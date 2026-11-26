let t = require("t");
let clash = require("singbox.clash_api");
let quality = require("service.connection_quality");

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

t.test("slow direct probes request additional diagnostics at the threshold or on failure", () => {
    t.eq(quality.slow_direct({ status: "ok", delay_ms: 149 }), false);
    t.eq(quality.slow_direct({ status: "ok", delay_ms: 150 }), true);
    t.eq(quality.slow_direct({ status: "failed" }), true);
    let real = clash.request;
    clash.request = (method, path, body) => {
        t.eq(path, "/proxies/direct-out/delay?url=https%3A%2F%2Fcp.cloudflare.com%2Fgenerate_204&timeout=4000");
        return { status: 200, body: '{"delay":45}' };
    };
    t.eq(quality.probe("direct-out", "https://cp.cloudflare.com/generate_204"), { status: "ok", delay_ms: 45 });
    clash.request = real;
});

t.test("curl timings report separate phases and distinguish failures", () => {
    let stdout = '{"http_code":"204","remote_ip":"192.0.2.1","dns":0.050,"connect":0.080,"tls":0.150,"first_byte":0.210,"total":0.211}';
    t.eq(quality.curl_result({ status: 0, stdout }), {
        status: "ok", http_status: 204, remote_ip: "192.0.2.1",
        dns_ms: 50, tcp_ms: 30, tls_ms: 70, first_byte_after_tls_ms: 60, total_ms: 211
    });
    t.eq(quality.curl_result({ status: 28, stdout: "" }), { status: "failed", exit_code: 28 });
    t.eq(quality.curl_result({ status: 0, stdout: "invalid" }), { status: "invalid_response" });
    t.eq(quality.curl_result({ status: 0, stdout: replace(stdout, '"204"', '"302"') }).status, "unexpected_http_status");
    t.eq(quality.curl_result({ status: 0, stdout: replace(stdout, '0.150', '0.010') }), { status: "invalid_response" });
});

t.done();
