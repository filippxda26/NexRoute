import { canonicalDeviceIp } from '../../../../validators/validateIp';
import { FAKEIP_CHECK_DOMAIN } from '../../../../constants';

export const PROBE_HOSTS = {
  fakeip: FAKEIP_CHECK_DOMAIN,
  ipv4: 'api.ipify.org',
  ipv6: 'api6.ipify.org',
} as const;

export type ProbeKind = keyof typeof PROBE_HOSTS;
export type ProbeRoutes = Partial<Record<ProbeKind, string>>;

export interface ProbeConnection {
  id?: string;
  metadata?: { host?: string; sourceIP?: string; type?: string };
  chains?: string[];
  rule?: string;
  upload?: number;
  download?: number;
}

export function probeConnections(value: unknown): ProbeConnection[] | null {
  const connections = (value as { connections?: unknown } | null)?.connections;
  return Array.isArray(connections)
    ? (connections as ProbeConnection[]).filter(
        (item) => item && typeof item === 'object',
      )
    : null;
}

export function clientAddresses(
  ip: string,
  macs: Record<string, string>,
): Set<string> {
  const address = canonicalDeviceIp(ip);
  if (!address || address === '::1' || address.startsWith('127.')) {
    return new Set();
  }
  const mac = macs[address];
  return new Set([
    address,
    ...Object.keys(macs).filter((candidate) => mac && macs[candidate] === mac),
  ]);
}

function routeTag(connection: ProbeConnection, tags: string[]): string {
  const known = ['direct-out', ...tags].sort((a, b) => b.length - a.length);
  const resolve = (tag: string) =>
    known.find((section) => tag === section || tag.startsWith(section + '/'));
  // The outermost known tag is the rule's route, not the leaf server.
  const chain = Array.isArray(connection.chains) ? connection.chains : [];
  const route = connection.rule?.match(/=>\s*route\(([^)]+)\)/)?.[1] || '';
  return (
    [...chain].reverse().map(resolve).find(Boolean) ||
    resolve(route.replace(/^['"]|['"]$/g, '')) ||
    ''
  );
}

export function observedProbeRoutes(
  baseline: ProbeConnection[],
  snapshots: ProbeConnection[][],
  addresses: Set<string>,
  tags: string[],
): ProbeRoutes {
  const before = new Map(baseline.map((item) => [item.id, item]));
  const candidates: Record<ProbeKind, Set<string>> = {
    fakeip: new Set(),
    ipv4: new Set(),
    ipv6: new Set(),
  };
  for (const snapshot of snapshots) {
    for (const connection of snapshot) {
      if (!connection.id || !connection.metadata) {
        continue;
      }
      const source = canonicalDeviceIp(connection.metadata.sourceIP || '');
      const type = connection.metadata.type || '';
      if (!addresses.has(source) || /(?:^|\/)system6?-in$/.test(type)) {
        continue;
      }
      const host = (connection.metadata.host || '')
        .toLowerCase()
        .replace(/\.$/, '');
      const kind = (Object.keys(PROBE_HOSTS) as ProbeKind[]).find(
        (key) => PROBE_HOSTS[key] === host,
      );
      if (!kind) {
        continue;
      }
      const old = before.get(connection.id);
      if (
        old &&
        (connection.upload || 0) <= (old.upload || 0) &&
        (connection.download || 0) <= (old.download || 0)
      ) {
        continue;
      }
      // An unidentified or competing route must not turn into a confident name.
      candidates[kind].add(routeTag(connection, tags));
    }
  }
  const result: ProbeRoutes = {};
  for (const kind of Object.keys(candidates) as ProbeKind[]) {
    if (candidates[kind].size === 1) {
      const [tag] = candidates[kind];
      if (tag) {
        result[kind] = tag;
      }
    }
  }
  return result;
}
