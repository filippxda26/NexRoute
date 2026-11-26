// Periodic samples run in a child of the state service, never on its RPC loop.
let common = require("core.common");
let exec = require("core.exec");
let fs = require("fs");
let uci = require("core.uci");
let constants = require("core.constants");
let connections = require("config.connections");
let clash = require("singbox.clash_api");
let sb = require("singbox.constants");
let health = require("service.health");

const TEST_URL = "https%3A%2F%2Fwww.gstatic.com%2Fgenerate_204";
const TIMEOUT_MS = 4000;

function encoded(value) {
    let result = "";
    for (let i = 0; i < length(value); i++) {
        let c = substr(value, i, 1);
        result += match(c, /^[A-Za-z0-9_.~-]$/) ? c : sprintf("%%%02X", ord(c));
    }
    return result;
}

function ubus_json(object, method, args) {
    return common.parse_json(exec.output([ "ubus", "-t", "3", "call", object, method, sprintf("%J", args ?? {}) ]));
}

function number_or_null(value) {
    return type(value) == "int" || type(value) == "double" ? value : null;
}

function station_metrics(station) {
    return {
        mac: common.as_string(station.mac),
        signal_dbm: number_or_null(station.signal),
        noise_dbm: number_or_null(station.noise),
        tx_rate_kbps: number_or_null(station.tx?.rate),
        rx_rate_kbps: number_or_null(station.rx?.rate),
        tx_packets: number_or_null(station.tx?.packets),
        tx_retries: number_or_null(station.tx?.retries ?? station.tx_retries),
        tx_failed: number_or_null(station.tx?.failed ?? station.tx_failed),
        rx_packets: number_or_null(station.rx?.packets),
        inactive_ms: number_or_null(station.inactive)
    };
}

function emit(kind, value, level) {
    exec.log(level ?? "info", "[quality] " + kind + " " + sprintf("%J", value));
}

function wifi() {
    let status = ubus_json("network.wireless", "status");
    if (type(status) != "object" || length(keys(status)) == 0) {
        emit("wifi", { status: "unavailable" });
        return;
    }
    for (let radio, device in status) {
        emit("wifi.radio", { radio, up: device.up === true, pending: device.pending === true });
        for (let iface in device.interfaces ?? []) {
            let name = common.as_string(iface.ifname);
            if (name == "")
                continue;
            let result = ubus_json("iwinfo", "assoclist", { device: name });
            if (type(result?.results) != "array") {
                emit("wifi.interface", { interface: name, status: "station_data_unavailable" });
                continue;
            }
            emit("wifi.interface", { interface: name, stations: length(result.results) });
            for (let station in result.results)
                emit("wifi.station", { interface: name, ...station_metrics(station) });
        }
    }
}

function counter(device, name) {
    if (!match(device, /^[A-Za-z0-9_.:@-]+$/))
        return null;
    let text = trim(fs.readfile("/sys/class/net/" + device + "/statistics/" + name) ?? "");
    return match(text, /^[0-9]+$/) ? int(text) : null;
}

function wan() {
    let result = ubus_json("network.interface", "dump");
    if (type(result?.interface) != "array") {
        emit("wan", { status: "unavailable" }, "warn");
        return;
    }
    let found = false;
    for (let iface in result.interface) {
        let name = common.as_string(iface.interface);
        let default_route = length(filter(iface.route ?? [], (r) => r.mask == 0 && (r.target == "0.0.0.0" || r.target == "::"))) > 0;
        if (!default_route && !match(name, /^(wan|wan6|wwan|wwan6)$/))
            continue;
        found = true;
        let device = common.as_string(iface.l3_device || iface.device);
        emit("wan", {
            interface: name, device, up: iface.up === true, pending: iface.pending === true,
            uptime_s: number_or_null(iface.uptime),
            rx_errors: counter(device, "rx_errors"), tx_errors: counter(device, "tx_errors"),
            rx_dropped: counter(device, "rx_dropped"), tx_dropped: counter(device, "tx_dropped")
        }, iface.up === true ? "info" : "warn");
    }
    if (!found)
        emit("wan", { status: "no_wan_interface_detected" });
}

function probe(tag) {
    let path = "/proxies/" + encoded(tag) + "/delay?url=" + TEST_URL + "&timeout=" + TIMEOUT_MS;
    try {
        let response = clash.request("GET", path, "");
        let data = common.parse_json(response.body);
        let delay = number_or_null(data?.delay);
        if (response.status == 200 && delay != null && delay > 0)
            return { status: "ok", delay_ms: delay };
        return { status: "failed", http_status: response.status };
    }
    catch (e) {
        return { status: "api_unavailable_or_timeout" };
    }
}

function sample() {
    emit("sample", { phase: "start" });
    try { wan(); } catch (e) { emit("wan", { status: "unavailable" }, "warn"); }
    try { wifi(); } catch (e) { emit("wifi", { status: "unavailable" }, "warn"); }
    if (!health.sing_box_service_running()) {
        emit("vpn", { status: "core_not_running" }, "warn");
    }
    else {
        let tags = [ sb.DIRECT_OUTBOUND_TAG ];
        for (let section in uci.section_objects(constants.NEXROUTE_CONFIG_NAME, "section")) {
            if (!common.bool_option(section, "enabled", true) || !connections.is_connections_action(section.action))
                continue;
            let tag = sb.outbound_tag(connections.section_display_name(section[".name"]));
            if (tag != "" && index(tags, tag) < 0)
                push(tags, tag);
        }
        for (let tag in tags) {
            let result = probe(tag);
            emit("outbound", { tag, ...result }, result.status == "ok" ? "info" : "warn");
        }
    }
    emit("sample", { phase: "end" });
}

if (ARGV[0] == "run" && (sourcepath(1) == null || sourcepath(1) == "")) {
    if (common.bool_option(uci.get_all(constants.NEXROUTE_CONFIG_NAME, "settings"), "connection_quality_logs", false))
        sample();
    exit(0);
}
return { encoded, station_metrics, probe };
