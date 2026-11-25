// The device choices take four calls (host hints, leases, interfaces, static hosts), so they are
// fetched once per page, and only when a stored value names a device or the dropdown opens.

import { canonicalDeviceIp, validateIP } from '../../validators/validateIp';
import { normalizeOptionValues } from './listValues';

const callHostHints = rpc.declare({
  object: 'luci-rpc',
  method: 'getHostHints',
  expect: { '': {} },
});
const callDHCPLeases = rpc.declare({
  object: 'luci-rpc',
  method: 'getDHCPLeases',
  expect: { '': {} },
});
const callNetworkInterfaceDump = rpc.declare({
  object: 'network.interface',
  method: 'dump',
  expect: { interface: [] },
});

export const SYSTEM_DEVICE_VALUE = '@system';

export function isMacDeviceValue(value: string): boolean {
  return /^@mac:(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value);
}

export interface LocalDevices {
  choices: Record<string, string>;
  order: string[];
  names: Record<string, string>;
  macChoices: Record<string, string>;
  macs: Record<string, string>;
  macNames: Record<string, string>;
}

const NO_LOCAL_DEVICES: LocalDevices = {
  choices: {},
  order: [],
  names: {},
  macChoices: {},
  macs: {},
  macNames: {},
};

let localDevicesCache: LocalDevices | null = null;
let localDevicesPromise: Promise<LocalDevices> | null = null;

function normalizeLocalDeviceName(name: unknown): string {
  return `${name || ''}`.trim().replace(/\.lan$/i, '');
}

function normalizeLocalDeviceIp(ip: unknown): string {
  const normalizedIp = `${ip || ''}`.trim();
  return validateIP(normalizedIp) === true ? normalizedIp : '';
}

function addLocalDeviceName(
  names: Record<string, string>,
  ip: string,
  name: unknown,
): void {
  const normalizedName = normalizeLocalDeviceName(name);

  if (ip && normalizedName) {
    names[ip] = normalizedName;
  }
}

function addOfferedAddress(
  offered: Record<string, string>,
  ip: string,
  mac: unknown,
): void {
  if (ip) {
    offered[ip] =
      offered[ip] || (normalizeOptionValues(mac)[0] || '').toUpperCase();
  }
}

function addRouterIp(routerIps: Record<string, boolean>, ip: unknown): void {
  const normalizedIp = `${ip || ''}`.trim();

  if (!normalizedIp || validateIP(normalizedIp) !== true) {
    return;
  }

  routerIps[normalizedIp] = true;
}

function buildRouterIpMap(networkInterfaces: unknown): Record<string, boolean> {
  const routerIps: Record<string, boolean> = {};

  if (!Array.isArray(networkInterfaces)) {
    return routerIps;
  }

  networkInterfaces.forEach((networkInterface) => {
    const ipAddresses: unknown[] = [];
    const ipv4Addresses =
      networkInterface &&
      typeof networkInterface === 'object' &&
      Array.isArray(networkInterface['ipv4-address'])
        ? networkInterface['ipv4-address']
        : [];
    const ipv6Addresses =
      networkInterface &&
      typeof networkInterface === 'object' &&
      Array.isArray(networkInterface['ipv6-address'])
        ? networkInterface['ipv6-address']
        : [];

    ipAddresses.push(...ipv4Addresses, ...ipv6Addresses);
    ipAddresses.forEach((address) => {
      addRouterIp(
        routerIps,
        address && typeof address === 'object'
          ? (address as { address?: unknown }).address
          : address,
      );
    });
  });

  return routerIps;
}

// A lease or a static host places a device on the LAN even without a name; a nameless host hint
// is left out, since the neighbours include the upstream gateway.
export function buildLocalDevices(
  hostHints: unknown,
  dhcpLeases: unknown,
  networkInterfaces: unknown,
  staticHosts: unknown,
): LocalDevices {
  const names: Record<string, string> = {};
  const offered: Record<string, string> = {};
  const macs: Record<string, string> = {};
  const macNames: Record<string, string> = {};
  const routerIps = buildRouterIpMap(networkInterfaces);

  function rememberMac(ip: string, rawMac: unknown, name: unknown) {
    const values = normalizeOptionValues(rawMac);
    const mac = values.length === 1 ? values[0].toLowerCase() : '';
    const address = canonicalDeviceIp(ip);
    if (!address || !isMacDeviceValue('@mac:' + mac)) {
      return;
    }
    // Live host hints come first; leases and static hosts fill missing mappings.
    if (!macs[address]) {
      macs[address] = mac;
    }
    const label = normalizeLocalDeviceName(name);
    if (macs[address] === mac && label) {
      macNames[mac] = label;
    }
  }

  if (hostHints && typeof hostHints === 'object') {
    Object.entries(hostHints).forEach(([mac, hint]) => {
      if (!hint || typeof hint !== 'object') {
        return;
      }

      normalizeOptionValues(hint.ipaddrs).forEach((address) => {
        const ip = normalizeLocalDeviceIp(address);
        addLocalDeviceName(names, ip, hint.name);
        rememberMac(ip, mac, hint.name);
        if (names[ip]) {
          addOfferedAddress(offered, ip, mac);
        }
      });
      normalizeOptionValues(hint.ip6addrs).forEach((address) => {
        const ip = normalizeLocalDeviceIp(address);
        addLocalDeviceName(names, ip, hint.name);
        rememberMac(ip, mac, hint.name);
      });
    });
  }

  if (
    dhcpLeases &&
    typeof dhcpLeases === 'object' &&
    Array.isArray((dhcpLeases as { dhcp_leases?: unknown }).dhcp_leases)
  ) {
    (dhcpLeases as { dhcp_leases: unknown[] }).dhcp_leases.forEach((lease) => {
      if (!lease || typeof lease !== 'object') {
        return;
      }

      const entry = lease as {
        ipaddr?: unknown;
        hostname?: unknown;
        macaddr?: unknown;
      };
      const ip = normalizeLocalDeviceIp(entry.ipaddr);
      addLocalDeviceName(names, ip, entry.hostname);
      addOfferedAddress(offered, ip, entry.macaddr);
      rememberMac(ip, entry.macaddr, entry.hostname);
    });
  }

  if (Array.isArray(staticHosts)) {
    staticHosts.forEach((host) => {
      if (!host || typeof host !== 'object') {
        return;
      }

      normalizeOptionValues(host.ip).forEach((address) => {
        const ip = normalizeLocalDeviceIp(address);
        addLocalDeviceName(names, ip, host.name);
        addOfferedAddress(offered, ip, host.mac);
        rememberMac(ip, host.mac, host.name);
      });
    });
  }

  Object.keys(routerIps).forEach((ip) => {
    delete names[ip];
    delete offered[ip];
    delete macs[canonicalDeviceIp(ip)];
  });

  const addresses = Object.keys(offered);
  const named = addresses
    .filter((ip) => names[ip])
    .sort((a, b) => names[a].localeCompare(names[b]) || a.localeCompare(b));
  const nameless = addresses
    .filter((ip) => !names[ip])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const choices: Record<string, string> = {
    [SYSTEM_DEVICE_VALUE]: _('System'),
  };
  // A name shown by several entries gets the address beside it.
  const nameCounts: Record<string, number> = {};
  [choices[SYSTEM_DEVICE_VALUE], ...named.map((ip) => names[ip])].forEach(
    (name) => {
      const key = name.toLowerCase();
      nameCounts[key] = (nameCounts[key] || 0) + 1;
    },
  );
  named.forEach((ip) => {
    choices[ip] =
      nameCounts[names[ip].toLowerCase()] > 1
        ? '%s (%s)'.format(names[ip], ip)
        : names[ip];
  });
  nameless.forEach((ip) => {
    choices[ip] = offered[ip] ? '%s (%s)'.format(ip, offered[ip]) : ip;
  });

  const macChoices: Record<string, string> = {};
  [...named, ...nameless].forEach((ip) => {
    const mac = offered[ip].toLowerCase();
    const value = '@mac:' + mac;
    if (isMacDeviceValue(value) && !macChoices[value]) {
      macChoices[value] = names[ip]
        ? '%s (MAC %s)'.format(names[ip], mac)
        : mac;
    }
  });

  return {
    choices,
    order: [SYSTEM_DEVICE_VALUE, ...named, ...nameless],
    names,
    macChoices,
    macs,
    macNames,
  };
}

export function loadLocalDevices(refresh = false): Promise<LocalDevices> {
  if (localDevicesCache && !refresh) {
    return Promise.resolve(localDevicesCache);
  }

  if (localDevicesPromise) {
    return localDevicesPromise;
  }

  localDevicesPromise = Promise.all([
    callHostHints().catch(() => ({})),
    callDHCPLeases().catch(() => ({})),
    callNetworkInterfaceDump().catch(() => []),
    uci
      .load('dhcp')
      .then(() => uci.sections('dhcp', 'host'))
      .catch(() => []),
  ])
    .then(([hostHints, dhcpLeases, networkInterfaces, staticHosts]) => {
      localDevicesCache = buildLocalDevices(
        hostHints,
        dhcpLeases,
        networkInterfaces,
        staticHosts,
      );
      return localDevicesCache;
    })
    .finally(() => {
      localDevicesPromise = null;
    });

  return localDevicesPromise;
}

function namesALocalDevice(values: unknown): boolean {
  return normalizeOptionValues(values).some(
    (value) =>
      value === SYSTEM_DEVICE_VALUE ||
      validateIP(value) === true ||
      isMacDeviceValue(value),
  );
}

export function localDevicePickerOptions(
  data: LocalDevices,
  macOnly = false,
): Pick<LocalDevices, 'choices' | 'order'> {
  if (!macOnly) {
    return { choices: data.choices, order: data.order };
  }

  const choices: Record<string, string> = {};
  if (data.choices[SYSTEM_DEVICE_VALUE]) {
    choices[SYSTEM_DEVICE_VALUE] = data.choices[SYSTEM_DEVICE_VALUE];
  }
  Object.assign(choices, data.macChoices);

  return { choices, order: Object.keys(choices) };
}

export function createLocalDeviceDynamicListWidget(
  option: CBIOption,
  section_id: string,
  cfgvalue: unknown,
  macOnly = false,
): Promise<HTMLElement> {
  const values = normalizeOptionValues(
    cfgvalue != null ? cfgvalue : option.default,
  );
  const shouldResolveExistingLabels = namesALocalDevice(values);

  return (
    shouldResolveExistingLabels
      ? loadLocalDevices()
      : Promise.resolve(NO_LOCAL_DEVICES)
  ).then((initialDevices) => {
    const devices = localDevicesCache || initialDevices;
    const picker = localDevicePickerOptions(devices, macOnly);
    const widget = new ui.DynamicList(values, picker.choices, {
      id: option.cbid(section_id),
      sort: picker.order,
      optional: option.optional || option.rmempty,
      datatype: option.datatype,
      placeholder: option.placeholder,
      validate: option.validate.bind(option, section_id),
      disabled: option.readonly != null ? option.readonly : option.map.readonly,
    });
    const node = widget.render();
    const onWidgetReady = option.onDeviceWidgetReady;
    const onListChange = option.onDeviceListChange;
    if (typeof onWidgetReady === 'function') {
      onWidgetReady(section_id, widget);
    }
    if (typeof onListChange === 'function') {
      node.addEventListener('cbi-dynlist-change', () => {
        onListChange(section_id, widget.getValue());
      });
    }
    let choicesLoaded = Boolean(localDevicesCache);
    let choicesLoading = false;

    const loadChoices = () => {
      if (choicesLoaded || choicesLoading) {
        return;
      }

      choicesLoading = true;
      loadLocalDevices()
        .then((loadedDevices) => {
          widget.clearChoices();
          const picker = localDevicePickerOptions(loadedDevices, macOnly);
          widget.addChoices(picker.order, picker.choices);
          choicesLoaded = true;
        })
        .finally(() => {
          choicesLoading = false;
        });
    };

    const maybeLoadChoices = (ev: Event) => {
      const target = ev.target;
      if (
        target &&
        typeof (target as Element).closest === 'function' &&
        (target as Element).closest('.cbi-dropdown')
      ) {
        loadChoices();
      }
    };

    node.addEventListener('mousedown', maybeLoadChoices, true);
    node.addEventListener('focusin', maybeLoadChoices, true);

    return node;
  });
}
