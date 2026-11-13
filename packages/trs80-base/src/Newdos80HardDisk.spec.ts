import {describe, expect, it} from "vitest";
import {decodeHdvHardDisk, HdvHardDisk} from "./HdvHardDisk.js";
import {findHardDiskPartitions, findLdosPartitions} from "./LdosHardDisk.js";
import {findNewdos80Partitions} from "./Newdos80HardDisk.js";
import {
    makeDefaultNewdos80TestHeads, makeNewdos80TestContents, makeNewdos80TestHardDiskBinary, newdos80TestSector,
} from "./Newdos80TestHardDisk.js";
import {readPdriveHardDiskSlots} from "./Pdrive.js";
import {checkTrsdos} from "./TrsdosCheck.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {evaluateTrsdosWriteGate, TrsdosWriteAccess} from "./TrsdosWriteGate.js";

/**
 * Decode the HDV, which the tests make well-formed.
 */
function decodeHdv(binary: Uint8Array): HdvHardDisk {
    return decodeHdvHardDisk(binary)!;
}

describe("readPdriveHardDiskSlots", () => {
    it("reads the hard disk slots and skips the floppy ones", () => {
        const disk = decodeHdv(makeNewdos80TestHardDiskBinary(makeDefaultNewdos80TestHeads()));
        const slots = readPdriveHardDiskSlots((cylinder, head, sector) => disk.readSector(cylinder, head, sector));
        expect(slots).to.eql([
            {slot: 1, head: 0, cylinderCount: 40, sectorsPerGranule: 5, granulesPerLump: 8, lumpCount: 32, dirStartLump: 4},
            {slot: 2, head: 1, cylinderCount: 40, sectorsPerGranule: 22, granulesPerLump: 8, lumpCount: 8, dirStartLump: 4},
            {slot: 3, head: 2, cylinderCount: 40, sectorsPerGranule: 22, granulesPerLump: 8, lumpCount: 8, dirStartLump: 4},
        ]);
    });
});

describe("findNewdos80Partitions", () => {
    it("finds a partition per formatted head, with the granule size from its slot", () => {
        const disk = decodeHdv(makeNewdos80TestHardDiskBinary(makeDefaultNewdos80TestHeads()));
        const partitions = findHardDiskPartitions(disk);

        // Head 2 has a slot but was never formatted.
        expect(partitions.map(p => [p.partition.cylinderOffset, p.partition.headOffset,
            p.partition.cylinderCount, p.partition.headCount])).to.eql([[0, 0, 40, 1], [0, 1, 40, 1]]);
        expect(partitions.map(p => p.diskName)).to.eql(["SYSTEM", "DATA"]);
        expect(partitions.map(p => p.trsdos.sectorsPerGranule)).to.eql([5, 22]);
        expect(partitions.map(p => p.trsdos.granulesPerLump)).to.eql([8, 8]);
        // The directory lump is the boot sector's, not the slot's.
        expect(partitions.map(p => p.trsdos.dirLumpNumber)).to.eql([4, 1]);
        expect(partitions.map(p => p.trsdos.lumpTerm)).to.eql(["lump", "lump"]);
        expect(partitions.map(p => p.trsdos.dirSectorCount)).to.eql([33, 33]);
        expect(partitions.map(p => p.trsdos.granulesPerDir)).to.eql([7, 2]);
        expect(partitions.map(p => p.trsdos.dirSysConfirmsSize)).to.eql([true, true]);
        expect(partitions.map(p => p.trsdos.gatPassesStrictCheck)).to.eql([true, true]);

        const [system, data] = partitions;
        expect(system.trsdos.getDirEntries(true).map(entry => entry.getFilename("/")))
            .to.eql(["BOOT/SYS", "DIR/SYS", "HELLO/TXT"]);
        const hello = system.trsdos.getDirEntries(false)[0];
        expect(new TextDecoder().decode(system.trsdos.readFile(hello))).to.equal("HELLO WORLD");

        // This file's entry is in the directory's last sector, and its granules start partway
        // through a track and run across several.
        const big = data.trsdos.getDirEntries(false)[0];
        expect(big.getFilename("/")).to.equal("BIG/DAT");
        expect(data.trsdos.readFile(big)).to.eql(makeNewdos80TestContents(30*256 + 17));
    });

    it("isn't found by the LDOS partition finder", () => {
        const disk = decodeHdv(makeNewdos80TestHardDiskBinary(makeDefaultNewdos80TestHeads()));
        expect(findLdosPartitions(disk)).to.eql([]);
        expect(findNewdos80Partitions(disk).length).to.equal(2);
    });

    it("finds nothing without a hard disk slot", () => {
        const binary = makeNewdos80TestHardDiskBinary(makeDefaultNewdos80TestHeads());
        // Make the slots floppies' by clearing the hard disk bit.
        const table = newdos80TestSector(binary, 0, 2);
        for (let slot = 0; slot < 10; slot++) {
            table[slot*16 + 13] &= ~0x40;
        }
        expect(findHardDiskPartitions(decodeHdv(binary))).to.eql([]);
    });

    it("rejects a slot whose lump count disagrees with the head's size", () => {
        const binary = makeNewdos80TestHardDiskBinary(makeDefaultNewdos80TestHeads());
        newdos80TestSector(binary, 0, 2)[2*16 + 1] = 9;
        expect(findHardDiskPartitions(decodeHdv(binary)).map(p => p.partition.headOffset)).to.eql([0]);
    });

    it("counts a partial last lump, whose missing granules the GAT marks used", () => {
        const disk = decodeHdv(makeNewdos80TestHardDiskBinary(makeDefaultNewdos80TestHeads()));
        const data = findHardDiskPartitions(disk)[1].trsdos;

        // 1,280 sectors: seven lumps of 176, then two granules of 22 and four sectors over.
        expect(data.lumpCount).to.equal(8);
        expect(data.granuleCount).to.equal(58);
        const map = TrsdosGranuleMap.make(data);
        if (typeof map === "string") {
            throw new Error(map);
        }
        expect(map.granules.filter(granule => granule.pastEnd).map(granule => granule.lump*8 + granule.granule))
            .to.eql([58, 59, 60, 61, 62, 63]);
        // BOOT/SYS, the directory's two and the file's two are used.
        expect(map.getFreeGranuleCount()).to.equal(58 - 5);
        expect(checkTrsdos(data).findings.map(finding => finding.kind)).to.eql([]);
    });

    it("isn't writable", () => {
        const disk = decodeHdv(makeNewdos80TestHardDiskBinary(makeDefaultNewdos80TestHeads()));
        for (const {trsdos} of findHardDiskPartitions(disk)) {
            const gate = evaluateTrsdosWriteGate(trsdos);
            expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
            expect(gate.blockers.map(blocker => blocker.message)).to.contain(
                "This is a partition of a NEWDOS/80 hard disk, and writing those isn't supported yet. " +
                "Files can be listed and extracted.");
        }
    });
});
