import {describe, expect, it} from "vitest";
import {decodeTrsdos, type Trsdos} from "./Trsdos.js";
import {
    checkTrsdos,
    findProgramPastEof,
    type TrsdosCheckResult,
    type TrsdosFinding,
    TrsdosFindingKind,
    trsdosFindingKindSeverity,
    trsdosFindingKindToString,
    TrsdosFindingSeverity,
    trsdosFindingSeverityToString,
} from "./TrsdosCheck.js";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile, type TestGranule, testUserSlotDec} from "./TrsdosTestDisk.js";

/**
 * Make a test disk, decode it as TRSDOS, and check it, failing the test if it doesn't decode.
 */
function check(files: TestFile[], options: TestDiskOptions = {}): TrsdosCheckResult {
    const trsdos = decodeTrsdos(makeTrsdos23TestDisk(files, options));
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }
    return checkTrsdos(trsdos);
}

/**
 * The findings of one kind.
 */
function ofKind(result: TrsdosCheckResult, kind: TrsdosFindingKind): TrsdosFinding[] {
    return result.findings.filter(finding => finding.kind === kind);
}

/**
 * The kinds of the findings, in order.
 */
function kinds(result: TrsdosCheckResult): TrsdosFindingKind[] {
    return result.findings.map(finding => finding.kind);
}

describe("checkTrsdos", () => {
    it("finds nothing wrong on a clean disk", () => {
        const result = check([
            {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000},
            {name: "WORLD/TXT", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}, {lump: 8, granuleOffset: 1, granuleCount: 1}]},
        ]);

        // BOOT/SYS, DIR/SYS and the directory account for their own granules, so there are no notes either.
        expect(result.findings).to.eql([]);
        expect(result.granuleMap).not.to.be.undefined;
    });

    it("finds nothing wrong on an empty disk", () => {
        expect(check([]).findings).to.eql([]);
    });

    it("accepts a file with extended entries", () => {
        const result = check([{
            name: "BIG/DAT",
            extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}, {lump: 4, granuleOffset: 0, granuleCount: 1}, {lump: 5, granuleOffset: 0, granuleCount: 1}, {lump: 6, granuleOffset: 0, granuleCount: 1}, {lump: 7, granuleOffset: 0, granuleCount: 1}, {lump: 8, granuleOffset: 0, granuleCount: 1}],
        }]);

        expect(result.findings).to.eql([]);
    });

    it("groups granules shared by the same files into one finding", () => {
        const result = check([
            {name: "HELLO/CMD", extents: [{lump: 5, granuleOffset: 0, granuleCount: 2}]},
            {name: "GAME/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 3}]},
        ]);

        expect(kinds(result)).to.eql([TrsdosFindingKind.SHARED_GRANULES]);
        const finding = result.findings[0];
        expect(finding.message).to.equal("HELLO/CMD and GAME/BAS share 2 granules (cylinder 5, granules 0-1).");
        expect(finding.dirEntries.map(entry => entry.getFilename("/"))).to.eql(["HELLO/CMD", "GAME/BAS"]);
        expect(finding.granules.map(granule => granule.lump + ":" + granule.granule)).to.eql(["5:0", "5:1"]);
    });

    it("notes a granule that BOOT/SYS shares on the boot cylinder", () => {
        const result = check([{name: "SYS7/SYS", system: true, extents: [{lump: 0, granuleOffset: 0, granuleCount: 1}]}]);

        expect(kinds(result)).to.eql([TrsdosFindingKind.BOOT_SYS_OVERLAP]);
        expect(result.findings[0].message).to.match(/^BOOT\/SYS and SYS7\/SYS share 1 granule \(cylinder 0, granule 0\) on the boot cylinder\./);
    });

    it("lists several ranges of shared granules", () => {
        const result = check([
            {name: "ONE/DAT", extents: [{lump: 5, granuleOffset: 0, granuleCount: 2}, {lump: 7, granuleOffset: 0, granuleCount: 1}]},
            {name: "TWO/DAT", extents: [{lump: 5, granuleOffset: 0, granuleCount: 2}, {lump: 7, granuleOffset: 0, granuleCount: 1}]},
        ]);

        expect(kinds(result)).to.eql([TrsdosFindingKind.SHARED_GRANULES]);
        expect(result.findings[0].message)
            .to.equal("ONE/DAT and TWO/DAT share 3 granules (cylinder 5, granules 0-1; cylinder 7, granule 0).");
    });

    it("makes one finding for each distinct set of files that share granules", () => {
        const result = check([
            {name: "A/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}]},
            {name: "B/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}, {lump: 6, granuleOffset: 0, granuleCount: 1}]},
            {name: "C/DAT", extents: [{lump: 6, granuleOffset: 0, granuleCount: 1}]},
        ]);

        expect(kinds(result)).to.eql([TrsdosFindingKind.SHARED_GRANULES, TrsdosFindingKind.SHARED_GRANULES]);
        expect(result.findings[0].message).to.equal("A/DAT and B/DAT share 1 granule (cylinder 3, granule 0).");
        expect(result.findings[1].message).to.equal("B/DAT and C/DAT share 1 granule (cylinder 6, granule 0).");
    });

    it("finds granules that are claimed but free in the GAT, one finding per file", () => {
        const result = check([
            {name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]},
            {name: "TWO/DAT", extents: [{lump: 8, granuleOffset: 0, granuleCount: 1}]},
        ], {gatFree: [{lump: 3, granule: 1}, {lump: 4, granule: 0}, {lump: 8, granule: 0}]});

        // 4:0 isn't claimed by anyone, so it's just free.
        expect(kinds(result)).to.eql([TrsdosFindingKind.CLAIMED_BUT_FREE, TrsdosFindingKind.CLAIMED_BUT_FREE]);
        expect(result.findings[0].message)
            .to.equal("ONE/DAT uses 1 granule that the GAT says is free (cylinder 3, granule 1).");
        expect(result.findings[1].message)
            .to.equal("TWO/DAT uses 1 granule that the GAT says is free (cylinder 8, granule 0).");
        expect(result.findings[0].dirEntries.map(entry => entry.getFilename("/"))).to.eql(["ONE/DAT"]);
    });

    it("finds an extent that runs past the end of the disk", () => {
        const result = check([{name: "ONE/DAT", extents: [{lump: 34, granuleOffset: 1, granuleCount: 3}]}]);

        expect(ofKind(result, TrsdosFindingKind.EXTENT_OUT_OF_RANGE).length).to.equal(1);
        expect(ofKind(result, TrsdosFindingKind.EXTENT_OUT_OF_RANGE)[0].message).to.equal(
            "ONE/DAT has an extent of 3 granules starting at cylinder 34, granule 1, which runs past the end of the disk.");
        expect(ofKind(result, TrsdosFindingKind.EXTENT_OUT_OF_RANGE)[0].dirEntries.length).to.equal(1);
    });

    it("reports used granules that no file claims as one note", () => {
        const result = check([{name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]}], {gatUsed: [{lump: 10, granule: 0}, {lump: 11, granule: 1}, {lump: 12, granule: 0}]});

        expect(kinds(result)).to.eql([TrsdosFindingKind.USED_BUT_UNCLAIMED]);
        const finding = result.findings[0];
        expect(finding.message).to.equal(
            "The GAT marks 3 granules used that no file claims (cylinder 10, granule 0; cylinder 11, granule 1; " +
            "cylinder 12, granule 0). That's normal for locked-out cylinders and some DOSes' boot granules.");
        expect(finding.granules.length).to.equal(3);
        expect(finding.dirEntries).to.eql([]);
    });

    it("reports locked-out cylinders as a note", () => {
        const result = check([], {lockedOut: [20]});

        expect(kinds(result)).to.eql([TrsdosFindingKind.USED_BUT_UNCLAIMED]);
        expect(result.findings[0].granules.length).to.equal(2);
        expect(result.findings[0].message).to.contain("(cylinder 20, granules 0-1)");
    });

    it("shortens a long list of granules", () => {
        const gatUsed: TestGranule[] = [];
        for (let lump = 1; lump < 15; lump++) {
            gatUsed.push({lump, granule: 0});
        }
        const result = check([], {gatUsed});

        expect(result.findings[0].message).to.contain("; and 6 more)");
        expect(result.findings[0].granules.length).to.equal(14);
    });

    it("finds a HIT byte that doesn't match the file's name", () => {
        const result = check([
            {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}], hitByte: 0x99},
            {name: "WORLD/TXT", extents: [{lump: 4, granuleOffset: 0, granuleCount: 1}]},
        ]);

        expect(kinds(result)).to.eql([TrsdosFindingKind.HIT_MISMATCH]);
        expect(result.findings[0].message).to.match(/^The HIT byte for HELLO\/BAS is 99, but the hash of its name is [0-9A-F]{2}\.$/);
        expect(result.findings[0].dirEntries.map(entry => entry.getFilename("/"))).to.eql(["HELLO/BAS"]);
    });

    it("compares an extended entry's HIT byte with its primary's hash", () => {
        const extents: TestFile["extents"] = [{lump: 3, granuleOffset: 0, granuleCount: 1}, {lump: 4, granuleOffset: 0, granuleCount: 1}, {lump: 5, granuleOffset: 0, granuleCount: 1}, {lump: 6, granuleOffset: 0, granuleCount: 1}, {lump: 7, granuleOffset: 0, granuleCount: 1}];
        const result = check([{name: "BIG/DAT", extents, extendedHitByte: 0x99}]);

        expect(kinds(result)).to.eql([TrsdosFindingKind.HIT_MISMATCH]);
        expect(result.findings[0].message).to.match(/^The HIT byte for an extended entry of BIG\/DAT is 99, /);
    });

    it("finds an extended entry that no file reaches", () => {
        // The stray entry claims to extend HELLO/BAS (user slot 0), but HELLO/BAS doesn't link to it.
        const result = check([{name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}]}], {
            strayExtendedEntries: [{prevDec: testUserSlotDec(0), hitByte: 0x99, extents: [{lump: 10, granuleOffset: 0, granuleCount: 1}]}],
        });

        expect(kinds(result)).to.eql([TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY]);
        const dec = testUserSlotDec(1).toString(16).toUpperCase();
        expect(result.findings[0].message).to.equal(`The extended directory entry at DEC ${dec} isn't part of any file.`);
        expect(result.findings[0].dirEntries.length).to.equal(1);
        expect(result.findings[0].dirEntries[0].isExtendedEntry()).to.equal(true);
    });

    it("finds a file whose chain of directory entries is broken", () => {
        const result = check([{name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}], danglingNextDec: testUserSlotDec(20)}]);

        expect(kinds(result)).to.eql([TrsdosFindingKind.DAMAGED_FILE]);
        expect(result.findings[0].message).to.equal("HELLO/BAS is damaged: missing extended directory entry.");
    });

    it("puts layout findings first, then damage, then notes", () => {
        const result = check([
            {name: "A/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}]},
            {name: "B/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}], hitByte: 0x99},
        ], {gatUsed: [{lump: 10, granule: 0}]});

        expect(kinds(result)).to.eql([
            TrsdosFindingKind.SHARED_GRANULES,
            TrsdosFindingKind.HIT_MISMATCH,
            TrsdosFindingKind.USED_BUT_UNCLAIMED,
        ]);
        const severities = result.findings.map(finding => trsdosFindingKindSeverity(finding.kind));
        expect(severities).to.eql([...severities].sort((a, b) => a - b));
    });

    it("doesn't change the disk or the decoder's output", () => {
        const trsdos: Trsdos = decodeTrsdos(makeTrsdos23TestDisk([
            {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]},
            {name: "BIG/DAT", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}, {lump: 6, granuleOffset: 0, granuleCount: 1}, {lump: 7, granuleOffset: 0, granuleCount: 1}, {lump: 8, granuleOffset: 0, granuleCount: 1}, {lump: 9, granuleOffset: 0, granuleCount: 1}]},
        ]))!;
        const before = trsdos.getDirEntries(true).map(entry => entry.getFilename("/"));
        checkTrsdos(trsdos);

        expect(trsdos.getDirEntries(true).map(entry => entry.getFilename("/"))).to.eql(before);
        expect(before.sort()).to.eql(["BIG/DAT", "BOOT/SYS", "DIR/SYS", "HELLO/BAS"]);
        // The slots include the extended entry, which getDirEntries() leaves out.
        const slots = trsdos.getDirSlots();
        expect(slots.length).to.equal(5);
        expect(slots.filter(slot => slot.dirEntry.isExtendedEntry()).length).to.equal(1);
        expect(slots.every(slot => slot.hitByte !== undefined && slot.hitByte !== 0)).to.equal(true);
    });
});

describe("TrsdosFindingKind", () => {
    it("has a severity and a name for every kind", () => {
        const expected = new Map<TrsdosFindingKind, TrsdosFindingSeverity>([
            [TrsdosFindingKind.GAT_UNREADABLE, TrsdosFindingSeverity.LAYOUT],
            [TrsdosFindingKind.GAT_NOT_STRICT, TrsdosFindingSeverity.LAYOUT],
            [TrsdosFindingKind.HIT_IGNORED, TrsdosFindingSeverity.LAYOUT],
            [TrsdosFindingKind.SHARED_GRANULES, TrsdosFindingSeverity.DAMAGE],
            [TrsdosFindingKind.CLAIMED_BUT_FREE, TrsdosFindingSeverity.DAMAGE],
            [TrsdosFindingKind.EXTENT_OUT_OF_RANGE, TrsdosFindingSeverity.DAMAGE],
            [TrsdosFindingKind.HIT_MISMATCH, TrsdosFindingSeverity.DAMAGE],
            [TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY, TrsdosFindingSeverity.DAMAGE],
            [TrsdosFindingKind.DAMAGED_FILE, TrsdosFindingSeverity.DAMAGE],
            [TrsdosFindingKind.PROGRAM_PAST_EOF, TrsdosFindingSeverity.NOTE],
            [TrsdosFindingKind.USED_BUT_UNCLAIMED, TrsdosFindingSeverity.NOTE],
            [TrsdosFindingKind.BOOT_SYS_OVERLAP, TrsdosFindingSeverity.NOTE],
        ]);

        const names = new Set<string>();
        for (const value of Object.values(TrsdosFindingKind)) {
            if (typeof value === "number") {
                expect(trsdosFindingKindSeverity(value)).to.equal(expected.get(value));
                names.add(trsdosFindingKindToString(value));
            }
        }
        expect(names.size).to.equal(expected.size);
    });

    it("names the severities", () => {
        expect(trsdosFindingSeverityToString(TrsdosFindingSeverity.LAYOUT)).to.equal("layout");
        expect(trsdosFindingSeverityToString(TrsdosFindingSeverity.DAMAGE)).to.equal("damage");
        expect(trsdosFindingSeverityToString(TrsdosFindingSeverity.NOTE)).to.equal("note");
    });
});

/**
 * A small CMD program: a load block of three bytes at 0x5200 (7 bytes in all), then a transfer record to
 * the given address (4 bytes), 11 bytes in all.
 */
function makeSmallProgram(entry = 0x5200): Uint8Array {
    return new Uint8Array([0x01, 0x05, 0x00, 0x52, 0xAA, 0xBB, 0xCC, 0x02, 0x02, entry & 0xFF, entry >> 8]);
}

/**
 * A file with the program as its contents and a size that may cut it short, with 0xAA after it.
 */
function makeProgramFile(contents: Uint8Array, size: number): TestFile {
    return {
        name: "PROG/CMD",
        extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}],
        size,
        contents,
        data: 0xAA,
    };
}

describe("findProgramPastEof", () => {
    it("reports a program whose size ends before its transfer record in the last sector", () => {
        const result = check([makeProgramFile(makeSmallProgram(), 9)]);
        const findings = ofKind(result, TrsdosFindingKind.PROGRAM_PAST_EOF);
        expect(findings.length).to.equal(1);
        expect(findings[0].message).to.equal("PROG/CMD's directory gives 9 bytes, but the program runs on 2 bytes " +
            "further into its last sector, to its transfer record. The DOS loads it whole, but copying it by its size " +
            "gives a broken program.");
        expect(findings[0].dirEntries.map(dirEntry => dirEntry.getFilename("/"))).to.eql(["PROG/CMD"]);
        expect(trsdosFindingKindToString(findings[0].kind)).to.equal("program-past-eof");
        expect(kinds(result)).to.eql([TrsdosFindingKind.PROGRAM_PAST_EOF]);
    });

    it("returns the program's real size", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([makeProgramFile(makeSmallProgram(), 9)]));
        const file = trsdos?.findFile("PROG/CMD");
        if (trsdos === undefined || file === undefined) {
            throw new Error("Test disk didn't decode");
        }
        expect(findProgramPastEof(trsdos, file)).to.equal(11);
    });

    it("doesn't report a program whose size already covers its transfer record", () => {
        expect(ofKind(check([makeProgramFile(makeSmallProgram(), 11)]), TrsdosFindingKind.PROGRAM_PAST_EOF)).to.eql([]);
    });

    it("doesn't report a program whose transfer record is in the next sector", () => {
        // A 258-byte load block, then the transfer record. The size cuts the block, and the rest isn't
        // in the same sector.
        const contents = new Uint8Array(262);
        contents.set([0x01, 0x00, 0x00, 0x52], 0);
        contents.set([0x02, 0x02, 0x00, 0x52], 258);
        expect(ofKind(check([makeProgramFile(contents, 100)]), TrsdosFindingKind.PROGRAM_PAST_EOF)).to.eql([]);
    });

    it("doesn't report a program whose bytes after the EOF don't end in a transfer record", () => {
        const contents = makeSmallProgram().slice(0, 7);
        expect(ofKind(check([makeProgramFile(contents, 5)]), TrsdosFindingKind.PROGRAM_PAST_EOF)).to.eql([]);
    });

    it("doesn't report a program whose entry point isn't in a load block", () => {
        expect(ofKind(check([makeProgramFile(makeSmallProgram(0x6000), 9)]), TrsdosFindingKind.PROGRAM_PAST_EOF)).to.eql([]);
    });

    it("doesn't report a file whose size is a multiple of the sector size", () => {
        expect(ofKind(check([makeProgramFile(makeSmallProgram(), 256)]), TrsdosFindingKind.PROGRAM_PAST_EOF)).to.eql([]);
    });

    it("doesn't report a file that isn't a program", () => {
        const text = new TextEncoder().encode("HELLO WORLD\r");
        expect(ofKind(check([makeProgramFile(text, 5)]), TrsdosFindingKind.PROGRAM_PAST_EOF)).to.eql([]);
    });
});
