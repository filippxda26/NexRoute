// NexRoute's own names, paths and marks; the sing-box configuration's are in singbox/constants.uc.

return {
    NEXROUTE_VERSION: "__COMPILED_VERSION_VARIABLE__",
    NEXROUTE_CONFIG_NAME: "nexroute",
    NEXROUTE_BIN: "/usr/bin/nexroute",
    NEXROUTE_SERVICE_INIT: "/etc/init.d/nexroute",
    // START in the init script, which names its rc.d links.
    NEXROUTE_START_PRIORITY: "99",
    NEXROUTE_RELEASE_REPO: "filippxda26/NexRoute",
    NEXROUTE_LUCI_VIEW_DIR: "/www/luci-static/resources/view/nexroute",
    NEXROUTE_LUCI_I18N_DOMAIN: "nexroute",
    // Tags match at the start of a message, so a LuCI login on a NexRoute page stays out.
    NEXROUTE_LOG_PATTERN: "^\\(nexroute\\|sing-box\\)\\|^procd: .*\\(nexroute\\|sing-box\\)",

    RT_TABLE_NAME: "nexroute",

    NFT_TABLE_NAME: "NexRouteTable",
    NFT_LOCALV4_SET_NAME: "localv4",
    NFT_LOCALV6_SET_NAME: "localv6",
    NFT_INTERFACE_SET_NAME: "nexroute_interfaces",
    NFT_PAUSE_CHAIN_NAME: "capture_pause",
    NFT_FAKEIP_MARK: "0x04000000",
    NFT_OUTBOUND_MARK: "0x08000000",
    // What the router itself sends to sing-box: a mark of its own keeps rule 104 off its lookups.
    NFT_ROUTER_MARK: "0x10000000",
    // A redirect hooked earlier would take a query before NexRoute sees it.
    NFT_DNS_REDIRECT_PRIORITY: -101,
    NFT_SYSTEM_DNS_REDIRECT_PRIORITY: -100,

    SB_REQUIRED_VERSION: "1.14.4-r1"
};
