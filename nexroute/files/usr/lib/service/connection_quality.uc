// Periodic samples run in a child of the state service, never on its RPC loop.
let common = require("core.common");
let exec = require("core.exec");
let fs = require("fs");
let socket = require("socket");
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

// ICMP is not the VPN latency check. Bind to the actual WAN device and distinguish
// a failed command from a completed ping with zero replies.
function ping_metrics(output) {
    let packets = match(output ?? "", /([0-9]+) packets transmitted, ([0-9]+) (packets )?received/);
    if (!packets || int(packets[1]) == 0)
        return { status: "unavailable" };
    let sent = int(packets[1]), received = int(packets[2]);
    if (received > sent)
        return { status: "unavailable" };
    let rtt = match(output, /(?:round-trip|rtt) min\/avg\/max(?:\/[a-z]+)? = ([0-9.]+)\/([0-9.]+)\/([0-9.]+)/);
    return {
        status: received == sent ? "ok" : received == 0 ? "no_reply" : "packet_loss",
        sent, received, loss_pct: (sent - received) * 100.0 / sent,
        min_ms: rtt ? common.parse_json(rtt[1]) : null,
        avg_ms: rtt ? common.parse_json(rtt[2]) : null,
        max_ms: rtt ? common.parse_json(rtt[3]) : null
    };
}

function wan_ping(device, family) {
    let target = family == 6 ? "2606:4700:4700::1111" : "1.1.1.1";
    if (!match(device, /^[A-Za-z0-9_.:@-]+$/))
        return;
    let result = exec.combined([ family == 6 ? "ping6" : "ping", "-I", device, "-c", "3", "-W", "1", "-w", "5", target ]);
    let metrics = ping_metrics(result.output);
    emit("wan.ping", { device, family, target, ...metrics }, metrics.status == "ok" ? "info" : "warn");
}

// Raw DNS messages allow HTTPS (type 65), which ucode's resolv module cannot query.
const DNS_TYPES = { A: 1, AAAA: 28, HTTPS: 65 };

function dns_packet(name, kind, id) {
    let qtype = DNS_TYPES[kind];
    if (qtype == null)
        return null;
    let packet = chr((id >> 8) & 255, id & 255, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0);
    for (let label in split(name, ".")) {
        if (!match(label, /^[a-z0-9-]{1,63}$/))
            return null;
        packet += chr(length(label)) + label;
    }
    return packet + chr(0, 0, qtype, 0, 1);
}

function dns_result(packet, id, elapsed) {
    if (length(packet ?? "") < 12 || ord(packet, 0) != ((id >> 8) & 255) ||
        ord(packet, 1) != (id & 255) || !(ord(packet, 2) & 128))
        return { status: "invalid_response", delay_ms: elapsed };
    let code = ord(packet, 3) & 15;
    let names = { "0": "NOERROR", "1": "FORMERR", "2": "SERVFAIL", "3": "NXDOMAIN", "4": "NOTIMP", "5": "REFUSED" };
    return {
        status: ord(packet, 2) & 2 ? "truncated" : code == 0 || code == 3 ? "ok" : "dns_error",
        rcode: names["" + code] ?? ("" + code),
        answers: ord(packet, 6) * 256 + ord(packet, 7),
        delay_ms: elapsed
    };
}

function dns_probe(name, kind) {
    let start = common.monotonic_ms();
    let id = start & 65535;
    let packet = dns_packet(name, kind, id);
    let conn = null;
    try {
        conn = socket.connect(sb.DNS_INBOUND_ADDRESS, sb.DNS_INBOUND_PORT,
            { socktype: socket.SOCK_DGRAM }, 1000);
        if (!conn || conn.send(packet) != length(packet))
            return { status: "socket_error", delay_ms: common.monotonic_ms() - start };
        let ready = socket.poll(3500, conn);
        if (ready?.[0]?.[1] === 0)
            return { status: "timeout", delay_ms: common.monotonic_ms() - start };
        if (!ready)
            return { status: "socket_error", delay_ms: common.monotonic_ms() - start };
        let reply = conn.recv(4096);
        return dns_result(reply, id, common.monotonic_ms() - start);
    }
    catch (e) {
        return { status: "socket_error", delay_ms: common.monotonic_ms() - start };
    }
    finally {
        if (conn)
            conn.close();
    }
}

function dns_quality(settings) {
    let config = common.read_json_file(sb.config_path(settings));
    let found = false;
    for (let rule in config?.dns?.rules ?? []) {
        // Read the active configuration, not the UCI order, to avoid assigning a result to the wrong server.
        if (rule.inbound != sb.DNS_INBOUND_TAG || type(rule.domain) != "string" ||
            !match(rule.domain, /^nexroute-quality-[0-9]+[.]example[.]com$/) || rule.disable_cache != true)
            continue;
        let server = filter(config.dns.servers ?? [], (item) => item.tag == rule.server)[0];
        if (!server)
            continue;
        found = true;
        for (let kind in keys(DNS_TYPES)) {
            let result = dns_probe(rule.domain, kind);
            emit("dns", { tag: server.tag, transport: server.type, server: server.server ?? null,
                port: server.server_port ?? null, detour: server.detour ?? null, query_type: kind,
                name: rule.domain, ...result }, result.status == "ok" ? "info" : "warn");
        }
    }
    if (!found)
        emit("dns", { status: "probe_rules_unavailable", reason: "apply configuration" }, "warn");
}

function wan() {
    let result = ubus_json("network.interface", "dump");
    if (type(result?.interface) != "array") {
        emit("wan", { status: "unavailable" }, "warn");
        return;
    }
    let found = false;
    let probes = {};
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
        if (iface.up === true) {
            for (let route in iface.route ?? []) {
                let family = route.mask == 0 && route.target == "::" ? 6 :
                    route.mask == 0 && route.target == "0.0.0.0" ? 4 : 0;
                if (family)
                    probes[device + "/" + family] = { device, family };
            }
        }
    }
    for (let key, probe in probes)
        wan_ping(probe.device, probe.family);
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
        try {
            dns_quality(uci.get_all(constants.NEXROUTE_CONFIG_NAME, "settings") ?? {});
        }
        catch (e) {
            emit("dns", { status: "unavailable" }, "warn");
        }
    }
    emit("sample", { phase: "end" });
}

if (ARGV[0] == "run" && (sourcepath(1) == null || sourcepath(1) == "")) {
    if (common.bool_option(uci.get_all(constants.NEXROUTE_CONFIG_NAME, "settings"), "connection_quality_logs", false))
        sample();
    exit(0);
}
return { encoded, station_metrics, probe, ping_metrics, dns_packet, dns_result };
