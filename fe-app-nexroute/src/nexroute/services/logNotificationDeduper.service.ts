import { getSessionStorage } from './browserStorage.service';
const LOG_NOTIFICATION_STORAGE_KEY =
  'nexroute:shown-log-error-notifications:v1';
const MAX_STORED_LOG_NOTIFICATIONS = 500;
// A NexRoute error as logread prints it: the date, the facility, the tag and the
// level before the message the alert shows.
const NEXROUTE_ERROR_LINE_PATTERN =
  /\bnexroute(?:\[\d+\])?:\s+\[error\]\s+(.*)$/i;
const NEXROUTE_INFO_LINE_PATTERN =
  /\bnexroute(?:\[\d+\])?:\s+\[info\]\s+(.*)$/i;

// The first line of each NexRoute action: a start, a stop, an apply and a reapply.
// A restart is a stop and a start.
export const NEXROUTE_ACTION_OPENINGS = [
  'Starting NexRoute',
  'Stopping NexRoute',
  'Applying configuration',
  'Reapplying configuration',
];

export type NexRouteLogNotification = {
  kind: 'error';
  line: string;
  message: string;
};

function readStoredKeys(storage: Storage | null): string[] {
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      storage.getItem(LOG_NOTIFICATION_STORAGE_KEY) || '[]',
    );

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeStoredKeys(storage: Storage | null, keys: string[]) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LOG_NOTIFICATION_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Notifications are still deduped in-memory when sessionStorage is blocked.
  }
}

export function isErrorLogLine(line: string) {
  return NEXROUTE_ERROR_LINE_PATTERN.test(line);
}

export function getNexRouteLogNotification(
  line: string,
): NexRouteLogNotification | null {
  const error = line.match(NEXROUTE_ERROR_LINE_PATTERN);
  return error ? { kind: 'error', line, message: error[1].trim() } : null;
}

export function opensNexRouteAction(line: string) {
  const info = line.match(NEXROUTE_INFO_LINE_PATTERN);
  return (
    !!info &&
    NEXROUTE_ACTION_OPENINGS.some((opening) => info[1].startsWith(opening))
  );
}

export function getLogNotificationKey(line: string) {
  return line.trim();
}

export class LogNotificationDeduper {
  private readonly storage: Storage | null;
  private readonly seenKeys: Set<string>;

  constructor(storage: Storage | null = getSessionStorage()) {
    this.storage = storage;
    this.seenKeys = new Set(
      readStoredKeys(storage).slice(-MAX_STORED_LOG_NOTIFICATIONS),
    );
  }

  shouldNotify(line: string) {
    if (!getNexRouteLogNotification(line)) {
      return false;
    }

    const key = getLogNotificationKey(line);

    if (!key || this.seenKeys.has(key)) {
      return false;
    }

    this.seenKeys.add(key);
    for (const oldest of this.seenKeys) {
      if (this.seenKeys.size <= MAX_STORED_LOG_NOTIFICATIONS) break;
      this.seenKeys.delete(oldest);
    }
    writeStoredKeys(this.storage, Array.from(this.seenKeys));
    return true;
  }
}
