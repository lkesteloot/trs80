/**
 * A builder for small synthetic hard disks with LDOS 5 or LS-DOS 6 partitions, for tests, as
 * TrsdosTestDisk.ts is for floppies. It makes an HDV image with one or more partitions, split by
 * head or by cylinder, each with a boot sector, a GAT with its real fields (version, cylinder
 * count, granules per cylinder, and the media data block), a HIT, a directory, and files, laid out
 * as "Hard disk images" in FLOPPY_FORMATS.md describes. It's exported from the package only so
 * that tests in this repo (trs80-tool's, for instance) can build disks; it isn't for real use.
 */

import {HARD_DISK_SECTOR_SIZE, HARD_DISK_SECTORS_PER_TRACK} from "./HardDisk.js";
import {decodeHdvHardDisk, type HdvHardDisk} from "./HdvHardDisk.js";
import {hashForFilename} from "./Trsdos.js";

/**
 * The size of an HDV file's header.
 */
const HEADER_SIZE = 256;

/**
 * A file to put on a test partition.
 */
export interface LdosTestFile {
    /**
     * The name with a slash for the extension, such as "HELLO/TXT".
     */
    name: string;

    /**
     * The file's bytes. They get consecutive granules after the directory cylinder, with at most
     * four extents' worth (128 granules), since the builder makes no extended entries.
     */
    contents: Uint8Array;
}

/**
 * Describes a partition to make. Every field has a default, so that {} is a partition of 40
 * cylinders and 2 heads, with 8 granules per cylinder and its directory on cylinder 20.
 */
export interface LdosTestPartition {
    /**
     * The first physical cylinder.
     */
    cylinderOffset?: number | undefined;

    /**
     * The first physical head.
     */
    headOffset?: number | undefined;

    /**
     * The number of cylinders, 35 to 203.
     */
    cylinderCount?: number | undefined;

    /**
     * The number of heads.
     */
    headCount?: number | undefined;

    /**
     * The number of granules in each cylinder, a divisor of the cylinder's sectors.
     */
    granulesPerCylinder?: number | undefined;

    /**
     * The directory's cylinder, relative to the partition.
     */
    dirCylinder?: number | undefined;

    /**
     * The disk name in the GAT.
     */
    name?: string | undefined;

    /**
     * The GAT's version byte (0xCB): 0x53 for LDOS 5.3, 0x63 for LS-DOS 6.3, 0x35 for DOSPLUS 3.5.
     */
    version?: number | undefined;

    /**
     * Whether to write the media data block, which makes the partition's position and shape explicit.
     * Partitions split by head need it.
     */
    mediaData?: boolean | undefined;

    /**
     * The user files, in directory order. BOOT/SYS and DIR/SYS are always there. Defaults to
     * HELLO/TXT, which holds "HELLO WORLD".
     */
    files?: LdosTestFile[] | undefined;

    /**
     * Whether sector 3 of the partition's cylinder 0 holds a copy of the GAT, as FORMAT leaves it.
     * Defaults to true. The copy is the GAT as built, and nothing updates it afterwards.
     */
    staleGatCopy?: boolean | undefined;
}

/**
 * Describes the disk the partitions are on.
 */
export interface LdosTestHardDiskOptions {
    /**
     * The number of cylinders. Defaults to the end of the last partition.
     */
    cylinderCount?: number | undefined;

    /**
     * The number of heads. Defaults to the end of the tallest partition.
     */
    headCount?: number | undefined;

    /**
     * Whether the header's write-protect flag is set.
     */
    writeProtected?: boolean | undefined;

    /**
     * The number of bytes to cut off the end of the file, making a truncated last cylinder.
     */
    truncateBytes?: number | undefined;
}

/**
 * A partition with every field filled in.
 */
export interface ResolvedLdosTestPartition {
    cylinderOffset: number;
    headOffset: number;
    cylinderCount: number;
    headCount: number;
    granulesPerCylinder: number;
    dirCylinder: number;
    name: string;
    version: number;
    mediaData: boolean;
    files: LdosTestFile[];
    staleGatCopy: boolean;
}

/**
 * Fill in the defaults of a partition description.
 */
export function resolveLdosTestPartition(partition: LdosTestPartition): ResolvedLdosTestPartition {
    return {
        cylinderOffset: partition.cylinderOffset ?? 0,
        headOffset: partition.headOffset ?? 0,
        cylinderCount: partition.cylinderCount ?? 40,
        headCount: partition.headCount ?? 2,
        granulesPerCylinder: partition.granulesPerCylinder ?? 8,
        dirCylinder: partition.dirCylinder ?? 20,
        name: partition.name ?? "TESTPART",
        version: partition.version ?? 0x63,
        mediaData: partition.mediaData ?? true,
        files: partition.files ?? [{name: "HELLO/TXT", contents: new TextEncoder().encode("HELLO WORLD")}],
        staleGatCopy: partition.staleGatCopy ?? true,
    };
}

/**
 * Make an HDV of 0xE5 filler with the given geometry and an empty file system. The caller fills in
 * the partitions.
 *
 * @param cylinderCount the number of cylinders.
 * @param headCount the number of heads.
 * @param writeProtected whether the header's write-protect flag is set.
 */
export function makeBlankTestHdv(cylinderCount: number, headCount: number, writeProtected = false): Uint8Array {
    const binary = new Uint8Array(HEADER_SIZE +
        cylinderCount*headCount*HARD_DISK_SECTORS_PER_TRACK*HARD_DISK_SECTOR_SIZE);
    binary.fill(0xE5, HEADER_SIZE);
    binary.set([0x56, 0xCB, 0x10, 0x00, 1, 4, 0, writeProtected ? 0x80 : 0, 0]);
    binary[29] = (headCount*HARD_DISK_SECTORS_PER_TRACK) & 0xFF;
    return binary;
}

/**
 * The bytes of sector "sector" of logical cylinder "cylinder" of the partition, in the HDV, which
 * can be changed in place. This deliberately doesn't use HardDiskPartition, so that tests of it
 * have something independent to compare to.
 *
 * @param binary the HDV file.
 * @param diskHeads the number of heads that the disk has.
 * @param partition the partition, with at least its position.
 * @param cylinder the logical cylinder, from the partition's first.
 * @param sector the logical sector, counted across all the partition's heads.
 */
export function ldosTestSector(binary: Uint8Array, diskHeads: number,
                               partition: {cylinderOffset: number, headOffset: number},
                               cylinder: number, sector: number): Uint8Array {

    const physicalCylinder = partition.cylinderOffset + cylinder;
    const head = partition.headOffset + Math.floor(sector/HARD_DISK_SECTORS_PER_TRACK);
    const index = (physicalCylinder*diskHeads + head)*HARD_DISK_SECTORS_PER_TRACK +
        sector % HARD_DISK_SECTORS_PER_TRACK;
    return binary.subarray(HEADER_SIZE + index*HARD_DISK_SECTOR_SIZE, HEADER_SIZE + (index + 1)*HARD_DISK_SECTOR_SIZE);
}

/**
 * Writes the text into the bytes, padded with spaces on the right.
 */
function writePadded(bytes: Uint8Array, offset: number, text: string, length: number): void {
    for (let i = 0; i < length; i++) {
        bytes[offset + i] = i < text.length ? text.charCodeAt(i) : 0x20;
    }
}

/**
 * Convert a name with a slash, such as "HELLO/TXT", to the 11 characters a directory entry holds:
 * the name padded to 8, then the extension padded to 3.
 */
function rawFilename(name: string): string {
    const [base, extension = ""] = name.toUpperCase().split("/");
    return base.padEnd(8, " ") + extension.padEnd(3, " ");
}

/**
 * Writes a directory entry for a file into a directory sector.
 *
 * @param sector the directory sector.
 * @param entryIndex the entry's index in the sector, 0 to 7.
 * @param flags the entry's flags byte.
 * @param filename the 11-character name.
 * @param sectorCount the file's length in sectors.
 * @param lastSectorSize the file's end-of-file offset in its last sector.
 * @param extents the extents, each as the lump and the extent byte (granule offset in 3 bits, count
 * less one in 5).
 */
function writeDirEntry(sector: Uint8Array, entryIndex: number, flags: number, filename: string,
                       sectorCount: number, lastSectorSize: number, extents: [number, number][]): void {

    const entry = sector.subarray(entryIndex*32, (entryIndex + 1)*32);
    entry.fill(0);
    entry[0] = flags;
    entry[1] = 3;
    entry[2] = (15 << 3) | 2;
    entry[3] = lastSectorSize;
    entry[4] = 0;
    writePadded(entry, 5, filename, 11);
    // The blank password hash.
    entry.set([0x96, 0x42, 0x96, 0x42], 16);
    entry[20] = sectorCount & 0xFF;
    entry[21] = sectorCount >> 8;
    entry.fill(0xFF, 22, 32);
    extents.forEach(([lump, extentByte], i) => {
        entry[22 + i*2] = lump;
        entry[23 + i*2] = extentByte;
    });
}

/**
 * Write an LDOS partition into the HDV: a boot sector, a GAT, a HIT, and directory entries for
 * BOOT/SYS, DIR/SYS and the user files, whose data goes in the granules after the directory cylinder.
 *
 * @param binary the HDV file.
 * @param diskHeads the number of heads the disk has.
 * @param spec the partition.
 */
export function writeLdosTestPartition(binary: Uint8Array, diskHeads: number, spec: ResolvedLdosTestPartition): void {
    const span = spec.headCount*HARD_DISK_SECTORS_PER_TRACK;
    const granulesPerCylinder = spec.granulesPerCylinder;
    const sectorsPerGranule = span/granulesPerCylinder;
    const sector = (cylinder: number, s: number) => ldosTestSector(binary, diskHeads, spec, cylinder, s);

    sector(0, 0).set([0x00, 0xFE, spec.dirCylinder]);

    const gat = sector(spec.dirCylinder, 0);
    gat.fill(0);
    // The DOS sets the bits of a lump's granules that don't exist.
    const unusedBits = (0xFF << granulesPerCylinder) & 0xFF;
    for (let lump = 0; lump < spec.cylinderCount; lump++) {
        gat[lump] = unusedBits;
    }
    gat[0] |= 0x01;
    gat[spec.dirCylinder] = 0xFF;
    gat[0xCB] = spec.version;
    gat[0xCC] = spec.cylinderCount - 35;
    gat[0xCD] = (granulesPerCylinder - 1) | 0x80;
    writePadded(gat, 0xD0, spec.name, 8);
    writePadded(gat, 0xD8, "01/01/90", 8);
    if (spec.mediaData) {
        gat.set([0x03, 0x52, 0x53, 0x48], 0xF5);
        gat[0xF9] = 0x0C | (spec.cylinderOffset >> 8);
        gat[0xFA] = 0x10 | spec.headOffset;
        gat[0xFB] = spec.cylinderOffset & 0xFF;
        gat[0xFC] = spec.cylinderCount - 1;
        gat[0xFD] = ((spec.headCount - 1) << 5) | (HARD_DISK_SECTORS_PER_TRACK - 1);
        gat[0xFE] = ((granulesPerCylinder - 1) << 5) | (sectorsPerGranule - 1);
        gat[0xFF] = spec.dirCylinder;
    }

    // The directory entry sectors start at logical sector 2, after the GAT and the HIT.
    const entrySectorCount = Math.min(span - 2, 32);
    for (let i = 0; i < entrySectorCount; i++) {
        sector(spec.dirCylinder, 2 + i).fill(0);
    }
    const hit = sector(spec.dirCylinder, 1);
    hit.fill(0);

    const entrySector = (sectorIndex: number) => sector(spec.dirCylinder, 2 + sectorIndex);
    const setEntry = (sectorIndex: number, entryIndex: number, flags: number, name: string,
                      sectorCount: number, lastSectorSize: number, extents: [number, number][]) => {

        const filename = rawFilename(name);
        writeDirEntry(entrySector(sectorIndex), entryIndex, flags, filename, sectorCount, lastSectorSize, extents);
        hit[entryIndex*32 + sectorIndex] = hashForFilename(filename);
    };
    setEntry(0, 0, 0x58, "BOOT/SYS", 1, 0, [[0, 0]]);
    setEntry(1, 0, 0x58, "DIR/SYS", span, 0, [[spec.dirCylinder, granulesPerCylinder - 1]]);

    // The files' granules follow the directory cylinder.
    let nextGranule = (spec.dirCylinder + 1)*granulesPerCylinder;
    spec.files.forEach((file, i) => {
        const fileSectorCount = Math.ceil(file.contents.length/HARD_DISK_SECTOR_SIZE);
        const granuleCount = Math.ceil(fileSectorCount/sectorsPerGranule);
        const extents: [number, number][] = [];
        for (let done = 0; done < granuleCount; done += 32) {
            const start = nextGranule + done;
            const count = Math.min(32, granuleCount - done);
            extents.push([Math.floor(start/granulesPerCylinder), ((start % granulesPerCylinder) << 5) | (count - 1)]);
        }
        if (extents.length > 4) {
            throw new Error(`${file.name} needs more than four extents`);
        }

        // The user files take entries 2 and up of each directory sector, in turn.
        setEntry(i % 32, 2 + Math.floor(i/32), 0x10, file.name, fileSectorCount,
            file.contents.length % HARD_DISK_SECTOR_SIZE, extents);

        for (let granule = 0; granule < granuleCount; granule++) {
            const index = nextGranule + granule;
            gat[Math.floor(index/granulesPerCylinder)] |= 1 << (index % granulesPerCylinder);
            for (let s = 0; s < sectorsPerGranule; s++) {
                const fileSectorIndex = granule*sectorsPerGranule + s;
                if (fileSectorIndex >= fileSectorCount) {
                    break;
                }
                const target = sector(Math.floor(index/granulesPerCylinder),
                    (index % granulesPerCylinder)*sectorsPerGranule + s);
                target.fill(0);
                target.set(file.contents.subarray(fileSectorIndex*HARD_DISK_SECTOR_SIZE,
                    (fileSectorIndex + 1)*HARD_DISK_SECTOR_SIZE));
            }
        }
        nextGranule += granuleCount;
    });

    if (spec.staleGatCopy) {
        sector(0, 3).set(gat);
    }
}

/**
 * Make the bytes of an HDV file with LDOS partitions, as {@link makeLdosTestHardDisk} does.
 *
 * @param partitions the partitions to write.
 * @param options the disk's shape and header.
 */
export function makeLdosTestHardDiskBinary(partitions: LdosTestPartition[],
                                           options: LdosTestHardDiskOptions = {}): Uint8Array {

    const specs = partitions.map(resolveLdosTestPartition);
    const cylinderCount = options.cylinderCount ??
        Math.max(...specs.map(spec => spec.cylinderOffset + spec.cylinderCount));
    const headCount = options.headCount ?? Math.max(...specs.map(spec => spec.headOffset + spec.headCount));

    const binary = makeBlankTestHdv(cylinderCount, headCount, options.writeProtected ?? false);
    for (const spec of specs) {
        writeLdosTestPartition(binary, headCount, spec);
    }

    const truncateBytes = options.truncateBytes ?? 0;
    return truncateBytes === 0 ? binary : binary.slice(0, binary.length - truncateBytes);
}

/**
 * Make a hard disk image with LDOS 5 or LS-DOS 6 partitions in it, split by head or by cylinder.
 * Each partition has a boot sector, a GAT with its real fields, a HIT, a directory, BOOT/SYS and
 * DIR/SYS, and the files given (see {@link LdosTestPartition} for the defaults). Make partitions
 * split by head with {@link LdosTestPartition.mediaData} true (the default).
 *
 * @param partitions the partitions to write, which mustn't overlap.
 * @param options the disk's shape and header.
 * @return the decoded disk.
 */
export function makeLdosTestHardDisk(partitions: LdosTestPartition[],
                                     options: LdosTestHardDiskOptions = {}): HdvHardDisk {

    const hardDisk = decodeHdvHardDisk(makeLdosTestHardDiskBinary(partitions, options));
    if (hardDisk === undefined) {
        throw new Error("The test hard disk doesn't decode");
    }
    return hardDisk;
}
