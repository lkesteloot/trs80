import {describe, expect, it} from "vitest";
import {
    findProtectionSigns, type ProtectionSign, ProtectionSignKind, protectionSignKindVerdict,
} from "./CopyProtection.js";
import {appendDmkTestTracks, type TestTailTrack} from "./DmkTestTail.js";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {SectorData, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {decodeFloppyFileSystem} from "./FloppyFileSystem.js";
import {
    analyzeFloppyTail, describeTailKeepReason, findBlockingProtectionSigns, findReReadCylinder, MAX_TRIMMABLE_TAIL,
    TailKeepReason, TailTrackKind,
} from "./FloppyTail.js";
import {USER_DATA_ADDRESS_MARK_F9} from "./TrackBytes.js";
import {LSDOS_DD_TRACK_LAYOUT, TRSDOS_13_TRACK_LAYOUT, TRSDOS_23_TRACK_LAYOUT, type TrackLayout} from "./TrackLayout.js";
import {Trsdos} from "./Trsdos.js";
import {formatTrsdosDataDisk, TrsdosFormatDos} from "./TrsdosFormat.js";
import {findDosDiskSize, findTrsdosCylinderUse} from "./TrsdosDiskSize.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";

/**
 * Format a data disk, failing the test if the options are refused.
 */
function format(dos: TrsdosFormatDos, cylinders: number, sides = 1): DmkFloppyDisk {
    const floppy = formatTrsdosDataDisk({dos, cylinders, sides});
    if (typeof floppy === "string") {
        throw new Error("Format failed: " + floppy);
    }
    return floppy;
}

/**
 * The TRSDOS-family file system of a disk, failing the test if it has none.
 */
function trsdosOf(floppy: DmkFloppyDisk): Trsdos {
    const fileSystem = decodeFloppyFileSystem(floppy);
    if (!(fileSystem instanceof Trsdos)) {
        throw new Error("Not a TRSDOS-family disk");
    }
    return fileSystem;
}

/**
 * The disk's size by its DOS's records, or why there's none.
 */
function diskSize(floppy: DmkFloppyDisk): ReturnType<typeof findDosDiskSize> {
    const trsdos = trsdosOf(floppy);
    const map = TrsdosGranuleMap.make(trsdos);
    if (typeof map === "string") {
        throw new Error(map);
    }
    return findDosDiskSize(trsdos, floppy, findTrsdosCylinderUse(trsdos, map, floppy.getGeometry().cylinderCount));
}

/**
 * A TRSDOS 2.3 disk of 40 cylinders with these cylinders after it (one track each).
 */
function trsdos23WithTail(tail: TestTailTrack[], layout: TrackLayout = TRSDOS_23_TRACK_LAYOUT): DmkFloppyDisk {
    return appendDmkTestTracks(format(TrsdosFormatDos.TRSDOS_2_3, 40), tail.map(track => [track]), layout);
}

/**
 * Analyze the tail of a disk, with its own protection signs unless some are given.
 */
function analyze(floppy: DmkFloppyDisk, signs?: ProtectionSign[]): ReturnType<typeof analyzeFloppyTail> {
    const fileSystem = decodeFloppyFileSystem(floppy);
    return analyzeFloppyTail(floppy, fileSystem, signs ?? findProtectionSigns(floppy, fileSystem));
}

/**
 * Make a sign of a kind on some tracks, as findProtectionSigns() would.
 */
function makeSign(kind: ProtectionSignKind, tracks: TrackPosition[]): ProtectionSign {
    return {
        kind, verdict: protectionSignKindVerdict(kind), schemes: [], schemeName: undefined,
        message: "A test sign.", tracks, sectors: [],
    };
}

/**
 * Give sector 3 of cylinder 39 the 0xF9 data mark, which only the Model I's controller writes.
 */
function markCylinder39(floppy: DmkFloppyDisk): void {
    const position = SectorPosition.make(39, 0, 3);
    const sector = floppy.readSector(position);
    if (sector === undefined) {
        throw new Error("No sector");
    }
    const marked = new SectorData(sector.data, position, sector.density);
    marked.dataAddressMark = USER_DATA_ADDRESS_MARK_F9;
    floppy.writeSector(position, marked);
}

describe("findDosDiskSize", () => {
    it("takes TRSDOS 2.x's fixed size, or the GAT's when it covers more", () => {
        expect(diskSize(format(TrsdosFormatDos.TRSDOS_2_3, 35))).to.eql({cylinderCount: 35, source: "TRSDOS 2.x's fixed size"});
        expect(diskSize(format(TrsdosFormatDos.TRSDOS_2_3, 40))).to.eql({cylinderCount: 40, source: "the GAT"});
    });

    it("takes TRSDOS 1.x's fixed size", () => {
        const floppy = appendDmkTestTracks(format(TrsdosFormatDos.TRSDOS_1_3, 40), [[{kind: "unformatted"}]],
            TRSDOS_13_TRACK_LAYOUT);
        expect(diskSize(floppy)).to.eql({cylinderCount: 40, source: "TRSDOS 1.x's fixed size"});
    });

    it("takes the LDOS line's GAT byte 0xCC, checked against the media block", () => {
        expect(diskSize(format(TrsdosFormatDos.LSDOS_6_3, 40))).to.eql({
            cylinderCount: 40, source: "GAT byte 0xCC and the media block",
        });
        expect(diskSize(format(TrsdosFormatDos.LDOS_5_3, 40))).to.have.property("cylinderCount", 40);
    });

    it("doesn't trust a GAT byte 0xCC that the media block contradicts", () => {
        const floppy = format(TrsdosFormatDos.LSDOS_6_3, 40);
        const gatPosition = trsdosOf(floppy).getGatPosition();
        const gat = floppy.readSector(gatPosition);
        if (gat === undefined) {
            throw new Error("No GAT");
        }
        const data = gat.data.slice();
        data[0xCC] = 3;
        floppy.writeSector(gatPosition, new SectorData(data, gatPosition, gat.density));
        expect(diskSize(floppy)).to.eql("GAT byte 0xCC says 38 cylinders, but the media block says 40");
    });
});

describe("findReReadCylinder", () => {
    it("finds an earlier cylinder read again, and nothing else", () => {
        const floppy = trsdos23WithTail([{kind: "reRead", cylinder: 39}, {kind: "blank"}, {kind: "unformatted"}]);
        expect(findReReadCylinder(floppy, new TrackPosition(40, 0))).to.equal(39);
        expect(findReReadCylinder(floppy, new TrackPosition(41, 0))).to.equal(undefined);
        expect(findReReadCylinder(floppy, new TrackPosition(42, 0))).to.equal(undefined);
        expect(findReReadCylinder(floppy, new TrackPosition(39, 0))).to.equal(undefined);
    });

    it("needs the data to match", () => {
        const floppy = trsdos23WithTail([{kind: "reRead", cylinder: 39}]);
        const position = SectorPosition.make(40, 0, 4);
        const sector = floppy.readSector(position);
        if (sector === undefined) {
            throw new Error("No sector");
        }
        floppy.writeSector(position, new SectorData(new Uint8Array(sector.data.length).fill(0x42), sector.sectorPosition,
            sector.density));
        expect(findReReadCylinder(floppy, new TrackPosition(40, 0))).to.equal(undefined);
        const tail = analyze(floppy);
        expect(tail.cylinders[0].tracks[0].kind).to.equal(TailTrackKind.FOREIGN_IDS);
        expect(tail.cylinders[0].keepReason).to.equal(TailKeepReason.FOREIGN_IDS);
        expect(describeTailKeepReason(tail, tail.cylinders[0], 1))
            .to.equal("its IDs name cylinder 39, but it doesn't read the same as that cylinder");
    });
});

describe("analyzeFloppyTail", () => {
    it("drops re-reads and unformatted tracks past the disk's end (rules 1 and 2)", () => {
        const tail = analyze(trsdos23WithTail([{kind: "reRead", cylinder: 39}, {kind: "unformatted"}]));
        expect(tail.size).to.eql({cylinderCount: 40, source: "the GAT"});
        expect(tail.cylinders.map(c => c.tracks[0].kind)).to.eql([TailTrackKind.RE_READ, TailTrackKind.UNFORMATTED]);
        expect(tail.cylinders.map(c => c.keepReason)).to.eql([undefined, undefined]);
        expect(tail.dropFrom).to.equal(40);
    });

    it("keeps a tail formatted like the disk, even when it's unused", () => {
        const tail = analyze(trsdos23WithTail([{kind: "blank"}, {kind: "blank"}]));
        expect(tail.cylinders.map(c => c.keepReason)).to.eql([TailKeepReason.LIKE_DISK, TailKeepReason.LIKE_DISK]);
        expect(tail.dropFrom).to.equal(42);
    });

    it("keeps a tail formatted another way", () => {
        const tail = analyze(trsdos23WithTail([{kind: "blank"}], LSDOS_DD_TRACK_LAYOUT));
        expect(tail.cylinders[0].tracks[0].kind).to.equal(TailTrackKind.OTHER_FORMAT);
        expect(tail.cylinders[0].keepReason).to.equal(TailKeepReason.OTHER_FORMAT);
    });

    it("drops only an unbroken run to the end of the image (rule 3)", () => {
        const tail = analyze(trsdos23WithTail([{kind: "unformatted"}, {kind: "blank"}, {kind: "reRead", cylinder: 41}]));
        expect(tail.cylinders.map(c => c.keepReason)).to.eql([
            TailKeepReason.LATER_CYLINDER_KEPT, TailKeepReason.LIKE_DISK, undefined,
        ]);
        expect(tail.dropFrom).to.equal(42);
    });

    it("keeps a track with a protection sign, but not for a re-read's own IDs (rule 4)", () => {
        const floppy = trsdos23WithTail([{kind: "reRead", cylinder: 39}, {kind: "reRead", cylinder: 39}]);
        const track41 = new TrackPosition(41, 0);
        const signed = analyze(floppy, [makeSign(ProtectionSignKind.MIXED_DENSITY_TRACK, [track41])]);
        expect(signed.cylinders.map(c => c.keepReason)).to.eql([TailKeepReason.LATER_CYLINDER_KEPT, TailKeepReason.PROTECTION_SIGN]);
        expect(describeTailKeepReason(signed, signed.cylinders[1], 1)).to.equal("it shows signs of copy protection (mixed-density track)");

        // The re-reads' IDs name cylinder 39, but they're past the disk's proven end, so they aren't a sign.
        const signs = findProtectionSigns(floppy, decodeFloppyFileSystem(floppy));
        expect(signs.map(sign => sign.kind)).to.not.include(ProtectionSignKind.FOREIGN_CYLINDER_IDS);
        expect(analyze(floppy, signs).dropFrom).to.equal(40);
        expect(findBlockingProtectionSigns(floppy, decodeFloppyFileSystem(floppy))).to.eql([]);
    });

    it("keeps an earlier format's track past the end, but doesn't count its IDs as protection", () => {
        // Cylinder 40 holds only filler, but its IDs name cylinder 42, which isn't in the image.
        const floppy = trsdos23WithTail([{kind: "blank", idCylinder: 42}]);
        const tail = analyze(floppy);
        expect(tail.cylinders[0].tracks[0].kind).to.equal(TailTrackKind.FOREIGN_IDS);
        expect(tail.cylinders[0].keepReason).to.equal(TailKeepReason.FOREIGN_IDS);
        expect(tail.dropFrom).to.equal(41);
        expect(findProtectionSigns(floppy, decodeFloppyFileSystem(floppy))).to.eql([]);
        expect(findBlockingProtectionSigns(floppy, decodeFloppyFileSystem(floppy))).to.eql([]);
    });

    it("keeps Tandy's protection track even when it's only FORMAT output", () => {
        const floppy = trsdos23WithTail([{kind: "unformatted"}]);
        const tail = analyze(floppy, [makeSign(ProtectionSignKind.TANDY_TRACK_FORMAT, [new TrackPosition(40, 0)])]);
        expect(tail.cylinders[0].keepReason).to.equal(TailKeepReason.PROTECTION_SIGN);
        expect(describeTailKeepReason(tail, tail.cylinders[0], 1)).to.equal("it's a TRSDOS 1.1 FORMAT track, which is never dropped");
    });

    it("keeps the whole tail of a disk with a sign that isn't about tracks", () => {
        const tail = analyze(trsdos23WithTail([{kind: "unformatted"}]), [makeSign(ProtectionSignKind.DIRECTORY_MISMATCH, [])]);
        expect(tail.cylinders[0].keepReason).to.equal(TailKeepReason.DISK_PROTECTION_SIGN);
        expect(tail.dropFrom).to.equal(41);
    });

    it("keeps a tail of 7 or more cylinders for a person to look at", () => {
        const unformatted: TestTailTrack[] = Array.from({length: MAX_TRIMMABLE_TAIL + 1}, () => ({kind: "unformatted"}));
        const tail = analyze(trsdos23WithTail(unformatted));
        expect(tail.cylinders.every(c => c.keepReason === TailKeepReason.TOO_LONG)).to.equal(true);
        expect(describeTailKeepReason(tail, tail.cylinders[0], 1)).to.equal("the image has 7 cylinders past the disk's end, " +
            "and a tail of 7 or more wants a person to look at it");
        expect(analyze(trsdos23WithTail(unformatted.slice(1))).dropFrom).to.equal(40);
    });

    it("needs both sides of a cylinder to qualify (rule 5)", () => {
        const base = format(TrsdosFormatDos.LSDOS_6_3, 40, 2);
        const both = analyze(appendDmkTestTracks(base, [[{kind: "reRead", cylinder: 39}, {kind: "reRead", cylinder: 39}]],
            LSDOS_DD_TRACK_LAYOUT));
        expect(both.dropFrom).to.equal(40);

        const one = analyze(appendDmkTestTracks(base, [[{kind: "reRead", cylinder: 39}, {kind: "blank"}]], LSDOS_DD_TRACK_LAYOUT));
        expect(one.cylinders[0].keepReason).to.equal(TailKeepReason.LIKE_DISK);
        expect(describeTailKeepReason(one, one.cylinders[0], 2)).to.match(/^on side 1, it's formatted like the rest of the disk/);
    });

    it("keeps everything when the DOS's records don't prove the disk's size", () => {
        const floppy = trsdos23WithTail([{kind: "unformatted"}]);
        const tail = analyzeFloppyTail(floppy, undefined, []);
        expect(tail.size).to.equal(undefined);
        expect(tail.unproven).to.equal("the disk has no file system that we recognize");
        expect(tail.dropFrom).to.equal(41);
    });
});

describe("findBlockingProtectionSigns", () => {
    it("counts every sign of protection on the disk", () => {
        const floppy = format(TrsdosFormatDos.TRSDOS_2_3, 40);
        markCylinder39(floppy);
        const signs = findBlockingProtectionSigns(floppy, decodeFloppyFileSystem(floppy));
        expect(signs.map(sign => sign.kind)).to.eql([ProtectionSignKind.F9_MARKS]);
    });
});
