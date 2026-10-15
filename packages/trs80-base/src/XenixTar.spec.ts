import {describe, expect, it} from "vitest";
import {Density, FloppyDisk, FloppyDiskGeometry, SectorData, SectorInfo, SectorPosition} from "./FloppyDisk.js";
import {decodeXenixTar, XenixTarType, xenixTarTypeToString} from "./XenixTar.js";

const SECTOR_SIZE = 512;
const SECTORS_PER_TRACK = 16;
const FILL_BYTE = 0xE5;

/**
 * A floppy in the Xenix layout: an unused FM boot track on cylinder 0 side 0, and MFM tracks of
 * sixteen 512-byte sectors numbered from 1 everywhere else. The sectors are kept in a map.
 */
class MemoryFloppyDisk extends FloppyDisk {
    public readonly className = "MemoryFloppyDisk";
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, Uint8Array>();
    private readonly crcErrorKeys = new Set<string>();

    /**
     * @param cylinderCount the number of cylinders.
     * @param sideCount the number of sides.
     */
    constructor(cylinderCount: number, sideCount: number) {
        super(new Uint8Array(0), undefined, []);

        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
            for (let side = 0; side < sideCount; side++) {
                if (cylinder === 0 && side === 0) {
                    // The boot track, FM with 26 sectors of 128 bytes.
                    for (let sector = 1; sector <= 26; sector++) {
                        const position = SectorPosition.make(0, 0, sector);
                        sectorInfos.push(new SectorInfo(position, Density.SINGLE, 128));
                        this.sectors.set(position.key(), new Uint8Array(128).fill(FILL_BYTE));
                    }
                } else {
                    for (let sector = 1; sector <= SECTORS_PER_TRACK; sector++) {
                        const position = SectorPosition.make(cylinder, side, sector);
                        sectorInfos.push(new SectorInfo(position, Density.DOUBLE, SECTOR_SIZE));
                        this.sectors.set(position.key(), new Uint8Array(SECTOR_SIZE).fill(FILL_BYTE));
                    }
                }
            }
        }
        this.geometry = FloppyDiskGeometry.make(cylinderCount, sideCount, sectorInfos)!;
    }

    /**
     * Describes the test disk.
     */
    public getDescription(): string {
        return "Test floppy";
    }

    public getGeometry(): FloppyDiskGeometry {
        return this.geometry;
    }

    /**
     * Read a sector from the map.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        const data = this.sectors.get(sectorPosition.key());
        if (data === undefined) {
            return undefined;
        }
        const sectorData = new SectorData(data, sectorPosition, Density.DOUBLE);
        sectorData.crcError = this.crcErrorKeys.has(sectorPosition.key());
        return sectorData;
    }

    /**
     * Make a sector read with a CRC error.
     */
    public setSectorCrcError(position: SectorPosition): void {
        this.crcErrorKeys.add(position.key());
    }

    /**
     * Remove a sector so that it can't be read.
     */
    public removeSector(position: SectorPosition): void {
        this.sectors.delete(position.key());
    }

    /**
     * Write the bytes of an archive to the data tracks, in order, starting at linear track 1,
     * where track = cylinder*sides + side. A short last sector is left padded with the fill byte.
     */
    public writeArchive(archive: Uint8Array): void {
        const sideCount = this.geometry.sideCount;
        const sectorCount = Math.ceil(archive.length/SECTOR_SIZE);
        for (let i = 0; i < sectorCount; i++) {
            const track = 1 + Math.floor(i/SECTORS_PER_TRACK);
            const position = SectorPosition.make(Math.floor(track/sideCount), track % sideCount,
                1 + i % SECTORS_PER_TRACK);
            const data = this.sectors.get(position.key());
            if (data === undefined) {
                // Off the end of the disk, which is how a multi-volume member gets cut off.
                break;
            }
            data.set(archive.subarray(i*SECTOR_SIZE, (i + 1)*SECTOR_SIZE));
        }
    }
}

/**
 * Write an ASCII string into a header field.
 */
function putString(header: Uint8Array, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
        header[offset + i] = text.charCodeAt(i);
    }
}

/**
 * Options for makeHeader().
 */
interface HeaderOptions {
    mode?: number | undefined;
    uid?: number | undefined;
    gid?: number | undefined;
    mtime?: number | undefined;
    typeFlag?: string | undefined;
    linkName?: string | undefined;
    // Text for the size field, instead of a padded octal number.
    rawSize?: string | undefined;
    // Make a ustar header with this prefix.
    prefix?: string | undefined;
    // Text for the extent number field (bytes 257-260), the extent count field (261-264), and the
    // whole file's size field (265-276), as the raw characters including any NUL.
    rawExtentNumber?: string | undefined;
    rawExtentCount?: string | undefined;
    rawExtentFileSize?: string | undefined;
}

/**
 * Make a 512-byte tar header, with a good checksum, in the style of the old Xenix tar: numbers are
 * octal, padded with spaces on the left and ended by a space and a NUL.
 */
function makeHeader(name: string, size: number, options: HeaderOptions = {}): Uint8Array {
    const header = new Uint8Array(SECTOR_SIZE);
    const octal = (value: number, width: number) => value.toString(8).padStart(width - 2, " ") + " \0";
    putString(header, 0, name);
    putString(header, 100, octal(options.mode ?? 0o644, 8));
    putString(header, 108, octal(options.uid ?? 0, 8));
    putString(header, 116, octal(options.gid ?? 3, 8));
    putString(header, 124, options.rawSize ?? size.toString(8).padStart(11, " ") + " ");
    putString(header, 136, (options.mtime ?? 0o3000000000).toString(8).padStart(11, " ") + " ");
    header[156] = (options.typeFlag ?? "\0").charCodeAt(0);
    putString(header, 157, options.linkName ?? "");
    if (options.prefix !== undefined) {
        putString(header, 257, "ustar\0" + "00");
        putString(header, 345, options.prefix);
    }
    putString(header, 257, options.rawExtentNumber ?? "");
    putString(header, 261, options.rawExtentCount ?? "");
    putString(header, 265, options.rawExtentFileSize ?? "");

    // Checksum: sum of all bytes, with the checksum field as spaces.
    putString(header, 148, "        ");
    let sum = 0;
    for (const b of header) {
        sum += b;
    }
    putString(header, 148, sum.toString(8).padStart(6, " ") + "\0 ");
    return header;
}

/**
 * Deterministic data for a member: the length in bytes, tagged with a seed.
 */
function makeData(length: number, seed: number): Uint8Array {
    return Uint8Array.from({length}, (_, i) => (i*7 + seed) & 0xFF);
}

/**
 * Pad data to a multiple of the sector size with zeros, as tar does.
 */
function pad(data: Uint8Array): Uint8Array {
    const padded = new Uint8Array(Math.ceil(data.length/SECTOR_SIZE)*SECTOR_SIZE);
    padded.set(data);
    return padded;
}

/**
 * Concatenate byte arrays.
 */
function concat(... parts: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

/**
 * A member of an archive: header and padded data.
 */
function makeMember(name: string, data: Uint8Array, options: HeaderOptions = {}): Uint8Array {
    return concat(makeHeader(name, data.length, options), pad(data));
}

// The terminator of an archive.
const END_BLOCKS = new Uint8Array(2*SECTOR_SIZE);

const SMALL = makeData(100, 1);
// Three sectors, ending partway through the third.
const MEDIUM = makeData(1200, 2);
// Longer than a track, so it crosses a track boundary wherever it starts.
const BIG = makeData(20*SECTOR_SIZE - 5, 3);

/**
 * An archive of three members and a terminator.
 */
function makeArchive(): Uint8Array {
    return concat(
        makeMember("./usr/bin/small", SMALL, {mtime: 0o3000000000}),
        makeMember("usr/lib/medium.a", MEDIUM, {mode: 0o755}),
        makeMember("big", BIG),
        END_BLOCKS);
}

/**
 * The positions of a file's sectors as "cylinder.side.sector".
 */
function keys(positions: SectorPosition[]): string[] {
    return positions.map(position => `${position.cylinderNumber}.${position.side}.${position.sectorNumber}`);
}

describe("decodeXenixTar", () => {
    it("decodes a single-sided disk", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(makeArchive());
        const tar = decodeXenixTar(disk)!;
        expect(tar).to.not.be.undefined;
        expect(tar.nameAndVersion).to.equal("Xenix tar");
        const files = tar.getDirEntries(true);
        expect(files.map(file => file.getFilename("."))).to.eql(["usr/bin/small", "usr/lib/medium.a", "big"]);
        expect(files.map(file => file.getSize())).to.eql([SMALL.length, MEDIUM.length, BIG.length]);
        expect(files[0].name).to.equal("./usr/bin/small");
        expect(files[1].mode).to.equal(0o755);
        expect(files[1].uid).to.equal(0);
        expect(files[1].gid).to.equal(3);
        expect(files[0].getDate()!.getTime()).to.equal(0o3000000000*1000);
        expect(files[0].isSystemFile()).to.be.false;
        expect(files[0].isHidden()).to.be.false;
        expect(Array.from(tar.readFile(files[0]))).to.eql(Array.from(SMALL));
        expect(Array.from(tar.readFile(files[1]))).to.eql(Array.from(MEDIUM));
        expect(Array.from(tar.readFile(files[2]))).to.eql(Array.from(BIG));
        // The first header is at cylinder 1 sector 1, so the first file's data is at sector 2.
        expect(keys(tar.getFileSectorPositions(files[0]))).to.eql(["1.0.2"]);
    });

    it("lists the data sector positions across a track boundary", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(makeArchive());
        const tar = decodeXenixTar(disk)!;
        const big = tar.getDirEntries(false)[2];
        // The header is at stream sector 1 + 1 + 3 = 5 (from 0), so the data starts at sector 6 + 1.
        const positions = keys(tar.getFileSectorPositions(big));
        expect(positions.length).to.equal(20);
        expect(positions[0]).to.equal("1.0.8");
        expect(positions[8]).to.equal("1.0.16");
        expect(positions[9]).to.equal("2.0.1");
        expect(positions[19]).to.equal("2.0.11");
    });

    it("reads a double-sided disk starting at cylinder 0 side 1", () => {
        const disk = new MemoryFloppyDisk(77, 2);
        disk.writeArchive(makeArchive());
        // The boot track's side has nothing, and the header is on side 1 of cylinder 0.
        const tar = decodeXenixTar(disk)!;
        expect(tar).to.not.be.undefined;
        const files = tar.getDirEntries(false);
        expect(files.map(file => file.getFilename("/"))).to.eql(["usr/bin/small", "usr/lib/medium.a", "big"]);
        expect(keys(tar.getFileSectorPositions(files[0]))).to.eql(["0.1.2"]);
        expect(Array.from(tar.readFile(files[2]))).to.eql(Array.from(BIG));
        // The big file's sectors go from cylinder 0 side 1 to cylinder 1 side 0.
        const positions = keys(tar.getFileSectorPositions(files[2]));
        expect(positions[0]).to.equal("0.1.8");
        expect(positions[9]).to.equal("1.0.1");
    });

    it("reports a good file as undamaged", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(makeArchive());
        const tar = decodeXenixTar(disk)!;
        for (const file of tar.getDirEntries(true)) {
            const {damage, binary} = tar.readFileWithDamage(file);
            expect(damage.isDamaged()).to.be.false;
            expect(binary.length).to.equal(file.getSize());
        }
    });

    it("reports a missing sector and a CRC error", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(makeArchive());
        // The medium member's header is at sector 3, and its data is in sectors 4 to 6.
        disk.removeSector(SectorPosition.make(1, 0, 4));
        disk.setSectorCrcError(SectorPosition.make(1, 0, 5));
        const tar = decodeXenixTar(disk)!;
        const medium = tar.getDirEntries(false)[1];
        const {binary, damage} = tar.readFileWithDamage(medium);
        expect(keys(damage.missingSectors)).to.eql(["1.0.4"]);
        expect(keys(damage.crcErrorSectors)).to.eql(["1.0.5"]);
        expect(binary.length).to.equal(MEDIUM.length);
        expect(Array.from(binary.subarray(0, SECTOR_SIZE))).to.eql(new Array(SECTOR_SIZE).fill(0));
        expect(Array.from(binary.subarray(SECTOR_SIZE))).to.eql(Array.from(MEDIUM.subarray(SECTOR_SIZE)));
    });

    it("stops at the end-of-archive zero block", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        // A member placed after the zero blocks isn't part of the archive.
        disk.writeArchive(concat(makeMember("one", SMALL), END_BLOCKS, makeMember("hidden", SMALL)));
        const tar = decodeXenixTar(disk)!;
        expect(tar.getDirEntries(true).map(file => file.name)).to.eql(["one"]);
    });

    it("stops at unwritten filler after the last member", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(concat(makeMember("one", SMALL), makeMember("two", SMALL)));
        const tar = decodeXenixTar(disk)!;
        expect(tar.getDirEntries(true).map(file => file.name)).to.eql(["one", "two"]);
    });

    it("reads an archive that fills the disk exactly", () => {
        // Two data tracks, no room for a terminator.
        const disk = new MemoryFloppyDisk(3, 1);
        const data = makeData(31*SECTOR_SIZE, 9);
        disk.writeArchive(makeMember("full", data));
        const tar = decodeXenixTar(disk)!;
        const full = tar.getDirEntries(true)[0];
        expect(tar.readFileWithDamage(full).damage.isDamaged()).to.be.false;
        expect(Array.from(tar.readFile(full))).to.eql(Array.from(data));
    });

    it("lists a member that's cut off by the end of the disk, with damage", () => {
        // Two data tracks (32 sectors). The second member wants 1 + 40 sectors, starting at sector 11.
        const disk = new MemoryFloppyDisk(3, 1);
        const data = makeData(40*SECTOR_SIZE - 10, 5);
        disk.writeArchive(concat(makeMember("first", makeData(9*SECTOR_SIZE, 4)), makeMember("cut", data)));
        const tar = decodeXenixTar(disk)!;
        const files = tar.getDirEntries(true);
        expect(files.map(file => file.name)).to.eql(["first", "cut"]);
        expect(tar.readFileWithDamage(files[0]).damage.isDamaged()).to.be.false;
        const cut = files[1];
        expect(cut.getSize()).to.equal(data.length);
        const {binary, damage} = tar.readFileWithDamage(cut);
        expect(binary.length).to.equal(data.length);
        // The member's data starts at stream sector 11 and 21 of its 40 sectors are on the disk.
        expect(damage.missingSectors.length).to.equal(40 - 21);
        expect(damage.toString()).to.equal("19 missing sectors");
        expect(Array.from(binary.subarray(0, 21*SECTOR_SIZE))).to.eql(Array.from(data.subarray(0, 21*SECTOR_SIZE)));
        expect(binary.subarray(21*SECTOR_SIZE).every(b => b === 0)).to.be.true;
    });

    it("rejects a disk that starts in the middle of a member", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(pad(makeData(20*SECTOR_SIZE, 8)));
        expect(decodeXenixTar(disk)).to.be.undefined;
    });

    it("rejects blank and zeroed disks", () => {
        expect(decodeXenixTar(new MemoryFloppyDisk(77, 1))).to.be.undefined;
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(new Uint8Array(10*SECTOR_SIZE));
        expect(decodeXenixTar(disk)).to.be.undefined;
    });

    it("rejects a header with a bad checksum", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        const archive = makeArchive();
        archive[0] ^= 0x20;
        disk.writeArchive(archive);
        expect(decodeXenixTar(disk)).to.be.undefined;
    });

    it("rejects a stale header followed by something else", () => {
        // This is what a boot block with a leftover tar header looks like to us.
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(concat(makeHeader("stale", 0), makeData(30*SECTOR_SIZE, 11)));
        expect(decodeXenixTar(disk)).to.be.undefined;
    });

    it("keeps the members before a damaged header", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        const damagedHeader = makeHeader("bad", 10);
        damagedHeader[130] ^= 1;
        disk.writeArchive(concat(makeMember("one", SMALL), makeMember("two", SMALL), damagedHeader,
            makeMember("three", SMALL)));
        const tar = decodeXenixTar(disk)!;
        expect(tar.getDirEntries(true).map(file => file.name)).to.eql(["one", "two"]);
    });

    it("rejects a disk with the wrong sector format", () => {
        // Geometry of a TRSDOS-style disk: no 16-sector tracks.
        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < 40; cylinder++) {
            for (let sector = 0; sector < 18; sector++) {
                sectorInfos.push(new SectorInfo(SectorPosition.make(cylinder, 0, sector), Density.SINGLE, 256));
            }
        }
        const geometry = FloppyDiskGeometry.make(40, 1, sectorInfos)!;
        class OtherDisk extends MemoryFloppyDisk {
            public getGeometry(): FloppyDiskGeometry {
                return geometry;
            }
        }
        const disk = new OtherDisk(40, 1);
        disk.writeArchive(makeArchive());
        expect(decodeXenixTar(disk)).to.be.undefined;
    });

    it("accepts a size field with stale digits after the terminator", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        const options = {rawSize: "   1750\0" + "1654 "};
        disk.writeArchive(concat(makeMember("old", makeData(0o1750, 6), options), END_BLOCKS));
        const tar = decodeXenixTar(disk)!;
        expect(tar.getDirEntries(true)[0].getSize()).to.equal(0o1750);
    });

    it("uses the ustar prefix, where there is one", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(concat(makeMember("file.c", SMALL, {prefix: "src/deep"}), END_BLOCKS));
        const tar = decodeXenixTar(disk)!;
        expect(tar.getDirEntries(true)[0].getFilename(".")).to.equal("src/deep/file.c");
    });

    it("skips directories and special members, and lists regular files by type", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(concat(
            makeMember("dir/", new Uint8Array(0), {typeFlag: "5"}),
            makeMember("dir/a", SMALL, {typeFlag: "0"}),
            makeMember("dir/sym", new Uint8Array(0), {typeFlag: "2", linkName: "a"}),
            makeMember("dir/dev", new Uint8Array(0), {typeFlag: "3"}),
            makeMember("dir/b", MEDIUM, {typeFlag: "7"}),
            END_BLOCKS));
        const tar = decodeXenixTar(disk)!;
        const files = tar.getDirEntries(true);
        expect(files.map(file => file.name)).to.eql(["dir/a", "dir/b"]);
        expect(files.map(file => file.type)).to.eql([XenixTarType.FILE, XenixTarType.CONTIGUOUS_FILE]);
        expect(tar.skippedMemberCount).to.equal(3);
        expect(Array.from(tar.readFile(files[1]))).to.eql(Array.from(MEDIUM));
    });

    it("lists a hard link with its target's contents", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(concat(
            makeMember("bin/target", MEDIUM),
            // A hard link with a size of zero, as written by tar, and one whose target is elsewhere.
            makeMember("bin/link", new Uint8Array(0), {typeFlag: "1", linkName: "bin/target"}),
            makeMember("bin/orphan", new Uint8Array(0), {typeFlag: "1", linkName: "bin/elsewhere"}),
            END_BLOCKS));
        const tar = decodeXenixTar(disk)!;
        const files = tar.getDirEntries(true);
        expect(files.map(file => file.name)).to.eql(["bin/target", "bin/link", "bin/orphan"]);
        expect(files[1].type).to.equal(XenixTarType.HARD_LINK);
        expect(files[1].linkName).to.equal("bin/target");
        expect(files[1].getSize()).to.equal(MEDIUM.length);
        expect(Array.from(tar.readFile(files[1]))).to.eql(Array.from(MEDIUM));
        expect(files[2].getSize()).to.equal(0);
        expect(tar.readFile(files[2]).length).to.equal(0);
    });

    it("strips leading slashes from filenames", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(concat(makeMember("/etc/termcap", SMALL), makeMember("./etc/passwd", SMALL), END_BLOCKS));
        const tar = decodeXenixTar(disk)!;
        expect(tar.getDirEntries(true).map(file => file.getFilename("."))).to.eql(["etc/termcap", "etc/passwd"]);
    });
});

/**
 * Decode an archive holding one member with the given options, and return that member.
 */
function decodeSingleMember(name: string, data: Uint8Array, options: HeaderOptions) {
    const disk = new MemoryFloppyDisk(77, 1);
    disk.writeArchive(concat(makeMember(name, data, options), END_BLOCKS));
    const tar = decodeXenixTar(disk)!;
    return tar.getDirEntries(true)[0];
}

describe("XenixTar extents", () => {
    it("reads the extent fields of a part of a split file", () => {
        const file = decodeSingleMember("usr/games/vtrek", MEDIUM, {
            rawExtentNumber: "1\0",
            rawExtentCount: "2\0",
            rawExtentFileSize: "167336\0",
        });
        expect(file.extent).to.eql({number: 1, count: 2, fileSize: 0o167336});
        expect(file.size).to.equal(MEDIUM.length);
    });

    it("has no extent without the fields", () => {
        expect(decodeSingleMember("plain", SMALL, {}).extent).to.be.undefined;
    });

    it("doesn't read a ustar header as an extent", () => {
        expect(decodeSingleMember("file.c", SMALL, {prefix: "src"}).extent).to.be.undefined;
    });

    it("ignores inconsistent extent fields", () => {
        // Number past the count.
        expect(decodeSingleMember("a", SMALL, {
            rawExtentNumber: "3\0", rawExtentCount: "2\0", rawExtentFileSize: "1000\0",
        }).extent).to.be.undefined;
        // A single extent.
        expect(decodeSingleMember("b", SMALL, {
            rawExtentNumber: "1\0", rawExtentCount: "1\0", rawExtentFileSize: "1000\0",
        }).extent).to.be.undefined;
        // Whole file smaller than the extent (SMALL is 100 bytes, 0o100 is 64).
        expect(decodeSingleMember("c", SMALL, {
            rawExtentNumber: "1\0", rawExtentCount: "2\0", rawExtentFileSize: "100\0",
        }).extent).to.be.undefined;
    });

    it("gives a hard link no extent", () => {
        const disk = new MemoryFloppyDisk(77, 1);
        disk.writeArchive(concat(
            makeMember("bin/target", MEDIUM),
            makeMember("bin/link", new Uint8Array(0), {
                typeFlag: "1", linkName: "bin/target",
                rawExtentNumber: "1\0", rawExtentCount: "2\0", rawExtentFileSize: "10000\0",
            }),
            END_BLOCKS));
        const files = decodeXenixTar(disk)!.getDirEntries(true);
        expect(files[1].type).to.equal(XenixTarType.HARD_LINK);
        expect(files[1].extent).to.be.undefined;
    });
});

describe("xenixTarTypeToString", () => {
    it("names the types", () => {
        expect(xenixTarTypeToString(XenixTarType.DIRECTORY)).to.equal("Directory");
        expect(xenixTarTypeToString(XenixTarType.HARD_LINK)).to.equal("Hard link");
    });
});
