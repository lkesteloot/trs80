// One-off script that fills packages/trs80-disk/templates/ from disk images: it gzips the seven
// bootable system disks, and copies the DOSes' own boot sectors for data disks out of DOS-formatted
// blank disks into data-disk-boot-sectors.json (with Montezuma Micro CP/M's, which come from the collection's
// own directories, since the trs80gp DOSes don't include it). The templates are committed, so this only needs to
// run again when a template is added or replaced; templates/README.md says what each one is.
//
// The sources are a directory of DMK images: the system disks directly in it, and the blank disks
// that each DOS's FORMAT made in its "formatted" subdirectory. Every source is checked to decode as
// the DOS we expect before anything is written. The hard disk boot sectors come from partitions of
// the HDV images in a second directory.
//
// The Montezuma CP/M system tracks (montezuma-cpm-2.32-system-tracks.json) come from four disks that Montezuma's
// CONFIG saved, in a fourth directory (see its README.md).
//
// Run with "npx tsx tools/ExtractTemplates.ts [SOURCE_DIR [HARD_DISK_DIR [COLLECTION_DIR [CONFIG_DIR]]]]" from
// packages/trs80-tool.

import fs from "fs";
import os from "os";
import path from "path";
import {fileURLToPath} from "url";
import zlib from "zlib";
import {
    Cpm, decodeFloppyFileSystem, decodeTrs80File, FloppyDisk, findCpmVerifiedLayout, findLdosPartitions, isFloppy,
    isHardDisk, SectorPosition,
} from "trs80-base";

/**
 * Where the images are unless the command line says otherwise.
 */
const DEFAULT_SOURCE_DIR = path.join(os.homedir(), "mine", "trs80-floppy-regress", "disks", "simple", "trs80gp");

/**
 * The root of the whole collection, where the Montezuma Micro CP/M disks are.
 */
const DEFAULT_COLLECTION_DIR = path.join(os.homedir(), "mine", "trs80-floppy-regress", "disks");

/**
 * Where the hard disk images are unless the command line says otherwise.
 */
const DEFAULT_HARD_SOURCE_DIR = path.join(os.homedir(), "mine", "trs80-floppy-regress", "disks", "hard");

/**
 * Where the disks that Montezuma's CONFIG saved system tracks on are, unless the command line says otherwise.
 */
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), "mine", "trs80-docs", "montezuma-config");

/**
 * Where the output goes.
 */
const TEMPLATES_DIR = fileURLToPath(new URL("../../trs80-disk/templates", import.meta.url));

/**
 * A bootable system disk to copy into the templates directory.
 */
interface SystemDiskSource {
    /** The source file name, in the source directory. */
    source: string;
    /** The output name, without the ".dmk.gz". */
    name: string;
    /** What the disk's decoded file system must call itself. */
    nameAndVersion: string;
    /** Whether the source is in the trs80gp directory (the default) or the whole collection. */
    from?: "collection";
}

/**
 * The system disks.
 */
const SYSTEM_DISKS: SystemDiskSource[] = [
    {source: "TRSDOS23.DSK", name: "trsdos-2.3-model1", nameAndVersion: "TRSDOS 2.3"},
    {source: "LD351-1.DSK", name: "ldos-5.3.1-model1", nameAndVersion: "LDOS 5.3.1"},
    {source: "LD3-531.DSK", name: "ldos-5.3.1-model3", nameAndVersion: "LDOS 5.3.1"},
    {source: "TRSDOS13.DSK", name: "trsdos-1.3-model3", nameAndVersion: "TRSDOS 1.3"},
    {source: "TRS621.DSK", name: "trsdos-6.2.1-model4", nameAndVersion: "TRSDOS 6.2.1"},
    {source: "LD4-631.DSK", name: "lsdos-6.3.1-model4", nameAndVersion: "LS-DOS 6.3.1"},
    {
        source: "ira/all-dos/Montezuma Micro CP-M 64K System v2.2 BIOS v2.32 (1984)(Montezuma Micro - JBO)[M4][Set 1][Original].dmk",
        name: "montezuma-cpm-2.32-model4", nameAndVersion: "Montezuma Micro CP/M BIOS 2.32", from: "collection",
    },
];

/**
 * A DOS's data-disk boot sectors to copy from a disk.
 */
interface BootSectorSource {
    /** The key in the JSON file. */
    key: string;
    /** The source file name, relative to the source directory. */
    source: string;
    /** What the disk's decoded file system must call itself. */
    nameAndVersion: string;
    /** The sector numbers on cylinder 0, side 0, in the order the formatter expects them. */
    sectors: number[];
    /** The sectors' size in bytes (default 256). */
    sectorSize?: number;
    /** Whether the source is in the trs80gp directory (the default) or the whole collection. */
    from?: "collection";
}

/**
 * The boot sectors. TRSDOS 2.3's is from its system disk and the others from blank disks that the
 * DOS formatted.
 */
const BOOT_SECTORS: BootSectorSource[] = [
    {key: "ldos-5.3-single", source: "formatted/m1-ldos-blank.dmk", nameAndVersion: "LDOS 5.3.1", sectors: [0, 1]},
    {key: "ldos-5.3-double", source: "formatted/m3-ldos-blank.dmk", nameAndVersion: "LDOS 5.3.1", sectors: [0, 1]},
    {key: "lsdos-6.3", source: "formatted/m4-lsdos-blank.dmk", nameAndVersion: "LS-DOS 6.3.1", sectors: [0, 1]},
    {key: "trsdos-6.2", source: "formatted/m4-trsdos-blank.dmk", nameAndVersion: "TRSDOS 6.2", sectors: [0, 1]},
    {key: "trsdos-1.3", source: "formatted/m3-trsdos-blank.dmk", nameAndVersion: "TRSDOS 1.3.2, 1.3I or 1.4", sectors: [1, 2]},
    {key: "trsdos-2.3", source: "TRSDOS23.DSK", nameAndVersion: "TRSDOS 2.3", sectors: [0]},
    // Montezuma's FORMAT leaves this boot sector in track 0 sector 1 of a system format that hasn't been SYSGENed.
    // The 10 x 512 one's first 256 bytes are the 18 x 256 one.
    {
        key: "montezuma-cpm-no-system-256", source: "mloewen/FORMAT13.DMK", nameAndVersion: "Montezuma Micro CP/M",
        sectors: [1], sectorSize: 256, from: "collection",
    },
    {
        key: "montezuma-cpm-no-system-512", source: "mloewen/FORMAT9.DMK", nameAndVersion: "Montezuma Micro CP/M",
        sectors: [1], sectorSize: 512, from: "collection",
    },
];

/**
 * A preset's Montezuma 2.32 system tracks to copy from a disk that CONFIG saved them on.
 */
interface SystemTracksSource {
    /** The preset's id, which is the key in the JSON file and the disk's file name without ".dmk". */
    presetId: string;
    /** The sides that the file system uses, which decide where the reserved tracks are. */
    sides: number;
}

/**
 * The presets that get system tracks, which are the 18 x 256 ones of BIOS 2.x.
 */
const SYSTEM_TRACKS: SystemTracksSource[] = [
    {presetId: "mm-system", sides: 1},
    {presetId: "mm-ds-system", sides: 2},
    {presetId: "mm-80-system", sides: 1},
    {presetId: "mm-80-ds-system", sides: 2},
];

/** How many reserved tracks the system tracks have. */
const SYSTEM_TRACK_COUNT = 2;

/** The sectors on each reserved track, which are numbered from 1. */
const SYSTEM_SECTORS_PER_TRACK = 18;

/** The size of each of those sectors. */
const SYSTEM_SECTOR_SIZE = 256;

/**
 * A hard disk DOS's data-partition boot sectors to copy from a partition of an HDV image.
 */
interface HardBootSectorSource {
    /** The key in the JSON file. */
    key: string;
    /** The source file name, in the hard disk directory. */
    source: string;
    /** The partition's first head. The partitions of these images are split by head. */
    head: number;
    /** The partition's disk name, which must match, to be sure that it's the one we mean. */
    diskName: string;
    /** What the partition's decoded file system must call itself. */
    nameAndVersion: string;
}

/**
 * The hard disk boot sectors, from freshly formatted data partitions of real DOSes: cylinder 0's
 * sectors 0 and 1 of the partition. See templates/README.md.
 */
const HARD_BOOT_SECTORS: HardBootSectorSource[] = [
    {key: "ldos-5.3-hard-model1", source: "m1-ldos531-keil.hdv.gz", head: 1, diskName: "M1LDVOL2", nameAndVersion: "LDOS 5.3"},
    {key: "ldos-5.3-hard-model3", source: "m3-ldos531.hdv.gz", head: 3, diskName: "LDM3HDD", nameAndVersion: "LDOS 5.3"},
    {key: "lsdos-6.3-hard", source: "m4-lsdos631.hdv.gz", head: 2, diskName: "M4LSDOSC", nameAndVersion: "LS-DOS 6.3"},
];

/**
 * Read a DMK image and check that it decodes as the expected DOS.
 *
 * @param sourceDir the directory of images.
 * @param source the image's name in it.
 * @param nameAndVersion what the decoded file system must call itself.
 * @return the file's bytes and the decoded floppy.
 * @throws Error if the file isn't a floppy of that DOS.
 */
function loadAndCheck(sourceDir: string, source: string, nameAndVersion: string): { binary: Uint8Array, floppy: FloppyDisk } {
    const pathname = path.join(sourceDir, source);
    const binary = new Uint8Array(fs.readFileSync(pathname));
    // Pretend it's a .dmk, since some have other extensions.
    const trs80File = decodeTrs80File(binary, {filename: "x.dmk"});
    if (!isFloppy(trs80File)) {
        throw new Error(pathname + " isn't a floppy image");
    }
    const actual = decodeFloppyFileSystem(trs80File)?.nameAndVersion;
    if (actual !== nameAndVersion) {
        throw new Error(pathname + " decodes as " + actual + ", not " + nameAndVersion);
    }
    return {binary, floppy: trs80File};
}

/**
 * Read the first two sectors of a partition of an HDV image, checking that it's the partition and DOS we expect.
 *
 * @param sourceDir the directory of hard disk images.
 * @param source what to read.
 * @return the two 256-byte sectors.
 * @throws Error if the image or the partition isn't what the source says.
 */
function loadHardBootSectors(sourceDir: string, source: HardBootSectorSource): Uint8Array[] {
    const pathname = path.join(sourceDir, source.source);
    const binary = new Uint8Array(fs.readFileSync(pathname));
    const trs80File = decodeTrs80File(binary, {filename: pathname});
    if (!isHardDisk(trs80File)) {
        throw new Error(pathname + " isn't a hard disk image");
    }

    const ldosPartition = findLdosPartitions(trs80File).find(p =>
        p.partition.headOffset === source.head && p.diskName === source.diskName);
    if (ldosPartition === undefined) {
        throw new Error(pathname + " has no partition " + source.diskName + " at head " + source.head);
    }
    const actual = ldosPartition.trsdos.nameAndVersion;
    if (actual !== source.nameAndVersion) {
        throw new Error(pathname + " partition " + source.diskName + " decodes as " + actual + ", not " +
            source.nameAndVersion);
    }

    return [0, 1].map(sectorNumber => {
        const data = ldosPartition.partition.readSector(SectorPosition.make(0, 0, sectorNumber))?.data;
        if (data === undefined || data.length !== 256) {
            throw new Error(pathname + " has no 256-byte sector " + sectorNumber + " on cylinder 0");
        }
        return new Uint8Array(data);
    });
}

/**
 * Read the two reserved tracks of a disk that CONFIG saved, in logical order (reserved track 0's sectors, then reserved
 * track 1's), checking that the disk reads as the preset it's for.
 *
 * @param configDir the directory of disks.
 * @param source which preset.
 * @return the bytes of the two tracks.
 * @throws Error if the disk isn't that preset or lacks a sector.
 */
function loadSystemTracks(configDir: string, source: SystemTracksSource): Uint8Array {
    const pathname = path.join(configDir, source.presetId + ".dmk");
    const binary = new Uint8Array(fs.readFileSync(pathname));
    const trs80File = decodeTrs80File(binary, {filename: "x.dmk"});
    if (!isFloppy(trs80File)) {
        throw new Error(pathname + " isn't a floppy image");
    }
    const fileSystem = decodeFloppyFileSystem(trs80File);
    const layout = fileSystem instanceof Cpm ? findCpmVerifiedLayout(fileSystem) : undefined;
    if (layout?.id !== source.presetId) {
        throw new Error(pathname + " reads as " + (layout?.id ?? "no preset") + ", not " + source.presetId);
    }

    const bytes = new Uint8Array(SYSTEM_TRACK_COUNT * SYSTEM_SECTORS_PER_TRACK * SYSTEM_SECTOR_SIZE);
    let offset = 0;
    for (let track = 0; track < SYSTEM_TRACK_COUNT; track++) {
        for (let sectorNumber = 1; sectorNumber <= SYSTEM_SECTORS_PER_TRACK; sectorNumber++) {
            const position = SectorPosition.make(Math.floor(track/source.sides), track % source.sides, sectorNumber);
            const data = trs80File.readSector(position)?.data;
            if (data === undefined || data.length !== SYSTEM_SECTOR_SIZE) {
                throw new Error(pathname + " has no " + SYSTEM_SECTOR_SIZE + "-byte sector at " + position.key());
            }
            bytes.set(data, offset);
            offset += SYSTEM_SECTOR_SIZE;
        }
    }
    return bytes;
}

/**
 * Convert bytes to a lowercase hex string.
 */
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check the sources and write the templates.
 */
function main(): void {
    const sourceDir = process.argv[2] ?? DEFAULT_SOURCE_DIR;
    const hardSourceDir = process.argv[3] ?? DEFAULT_HARD_SOURCE_DIR;
    const collectionDir = process.argv[4] ?? DEFAULT_COLLECTION_DIR;
    const configDir = process.argv[5] ?? DEFAULT_CONFIG_DIR;

    // Check everything before writing anything.
    const systemDisks = SYSTEM_DISKS.map(systemDisk => ({
        systemDisk,
        loaded: loadAndCheck(systemDisk.from === "collection" ? collectionDir : sourceDir, systemDisk.source,
            systemDisk.nameAndVersion),
    }));
    const bootSectors: { [key: string]: string[] } = {};
    for (const bootSectorSource of BOOT_SECTORS) {
        const {floppy} = loadAndCheck(bootSectorSource.from === "collection" ? collectionDir : sourceDir,
            bootSectorSource.source, bootSectorSource.nameAndVersion);
        const sectorSize = bootSectorSource.sectorSize ?? 256;
        bootSectors[bootSectorSource.key] = bootSectorSource.sectors.map(sectorNumber => {
            const data = floppy.readSector(SectorPosition.make(0, 0, sectorNumber))?.data;
            if (data === undefined || data.length !== sectorSize) {
                throw new Error(bootSectorSource.source + " has no " + sectorSize + "-byte sector " + sectorNumber +
                    " on cylinder 0");
            }
            return toHex(data);
        });
    }

    for (const hardSource of HARD_BOOT_SECTORS) {
        bootSectors[hardSource.key] = loadHardBootSectors(hardSourceDir, hardSource).map(toHex);
    }

    const systemTracks: { [presetId: string]: string } = {};
    for (const systemTracksSource of SYSTEM_TRACKS) {
        systemTracks[systemTracksSource.presetId] = toHex(loadSystemTracks(configDir, systemTracksSource));
    }

    fs.mkdirSync(TEMPLATES_DIR, {recursive: true});
    for (const {systemDisk, loaded} of systemDisks) {
        const gzipped = zlib.gzipSync(loaded.binary, {level: 9});
        fs.writeFileSync(path.join(TEMPLATES_DIR, systemDisk.name + ".dmk.gz"), gzipped);
        console.log(systemDisk.name + ": " + loaded.binary.length + " bytes, " + gzipped.length + " gzipped");
    }
    fs.writeFileSync(path.join(TEMPLATES_DIR, "data-disk-boot-sectors.json"), JSON.stringify(bootSectors, null, 2) + "\n");
    console.log("Wrote data-disk-boot-sectors.json");
    fs.writeFileSync(path.join(TEMPLATES_DIR, "montezuma-cpm-2.32-system-tracks.json"),
        JSON.stringify(systemTracks, null, 2) + "\n");
    console.log("Wrote montezuma-cpm-2.32-system-tracks.json");
}

main();
