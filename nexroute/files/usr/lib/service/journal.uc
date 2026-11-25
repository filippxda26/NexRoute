// Private copy of NexRoute's syslog messages. The state service is
// its sole writer; the CLI and diagnostic report only read it.
let fs = require("fs");
let common = require("core.common");

let paths = { file: "/var/log/nexroute.log" };
// RPC transport chunk, not a retention or display limit.
const CHUNK_BYTES = 32 * 1024;

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

function append(value) {
    if (!common.ensure_dir(common.parent_dir(paths.file)))
        return false;
    let file = fs.open(paths.file, "a", 0600);
    if (file == null)
        return false;
    let written = file.write(value);
    let closed = file.close();
    return written == length(value) && !!closed;
}

// The file can grow without a configured cap. Read a fixed snapshot in
// transport-sized pieces, preserving bytes across UTF-8 boundaries.
function size() {
    return fs.stat(paths.file)?.size ?? 0;
}

function page(offset, end) {
    if (offset < 0 || end < offset || end > size())
        return null;
    if (offset == end)
        return { chunk: "", next: end, size: end };
    let file = fs.open(paths.file, "r");
    if (file == null)
        return null;
    let value = file.seek(offset, 0) ? file.read(min(CHUNK_BYTES, end - offset)) : null;
    file.close();
    if (value == null || length(value) == 0)
        return null;
    return { chunk: b64enc(value), next: offset + length(value), size: end };
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
    if (!append(join("\n", lines) + "\n") ||
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

return { paths, read, sync, clear, pending, size, page, CHUNK_BYTES };
