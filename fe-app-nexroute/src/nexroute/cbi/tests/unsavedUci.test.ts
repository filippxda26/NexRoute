import { beforeEach, describe, expect, it } from 'vitest';

import { captureUnsavedUci, restoreUnsavedUci } from '../unsavedUci';

let state: {
  values: Record<string, Record<string, Record<string, unknown>>>;
  creates: Record<string, Record<string, Record<string, unknown>>>;
  changes: Record<string, Record<string, Record<string, unknown>>>;
  deletes: Record<string, Record<string, unknown>>;
  reorder: Record<string, boolean>;
};

beforeEach(() => {
  state = {
    values: {
      nexroute: {
        sec_a: { '.name': 'sec_a', '.type': 'section', '.index': 0 },
        sec_b: { '.name': 'sec_b', '.type': 'section', '.index': 1 },
      },
      network: { lan: { '.name': 'lan', '.index': 0 } },
    },
    creates: {},
    changes: {},
    deletes: {},
    reorder: {},
  };
  (globalThis as unknown as { uci: unknown }).uci = { state };
});

describe('what a dismissed dialog leaves in uci', () => {
  it('is taken back to what uci held when the dialog opened', () => {
    state.changes.nexroute = { sec_a: { label: 'kept' } };
    const unsaved = captureUnsavedUci();

    state.creates.nexroute = {
      tun_1: { '.name': 'tun_1', '.type': 'tunnel', section: 'sec_a' },
    };
    state.changes.nexroute.sec_a.label = 'dismissed';
    state.changes.nexroute.sec_b = { enabled: '0' };
    state.deletes.nexroute = { sec_b: true };
    restoreUnsavedUci(unsaved);

    expect(state.creates.nexroute).toBeUndefined();
    expect(state.changes.nexroute).toEqual({ sec_a: { label: 'kept' } });
    expect(state.deletes.nexroute).toBeUndefined();
  });

  it('keeps the order the rows were dragged into before the dialog', () => {
    state.values.nexroute.sec_a['.index'] = 1;
    state.values.nexroute.sec_b['.index'] = 0;
    state.reorder.nexroute = true;
    const unsaved = captureUnsavedUci();

    state.values.nexroute.sec_a['.index'] = 0;
    state.values.nexroute.sec_b['.index'] = 1;
    restoreUnsavedUci(unsaved);

    expect(state.reorder.nexroute).toBe(true);
    expect(state.values.nexroute.sec_a['.index']).toBe(1);
    expect(state.values.nexroute.sec_b['.index']).toBe(0);
  });

  it('touches no other package', () => {
    state.changes.network = { lan: { proto: 'dhcp' } };
    const unsaved = captureUnsavedUci();
    state.changes.network.lan.proto = 'static';
    restoreUnsavedUci(unsaved);

    expect(state.changes.network).toEqual({ lan: { proto: 'static' } });
  });

  it('is left alone once a save has reloaded the package', () => {
    const unsaved = captureUnsavedUci();
    state.values.nexroute = {
      sec_a: { '.name': 'sec_a', '.type': 'section', '.index': 0 },
    };
    state.changes.nexroute = { sec_a: { label: 'new' } };
    restoreUnsavedUci(unsaved);

    expect(state.changes.nexroute).toEqual({ sec_a: { label: 'new' } });
  });
});
