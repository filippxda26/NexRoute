let t = require("t");
let clash = require("singbox.clash_api");
let quality = require("service.connection_quality");

t.test("Wi-Fi counters are reported without turning missing data into zeros", () => {
    let value = quality.station_metrics({
        mac: "aa:bb:cc:dd:ee:ff", signal: -62, noise: -95,
        tx: { rate: 144000, packets: 250, retries: 15, failed: 2 },
        rx: { rate: 72000, packets: 200 }, inactive: 35
    });
    t.eq([ value.signal_dbm, value.tx_rate_kbps, value.tx_retries, value.tx_failed ], [ -62, 144000, 15, 2 ]);
    t.eq(quality.station_metrics({}).signal_dbm, null);
});

t.test("a probe distinguishes measured latency from a failed response", () => {
    let real = clash.request;
    clash.request = (method, path, body) => {
        t.ok(index(path, "/proxies/My%20VPN/delay?") == 0);
        return { status: 200, body: '{"delay":83}' };
    };
    t.eq(quality.probe("My VPN"), { status: "ok", delay_ms: 83 });
    clash.request = () => ({ status: 503, body: "{}" });
    t.eq(quality.probe("direct-out"), { status: "failed", http_status: 503 });
    clash.request = () => die("unavailable");
    t.eq(quality.probe("direct-out"), { status: "api_unavailable_or_timeout" });
    clash.request = real;
});

t.test("WAN ping distinguishes loss from unavailable tools and parses RTT", () => {
    let result = quality.ping_metrics("3 packets transmitted, 2 packets received, 33% packet loss\nround-trip min/avg/max = 12.1/14.5/16.9 ms");
    t.eq([result.status, result.sent, result.received, result.avg_ms], ["packet_loss", 3, 2, 14.5]);
    t.eq(quality.ping_metrics("3 packets transmitted, 0 packets received, 100% packet loss").status, "no_reply");
    t.eq(quality.ping_metrics("ping: not found"), { status: "unavailable" });
});

t.test("wire DNS supports HTTPS and reports response status and truncation", () => {
    let packet = quality.dns_packet("nexroute-quality-0.example.com", "HTTPS", 4660);
    t.eq([ord(packet, 0), ord(packet, 1), ord(packet, length(packet) - 3)], [18, 52, 65]);
    t.eq(quality.dns_result(chr(18, 52, 129, 131, 0, 1, 0, 0, 0, 0, 0, 0), 4660, 15),
        { status: "ok", rcode: "NXDOMAIN", answers: 0, delay_ms: 15 });
    t.eq(quality.dns_result(chr(18, 52, 129, 130, 0, 1, 0, 0, 0, 0, 0, 0), 4660, 25).status, "dns_error");
    t.eq(quality.dns_result(chr(18, 52, 131, 128, 0, 1, 0, 0, 0, 0, 0, 0), 4660, 25).status, "truncated");
    t.eq(quality.dns_result("", 4660, 25).status, "invalid_response");
});

t.done();
