import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeShellCommand: vi.fn(),
}));

vi.mock('../../../../helpers/executeShellCommand', () => ({
  executeShellCommand: mocks.executeShellCommand,
}));

import { NexRoute } from '../../../types';
import { callBaseMethod } from '../callBaseMethod';

describe('callBaseMethod', () => {
  beforeEach(() => {
    mocks.executeShellCommand.mockReset();
  });

  it('fails on non-zero exit code even when stdout is present by default', async () => {
    mocks.executeShellCommand.mockResolvedValue({
      stdout: '{"ok":false}',
      stderr: 'command failed',
      code: 1,
    });

    const response = await callBaseMethod(NexRoute.AvailableMethods.CHECK_DNS);

    expect(response).toEqual({
      success: false,
      error: 'command failed',
    });
  });

  it('passes a custom timeout to long-running commands', async () => {
    mocks.executeShellCommand.mockResolvedValue({
      stdout: '{"ok":true}',
      stderr: '',
      code: 0,
    });

    await callBaseMethod(
      NexRoute.AvailableMethods.REPORT,
      [],
      '/usr/bin/nexroute',
      { timeout: 60000 },
    );

    expect(mocks.executeShellCommand).toHaveBeenCalledWith({
      command: '/usr/bin/nexroute',
      args: ['report'],
      timeout: 60000,
    });
  });
});
