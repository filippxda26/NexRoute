include $(TOPDIR)/rules.mk

PKG_NAME:=nexroute

NEXROUTE_SOURCE_VERSION:=$(or $(NEXROUTE_PACKAGE_VERSION),$(NEXROUTE_VERSION))
NEXROUTE_HAS_RELEASE_VERSION:=$(if $(filter dev,$(NEXROUTE_SOURCE_VERSION)),,$(NEXROUTE_SOURCE_VERSION))
NEXROUTE_COMPILED_VERSION:=$(if $(NEXROUTE_HAS_RELEASE_VERSION),$(NEXROUTE_SOURCE_VERSION),$(or $(NEXROUTE_SOURCE_VERSION),dev))
NEXROUTE_RELEASE_VERSION_VALID:=$(if $(NEXROUTE_HAS_RELEASE_VERSION),$(shell printf '%s\n' '$(NEXROUTE_SOURCE_VERSION)' | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' && printf '1'),1)

ifeq ($(NEXROUTE_RELEASE_VERSION_VALID),)
$(error NEXROUTE_PACKAGE_VERSION and NEXROUTE_VERSION must use x.y.z format)
endif

PKG_VERSION:=$(or $(NEXROUTE_HAS_RELEASE_VERSION),0.0.0)
PKG_RELEASE:=

PKG_MAINTAINER:=ushan0v <ushan0v@users.noreply.github.com>
PKG_LICENSE:=GPL-2.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/nexroute
	SECTION:=net
	CATEGORY:=Network
	DEPENDS:=+ca-bundle +ucode +ucode-mod-fs +ucode-mod-resolv +ucode-mod-socket +ucode-mod-ubus +ucode-mod-uloop +ucode-mod-uci +uclient-fetch +kmod-nft-tproxy +nftables +kmod-nft-nat +ip-tiny +sing-box-forkop
	CONFLICTS:=forkop luci-app-forkop luci-i18n-forkop-ru
	TITLE:=NexRoute backend service
	URL:=https://github.com/filippxda26/NexRoute
	PKGARCH:=all
endef

define Package/nexroute/description
	Rule-based traffic routing for OpenWrt
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/nexroute/prerm
#!/usr/bin/ucode

if (getenv("IPKG_INSTROOT") == null || getenv("IPKG_INSTROOT") == "")
	system("/usr/bin/nexroute package_prerm " + (ARGV[0] || "") + " >/dev/null 2>&1");

exit(0);
endef

define Package/nexroute/postinst
#!/bin/sh

[ -n "$${IPKG_INSTROOT}" ] && exit 0
NEXROUTE_LIB=/usr/lib/nexroute ucode -L /usr/lib/nexroute /usr/lib/nexroute/config/migration.uc migrate || exit $$?
NEXROUTE_BYTECODE_VALIDATION_TTL=0 /usr/bin/nexroute package_postinst
endef

define Package/nexroute/conffiles
/etc/config/nexroute
endef

define Package/nexroute/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/nexroute $(1)/etc/init.d/nexroute
	$(INSTALL_BIN) ./files/etc/init.d/nexroute-state $(1)/etc/init.d/nexroute-state

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/nexroute $(1)/etc/config/nexroute
	$(INSTALL_DIR) $(1)/usr/share/nexroute
	$(INSTALL_DATA) ./files/etc/config/nexroute $(1)/usr/share/nexroute/default-config

	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/nexroute $(1)/usr/bin/nexroute

	$(INSTALL_DIR) $(1)/usr/lib/nexroute
	$(CP) ./files/usr/lib/. $(1)/usr/lib/nexroute/

	$(INSTALL_DIR) $(1)/usr/share/nftables.d/chain-pre/input
	$(INSTALL_DATA) ./files/usr/share/nftables.d/chain-pre/input/nexroute.nft $(1)/usr/share/nftables.d/chain-pre/input/nexroute.nft

	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) ./files/lib/upgrade/keep.d/nexroute $(1)/lib/upgrade/keep.d/nexroute

	sed -i -e 's/__COMPILED_VERSION_VARIABLE__/$(NEXROUTE_COMPILED_VERSION)/g' $(1)/usr/lib/nexroute/core/constants.uc
endef

$(eval $(call BuildPackage,nexroute))
