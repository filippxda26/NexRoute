let t = require("t");
let stub = require("stub");
let fs = require("fs");
let journal = require("service.journal");

t.test("clearing the private file never restores the same syslog history", () => {
    journal.paths.file = stub.tmpdir() + "/nexroute.log";
    t.eq(journal.sync([ "old", "last" ]), { success: true, lines: [ "old", "last" ] });
    t.eq(journal.read(), "old\nlast\n");
    t.eq(journal.clear([ "old", "last" ]), true);
    t.eq(fs.readfile(journal.paths.file), "");
    t.eq(journal.sync([ "old", "last" ]), { success: true, lines: [] });
    t.eq(journal.read(), "");
    t.eq(journal.sync([ "last", "new" ]), { success: true, lines: [ "new" ] });
    t.eq(journal.read(), "new\n");
    t.eq(fs.stat(journal.paths.file).mode & 0777, 0600);
});

t.test("the journal retains all bytes and serves a complete snapshot in pages", () => {
    journal.paths.file = stub.tmpdir() + "/nexroute.log";
    let line = "0123456789\n";
    let text = "";
    for (let i = 0; i < 15000; i++)
        text += line;
    fs.writefile(journal.paths.file, text);
    t.eq(journal.sync([ "new" ]).success, true);
    t.eq(journal.read(), text + "new\n");
    let size = journal.size();
    let offset = 0;
    let result = "";
    while (offset < size) {
        let page = journal.page(offset, size);
        t.ok(page != null);
        if (page == null)
            break;
        result += b64dec(page.chunk);
        offset = page.next;
    }
    t.eq(result, text + "new\n");
});

t.done();
