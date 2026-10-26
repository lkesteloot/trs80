// One-off script that fills packages/trs80-tool/templates/ from disk images: it gzips the six
// bootable system disks, and copies the DOSes' own boot sectors for data disks out of DOS-formatted
// blank disks into data-disk-boot-sectors.json. The templates are committed, so this only needs to
// run again when a template is added or replaced; templates/README.md says what each one is.
//
// The sources are a directory of DMK images: the system disks directly in it, and the blank disks
// that each DOS's FORMAT made in its "formatted" subdirectory. Every source is checked to decode as
// the DOS we expect before anything is written.
//
// Run with "npx tsx tools/ExtractTemplates.ts [SOURCE_DIR]" from packages/trs80-tool.

import fs from "fs";
import os from "os";
import path from "path";
import {fileURLToPath} from "url";
import zlib from "zlib";
import {decodeFloppyFileSystem, decodeTrs80File, FloppyDisk, isFloppy, SectorPosition} from "trs80-base";

/**
 * Where the images are unless the command line says otherwise.
 */
const DEFAULT_SOURCE_DIR = path.join(os.homedir(), "mine", "trs80-floppy-regress", "disks", "simple", "trs80gp");

/**
 * Where the output goes.
 */
const TEMPLATES_DIR = fileURLToPath(new URL("../templates", import.meta.url));

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
}

/**
 * The boot sectors. TRSDOS 2.3's is from its system disk and the others from blank disks that the
 * DOS formatted.
 */
const BOOT_SECTORS: BootSectorSource[] = [
    {key: "ldos-5.3-single", source: "formatted/m1-ldos-blank.dmk", nameAndVersion: "LDOS 5.3", sectors: [0, 1]},
    {key: "ldos-5.3-double", source: "formatted/m3-ldos-blank.dmk", nameAndVersion: "LDOS 5.3", sectors: [0, 1]},
    {key: "lsdos-6.3", source: "formatted/m4-lsdos-blank.dmk", nameAndVersion: "LS-DOS 6.3", sectors: [0, 1]},
    {key: "trsdos-6.2", source: "formatted/m4-trsdos-blank.dmk", nameAndVersion: "TRSDOS 6.2", sectors: [0, 1]},
    {key: "trsdos-1.3", source: "formatted/m3-trsdos-blank.dmk", nameAndVersion: "TRSDOS 1.x", sectors: [1, 2]},
    {key: "trsdos-2.3", source: "TRSDOS23.DSK", nameAndVersion: "TRSDOS 2.3", sectors: [0]},
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

    // Check everything before writing anything.
    const systemDisks = SYSTEM_DISKS.map(systemDisk => ({
        systemDisk,
        loaded: loadAndCheck(sourceDir, systemDisk.source, systemDisk.nameAndVersion),
    }));
    const bootSectors: { [key: string]: string[] } = {};
    for (const bootSectorSource of BOOT_SECTORS) {
        const {floppy} = loadAndCheck(sourceDir, bootSectorSource.source, bootSectorSource.nameAndVersion);
        bootSectors[bootSectorSource.key] = bootSectorSource.sectors.map(sectorNumber => {
            const data = floppy.readSector(SectorPosition.make(0, 0, sectorNumber))?.data;
            if (data === undefined || data.length !== 256) {
                throw new Error(bootSectorSource.source + " has no 256-byte sector " + sectorNumber + " on cylinder 0");
            }
            return toHex(data);
        });
    }

    fs.mkdirSync(TEMPLATES_DIR, {recursive: true});
    for (const {systemDisk, loaded} of systemDisks) {
        const gzipped = zlib.gzipSync(loaded.binary, {level: 9});
        fs.writeFileSync(path.join(TEMPLATES_DIR, systemDisk.name + ".dmk.gz"), gzipped);
        console.log(systemDisk.name + ": " + loaded.binary.length + " bytes, " + gzipped.length + " gzipped");
    }
    fs.writeFileSync(path.join(TEMPLATES_DIR, "data-disk-boot-sectors.json"), JSON.stringify(bootSectors, null, 2) + "\n");
    console.log("Wrote data-disk-boot-sectors.json");
}

main();
