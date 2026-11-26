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

t.test("router HTTP comparison pairs each provider with IPv4 and IPv6", () => {
    let plan = quality.router_http_plan();
    t.eq(length(plan), 8);
    t.eq(map(plan, (item) => [ item.provider, item.family, item.expected_status ]), [
        [ "google", 4, 204 ], [ "google", 6, 204 ],
        [ "cloudflare", 4, 204 ], [ "cloudflare", 6, 204 ],
        [ "apple", 4, 200 ], [ "apple", 6, 200 ],
        [ "yandex", 4, 204 ], [ "yandex", 6, 204 ]
    ]);
    for (let item in plan) {
        t.eq(item.argv[2], "-" + item.family);
        t.eq(item.argv[length(item.argv) - 1], item.url);
        t.ok(index(item.argv, "--max-time") >= 0);
    }
    let stdout = '{"http_code":"200","remote_ip":"2001:db8::1","dns":0.001,"connect":0.040,"tls":0.080,"first_byte":0.120,"total":0.121}';
    t.eq(quality.curl_result({ status: 0, stdout }, 200).status, "ok");
    t.eq(quality.curl_result({ status: 0, stdout }, 204).status, "unexpected_http_status");
});

t.test("configured latency test URL is used with a safe default", () => {
    let url = "https://api.browser.yandex.ru/generate_204";
    t.eq(quality.latency_url({ latency_test_url: url }), url);
    t.eq(quality.latency_url({}), "https://www.gstatic.com/generate_204");
    t.eq(quality.latency_url({ latency_test_url: "" }), "https://www.gstatic.com/generate_204");
    t.eq(quality.latency_url({ latency_test_url: "file:///etc/passwd" }), "https://www.gstatic.com/generate_204");
    let real = clash.request;
    clash.request = (method, path, body) => {
        t.eq(path, "/proxies/direct-out/delay?url=https%3A%2F%2Fapi.browser.yandex.ru%2Fgenerate_204&timeout=4000");
        return { status: 200, body: '{"delay":35}' };
    };
    t.eq(quality.probe("direct-out", quality.latency_url({ latency_test_url: url })), { status: "ok", delay_ms: 35 });
    clash.request = real;
});

t.test("FakeIP ranges are identified and excluded from public IPv6 route checks", () => {
    t.eq(quality.fakeip_address("198.18.0.51"), true);
    t.eq(quality.fakeip_address("2001:2::31"), true);
    t.eq(quality.fakeip_address("2001:0002:0:0:0:0:0:31"), true);
    t.eq(quality.fakeip_address("142.251.154.120"), false);
    t.eq(quality.route_target("2001:4860:4826:7800::"), true);
    t.eq(quality.route_target("2a02:6b8::1d0"), true);
    t.eq(quality.route_target("2001:2::31"), false);
    t.eq(quality.route_target("2001:db8::1"), false);
    t.eq(quality.route_target("fe80::1"), false);
    t.eq(quality.route_target("198.18.0.51"), false);
});

t.test("IPv6 route lookup reports device and gateway without source address", () => {
    t.eq(quality.route_result({ status: 0, stdout: "2001:4860::1 via fe80::1 dev pppoe-wan src 2001:db8::2 metric 1024\n" }),
        { status: "ok", device: "pppoe-wan", gateway: "fe80::1" });
    t.eq(quality.route_result({ status: 0, stdout: "2001:4860::1 dev pppoe-wan" }),
        { status: "ok", device: "pppoe-wan", gateway: null });
    t.eq(quality.route_result({ status: 2, stdout: "" }), { status: "unavailable", exit_code: 2 });
});

t.done();
