import {BasicDialect, makeTrsdos23TestDisk, type TestFile} from "trs80-base";
import {describe, expect, it} from "vitest";
import {DiskError} from "./DiskError.js";
import {
    type AddOptions, addFiles, changeAttributes, changeDiskInfo, describeChanges, killFiles, listAttributes,
    planAdd, readDiskInfo, renameFile,
} from "./DiskFileOperations.js";
import {DiskSession} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 300};

const DEFAULT_OPTIONS: AddOptions = {
    ascii: false, binary: false, basic: BasicDialect.MODEL_III, system: false, invisible: false, overwrite: false,
};

/**
 * Open a small in-memory TRSDOS 2.3 disk with the given files.
 */
function makeSession(files: TestFile[] = [HELLO, WORLD]): DiskSession {
    return DiskSession.fromBinary("test.jv1", makeTrsdos23TestDisk(files).binary);
}

/**
 * Make a host file from text.
 */
function hostFile(name: string, text: string): {label: string, name: string, bytes: Uint8Array} {
    return {label: "dir/" + name, name, bytes: new TextEncoder().encode(text)};
}

/**
 * The names of the files on the session's disk, as the disk shows them.
 */
function fileNames(session: DiskSession): string[] {
    return listAttributes(session, ["*"]).dirEntries.map(dirEntry => dirEntry.getFilename("/"));
}

/**
 * The message of the DiskError that the function throws, failing the test if it doesn't.
 */
function errorOf(run: () => void): string {
    try {
        run();
    } catch (e) {
        expect(e).to.be.instanceOf(DiskError);
        return (e as DiskError).message;
    }
    expect.fail("expected a DiskError");
}

describe("DiskFileOperations", () => {
    it("plans every problem at once", () => {
        const session = makeSession();
        const plan = planAdd(session, [
            hostFile("a.txt", "one\n"),
            hostFile("A.TXT", "two\n"),
            hostFile("bad.cas", "not a cassette"),
            hostFile("hello.bas", "10 PRINT 1\n"),
        ], {...DEFAULT_OPTIONS, ascii: true});

        expect(plan.map(item => item.problem === undefined)).to.eql([true, false, false, true]);
        expect(plan[1].problem).to.equal("\"dir/a.txt\" and \"dir/A.TXT\" would both be A/TXT on the disk");
        expect(plan[2].problem).to.be.a("string");
        expect(plan[0].name).to.equal("A/TXT");
        expect(plan[0].conversionMessages).to.eql(["Converted line endings of a.txt."]);
        expect(plan[3].existingName).to.equal("HELLO/BAS");
        // Planning changes nothing.
        expect(fileNames(session)).to.eql(["HELLO/BAS", "WORLD/BAS"]);
    });

    it("adds files and kills them again", () => {
        const session = makeSession();
        const plan = planAdd(session, [hostFile("notes.txt", "hi\n"), hostFile("b.bin", "xyz")], DEFAULT_OPTIONS);
        const result = addFiles(session, plan, DEFAULT_OPTIONS);
        expect(result.files.map(file => [file.name, file.size, file.replaced])).to.eql([
            ["NOTES/TXT", 3, false], ["B/BIN", 3, false],
        ]);
        expect(result.files[0].conversionMessages).to.eql(["Converted line endings of notes.txt."]);
        expect(fileNames(session)).to.have.members(["HELLO/BAS", "WORLD/BAS", "NOTES/TXT", "B/BIN"]);

        expect(killFiles(session, ["*.TXT", "B/BIN"])).to.eql(["NOTES/TXT", "B/BIN"]);
        expect(fileNames(session)).to.eql(["HELLO/BAS", "WORLD/BAS"]);
        expect(errorOf(() => killFiles(session, ["NOPE"]))).to.equal("No file on the disk matches \"NOPE\"");
    });

    it("refuses an existing file without overwrite and replaces it with it", () => {
        const session = makeSession();
        const sources = [hostFile("hello.bas", "10 PRINT 1\n")];
        const plan = planAdd(session, sources, {...DEFAULT_OPTIONS, binary: true});
        expect(errorOf(() => addFiles(session, plan, {...DEFAULT_OPTIONS, binary: true})))
            .to.equal("HELLO/BAS is already on the disk (use --overwrite to replace it)");

        const options = {...DEFAULT_OPTIONS, binary: true, overwrite: true};
        const result = addFiles(session, planAdd(session, sources, options), options);
        expect(result.files.map(file => [file.name, file.replaced])).to.eql([["HELLO/BAS", true]]);
    });

    it("throws a file's problem from addFiles", () => {
        const session = makeSession();
        const plan = planAdd(session, [hostFile("bad.cas", "x")], DEFAULT_OPTIONS);
        expect(errorOf(() => addFiles(session, plan, DEFAULT_OPTIONS))).to.equal(plan[0].problem);
    });

    it("rejects --as with several files", () => {
        const session = makeSession();
        expect(errorOf(() => planAdd(session, [hostFile("a", "1"), hostFile("b", "2")], {...DEFAULT_OPTIONS, as: "X"})))
            .to.equal("--as names one file, but 2 host files were given");
    });

    it("renames a file", () => {
        const session = makeSession();
        expect(renameFile(session, "hello/bas", "HI/BAS")).to.eql({oldName: "HELLO/BAS", newName: "HI/BAS"});
        expect(fileNames(session)).to.eql(["HI/BAS", "WORLD/BAS"]);
        expect(errorOf(() => renameFile(session, "NOPE/BAS", "X/BAS"))).to.equal("No file on the disk is called NOPE/BAS");
    });

    it("changes attributes", () => {
        const session = makeSession();
        const result = changeAttributes(session, ["*.BAS"], {invisible: true, protect: "READ"});
        expect(result.files).to.eql(["HELLO/BAS", "WORLD/BAS"]);
        expect(describeChanges(result.changes, result.protectionNames)).to.equal("invisible, protection READ");
        const listing = listAttributes(session, ["HELLO/BAS"]);
        expect(listing.dirEntries[0].isHidden()).to.equal(true);
        expect(errorOf(() => changeAttributes(session, ["*"], {protect: "bogus"}))).to.contain("Invalid --protect \"bogus\"");
    });

    it("changes the disk's information", () => {
        const session = makeSession();
        const info = changeDiskInfo(session, {name: "games"});
        expect(info.name).to.equal("GAMES");
        expect(readDiskInfo(session).name).to.equal("GAMES");
    });
});
