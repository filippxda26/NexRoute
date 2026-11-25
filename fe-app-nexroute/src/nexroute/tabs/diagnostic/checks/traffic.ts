import {
  CustomNexRouteMethods,
  NexRouteShellMethods,
  RemoteFakeIPMethods,
} from '../../../methods';
import { createBaseApiRequest } from '../../../api';
import { getDashboardSections } from '../../../methods/custom/getDashboardSections';
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
}

function familyAddress(value: unknown, family: AddressFamily): string {
  if (typeof value !== 'string') {
    return '';
  }
  const valid = family === 'ipv4' ? isIPv4(value) : isIPv6(value);
  return valid ? canonicalDeviceIp(value) : '';
}

async function browserAddress(family: AddressFamily): Promise<string> {
  const host = family === 'ipv4' ? 'api.ipify.org' : 'api6.ipify.org';
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

// Shared exit addresses identify candidates, not a unique routing rule.
function deviceSectionSummary(dual: DualStackTraffic): string {
  if (!dual.sectionsComplete) {
    return '';
  }
  const candidates = (family: AddressFamily) => {
    const direct = familyAddress(dual.direct?.[family]?.address, family);
    const browser = familyAddress(dual.browser[family], family);
    return direct && browser !== direct
      ? [...new Set(matchingSections(dual, family))]
      : [];
  };
  const ipv4 = candidates('ipv4');
  const ipv6 = candidates('ipv6');
  const same =
    ipv4.length > 0 &&
    ipv4.length === ipv6.length &&
    ipv4.every((section) => ipv6.includes(section));
  if (same) {
    return ipv4.length === 1
      ? _('goes through section "%s"').format(ipv4[0])
      : _('matches exits of sections: %s').format(ipv4.join(', '));
  }
  const describe = (matches: string[], label: string) => {
    if (!matches.length) {
      return '';
    }
    return matches.length === 1
      ? _('goes through section "%s" (%s)').format(matches[0], label)
      : _('matches exits of sections (%s): %s').format(
          label,
          matches.join(', '),
        );
  };
  return [describe(ipv4, 'IPv4'), describe(ipv6, 'IPv6')]
    .filter(Boolean)
    .join('; ');
}

export function presentDualStackTraffic(
  dual: DualStackTraffic,
): IDiagnosticsChecksItem[] {
  const items: IDiagnosticsChecksItem[] = [];
  const families = ['ipv4', 'ipv6'] as const;
  const shown = dual.exits.find(
    ({ section }) => section === dual.displaySection,
  );
  const direct4 = familyAddress(dual.direct?.ipv4?.address, 'ipv4');
  const matchesExit4 =
    !!direct4 &&
    dual.browser.ipv4 !== direct4 &&
    matchingSections(dual, 'ipv4').length > 0;

  for (const family of families) {
    const label = family === 'ipv4' ? 'IPv4' : 'IPv6';
    const direct = familyAddress(dual.direct?.[family]?.address, family);
    const browser = familyAddress(dual.browser[family], family);
    const matches = matchingSections(dual, family);
    const complete =
      dual.sectionsComplete &&
      dual.exits.length > 0 &&
      dual.exits.every(({ result }) =>
        Boolean(familyAddress(result?.[family]?.address, family)),
      );
    const directKey = _('Direct exit (%s)').format(label);
    items.push(
      direct
        ? finding('success', directKey, direct)
        : finding('warning', directKey, _('not checked: no answer')),
    );

    // Keep one reference section visible, but compare against every exit.
    if (dual.displaySection) {
      const exit = familyAddress(shown?.result?.[family]?.address, family);
      const key =
        _('Exit via "%s"').format(dual.displaySection) + ' (' + label + ')';
      items.push(
        !exit
          ? finding('warning', key, _('not checked: no answer'))
          : exit === direct
            ? finding('warning', key, _('%s, the same as direct').format(exit))
            : finding('success', key, exit),
      );
    }

    const key = _('This device') + ' (' + label + ')';
    if (!browser) {
      items.push(
        finding(
          'warning',
          key,
          family === 'ipv6'
            ? _('IPv6 unavailable or the check did not answer')
            : _('not checked: no answer'),
        ),
      );
    } else if (matches.length && direct && browser !== direct) {
      items.push(
        finding(
          'success',
          key,
          _('%s, matches exit of %s').format(browser, matches.join(', ')),
        ),
      );
    } else if (matches.length) {
      items.push(
        finding('warning', key, _('%s, route not verified').format(browser)),
      );
    } else if (direct && browser === direct) {
      const value =
        family === 'ipv6' && matchesExit4
          ? _('%s, possible IPv6 bypass').format(browser)
          : _('%s, the same as direct').format(browser);
      items.push(finding('warning', key, value));
    } else if (family === 'ipv6' && matchesExit4 && direct && complete) {
      items.push(
        finding('warning', key, _('%s, possible IPv6 bypass').format(browser)),
      );
    } else {
      items.push(
        finding('warning', key, _('%s, route not verified').format(browser)),
      );
    }
  }
  return items;
}

export function presentTraffic(
  data: NexRoute.TrafficCheckResult,
  browser: BrowserCheck,
  dual?: DualStackTraffic,
): IDiagnosticsChecksItem[] {
  return [routerItem(data.router), deviceItem(browser, dual)];
}

// The router's side and the browser's run at once; each can take seconds when something is wrong.
export async function runTrafficCheck(): Promise<CheckOutcome> {
  const [response, browser, ipv4, ipv6, direct, sections] = await Promise.all([
    NexRouteShellMethods.checkTraffic(),
    RemoteFakeIPMethods.getFakeIpCheck(),
    browserAddress('ipv4'),
    browserAddress('ipv6'),
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
  const dual: DualStackTraffic = {
    direct,
    exits,
    displaySection: response.data.exit?.section,
    sectionsComplete: sections?.success === true,
    browser: { ipv4, ipv6 },
  };
  return outcome([
    ...presentTraffic(
      response.data,
      browser.success ? { fakeip: Boolean(browser.data.fakeip) } : null,
      dual,
    ),
    ...presentDualStackTraffic(dual),
  ]);
}
