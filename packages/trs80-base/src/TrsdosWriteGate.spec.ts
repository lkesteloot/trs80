import {describe, expect, it} from "vitest";
import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {Density, FloppyDisk, type FloppyDiskGeometry, SectorData, SectorPosition} from "./FloppyDisk.js";
import {type Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {decodeTrsdos, Trsdos, TrsdosVersion} from "./Trsdos.js";
import {TrsdosFindingKind} from "./TrsdosCheck.js";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile} from "./TrsdosTestDisk.js";
import {
    directorySizesTried,
    dirSysCoversDirectory,
    evaluateTrsdosWriteGate,
    sidesAreUnproven,
    TrsdosWriteAccess,
    trsdosWriteAccessForBlockerKinds,
    trsdosWriteAccessToString,
    type TrsdosWriteBlocker,
    TrsdosWriteBlockerKind,
    trsdosWriteBlockerKindAccess,
    trsdosWriteBlockerKindToString,
    unsupportedLayoutMessage,
    writeProtectionMessage,
} from "./TrsdosWriteGate.js";

/**
 * A floppy that wraps another and can't be written, like the image formats that are read-only.
 */
class ReadOnlyTestDisk extends FloppyDisk {
    public readonly className = "ReadOnlyTestDisk";
    private readonly inner: Jv1FloppyDisk;

    constructor(inner: Jv1FloppyDisk) {
        super(inner.binary, undefined, []);
        this.inner = inner;
    }

    /**
     * The name that the gate pulls the format out of.
     */
    public getDescription(): string {
        return "Floppy disk (TST)";
    }

    /**
     * The wrapped disk's geometry.
     */
    public getGeometry(): FloppyDiskGeometry {
        return this.inner.getGeometry();
    }

    /**
     * Read from the wrapped disk.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        return this.inner.readSector(sectorPosition);
    }
}

/**
 * Make a test disk and decode it as TRSDOS, failing the test if it doesn't decode.
 */
function decode(files: TestFile[] = [], options: TestDiskOptions = {}): Trsdos {
    const trsdos = decodeTrsdos(makeTrsdos23TestDisk(files, options));
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }
    return trsdos;
}

/**
 * The kinds of the blockers, in order.
 */
function kinds(blockers: TrsdosWriteBlocker[]): TrsdosWriteBlockerKind[] {
    return blockers.map(blocker => blocker.kind);
}

/**
 * Make another interpretation of the same disk, for exercising the gate on layouts the decoder
 * wouldn't pick for the test disk.
 */
function reinterpret(trsdos: Trsdos, version: TrsdosVersion, granulesPerLump: number, granulesPerDir: number): Trsdos {
    return new Trsdos(trsdos.disk, trsdos.geometry, version, trsdos.allocationSides, granulesPerLump,
        trsdos.sectorsPerGranule, trsdos.dirLumpNumber, granulesPerDir, 0);
}

describe("evaluateTrsdosWriteGate", () => {
    it("lets a clean single-sided disk be written", () => {
        const gate = evaluateTrsdosWriteGate(decode([
            {name: "HELLO/BAS", extents: [[3, 0, 2]], size: 1000},
            {name: "WORLD/TXT", extents: [[5, 0, 1], [8, 1, 1]]},
        ]));

        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(gate.check.findings).to.eql([]);
    });

    it("lets an empty disk be written", () => {
        expect(evaluateTrsdosWriteGate(decode()).access).to.equal(TrsdosWriteAccess.WRITABLE);
    });

    it("allows only repairs on a damaged file system", () => {
        const gate = evaluateTrsdosWriteGate(decode([
            {name: "HELLO/CMD", extents: [[5, 0, 2]]},
            {name: "GAME/BAS", extents: [[5, 0, 3]]},
        ]));

        expect(gate.access).to.equal(TrsdosWriteAccess.REPAIR_ONLY);
        expect(kinds(gate.blockers)).to.eql([TrsdosWriteBlockerKind.DAMAGE]);
        expect(gate.blockers[0].forceable).to.equal(true);
        // The shared granules are one finding, but the HIT bytes aren't wrong and nothing else is.
        expect(gate.blockers[0].message).to.contain("(1 problem)");
        expect(gate.check.findings.length).to.equal(1);
    });

    it("counts every damage finding in the one blocker", () => {
        const gate = evaluateTrsdosWriteGate(decode([
            {name: "HELLO/CMD", extents: [[5, 0, 2]]},
            {name: "GAME/BAS", extents: [[5, 0, 3]]},
            {name: "BAD/DAT", extents: [[9, 0, 1]], hitByte: 0x55},
        ]));

        expect(gate.access).to.equal(TrsdosWriteAccess.REPAIR_ONLY);
        expect(kinds(gate.blockers)).to.eql([TrsdosWriteBlockerKind.DAMAGE]);
        expect(gate.check.findings.map(finding => finding.kind)).to.include(TrsdosFindingKind.HIT_MISMATCH);
        expect(gate.blockers[0].message).to.contain("(2 problems)");
    });

    it("makes a disk read-only, one blocker per finding, when its layout is in doubt", () => {
        // Clear the unused bits of the GAT byte for cylinder 3, which the DOS always sets.
        const disk = makeTrsdos23TestDisk([{name: "HELLO/BAS", extents: [[3, 0, 1]]}]);
        const gatPosition = SectorPosition.make(17, 0, 0);
        const gatSector = disk.readSector(gatPosition)!;
        const data = new Uint8Array(gatSector.data);
        data[3] = 0x01;
        disk.writeSector(gatPosition, new SectorData(data, gatPosition, Density.SINGLE));
        const trsdos = decodeTrsdos(disk)!;

        const gate = evaluateTrsdosWriteGate(trsdos);

        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        const layoutBlockers = gate.blockers.filter(blocker => blocker.kind === TrsdosWriteBlockerKind.LAYOUT_DOUBT);
        const layoutFindings = gate.check.findings.filter(finding => finding.kind === TrsdosFindingKind.GAT_NOT_STRICT);
        expect(layoutFindings.length).to.equal(1);
        expect(layoutBlockers.map(blocker => blocker.message)).to.eql(layoutFindings.map(finding => finding.message));
        expect(layoutBlockers[0].forceable).to.equal(true);
    });

    it("makes a write-protected disk read-only", () => {
        const disk = makeTrsdos23TestDisk([]);
        disk.setMountedWriteProtected(true);

        const gate = evaluateTrsdosWriteGate(decodeTrsdos(disk)!);

        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(kinds(gate.blockers)).to.eql([TrsdosWriteBlockerKind.WRITE_PROTECTED]);
        expect(gate.blockers[0].message).to.equal("The image is mounted write-protected.");
    });

    it("lists the blockers in the order of the enum", () => {
        // Write-protected and damaged: the write protection comes first.
        const disk = makeTrsdos23TestDisk([
            {name: "HELLO/CMD", extents: [[5, 0, 2]]},
            {name: "GAME/BAS", extents: [[5, 0, 3]]},
        ]);
        disk.setMountedWriteProtected(true);

        const gate = evaluateTrsdosWriteGate(decodeTrsdos(disk)!);

        expect(kinds(gate.blockers)).to.eql([TrsdosWriteBlockerKind.WRITE_PROTECTED, TrsdosWriteBlockerKind.DAMAGE]);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
    });

    it("can't be forced on a layout we can't write", () => {
        const trsdos = decode();
        // Four granules per lump on two-granule cylinders means lumps that aren't cylinders.
        const lumpy = reinterpret(trsdos, TrsdosVersion.V2_3, 4, 4);
        expect(lumpy.lumpsAreCylinders).to.equal(false);

        const gate = evaluateTrsdosWriteGate(lumpy);

        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        const unsupported = gate.blockers.find(blocker => blocker.kind === TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT);
        expect(unsupported).not.to.be.undefined;
        expect(unsupported!.forceable).to.equal(false);
        // The sides and directory size don't matter for a layout we can't write.
        expect(kinds(gate.blockers)).not.to.include(TrsdosWriteBlockerKind.DIRECTORY_SIZE_UNPROVEN);
    });
});

describe("unsupportedLayoutMessage", () => {
    it("accepts the 2.3 family", () => {
        expect(unsupportedLayoutMessage(decode())).to.be.undefined;
    });

    it("rejects the TRSDOS 2.7 layout", () => {
        const trsdos = reinterpret(decode(), TrsdosVersion.V2_7, 2, 2);
        expect(unsupportedLayoutMessage(trsdos)).to.contain("2.7");
    });

    it("rejects lumps that aren't cylinders", () => {
        const trsdos = reinterpret(decode(), TrsdosVersion.V2_3, 4, 4);
        expect(unsupportedLayoutMessage(trsdos)).to.contain("lumps");
    });

    it("rejects a volume that isn't a floppy", () => {
        const trsdos = decode();
        const volume = {
            getGeometry: () => trsdos.geometry,
            readSector: (position: SectorPosition) => trsdos.disk.readSector(position),
            hasSectorData: (position: SectorPosition) => trsdos.disk.hasSectorData(position),
            getBootTrackText: () => trsdos.disk.getBootTrackText(),
        };
        const partition = new Trsdos(volume, trsdos.geometry, TrsdosVersion.V2_3, 1, 2, 5, 17, 2, 0);
        expect(unsupportedLayoutMessage(partition)).to.contain("hard disk");
    });
});

describe("writeProtectionMessage", () => {
    it("says nothing about a writable JV1 image", () => {
        expect(writeProtectionMessage(makeTrsdos23TestDisk([]))).to.be.undefined;
    });

    it("says when the disk was mounted write-protected", () => {
        const disk = makeTrsdos23TestDisk([]);
        disk.setMountedWriteProtected(true);
        expect(writeProtectionMessage(disk)).to.equal("The image is mounted write-protected.");
    });

    it("says when a DMK image's write-protect flag is set", () => {
        const protectedDisk = new DmkFloppyDisk(new Uint8Array(16), undefined, [], true, 0, 0, 0);
        expect(writeProtectionMessage(protectedDisk)).to.equal("The image's write-protect flag is set.");

        const writableDisk = new DmkFloppyDisk(new Uint8Array(16), undefined, [], false, 0, 0, 0);
        expect(writeProtectionMessage(writableDisk)).to.be.undefined;
    });

    it("names a format that can't be written", () => {
        const disk = new ReadOnlyTestDisk(makeTrsdos23TestDisk([]));
        expect(writeProtectionMessage(disk)).to.equal("Writing TST images isn't supported yet.");
    });

    it("blocks a read-only format in the gate", () => {
        const disk = new ReadOnlyTestDisk(makeTrsdos23TestDisk([]));
        const gate = evaluateTrsdosWriteGate(decodeTrsdos(disk)!);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(kinds(gate.blockers)).to.eql([TrsdosWriteBlockerKind.WRITE_PROTECTED]);
    });
});

describe("sidesAreUnproven", () => {
    it("is true only for one allocation side on a two-sided 2.3-family image", () => {
        expect(sidesAreUnproven(TrsdosVersion.V2_3, 1, 2)).to.equal(true);
        expect(sidesAreUnproven(TrsdosVersion.V2_3, 1, 1)).to.equal(false);
        expect(sidesAreUnproven(TrsdosVersion.V2_3, 2, 2)).to.equal(false);
    });

    it("is false for the older DOSes, which only have one side", () => {
        expect(sidesAreUnproven(TrsdosVersion.V1_3, 1, 2)).to.equal(false);
        expect(sidesAreUnproven(TrsdosVersion.V2_7, 1, 2)).to.equal(false);
    });
});

describe("directorySizesTried", () => {
    it("has one size for a single-sided single-density disk", () => {
        expect(directorySizesTried(TrsdosVersion.V2_3, 1, 2, 5, false)).to.eql([2]);
        // Even when cylinder 0 differs, which only removes the NEWDOS/80 twin.
        expect(directorySizesTried(TrsdosVersion.V2_3, 1, 2, 5, true)).to.eql([2]);
    });

    it("has one size for TRSDOS 1.3 and for single-sided double density", () => {
        expect(directorySizesTried(TrsdosVersion.V1_3, 1, 5, 2, false)).to.eql([5]);
        // Six-sector granules, three per cylinder: no NEWDOS/80 layout matches.
        expect(directorySizesTried(TrsdosVersion.V2_3, 1, 3, 6, false)).to.eql([3]);
    });

    it("has a side and a cylinder on two sides", () => {
        // Double-density 6-sector granules, so no NEWDOS/80 layout matches.
        expect(directorySizesTried(TrsdosVersion.V2_3, 2, 6, 6, false)).to.eql([3, 6]);
    });

    it("has every size NEWDOS/80 tries when 5-sector granules fill the cylinder", () => {
        expect(directorySizesTried(TrsdosVersion.V2_3, 2, 4, 5, false)).to.eql([2, 3, 4]);
        expect(directorySizesTried(TrsdosVersion.V2_3, 2, 4, 5, true)).to.eql([2, 4]);
    });
});

describe("dirSysCoversDirectory", () => {
    it("is true when DIR/SYS holds exactly the directory's granules", () => {
        expect(dirSysCoversDirectory(decode())).to.equal(true);
    });

    it("is false when the directory is a different size from DIR/SYS", () => {
        const trsdos = decode();
        expect(dirSysCoversDirectory(reinterpret(trsdos, TrsdosVersion.V2_3, 2, 1))).to.equal(false);
    });

    it("is false when DIR/SYS isn't where the directory is", () => {
        const trsdos = decode();
        const elsewhere = new Trsdos(trsdos.disk, trsdos.geometry, TrsdosVersion.V2_3, 1, 2, 5, 18, 2, 0);
        expect(dirSysCoversDirectory(elsewhere)).to.equal(false);
    });
});

describe("write access", () => {
    it("maps every kind of blocker to an access level", () => {
        const expected = new Map<TrsdosWriteBlockerKind, TrsdosWriteAccess>([
            [TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT, TrsdosWriteAccess.READ_ONLY],
            [TrsdosWriteBlockerKind.WRITE_PROTECTED, TrsdosWriteAccess.READ_ONLY],
            [TrsdosWriteBlockerKind.LAYOUT_DOUBT, TrsdosWriteAccess.READ_ONLY],
            [TrsdosWriteBlockerKind.SIDES_UNPROVEN, TrsdosWriteAccess.READ_ONLY],
            [TrsdosWriteBlockerKind.DIRECTORY_SIZE_UNPROVEN, TrsdosWriteAccess.READ_ONLY],
            [TrsdosWriteBlockerKind.DAMAGE, TrsdosWriteAccess.REPAIR_ONLY],
        ]);

        const names = new Set<string>();
        for (const value of Object.values(TrsdosWriteBlockerKind)) {
            if (typeof value === "number") {
                expect(trsdosWriteBlockerKindAccess(value)).to.equal(expected.get(value));
                names.add(trsdosWriteBlockerKindToString(value));
            }
        }
        expect(names.size).to.equal(expected.size);
    });

    it("takes the most restrictive access of the blockers", () => {
        const {DAMAGE, LAYOUT_DOUBT, SIDES_UNPROVEN} = TrsdosWriteBlockerKind;
        expect(trsdosWriteAccessForBlockerKinds([])).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(trsdosWriteAccessForBlockerKinds([DAMAGE])).to.equal(TrsdosWriteAccess.REPAIR_ONLY);
        expect(trsdosWriteAccessForBlockerKinds([SIDES_UNPROVEN])).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(trsdosWriteAccessForBlockerKinds([DAMAGE, LAYOUT_DOUBT])).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(trsdosWriteAccessForBlockerKinds([LAYOUT_DOUBT, DAMAGE])).to.equal(TrsdosWriteAccess.READ_ONLY);
    });

    it("names the access levels", () => {
        expect(trsdosWriteAccessToString(TrsdosWriteAccess.WRITABLE)).to.equal("writable");
        expect(trsdosWriteAccessToString(TrsdosWriteAccess.REPAIR_ONLY)).to.equal("repair-only");
        expect(trsdosWriteAccessToString(TrsdosWriteAccess.READ_ONLY)).to.equal("read-only");
    });
});
