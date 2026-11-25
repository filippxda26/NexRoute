import { describe, expect, it } from 'vitest';
import {
  clientAddresses,
  observedProbeRoutes,
  PROBE_HOSTS,
  type ProbeConnection,
} from '../deviceRoute';

const addresses = clientAddresses('192.168.1.20', {
  '192.168.1.20': 'aa:bb:cc:dd:ee:ff',
  '2001:db8::20': 'aa:bb:cc:dd:ee:ff',
  '192.168.1.21': 'aa:bb:cc:dd:ee:00',
});
const tags = ['Germany', 'Vanya_FULL_VPN', 'Vera_DE'];

function connection(
  id: string,
  host: string,
  sourceIP: string,
  section: string,
): ProbeConnection {
  return {
    id,
    metadata: { host, sourceIP },
    chains: [section + '/node', section],
    upload: 10,
  };
}

describe('actual diagnostic routes', () => {
  it('uses the outer section of the client connection independently per probe', () => {
    expect(
      observedProbeRoutes(
        [],
        [
          [
            connection('a', PROBE_HOSTS.fakeip, '192.168.1.20', tags[1]),
            connection('b', PROBE_HOSTS.ipv4, '192.168.1.20', tags[0]),
            connection('c', PROBE_HOSTS.ipv6, '2001:db8::20', tags[2]),
            connection('d', PROBE_HOSTS.fakeip, '192.168.1.21', tags[0]),
          ],
        ],
        addresses,
        tags,
      ),
    ).toEqual({ fakeip: tags[1], ipv4: tags[0], ipv6: tags[2] });
  });

  it('does not use an unchanged old connection or choose between competing routes', () => {
    const old = connection('old', PROBE_HOSTS.fakeip, '192.168.1.20', tags[0]);
    expect(
      observedProbeRoutes(
        [old],
        [
          [
            old,
            connection('a', PROBE_HOSTS.ipv4, '192.168.1.20', tags[0]),
            connection('b', PROBE_HOSTS.ipv4, '192.168.1.20', tags[1]),
          ],
        ],
        addresses,
        tags,
      ),
    ).toEqual({});
    expect(
      observedProbeRoutes([old], [[{ ...old, upload: 20 }]], addresses, tags),
    ).toEqual({ fakeip: tags[0] });
  });
});
