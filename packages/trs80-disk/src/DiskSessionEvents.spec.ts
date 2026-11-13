import {makeTrsdos23TestDisk, type TestFile} from "trs80-base";
import {describe, expect, it} from "vitest";
import {DiskError} from "./DiskError.js";
import {killFiles, renameFile} from "./DiskFileOperations.js";
import {DiskSession} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 300};

/**
 * Open a small in-memory TRSDOS 2.3 disk with two files.
 */
function makeSession(): DiskSession {
    return DiskSession.fromBinary("test.jv1", makeTrsdos23TestDisk([HELLO, WORLD]).binary);
}

/**
 * Count the change notifications of a session. The returned object's count is live.
 */
function countChanges(session: DiskSession): {count: number, stop: () => void} {
    const counter = {count: 0, stop: () => {}};
    counter.stop = session.onChange(() => counter.count++);
    return counter;
}

describe("DiskSession change events", () => {
    it("notifies once for a recorded change", async () => {
        const session = makeSession();
        const counter = countChanges(session);
        await session.runUndoable("kill hello.bas", () => {
            killFiles(session, ["HELLO/BAS"]);
        });
        expect(counter.count).to.equal(1);
    });

    it("sees the history entry in the notification", async () => {
        const session = makeSession();
        let entryCount = -1;
        session.onChange(() => {
            entryCount = session.getHistory().entries.length;
        });
        await session.runUndoable("kill hello.bas", () => {
            killFiles(session, ["HELLO/BAS"]);
        });
        expect(entryCount).to.equal(1);
    });

    it("doesn't notify for a command that changes nothing", async () => {
        const session = makeSession();
        const counter = countChanges(session);
        await session.runUndoable("nothing", () => {});
        expect(counter.count).to.equal(0);
    });

    it("notifies for undo and redo", async () => {
        const session = makeSession();
        await session.runUndoable("kill hello.bas", () => {
            killFiles(session, ["HELLO/BAS"]);
        });
        const counter = countChanges(session);
        session.undo();
        expect(counter.count).to.equal(1);
        session.redo();
        expect(counter.count).to.equal(2);
    });

    it("stops notifying after unsubscribing", async () => {
        const session = makeSession();
        const counter = countChanges(session);
        counter.stop();
        await session.runUndoable("kill hello.bas", () => {
            killFiles(session, ["HELLO/BAS"]);
        });
        expect(counter.count).to.equal(0);
    });

    it("keeps calling listeners when one throws", async () => {
        const session = makeSession();
        const originalError = console.error;
        console.error = () => {};
        try {
            session.onChange(() => {
                throw new Error("boom");
            });
            const counter = countChanges(session);
            session.markSaved();
            expect(counter.count).to.equal(1);
        } finally {
            console.error = originalError;
        }
    });

    it("notifies for saving and aborting", async () => {
        const session = makeSession();
        const counter = countChanges(session);
        await session.runUndoable("kill hello.bas", () => {
            killFiles(session, ["HELLO/BAS"]);
        });
        expect(counter.count).to.equal(1);
        session.save(() => {});
        expect(counter.count).to.equal(2);
        session.abort();
        expect(counter.count).to.equal(3);
    });

    it("notifies once for a change outside runUndoable", () => {
        const session = makeSession();
        const counter = countChanges(session);
        renameFile(session, "HELLO/BAS", "HI/BAS");
        expect(counter.count).to.equal(1);
    });
});

describe("DiskSession history", () => {
    /**
     * Make a session with three recorded changes.
     */
    async function makeHistory(): Promise<DiskSession> {
        const session = makeSession();
        await session.runUndoable("rename hello.bas a.bas", () => {
            renameFile(session, "HELLO/BAS", "A/BAS");
        });
        await session.runUndoable("rename a.bas b.bas", () => {
            renameFile(session, "A/BAS", "B/BAS");
        });
        await session.runUndoable("kill b.bas", () => {
            killFiles(session, ["B/BAS"]);
        });
        return session;
    }

    it("is empty at first", () => {
        const history = makeSession().getHistory();
        expect(history.entries).to.eql([]);
        expect(history.position).to.equal(0);
        expect(history.savedPosition).to.equal(0);
    });

    it("follows undo and redo", async () => {
        const session = await makeHistory();
        const labels = ["rename hello.bas a.bas", "rename a.bas b.bas", "kill b.bas"];
        expect(session.getHistory().entries).to.eql(labels);
        expect(session.getHistory().position).to.equal(3);
        session.undo();
        expect(session.getHistory().entries).to.eql(labels);
        expect(session.getHistory().position).to.equal(2);
        session.undo();
        expect(session.getHistory().position).to.equal(1);
        session.redo();
        expect(session.getHistory().position).to.equal(2);
        // A new change drops the redo entries.
        await session.runUndoable("kill world.bas", () => {
            killFiles(session, ["WORLD/BAS"]);
        });
        expect(session.getHistory().entries).to.eql([labels[0], labels[1], "kill world.bas"]);
    });

    it("tracks the saved position", async () => {
        const session = await makeHistory();
        expect(session.getHistory().savedPosition).to.equal(0);
        session.undo();
        session.markSaved();
        expect(session.getHistory().savedPosition).to.equal(2);
        session.undo();
        expect(session.getHistory().savedPosition).to.equal(2);
        session.redo();
        session.redo();
        expect(session.getHistory().savedPosition).to.equal(2);
        session.goToHistoryPosition(0);
        expect(session.getHistory().savedPosition).to.equal(2);
        expect(session.hasChanges()).to.equal(true);
        session.goToHistoryPosition(2);
        expect(session.hasChanges()).to.equal(false);
    });

    it("has no saved position when a new change drops it", async () => {
        const session = await makeHistory();
        session.markSaved();
        session.undo();
        session.undo();
        await session.runUndoable("kill world.bas", () => {
            killFiles(session, ["WORLD/BAS"]);
        });
        expect(session.getHistory().savedPosition).to.equal(undefined);
    });

    it("moves several steps with one notification", async () => {
        const session = await makeHistory();
        const counter = countChanges(session);
        session.goToHistoryPosition(0);
        expect(counter.count).to.equal(1);
        expect(session.getHistory().position).to.equal(0);
        session.goToHistoryPosition(2);
        expect(counter.count).to.equal(2);
        expect(session.getHistory().position).to.equal(2);
        session.goToHistoryPosition(2);
        expect(counter.count).to.equal(2);
    });

    it("rejects a position out of range", async () => {
        const session = await makeHistory();
        expect(() => session.goToHistoryPosition(4)).to.throw(DiskError);
        expect(() => session.goToHistoryPosition(-1)).to.throw(DiskError);
    });
});
