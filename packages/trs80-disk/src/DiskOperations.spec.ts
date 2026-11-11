import {convertFloppy, FloppyImageFormat, makeTrsdos23TestDisk, type TestFile} from "trs80-base";
import {describe, expect, it} from "vitest";
import {checkDisk, describeFixablePrograms, describeFreeableUnclaimed, repairDisk} from "./DiskCheck.js";
import {DiskError} from "./DiskError.js";
import {getWriteProtect, setWriteProtect} from "./DiskImageOperations.js";
import {DiskSession} from "./DiskSession.js";
import {TrimNothingReason, trimDisk} from "./DiskTrim.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};

/**
 * Open a small in-memory TRSDOS 2.3 disk, as a JV1 image unless a format is given.
 *
 * @param format the image format.
 * @param cylinderCount the number of cylinders of the disk, or undefined for the default.
 */
function makeSession(format = FloppyImageFormat.JV1, cylinderCount: number | undefined = undefined): DiskSession {
    const jv1 = makeTrsdos23TestDisk([HELLO], {cylinderCount});
    const floppy = format === FloppyImageFormat.JV1 ? jv1 : convertFloppy(jv1, format);
    if (typeof floppy === "string") {
        throw new Error(floppy);
    }
    return DiskSession.fromBinary(format === FloppyImageFormat.JV1 ? "test.jv1" : "test.dmk", floppy.binary);
}

describe("DiskImageOperations", () => {
    it("sets the write-protect flag of a DMK image and back", () => {
        const session = makeSession(FloppyImageFormat.DMK);
        expect(getWriteProtect(session)).to.equal(false);
        expect(setWriteProtect(session, true)).to.equal(true);
        expect(getWriteProtect(session)).to.equal(true);
        expect(setWriteProtect(session, true)).to.equal(false);
        expect(setWriteProtect(session, false)).to.equal(true);
        expect(getWriteProtect(session)).to.equal(false);
    });

    it("says why a JV1 image has no flag", () => {
        const session = makeSession();
        expect(getWriteProtect(session)).to.be.a("string");
        expect(() => setWriteProtect(session, true)).to.throw(DiskError);
    });
});

describe("DiskCheck", () => {
    it("checks a clean disk", () => {
        const result = checkDisk(makeSession());
        expect(result.findings.filter(finding => finding.kind !== undefined)).to.be.an("array");
        expect(result.readOnlyReason).to.equal(undefined);
    });

    it("has nothing to repair on a clean disk", () => {
        const result = repairDisk(makeSession(), {freeUnclaimed: false, fixProgramSizes: false});
        expect(result.repaired.changes).to.eql([]);
        expect(result.repaired.remaining).to.eql([]);
        expect(result.damagedBefore).to.equal(false);
        expect(result.readOnlyReasonAfter).to.equal(undefined);
    });

    it("describes what could be repaired", () => {
        expect(describeFreeableUnclaimed(1)).to.equal(
            "1 granule is marked used but no file claims it. Use --free-unclaimed to free it, unless a program keeps data there.");
        expect(describeFixablePrograms(["A/CMD", "B/CMD"])).to.equal(
            "2 programs run past their directory size: A/CMD and B/CMD. Use --fix-program-sizes to set their sizes.");
        expect(describeFixablePrograms(["A", "B", "C", "D", "E", "F"])).to.contain("A, B, C, D, and 2 more");
    });
});

describe("DiskTrim", () => {
    it("trims the free cylinders at the end of an 80-cylinder image when forced", () => {
        const session = makeSession(FloppyImageFormat.JV1, 80);
        expect(() => trimDisk(session, {cylinders: 40, dropSide: false, force: false})).to.throw("Use --force");
        const result = trimDisk(session, {cylinders: 40, dropSide: false, force: true});
        expect(result.trimmed).to.equal(true);
        if (result.trimmed) {
            expect(result.newSize).to.be.lessThan(result.oldSize);
            expect(result.removed.length).to.equal(1);
        }
        const again = trimDisk(session, {cylinders: 40, dropSide: false, force: true});
        expect(again).to.eql({trimmed: false, reason: TrimNothingReason.CYLINDERS, cylinderCount: 40});
    });

    it("refuses 0 cylinders and says when there's nothing on a second side", () => {
        const session = makeSession();
        expect(() => trimDisk(session, {cylinders: 0, dropSide: false, force: false})).to.throw("Invalid --cylinders \"0\"");
        expect(trimDisk(session, {cylinders: undefined, dropSide: true, force: false}))
            .to.eql({trimmed: false, reason: TrimNothingReason.ONE_SIDE, cylinderCount: 35});
    });
});

describe("DiskSession free space", () => {
    it("gives the free space as numbers and as text", () => {
        const session = makeSession();
        const free = session.getFreeSpace();
        expect(free.granuleBytes).to.equal(1280);
        expect(free.freeBytes).to.equal(free.freeGranules*free.granuleBytes);
        expect(session.getFreeSpaceText()).to.contain(free.freeGranules.toLocaleString() + " granules of 1,280 bytes each");
    });
});
