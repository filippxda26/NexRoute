import {
  CustomNexRouteMethods,
  NexRouteShellMethods,
  RemoteFakeIPMethods,
} from '../../../methods';
import { createBaseApiRequest } from '../../../api';
import { getDashboardSections } from '../../../methods/custom/getDashboardSections';
import { loadLocalDevices } from '../../../cbi/localDevices';
import {
  clientAddresses,
  observedProbeRoutes,
  probeConnections,
  PROBE_HOSTS,
  type ProbeConnection,
  type ProbeRoutes,
} from './deviceRoute';
import {
  canonicalDeviceIp,
  isIPv4,
  isIPv6,
} from '../../../../validators/validateIp';
import type { IDiagnosticsChecksItem } from '../../../services';
import type { NexRoute } from '../../../types';
import { CheckOutcome, finding, outcome, unanswered } from './present';

// Whether this browser's request reached the check address through NexRoute, or null for no answer.
export type BrowserCheck = { fakeip: boolean } | null;

function routerItem(router: NexRoute.TrafficCheckResult['router']) {
  const key = _('Router');

  if (router.excluded) {
    return finding('success', key, _('excluded from routing'));
  }
  if (router.fakeip) {
    return finding('success', key, _('goes through NexRoute'));
  }
  if (!router.dns_fakeip) {
    return finding('warning', key, _('resolves past NexRoute'));
  }
  if (router.answered) {
    return finding('error', key, _('goes past NexRoute'));
  }
  return finding(
    'warning',
    key,
    _('not checked: the check service did not answer'),
  );
}

function deviceItem(browser: BrowserCheck, dual?: DualStackTraffic) {
  const key = _('This device');

  if (browser?.fakeip) {
    const section = dual ? deviceSectionSummary(dual) : '';
    return finding('success', key, section || _('goes through NexRoute'));
  }
  return browser
    ? finding('warning', key, _("does not use the router's DNS"))
    : finding('warning', key, _('not checked: no answer'));
}

type AddressFamily = 'ipv4' | 'ipv6';

export interface SectionExit {
  section: string;
  result: NexRoute.GetClashApiProxyExit | null;
}

export interface DualStackTraffic {
  direct: NexRoute.GetClashApiProxyExit | null;
  exits: SectionExit[];
  displaySection?: string;
  sectionsComplete: boolean;
  browser: Record<AddressFamily, string>;
  routes?: ProbeRoutes;
}

function familyAddress(value: unknown, family: AddressFamily): string {
  if (typeof value !== 'string') {
    return '';
  }
  const valid = family === 'ipv4' ? isIPv4(value) : isIPv6(value);
  return valid ? canonicalDeviceIp(value) : '';
}

async function browserAddress(family: AddressFamily): Promise<string> {
  const host = PROBE_HOSTS[family];
  const result = await createBaseApiRequest<{ ip?: string }>(
    () =>
      fetch(`https://${host}/?format=json`, {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(5000),
      }),
    { operationName: 'diagnostic browser IP', timeoutMs: 5000 },
  );
  return result.success ? familyAddress(result.data?.ip, family) : '';
}

async function outboundAddresses(
  tag: string,
): Promise<NexRoute.GetClashApiProxyExit | null> {
  try {
    const result = await CustomNexRouteMethods.getClashApiProxyExit(tag);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// An address match describes this probe, not every destination or the routing rule.
function matchingSections(dual: DualStackTraffic, family: AddressFamily) {
  const browser = familyAddress(dual.browser[family], family);
  return dual.exits
    .filter(
      ({ result }) =>
        browser && familyAddress(result?.[family]?.address, family) === browser,
    )
    .map(({ section }) => section);
}

// Use the observed public-IP connections, not the internal FakeIP route.
function deviceSectionSummary(dual: DualStackTraffic): string {
  const confirmed = (family: AddressFamily) => {
    const actual = dual.routes?.[family];
    return actual &&
      actual !== 'direct-out' &&
      familyAddress(dual.browser[family], family)
      ? actual
      : '';
  };
  const ipv4 = confirmed('ipv4');
  const ipv6 = confirmed('ipv6');
  if (ipv4 && ipv4 === ipv6) {
    return _('goes through section "%s"').format(ipv4);
  }
  return [
    ipv4 && _('goes through section "%s" (%s)').format(ipv4, 'IPv4'),
    ipv6 && _('goes through section "%s" (%s)').format(ipv6, 'IPv6'),
  ]
    .filter(Boolean)
    .join('; ');
}

export function presentDualStackTraffic(
  dual: DualStackTraffic,
): IDiagnosticsChecksItem[] {
  const direct4 = familyAddress(dual.direct?.ipv4?.address, 'ipv4');
  const direct6 = familyAddress(dual.direct?.ipv6?.address, 'ipv6');
  const items: IDiagnosticsChecksItem[] = [
    {
      ...finding(
        direct4 ? 'success' : 'warning',
        _('Direct exit (%s)').format('IPv4'),
        direct4 || _('not checked: no answer'),
      ),
      layout: 'direct-exit',
    },
    {
      ...finding(
        direct6 ? 'success' : 'warning',
        _('Direct exit (%s)').format('IPv6'),
        direct6 || _('not checked: no answer'),
      ),
      layout: 'direct-exit',
    },
  ];
  const families = ['ipv4', 'ipv6'] as const;
  const shown = dual.exits.find(
    ({ section }) => section === dual.displaySection,
  );
  // Place the two reference exits together, before the device findings.
  if (dual.displaySection) {
    for (const family of families) {
      const label = family === 'ipv4' ? 'IPv4' : 'IPv6';
      const direct = familyAddress(dual.direct?.[family]?.address, family);
      const exit = familyAddress(shown?.result?.[family]?.address, family);
      const key =
        _('Exit via "%s"').format(dual.displaySection) + ' (' + label + ')';
      items.push({
        ...(!exit
          ? finding('warning', key, _('not checked: no answer'))
          : exit === direct
            ? finding('warning', key, _('%s, the same as direct').format(exit))
            : finding('success', key, exit)),
        layout: 'section-exit',
      });
    }
  }

  const route4 = dual.routes?.ipv4;
  const routed4 = Boolean(route4 && route4 !== 'direct-out');

  for (const family of families) {
    const label = family === 'ipv4' ? 'IPv4' : 'IPv6';
    const direct = familyAddress(dual.direct?.[family]?.address, family);
    const browser = familyAddress(dual.browser[family], family);
    const matches = matchingSections(dual, family);
    const actual = dual.routes?.[family];
    const key = _('This device') + ' (' + label + ')';
    const addDeviceFinding = (item: IDiagnosticsChecksItem) =>
      items.push({ ...item, layout: 'device-exit' });
    if (!browser) {
      addDeviceFinding(
        finding(
          'warning',
          key,
          family === 'ipv6'
            ? _('IPv6 unavailable or the check did not answer')
            : _('not checked: no answer'),
        ),
      );
    } else if (actual === 'direct-out') {
      addDeviceFinding(
        finding(
          'warning',
          key,
          family === 'ipv6' && routed4
            ? _('%s, possible IPv6 bypass').format(browser)
            : _('%s, goes directly').format(browser),
        ),
      );
    } else if (actual) {
      addDeviceFinding(
        finding(
          'success',
          key,
          matches.includes(actual)
            ? _('%s, matches exit of %s').format(browser, actual)
            : _('%s, goes through section "%s"').format(browser, actual),
        ),
      );
    } else if (matches.length && direct && browser !== direct) {
      addDeviceFinding(
        finding(
          'warning',
          key,
          _('%s, matches exit of %s').format(browser, matches.join(', ')),
        ),
      );
    } else if (direct && browser === direct && !matches.length) {
      addDeviceFinding(
        finding('warning', key, _('%s, the same as direct').format(browser)),
      );
    } else {
      addDeviceFinding(
        finding('warning', key, _('%s, route not verified').format(browser)),
      );
    }
  }
  return items;
}

export function presentFakeIpDns(
  data: NexRoute.TrafficCheckResult,
): IDiagnosticsChecksItem[] {
  const results = data.fakeip_dns;
  if (!results) {
    return [];
  }
  return (['ipv4', 'ipv6'] as const).map((family) => {
    const result = results[family];
    const address = familyAddress(result?.address, family);
    const working = Boolean(address && result?.fakeip);
    return {
      ...finding(
        working ? 'success' : 'warning',
        _('FakeIP (%s)').format(family === 'ipv4' ? 'IPv4' : 'IPv6'),
        working
          ? _('Works')
          : address
            ? _('Not working')
            : _('not checked: no answer'),
      ),
      ...(address ? { detail: address } : {}),
      layout: 'fakeip-dns',
    };
  });
}

export function presentTraffic(
  data: NexRoute.TrafficCheckResult,
  browser: BrowserCheck,
  dual?: DualStackTraffic,
): IDiagnosticsChecksItem[] {
  return [
    { ...routerItem(data.router), layout: 'traffic-summary' },
    { ...deviceItem(browser, dual), layout: 'traffic-summary' },
  ];
}

async function connectionSnapshot(): Promise<ProbeConnection[] | null> {
  try {
    const response = await CustomNexRouteMethods.getClashApiConnections();
    return response.success ? probeConnections(response.data) : null;
  } catch {
    return null;
  }
}

async function browserProbes() {
  const [client, devices] = await Promise.all([
    createBaseApiRequest<{ ip?: string }>(
      () =>
        fetch('/cgi-bin/nexroute-client', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(2000),
        }),
      { operationName: 'diagnostic local client', timeoutMs: 2000 },
    ),
    loadLocalDevices(true).catch(() => null),
  ]);
  const addresses = clientAddresses(
    client.success ? client.data?.ip || '' : '',
    devices?.macs || {},
  );
  const baseline = addresses.size ? await connectionSnapshot() : null;
  let finished = false;
  const probes = Promise.all([
    RemoteFakeIPMethods.getFakeIpCheck(),
    browserAddress('ipv4'),
    browserAddress('ipv6'),
  ]).finally(() => {
    finished = true;
  });
  const snapshots: ProbeConnection[][] = [];
  if (baseline) {
    // Bounded sampling; a failed or very short probe may not be visible.
    for (let i = 0; i < 25 && !finished; i++) {
      const snapshot = await connectionSnapshot();
      if (!snapshot) {
        break;
      }
      snapshots.push(snapshot);
      if (!finished) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  const [browser, ipv4, ipv6] = await probes;
  if (baseline) {
    // IPv6 privacy addresses may only appear in NDP after the probe starts.
    const [latest, snapshot] = await Promise.all([
      loadLocalDevices(true).catch(() => null),
      connectionSnapshot(),
    ]);
    if (snapshot) {
      snapshots.push(snapshot);
    }
    for (const address of clientAddresses(
      client.success ? client.data?.ip || '' : '',
      { ...devices?.macs, ...latest?.macs },
    )) {
      addresses.add(address);
    }
  }
  return { browser, ipv4, ipv6, addresses, baseline, snapshots };
}

// The router's side and the browser's run at once; each can take seconds when something is wrong.
export async function runTrafficCheck(): Promise<CheckOutcome> {
  const [response, probes, direct, sections] = await Promise.all([
    NexRouteShellMethods.checkTraffic(),
    browserProbes(),
    outboundAddresses('direct-out'),
    getDashboardSections().catch(() => null),
  ]);

  if (!response.success) {
    return unanswered();
  }

  const targets = sections?.success
    ? sections.data.map(({ code, displayName }) => ({
        code,
        section: displayName,
      }))
    : response.data.exit
      ? [
          {
            code: response.data.exit.section,
            section: response.data.exit.section,
          },
        ]
      : [];
  const exits: SectionExit[] = [];
  // Bound simultaneous lookups on small routers.
  for (let i = 0; i < targets.length; i += 4) {
    const batch = await Promise.all(
      targets.slice(i, i + 4).map(async ({ code, section }) => ({
        section,
        result: await outboundAddresses(code),
      })),
    );
    exits.push(...batch);
  }
  const { browser, ipv4, ipv6 } = probes;
  const routes =
    probes.baseline && sections?.success
      ? observedProbeRoutes(
          probes.baseline,
          probes.snapshots,
          probes.addresses,
          targets.map(({ code }) => code),
        )
      : {};
  for (const kind of Object.keys(routes) as (keyof ProbeRoutes)[]) {
    const target = targets.find(({ code }) => code === routes[kind]);
    if (target) {
      routes[kind] = target.section;
    }
  }
  const dual: DualStackTraffic = {
    direct,
    exits,
    displaySection: response.data.exit?.section,
    sectionsComplete: sections?.success === true,
    browser: { ipv4, ipv6 },
    routes,
  };
  return outcome([
    ...presentTraffic(
      response.data,
      browser.success ? { fakeip: Boolean(browser.data.fakeip) } : null,
      dual,
    ),
    ...presentFakeIpDns(response.data),
    ...presentDualStackTraffic(dual),
  ]);
}
