import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let blockReason: typeof import('../warpGenerate').warpGenerateBlockReason;
let showBlock: typeof import('../warpGenerate').showWarpGenerateBlock;
beforeAll(async () => {
  vi.stubGlobal('_', (text: string) => text);
  ({ warpGenerateBlockReason: blockReason, showWarpGenerateBlock: showBlock } =
    await import('../warpGenerate'));
});
afterAll(() => vi.unstubAllGlobals());

const service = (singbox: boolean, state: 'read' | 'loading' | 'failed') => ({
  loading: state === 'loading',
  failed: state === 'failed',
  data: {
    singbox: Number(singbox),
    nexrouteRunning: Number(singbox),
    nexrouteEnabled: 1,
    nexrouteBusy: null,
  },
});

describe('the WARP generate button', () => {
  it('is blocked only while profiles go through a section and the core is down', () => {
    expect(blockReason(true, service(false, 'read'))).toBe(
      'Start NexRoute: WARP is requested through a section',
    );
    expect(blockReason(true, service(true, 'read'))).toBe('');
    expect(blockReason(false, service(false, 'read'))).toBe('');
  });

  it('blocks nothing on a service state the page has not read', () => {
    expect(blockReason(true, service(false, 'loading'))).toBe('');
    expect(blockReason(true, service(false, 'failed'))).toBe('');
  });

  it('says the reason on the button and under it, and takes it back', () => {
    const button = { disabled: false, title: '' } as HTMLButtonElement;
    const hint = { textContent: '', style: { display: '' } } as HTMLElement;

    showBlock(button, hint, false, 'Start NexRoute');
    expect(button).toEqual({ disabled: true, title: 'Start NexRoute' });
    expect(hint).toEqual({
      textContent: 'Start NexRoute',
      style: { display: '' },
    });

    showBlock(button, hint, false, '');
    expect(button).toEqual({ disabled: false, title: '' });
    expect(hint).toEqual({ textContent: '', style: { display: 'none' } });
  });

  it('keeps a read-only form disabled', () => {
    const button = { disabled: true, title: '' } as HTMLButtonElement;
    const hint = { textContent: '', style: { display: '' } } as HTMLElement;

    showBlock(button, hint, true, '');
    expect(button.disabled).toBe(true);
  });
});
