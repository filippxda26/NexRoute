import { callBaseMethod } from './callBaseMethod';
import { NexRoute } from '../../types';
import { callUbus } from '../../../helpers/callUbus';
import { executeShellCommand } from '../../../helpers/executeShellCommand';

const UI_ACTION_RPC_TIMEOUT_MS = 15000;
const GET_UI_STATE_RPC_TIMEOUT_MS = 3000;
// Covers only the state service still computing its first answer.
const SYSTEM_INFO_UBUS_TIMEOUT_MS = 5000;
const LOG_TEXT_UBUS_TIMEOUT_MS = 5000;
// The router-side Clash transport gives an update a minute; LuCI aborts an RPC after twenty
// seconds unless the timeout is raised.
const CLASH_API_TRANSPORT_TIMEOUT_MS = 65000;
// A check on a slow router takes far longer than an ordinary RPC.
const DIAGNOSTIC_CHECK_RPC_TIMEOUT_MS = 3 * 60 * 1000;

let checkLogsRequest: Promise<NexRoute.MethodResponse<string>> | null = null;
let servedLog: { cursor: number; text: string } | null = null;

type LogTextReply = { cursor?: number; unchanged?: boolean; text?: string };

// The state service reads the log again only once a line arrived past the cursor it handed out;
// the CLI answers when the service does not run. A log with no NexRoute line yet is empty, not a
// failed read.
async function readLogs(): Promise<NexRoute.MethodResponse<string>> {
  const served = await callUbus<LogTextReply>({
    object: 'nexroute',
    method: 'log_text',
    params: servedLog ? { cursor: servedLog.cursor } : {},
    timeoutMs: LOG_TEXT_UBUS_TIMEOUT_MS,
  });
  const reply = served.success ? served.data : null;
  if (typeof reply?.cursor === 'number') {
    const text = reply.unchanged ? servedLog?.text : reply.text;
    if (typeof text === 'string') {
      servedLog = { cursor: reply.cursor, text };
      return { success: true, data: text };
    }
  }

  servedLog = null;
  const response = await executeShellCommand({
    command: '/usr/bin/nexroute',
    args: [NexRoute.AvailableMethods.CHECK_LOGS],
    timeout: 15000,
  });
  return response.code
    ? { success: false, error: response.stderr || response.stdout || '' }
    : { success: true, data: response.stdout };
}

function checkLogs() {
  if (!checkLogsRequest) {
    checkLogsRequest = readLogs().finally(() => {
      checkLogsRequest = null;
    });
  }

  return checkLogsRequest;
}

function parseJsonObjectOutput<T>(output: string): T | null {
  if (!output) {
    return null;
  }

  try {
    return JSON.parse(output) as T;
  } catch (_error) {
    const jsonMatch = output.match(/(\{[\s\S]*\})\s*$/);

    if (!jsonMatch) {
      return null;
    }

    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch (_jsonError) {
      return null;
    }
  }
}

function parseUiActionStartResult(
  response: Awaited<ReturnType<typeof executeShellCommand>>,
) {
  return parseJsonObjectOutput<NexRoute.UiActionStartResult>(response.stdout);
}

function uiActionFailure(
  response: Awaited<ReturnType<typeof executeShellCommand>>,
  parsedResponse?: { message?: string } | null,
  fallback: string = _('Failed to execute'),
) {
  return {
    success: false,
    error: parsedResponse?.message || response.stderr || fallback,
  } as NexRoute.MethodFailureResponse;
}

function diagnosticCheck<T>(
  method: NexRoute.AvailableMethods,
  args: string[] = [],
) {
  return callBaseMethod<T>(method, args, '/usr/bin/nexroute', {
    timeout: DIAGNOSTIC_CHECK_RPC_TIMEOUT_MS,
  });
}

export const NexRouteShellMethods = {
  checkService: async () =>
    diagnosticCheck<NexRoute.ServiceCheckResult>(
      NexRoute.AvailableMethods.CHECK_SERVICE,
    ),
  checkDns: async () =>
    diagnosticCheck<NexRoute.DnsCheckResult>(NexRoute.AvailableMethods.CHECK_DNS),
  checkTraffic: async () =>
    diagnosticCheck<NexRoute.TrafficCheckResult>(
      NexRoute.AvailableMethods.CHECK_TRAFFIC,
    ),
  checkServers: async () =>
    diagnosticCheck<NexRoute.ServersCheckResult>(
      NexRoute.AvailableMethods.CHECK_SERVERS,
    ),
  // The router masks the checks by the same rules as the rest of the report.
  report: async (masked: boolean, checks: string) =>
    diagnosticCheck<NexRoute.ReportAttachments>(NexRoute.AvailableMethods.REPORT, [
      masked ? 'masked' : 'raw',
      checks,
    ]),
  clashApi: async (method: string, path: string, body = '') =>
    callBaseMethod<NexRoute.ClashApiResponse>(
      NexRoute.AvailableMethods.CLASH_API,
      [method, path, body],
      '/usr/bin/nexroute',
      {
        timeout:
          method.toUpperCase() === 'GET' && !/\/(delay|exit)\?/.test(path)
            ? 10000
            : CLASH_API_TRANSPORT_TIMEOUT_MS,
      },
    ),
  clashSummary: async () =>
    callBaseMethod<NexRoute.ClashApiResponse>(
      NexRoute.AvailableMethods.CLASH_SUMMARY,
      [],
      '/usr/bin/nexroute',
      { timeout: 10000 },
    ),
  // Through the CLI: init script commands wait on procd's per-service lock.
  enable: async () => callBaseMethod<unknown>(NexRoute.AvailableMethods.ENABLE),
  disable: async () => callBaseMethod<unknown>(NexRoute.AvailableMethods.DISABLE),
  checkLogs,
  // The state service holds the versions until the installed packages change; the CLI answers
  // when it is not running.
  getSystemInfo: async () => {
    const served = await callUbus<{
      available?: boolean;
      system_info?: NexRoute.GetSystemInfo;
    }>({
      object: 'nexroute',
      method: 'system_info',
      timeoutMs: SYSTEM_INFO_UBUS_TIMEOUT_MS,
    });

    if (served.success && served.data.available && served.data.system_info) {
      return { success: true as const, data: served.data.system_info };
    }

    return callBaseMethod<NexRoute.GetSystemInfo>(
      NexRoute.AvailableMethods.GET_SYSTEM_INFO,
    );
  },
  // Runs the core itself, so only a page the state service cannot answer asks.
  getCoreFeatures: async () =>
    callBaseMethod<NexRoute.CoreFeatures>(
      NexRoute.AvailableMethods.GET_CORE_FEATURES,
    ),
  getUiState: async () =>
    callBaseMethod<NexRoute.UiState>(
      NexRoute.AvailableMethods.GET_UI_STATE,
      [],
      '/usr/bin/nexroute',
      { timeout: GET_UI_STATE_RPC_TIMEOUT_MS },
    ),
  serviceActionStart: async (action: NexRoute.ServiceAction) => {
    const response = await executeShellCommand({
      command: '/usr/bin/nexroute',
      args: [NexRoute.AvailableMethods.SERVICE_ACTION_ASYNC, action],
      timeout: UI_ACTION_RPC_TIMEOUT_MS,
    });
    const parsedResponse = parseUiActionStartResult(response);

    if (
      (response.code ?? 0) !== 0 ||
      !parsedResponse?.success ||
      !parsedResponse.job_id
    ) {
      return uiActionFailure(
        response,
        parsedResponse,
        _('Service action failed'),
      );
    }

    return {
      success: true,
      data: parsedResponse,
    } as NexRoute.MethodSuccessResponse<NexRoute.UiActionStartResult>;
  },
  uiActionAck: async (jobId: string) => {
    const response = await executeShellCommand({
      command: '/usr/bin/nexroute',
      args: [NexRoute.AvailableMethods.UI_ACTION_ACK, jobId],
      timeout: UI_ACTION_RPC_TIMEOUT_MS,
    });
    const parsedResponse = parseUiActionStartResult(response);

    if ((response.code ?? 0) !== 0 || !parsedResponse?.success) {
      return uiActionFailure(response, parsedResponse);
    }

    return {
      success: true,
      data: parsedResponse,
    } as NexRoute.MethodSuccessResponse<NexRoute.UiActionStartResult>;
  },
};
