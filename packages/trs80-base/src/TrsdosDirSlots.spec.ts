import {describe, expect, it} from "vitest";
import {BYTES_PER_SECTOR} from "./FloppyDisk.js";
import {decodeTrsdos, type Trsdos} from "./Trsdos.js";
import {chooseDirSlots, reservedDecs} from "./TrsdosDirSlots.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {makeTrsdos23TestDisk, testUserSlotDec, type TestFile} from "./TrsdosTestDisk.js";

// The test disk is single density with 10 sectors per track, and the directory is on cylinder 17.
const SECTORS_PER_TRACK = 10;
const DIR_CYLINDER = 17;
const GAT_FLAGS_OFFSET = 0xCD;

// Entries 0 and 1 of the first eight directory sectors.
const SYSTEM_FILE_DECS = [
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27,
];

/**
 * Make a decoded test disk, optionally marked in its GAT as a TRSDOS 6 data disk.
 */
function makeTrsdos(files: TestFile[] = [], dataDisk: boolean = false): Trsdos {
    const disk = makeTrsdos23TestDisk(files);
    if (dataDisk) {
        disk.binary[DIR_CYLINDER*SECTORS_PER_TRACK*BYTES_PER_SECTOR + GAT_FLAGS_OFFSET] |= 0x80;
    }
    const trsdos = decodeTrsdos(disk);
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }
    return trsdos;
}

/**
 * A copy of the disk's HIT, for passing to chooseDirSlots().
 */
function getHit(trsdos: Trsdos): Uint8Array {
    const hitInfo = trsdos.getHitInfo();
    if (typeof hitInfo === "string") {
        throw new Error(hitInfo);
    }
    return new Uint8Array(hitInfo.hit);
}

/**
 * The sorted contents of a set.
 */
function sorted(set: Set<number>): number[] {
    return [...set].sort((a, b) => a - b);
}

describe("reservedDecs", () => {
    it("reserves entries 0 and 1 of eight sectors in TRSDOS 2.x, LDOS 5 and DOSPLUS 3", () => {
        const trsdos = makeTrsdos();
        for (const ruleSet of [TrsdosRuleSet.TRSDOS_2, TrsdosRuleSet.LDOS_5, TrsdosRuleSet.DOSPLUS]) {
            expect(sorted(reservedDecs(trsdos, ruleSet))).to.eql(SYSTEM_FILE_DECS);
        }
    });

    it("reserves the same 16 on a TRSDOS 6 system disk", () => {
        expect(sorted(reservedDecs(makeTrsdos(), TrsdosRuleSet.TRSDOS_6))).to.eql(SYSTEM_FILE_DECS);
    });

    it("reserves only DECs 0 and 1 on a TRSDOS 6 data disk", () => {
        expect(sorted(reservedDecs(makeTrsdos([], true), TrsdosRuleSet.TRSDOS_6))).to.eql([0, 1]);
    });

    it("looks at the data disk flag only for TRSDOS 6", () => {
        expect(sorted(reservedDecs(makeTrsdos([], true), TrsdosRuleSet.LDOS_5))).to.eql(SYSTEM_FILE_DECS);
    });

    it("reserves nothing in TRSDOS 1.3, whose system files aren't in the directory", () => {
        expect(reservedDecs(makeTrsdos(), TrsdosRuleSet.TRSDOS_1_3).size).to.equal(0);
    });
});

describe("chooseDirSlots", () => {
    it("skips the reserved slots of an empty disk and goes in DEC order", () => {
        const trsdos = makeTrsdos();
        const hit = getHit(trsdos);
        // Entry 2 of sectors 0 to 7, then entry 3 of sector 0.
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 10))
            .to.eql([0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x60, 0x61]);
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 1)).to.eql([testUserSlotDec(0)]);
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 0)).to.eql([]);
    });

    it("skips the slots that files use", () => {
        // The builder puts files in entries 2 to 7 of directory sector 0 first.
        const trsdos = makeTrsdos([
            {name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}]},
            {name: "TWO/DAT", extents: [{lump: 4, granuleOffset: 0, granuleCount: 1}]},
        ]);
        expect(testUserSlotDec(0)).to.equal(0x40);
        expect(testUserSlotDec(1)).to.equal(0x60);
        const hit = getHit(trsdos);
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.LDOS_5, hit, 3)).to.eql([0x41, 0x42, 0x43]);
        // The second file's slot, 0x60, falls between 0x47 and 0x61.
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.LDOS_5, hit, 9))
            .to.eql([0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x61, 0x62]);
    });

    it("treats a HIT byte of 0 in the passed array as free", () => {
        const trsdos = makeTrsdos([
            {name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}]},
            {name: "TWO/DAT", extents: [{lump: 4, granuleOffset: 0, granuleCount: 1}]},
        ]);
        const hit = getHit(trsdos);
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.LDOS_5, hit, 1)).to.eql([0x41]);

        // Delete the first file in the working copy, and take a slot in the working copy.
        hit[testUserSlotDec(0)] = 0;
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.LDOS_5, hit, 2)).to.eql([0x40, 0x41]);
        hit[0x41] = 0x55;
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.LDOS_5, hit, 2)).to.eql([0x40, 0x42]);

        // The disk's own HIT is untouched.
        expect(getHit(trsdos)[testUserSlotDec(0)]).to.not.equal(0);
    });

    it("never gives out a reserved slot even when its HIT byte is 0", () => {
        const trsdos = makeTrsdos();
        const hit = getHit(trsdos);
        hit[0x05] = 0;
        hit[0x22] = 0;
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 1)).to.eql([0x40]);
    });

    it("reports a full directory", () => {
        const trsdos = makeTrsdos();
        const hit = getHit(trsdos);
        // 8 sectors with 6 user entries each.
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 48)).to.have.length(48);
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 49))
            .to.equal("The directory is full: the file needs 49 entries and there are 48 free");

        for (const dec of chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 47) as number[]) {
            hit[dec] = 0x77;
        }
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_2, hit, 2))
            .to.equal("The directory is full: the file needs 2 entries and there are 1 free");
    });

    it("gives out the slots that a TRSDOS 6 data disk leaves unreserved", () => {
        const trsdos = makeTrsdos([], true);
        const hit = getHit(trsdos);
        // Entry 0 of sector 2 (DEC 2) onward, since DEC 0 and 1 hold BOOT/SYS and DIR/SYS.
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_6, hit, 3)).to.eql([0x02, 0x03, 0x04]);
        // 64 slots exist (8 entries in each of 8 sectors), less the two reserved.
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_6, hit, 62)).to.have.length(62);
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_6, hit, 63))
            .to.equal("The directory is full: the file needs 63 entries and there are 62 free");
    });

    it("ignores TRSDOS 1.3's rule set when it reserves nothing", () => {
        // The reserved set is empty, so the free slots are exactly those with a zero HIT byte (the
        // test disk has the 2.3 layout, so this checks only that the rule set is what decides).
        const trsdos = makeTrsdos();
        const hit = getHit(trsdos);
        expect(chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_1_3, hit, 1)).to.eql([0x02]);
    });
});
