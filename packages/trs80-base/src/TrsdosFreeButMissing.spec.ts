import {describe, expect, it} from "vitest";
import {removeDmkId} from "./DmkTestArtifacts.js";
import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {appendDmkTestTracks} from "./DmkTestTail.js";
import {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {TRSDOS_13_TRACK_LAYOUT} from "./TrackLayout.js";
import {decodeTrsdos, type Trsdos} from "./Trsdos.js";
import {findUnwritableGranuleSectors} from "./TrsdosAllocator.js";
import {checkTrsdos, findFreeButMissingGranules, TrsdosFindingKind} from "./TrsdosCheck.js";
import {parseTrsdosFilename, type TrsdosFilename} from "./TrsdosFilename.js";
import {formatTrsdosDataDisk, TrsdosFormatDos} from "./TrsdosFormat.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {evaluateTrsdosWriteGate, TrsdosWriteAccess} from "./TrsdosWriteGate.js";
import {TrsdosWriter} from "./TrsdosWriter.js";

// Tests of free granules that the image doesn't fully hold: "check" notes them, and the writer's allocator
// skips them, by the same test.

const FORMAT_DATE = new Date(1983, 4, 17);

/**
 * Format a blank data disk, failing the test if it can't be made.
 */
function format(dos: TrsdosFormatDos, cylinders: number): DmkFloppyDisk {
    const disk = formatTrsdosDataDisk({dos, cylinders, sides: 1, date: FORMAT_DATE});
    if (typeof disk === "string") {
        throw new Error(disk);
    }
    return disk;
}

/**
 * Decode a disk through an overlay, as the writer needs, failing the test if it doesn't decode.
 */
function decode(disk: DmkFloppyDisk): Trsdos {
    const trsdos = decodeTrsdos(new SectorOverlay(disk));
    if (trsdos === undefined) {
        throw new Error("The test disk doesn't decode");
    }
    return trsdos;
}

/**
 * The granules that findFreeButMissingGranules() finds, as "lump:granule" strings.
 */
function freeButMissing(trsdos: Trsdos): string[] {
    const map = TrsdosGranuleMap.make(trsdos);
    if (typeof map === "string") {
        throw new Error(map);
    }
    return findFreeButMissingGranules(trsdos, map).granules.map(granule => granule.lump + ":" + granule.granule);
}

/**
 * Parse a file name, failing the test if it isn't one.
 */
function name(text: string): TrsdosFilename {
    const filename = parseTrsdosFilename(text);
    if (typeof filename === "string") {
        throw new Error(filename);
    }
    return filename;
}

/**
 * A file of the given size, of filler that's different in each sector.
 */
function contents(size: number): Uint8Array {
    return Uint8Array.from({length: size}, (_, i) => (i >> 8) & 0xFF);
}

describe("free granules that the image doesn't fully hold", () => {
    // TRSDOS 2.3: 5-sector granules, two to a cylinder, so cylinder 0's sector 7 is in lump 0, granule 1,
    // which the allocator would otherwise give a one-granule file: it's the start of the run of free
    // granules up to the directory, the smaller of the two.
    const missingPosition = SectorPosition.make(0, 0, 7);

    it("finds the sectors a write would refuse", () => {
        const trsdos = decode(removeDmkId(format(TrsdosFormatDos.TRSDOS_2_3, 35), missingPosition));
        expect(findUnwritableGranuleSectors(trsdos, 0, 1).map(position => position.key())).to.eql(["0:0:7"]);
        expect(findUnwritableGranuleSectors(trsdos, 1, 0)).to.eql([]);
    });

    it("is a note, which leaves the disk writable", () => {
        const trsdos = decode(removeDmkId(format(TrsdosFormatDos.TRSDOS_2_3, 35), missingPosition));
        const findings = checkTrsdos(trsdos).findings.filter(finding =>
            finding.kind === TrsdosFindingKind.FREE_BUT_MISSING);
        expect(findings.map(finding => finding.message)).to.eql([
            "The GAT says 1 granule is free that the image doesn't fully hold (cylinder 0, granule 1): 1 of its " +
            "sectors is missing or the wrong size. New files skip it, so 1,280 bytes of the free space can't be used.",
        ]);
        expect(findings[0].granules.map(granule => granule.lump + ":" + granule.granule)).to.eql(["0:1"]);
        expect(evaluateTrsdosWriteGate(trsdos).access).to.equal(TrsdosWriteAccess.WRITABLE);
    });

    it("isn't found on a whole disk", () => {
        const trsdos = decode(format(TrsdosFormatDos.TRSDOS_2_3, 35));
        expect(freeButMissing(trsdos)).to.eql([]);
        expect(checkTrsdos(trsdos).findings.map(finding => finding.kind))
            .to.not.include(TrsdosFindingKind.FREE_BUT_MISSING);
    });

    it("is skipped by the allocator, so the write succeeds", () => {
        const disk = removeDmkId(format(TrsdosFormatDos.TRSDOS_2_3, 35), missingPosition);
        const trsdos = decode(disk);
        const writer = new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_2);
        writer.addFile(name("ONE/DAT"), contents(256));
        const after = writer.flush();
        const file = after.getDirectory().files.find(dirEntry => dirEntry.getFilename("/") === "ONE/DAT");
        expect(file).to.not.equal(undefined);
        if (file !== undefined) {
            expect(after.readFile(file)).to.eql(contents(256));
            // The next granule, not the one with the missing sector.
            expect([...after.getFileExtents(file)].map(extent => [extent.cylinderNumber, extent.granuleOffset]))
                .to.eql([[1, 0]]);
        }
        // The missing granule stays free in the GAT, and is still noted.
        expect(freeButMissing(after)).to.eql(["0:1"]);
    });

    it("is skipped when a write fills the disk", () => {
        const trsdos = decode(removeDmkId(format(TrsdosFormatDos.TRSDOS_2_3, 35), missingPosition));
        const map = TrsdosGranuleMap.make(trsdos);
        if (typeof map === "string") {
            throw new Error(map);
        }
        const usable = map.getFreeGranuleCount() - 1;
        const granuleBytes = trsdos.sectorsPerGranule*256;

        const fits = new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_2);
        fits.addFile(name("ALL/DAT"), contents(usable*granuleBytes));
        fits.flush();

        const tooBig = new TrsdosWriter(decode(removeDmkId(format(TrsdosFormatDos.TRSDOS_2_3, 35), missingPosition)),
            TrsdosRuleSet.TRSDOS_2);
        expect(() => tooBig.addFile(name("ALL/DAT"), contents((usable + 1)*granuleBytes)))
            .to.throw(`the disk has ${usable} free`);
    });

    it("counts only granules inside the disk's proven size", () => {
        // TRSDOS 1.3's GAT is zero past its 40 cylinders, so a tail's granules look free. Here the tail
        // is unformatted, and a sector inside the disk is missing too.
        const formatted = format(TrsdosFormatDos.TRSDOS_1_3, 40);
        const withTail = appendDmkTestTracks(formatted, [[{kind: "unformatted"}], [{kind: "unformatted"}]],
            TRSDOS_13_TRACK_LAYOUT);
        const tailOnly = decode(withTail);
        expect(tailOnly.lumpCount).to.equal(42);
        const map = TrsdosGranuleMap.make(tailOnly);
        if (typeof map === "string") {
            throw new Error(map);
        }
        expect(map.get(40, 0)?.isFree()).to.equal(true);
        expect(freeButMissing(tailOnly)).to.eql([]);

        const inside = decode(removeDmkId(withTail, SectorPosition.make(5, 0, 1)));
        expect(freeButMissing(inside)).to.eql(["5:0"]);

        // The writer skips the tail's granules all the same, since it can't write them.
        expect(findUnwritableGranuleSectors(inside, 40, 0)).to.have.length(inside.sectorsPerGranule);
    });
});
