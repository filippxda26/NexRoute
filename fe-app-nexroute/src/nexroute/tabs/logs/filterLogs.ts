export function filterLogText(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return text
    .split(/\r?\n/)
    .filter((line) => {
      if (!line) {
        return false;
      }

      return !normalizedQuery || line.toLowerCase().includes(normalizedQuery);
    })
    .join('\n');
}

// A refreshed log can be a sliding window: find the longest suffix of the
// previous snapshot that is still at the start of the new one.
export function retainedLogLines(previous: string[], next: string[]): number {
  const prefix = Array<number>(next.length).fill(0);
  for (let i = 1, matched = 0; i < next.length; i += 1) {
    while (matched && next[i] !== next[matched]) {
      matched = prefix[matched - 1];
    }
    if (next[i] === next[matched]) {
      matched += 1;
    }
    prefix[i] = matched;
  }

  let matched = 0;
  for (const line of previous) {
    while (matched && (matched === next.length || line !== next[matched])) {
      matched = prefix[matched - 1];
    }
    if (line === next[matched]) {
      matched += 1;
    }
  }
  return matched;
}
