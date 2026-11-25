// Private, bounded copy of NexRoute's syslog messages. The state service is
// its sole writer; the CLI and diagnostic report only read it.
let fs = require("fs");
let common = require("core.common");

let paths = { file: "/var/log/nexroute.log" };
const MAX_BYTES = 4 * 1024 * 1024;
const UI_BYTES = 128 * 1024;

function read() {
    return fs.readfile(paths.file) ?? "";
}

// Atomic replacement also ensures readers never see a partial log.
function write_private(path, value) {
    if (!common.ensure_dir(common.parent_dir(path)))
        return false;
    let now = clock();
    let temp = sprintf("%s.%d.%d.tmp", path, now[0], now[1]);
    let file = fs.open(temp, "wx", 0600);
    if (file == null)
        return false;
    let written = file.write(value);
    let closed = file.close();
    if (written != length(value) || !closed || !fs.rename(temp, path)) {
        fs.unlink(temp);
        return false;
    }
    return true;
}

function bounded(value, limit) {
    limit ??= MAX_BYTES;
    if (length(value) <= limit)
        return value;
    let tail = substr(value, length(value) - limit);
    let newline = index(tail, "\n");
    return newline < 0 ? "" : substr(tail, newline + 1);
}

// Keep the last seen syslog line separately, including when the visible file
// is empty. Restarting the state service must not restore cleared history.
function pending(tail, anchor) {
    if (anchor != null && anchor != "")
        for (let i = length(tail) - 1; i >= 0; i--)
            if (tail[i] == anchor)
                return slice(tail, i + 1);
    return tail;
}

function sync(tail) {
    let anchor = fs.readfile(paths.file + ".cursor");
    let lines = pending(tail, anchor);
    if (length(lines) == 0)
        return { success: true, lines: [] };
    let text = bounded(read() + join("\n", lines) + "\n");
    if (!write_private(paths.file, text) ||
        !write_private(paths.file + ".cursor", tail[length(tail) - 1]))
        return { success: false, lines: [] };
    return { success: true, lines };
}

function clear(tail) {
    // Record the current syslog boundary before truncating the journal.
    if (!write_private(paths.file + ".cursor", length(tail) ? tail[length(tail) - 1] : ""))
        return false;
    return write_private(paths.file, "");
}

function read_visible() {
    return bounded(read(), UI_BYTES);
}

return { paths, read, read_visible, sync, clear, pending, bounded };
