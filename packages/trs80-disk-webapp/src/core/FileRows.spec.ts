import {describe, expect, it} from "vitest";
import {FileKind, fileKindToString, filterRows, getFileRows} from "./FileRows.js";
import {makeBlankDisk, makeDiskWithFiles} from "./TestHelpers.js";

describe("getFileRows", () => {
    it("lists a BASIC program and a CMD file", async () => {
        const disk = await makeDiskWithFiles();
        const rows = getFileRows(disk.session, false);
        expect(rows.map(row => row.fullName)).to.eql(["HELLO/BAS", "PROG/CMD"]);

        const [hello, prog] = rows;
        expect(hello.name).to.equal("HELLO");
        expect(hello.extension).to.equal("BAS");
        expect(hello.hostName).to.equal("HELLO.BAS");
        expect(hello.kind).to.equal(FileKind.BASIC);
        expect(fileKindToString(hello.kind)).to.equal("BASIC program");
        expect(hello.size).to.be.greaterThan(0);
        expect(hello.attributes?.invisible).to.equal(false);
        expect(hello.attributes?.system).to.equal(false);
        expect(hello.attributes?.hasPasswords).to.equal(false);
        expect(hello.attributes?.protection).to.be.a("string");
        expect(hello.damage).to.equal(undefined);
        expect(hello.date?.getFullYear()).to.equal(2001);
        expect(hello.dateText).to.contain("2001");

        expect(prog.kind).to.equal(FileKind.CMD);
        expect(prog.size).to.equal(11);
        expect(prog.bytes.length).to.equal(11);
    });

    it("has no rows for an empty disk", async () => {
        const disk = await makeBlankDisk();
        expect(getFileRows(disk.session, false)).to.eql([]);
        expect(getFileRows(disk.session, true).length).to.be.greaterThan(0);
    });
});

describe("filterRows", () => {
    it("matches wildcards, case-insensitively, as the CLI does", async () => {
        const disk = await makeDiskWithFiles();
        const rows = getFileRows(disk.session, false);
        expect(filterRows(rows, "").length).to.equal(2);
        expect(filterRows(rows, "*.bas").map(row => row.fullName)).to.eql(["HELLO/BAS"]);
        expect(filterRows(rows, "*/cmd").map(row => row.fullName)).to.eql(["PROG/CMD"]);
        expect(filterRows(rows, "h* p*").length).to.equal(2);
        expect(filterRows(rows, "hel").length).to.equal(0);
    });
});
