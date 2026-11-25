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

t.test("the journal is bounded and keeps complete recent lines", () => {
    let line = "0123456789\n";
    let text = "";
    for (let i = 0; i < 15000; i++)
        text += line;
    let result = journal.bounded(text, 128 * 1024);
    t.ok(length(result) <= 128 * 1024);
    t.eq(substr(result, 0, length(line)), line);
    t.eq(journal.bounded(text), text);
});

t.done();
