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

t.done();
