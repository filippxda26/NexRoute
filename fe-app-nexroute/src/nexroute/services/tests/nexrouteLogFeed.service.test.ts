import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ callUbus: vi.fn() }));

vi.mock('../../../helpers/callUbus', () => ({
  callUbus: mocks.callUbus,
}));

async function freshFeed() {
  vi.resetModules();
  return import('../nexrouteLogFeed.service');
}

const gone = { success: false, message: 'Object not found', unavailable: true };

beforeEach(() => {
  mocks.callUbus.mockReset();
});

describe('the log feed', () => {
  it('starts from where the log stands and takes only the lines after it', async () => {
    mocks.callUbus.mockResolvedValue({ success: true, data: { cursor: 3 } });
    const feed = await freshFeed();

    const lines: string[] = [];
    feed.startNexRouteLogFeed((line) => lines.push(line));
    feed.takeNexRouteLogLines({ cursor: 3, lines: ['nexroute: old'] });
    await feed.placeNexRouteLogFeed();
    feed.takeNexRouteLogLines({ cursor: 4, lines: ['nexroute: new'] });

    expect(lines).toEqual(['nexroute: new']);
    expect(feed.getNexRouteLogCursor()).toBe(4);
  });

  it('goes on from the cursor of the page it took over from', async () => {
    const feed = await freshFeed();

    feed.startNexRouteLogFeed(() => {}, 7);
    await feed.placeNexRouteLogFeed();

    expect(feed.getNexRouteLogCursor()).toBe(7);
    expect(mocks.callUbus).not.toHaveBeenCalled();
  });

  it('asks where the log stands again once the state service is back', async () => {
    mocks.callUbus
      .mockResolvedValueOnce(gone)
      .mockResolvedValueOnce({ success: true, data: { cursor: 5 } });
    const feed = await freshFeed();

    feed.startNexRouteLogFeed(() => {});
    await feed.placeNexRouteLogFeed();
    expect(feed.getNexRouteLogCursor()).toBeUndefined();

    await feed.placeNexRouteLogFeed();
    expect(feed.getNexRouteLogCursor()).toBe(5);
  });
});
