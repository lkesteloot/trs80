import {describe, expect, it} from "vitest";
import {
    findProtectionSigns,
    hasProtectionSigns,
    type ProtectionSign,
    ProtectionSignKind,
    ProtectionVerdict,
} from "./CopyProtection.js";
import {
    CrcInfo,
    Density,
    FloppyDisk,
    FloppyDiskGeometry,
    SectorCrc,
    SectorData,
    SectorInfo,
    SectorPosition,
} from "./FloppyDisk.js";
import {decodeJv1FloppyDisk} from "./Jv1FloppyDisk.js";

/**
 * One ID field (and its data) of a made-up floppy.
 */
interface TestSector {
    cylinder: number;
    side?: number;
    sector: number;
    density?: Density;
    // The cylinder that the ID field names, if not the physical one.
    idCylinder?: number;
    // Defaults to 256 bytes of 0x00.
    data?: Uint8Array;
    dataAddressMark?: number;
    sizeCode?: number;
    // Whether the data CRC is bad.
    crcError?: boolean;
}

/**
 * A floppy made from a list of ID fields, which can be anything a real disk can have: repeated sector numbers,
 * IDs naming another cylinder, odd marks. A repeated position reads as its last copy.
 */
class TestFloppy extends FloppyDisk {
    public readonly className = "TestFloppy";
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, SectorData>();

    constructor(testSectors: TestSector[]) {
        super(new Uint8Array(0), undefined, []);
        const sectorInfos: SectorInfo[] = [];
        for (const testSector of testSectors) {
            const side = testSector.side ?? 0;
            const density = testSector.density ?? Density.SINGLE;
            const data = testSector.data ?? new Uint8Array(256);
            const physical = SectorPosition.make(testSector.cylinder, side, testSector.sector);
            const logical = SectorPosition.make(testSector.idCylinder ?? testSector.cylinder, side, testSector.sector);
            const crc = new SectorCrc(new CrcInfo(0, 0), new CrcInfo(0, testSector.crcError === true ? 1 : 0));

            const info = new SectorInfo(physical, density, data.length);
            const sectorData = new SectorData(data, logical, density);
            for (const target of [info, sectorData]) {
                target.crc = crc;
                target.crcError = !crc.valid();
                target.dataAddressMark = testSector.dataAddressMark;
                target.deleted = testSector.dataAddressMark === 0xF8;
                target.sizeCode = testSector.sizeCode ?? 1;
            }
            sectorInfos.push(info);
            this.sectors.set(physical.key(), sectorData);
        }
        const cylinderCount = Math.max(...testSectors.map(s => s.cylinder)) + 1;
        const sideCount = Math.max(...testSectors.map(s => s.side ?? 0)) + 1;
        const geometry = FloppyDiskGeometry.make(cylinderCount, sideCount, sectorInfos);
        if (geometry === undefined) {
            throw new Error("No geometry");
        }
        this.geometry = geometry;
    }

    /**
     * Describes the made-up floppy.
     */
    public getDescription(): string {
        return "Test floppy";
    }

    /**
     * The geometry of the ID fields given to the constructor.
     */
    public getGeometry(): FloppyDiskGeometry {
        return this.geometry;
    }

    /**
     * The last sector given to the constructor at this physical position.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        return this.sectors.get(sectorPosition.key());
    }
}

/**
 * The sectors of plain tracks: the given cylinders numbered 0 to count - 1 (or from "first"), all alike.
 */
function plainTracks(cylinders: number[], count = 10, density = Density.SINGLE, first = 0): TestSector[] {
    return cylinders.flatMap(cylinder => Array.from({length: count}, (_, i) =>
        ({cylinder, sector: first + i, density})));
}

/**
 * The numbers 0 to n - 1.
 */
function range(n: number): number[] {
    return Array.from({length: n}, (_, i) => i);
}

/**
 * The kinds of the signs, in order.
 */
function kinds(signs: ProtectionSign[]): ProtectionSignKind[] {
    return signs.map(sign => sign.kind);
}

/**
 * Data of Tandy's protection-track filler: 0xE5 ending in the copyright.
 */
function tandyFiller(): Uint8Array {
    const data = new Uint8Array(256).fill(0xE5);
    data.set([..."(c) 1980 Tandy  "].map(c => c.charCodeAt(0)), 0xF0);
    return data;
}

/**
 * A double-density disk numbered 1-18, with a cylinder 40 numbered 129-146 whose sectors come from makeData.
 */
function tandyDisk(makeData: (sector: number) => Uint8Array, dataAddressMark: number): TestFloppy {
    const track40 = range(18).map(i => ({
        cylinder: 40, sector: 0x81 + i, density: Density.DOUBLE, data: makeData(0x81 + i), dataAddressMark,
    }));
    return new TestFloppy([...plainTracks(range(40), 18, Density.DOUBLE, 1), ...track40]);
}

describe("findProtectionSigns", () => {
    it("finds nothing on a plain disk", () => {
        const signs = findProtectionSigns(new TestFloppy(plainTracks(range(35))), undefined);
        expect(signs).to.eql([]);
        expect(hasProtectionSigns(signs)).to.be.false;
    });

    it("finds VTOS 3.0's mini-sectors", () => {
        const minis = [0x7C, 0x7D, 0x7E].map(sector => ({cylinder: 0, sector, crcError: true}));
        const signs = findProtectionSigns(new TestFloppy([...plainTracks(range(35)), ...minis]), undefined);
        expect(kinds(signs)).to.eql([ProtectionSignKind.VTOS_MINI_SECTORS]);
        expect(signs[0].verdict).to.equal(ProtectionVerdict.DOS_PROTECTED);
        expect(signs[0].schemes).to.eql(["S-101"]);
        expect(signs[0].sectors.map(sector => sector.sectorNumber)).to.eql([0x7C, 0x7D, 0x7E]);
        expect(hasProtectionSigns(signs)).to.be.true;
    });

    it("takes VTOS 4.0's single good sector 124 for FORMAT output", () => {
        const formatSector = {cylinder: 0, sector: 0x7C, data: new Uint8Array(256).fill(0xE5)};
        const signs = findProtectionSigns(new TestFloppy([...plainTracks(range(35)), formatSector]), undefined);
        expect(kinds(signs)).to.eql([ProtectionSignKind.VTOS_FORMAT_SECTOR]);
        expect(signs[0].verdict).to.equal(ProtectionVerdict.INFO);
        expect(hasProtectionSigns(signs)).to.be.false;
    });

    it("tells what's on Tandy's protection track", () => {
        const code = (sector: number) => {
            const data = tandyFiller();
            if (sector >= 0x90) {
                data[0] = 0x21;
            }
            return data;
        };
        const overlay = (sector: number) => sector === 0x85 ? new Uint8Array(256).fill(0x12) : tandyFiller();
        const cases: [TestFloppy, ProtectionSignKind][] = [
            [tandyDisk(code, 0xF8), ProtectionSignKind.TANDY_PROTECTION_CODE],
            [tandyDisk(overlay, 0xF8), ProtectionSignKind.TANDY_OVERLAYS],
            [tandyDisk(tandyFiller, 0xF8), ProtectionSignKind.TANDY_TRACK_EMPTY],
            [tandyDisk(tandyFiller, 0xFB), ProtectionSignKind.TANDY_TRACK_FORMAT],
        ];
        for (const [disk, kind] of cases) {
            // The track's numbering isn't reported again as a renumbered track.
            expect(kinds(findProtectionSigns(disk, undefined))).to.eql([kind]);
        }
    });

    it("finds renumbered sectors and renumbered tracks", () => {
        const renumbered = plainTracks(range(35)).map(s =>
            s.cylinder === 5 && s.sector === 3 ? {...s, sector: 200} : s);
        const outside = plainTracks([7], 10, Density.SINGLE, 100);
        const disk = new TestFloppy([...renumbered.filter(s => s.cylinder !== 7), ...outside]);
        const signs = findProtectionSigns(disk, undefined);
        expect(kinds(signs)).to.eql([ProtectionSignKind.TRACK_NUMBERED_OUTSIDE, ProtectionSignKind.RENUMBERED_SECTORS]);
        expect(signs[0].tracks.map(track => track.cylinderNumber)).to.eql([7]);
        expect(signs[1].sectors.map(sector => sector.key())).to.eql(["5:0:200"]);
    });

    it("doesn't take a track with many odd numbers for a renumbered one", () => {
        // Like an 8" disk's cylinder 0: 26 sectors, numbered past 18.
        const disk = new TestFloppy([...plainTracks([0], 26, Density.SINGLE, 1), ...plainTracks(range(35).slice(1))]);
        expect(findProtectionSigns(disk, undefined)).to.eql([]);
    });

    it("needs duplicate sector numbers on two tracks", () => {
        const base = plainTracks(range(35));
        const oneTrack = new TestFloppy([...base, {cylinder: 3, sector: 4}]);
        expect(findProtectionSigns(oneTrack, undefined)).to.eql([]);
        const twoTracks = new TestFloppy([...base, {cylinder: 3, sector: 4}, {cylinder: 9, sector: 2}]);
        expect(kinds(findProtectionSigns(twoTracks, undefined))).to.eql([ProtectionSignKind.DUPLICATE_SECTOR_NUMBERS]);
        // The same number in the other density isn't a duplicate.
        const otherDensity = new TestFloppy([...base, {cylinder: 3, sector: 4, density: Density.DOUBLE},
            {cylinder: 9, sector: 2, density: Density.DOUBLE}]);
        expect(kinds(findProtectionSigns(otherDensity, undefined))).to.eql([ProtectionSignKind.MIXED_DENSITY_TRACK]);
    });

    it("finds mixed density on data tracks but not on cylinder 0", () => {
        const cylinder0 = new TestFloppy([{cylinder: 0, sector: 0}, ...plainTracks([0], 17, Density.DOUBLE, 1),
            ...plainTracks(range(35).slice(1), 18, Density.DOUBLE)]);
        expect(findProtectionSigns(cylinder0, undefined)).to.eql([]);
        const dataTrack = new TestFloppy([...plainTracks(range(35), 18, Density.DOUBLE),
            {cylinder: 12, sector: 30, density: Density.SINGLE}]);
        expect(kinds(findProtectionSigns(dataTrack, undefined))).to.include(ProtectionSignKind.MIXED_DENSITY_TRACK);
    });

    it("finds size codes above 3", () => {
        const sectors = plainTracks(range(35)).map(s => s.cylinder === 8 && s.sector === 1 ? {...s, sizeCode: 0x30} : s);
        const signs = findProtectionSigns(new TestFloppy(sectors), undefined);
        expect(kinds(signs)).to.eql([ProtectionSignKind.LARGE_SIZE_CODE]);
        expect(signs[0].message).to.contain("0x30");
    });

    it("finds sectors hidden in other sectors' data", () => {
        const hidden = range(32).map(i => ({cylinder: 20, sector: i % 18, density: Density.DOUBLE}));
        const sectors = [...plainTracks(range(35).filter(c => c !== 20), 18, Density.DOUBLE), ...hidden];
        expect(kinds(findProtectionSigns(new TestFloppy(sectors), undefined))).to.include(ProtectionSignKind.HIDDEN_SECTORS);
    });

    it("finds tracks whose IDs name another cylinder", () => {
        const sectors = plainTracks(range(35)).map(s => s.cylinder === 6 ? {...s, idCylinder: 1} : s);
        const signs = findProtectionSigns(new TestFloppy(sectors), undefined);
        expect(kinds(signs)).to.eql([ProtectionSignKind.FOREIGN_CYLINDER_IDS]);
        expect(signs[0].verdict).to.equal(ProtectionVerdict.POSSIBLE);
    });

    it("finds single-density F9 and FA marks, but not double-density ones", () => {
        const marked = plainTracks(range(35)).map(s =>
            s.cylinder === 4 && s.sector === 2 ? {...s, dataAddressMark: 0xF9} :
            s.cylinder === 5 && s.sector === 3 ? {...s, dataAddressMark: 0xFA} : s);
        expect(kinds(findProtectionSigns(new TestFloppy(marked), undefined)))
            .to.eql([ProtectionSignKind.F9_MARKS, ProtectionSignKind.FA_MARKS]);
        const doubleDensity = plainTracks(range(35), 18, Density.DOUBLE).map(s =>
            s.cylinder === 4 && s.sector === 2 ? {...s, dataAddressMark: 0xF9} : s);
        expect(findProtectionSigns(new TestFloppy(doubleDensity), undefined)).to.eql([]);
    });

    it("doesn't count the marks that the JV1 reader makes up", () => {
        const disk = decodeJv1FloppyDisk(new Uint8Array(35*10*256));
        expect(disk).to.not.be.undefined;
        expect(findProtectionSigns(disk!, undefined)).to.eql([]);
    });
});
