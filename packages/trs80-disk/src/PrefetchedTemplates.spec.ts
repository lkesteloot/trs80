import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import zlib from "zlib";
import {TrsdosFormatDos} from "trs80-base";
import {describe, expect, it} from "vitest";
import {createFloppy, type CreateFloppyRequest} from "./DiskCreate.js";
import {DiskSession} from "./DiskSession.js";
import type {DiskTemplateSource} from "./DiskTemplates.js";
import {PrefetchedTemplateSource} from "./PrefetchedTemplates.js";

/** The folder with the engine's templates. */
const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../templates");

/** The boot sector table, as a page would import it. */
const BOOT_SECTORS_HEX = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, "data-disk-boot-sectors.json"), "utf8"));

/** The template that these tests prefetch. */
const SYSTEM_DISK_NAME = "ldos-5.3.1-model3";

/**
 * Read a gzipped template file, as a page would fetch it.
 *
 * @param name the template's name.
 */
async function loadGzipped(name: string): Promise<Uint8Array> {
    return new Uint8Array(fs.readFileSync(path.join(TEMPLATES_DIR, name + ".dmk.gz")));
}

/**
 * A request to make a floppy, with a fixed date so that two disks are the same.
 */
function floppyRequest(system: boolean): CreateFloppyRequest {
    return {
        format: {dos: TrsdosFormatDos.LDOS_5_3, cylinders: undefined, sides: undefined, density: undefined,
            model: undefined, name: undefined, date: new Date(1990, 0, 2)},
        system,
        minimal: false,
        force: false,
    };
}

/**
 * Make a floppy through the source and return its bytes.
 *
 * @param templates where the templates come from.
 * @param system whether to make a system disk.
 */
function makeDiskBytes(templates: DiskTemplateSource, system: boolean): Uint8Array {
    const session = DiskSession.fromBinary("new.dmk", undefined, {templates});
    createFloppy(session, floppyRequest(system));
    return new Uint8Array(session.image.binary);
}

/**
 * The tool's way of getting templates, from the real files with Node's zlib.
 */
const FILE_TEMPLATES: DiskTemplateSource = {
    systemDisk(name: string): Uint8Array | undefined {
        const pathname = path.join(TEMPLATES_DIR, name + ".dmk.gz");
        return fs.existsSync(pathname) ? new Uint8Array(zlib.gunzipSync(fs.readFileSync(pathname))) : undefined;
    },
    bootSectorsHex(key: string): readonly string[] | undefined {
        return BOOT_SECTORS_HEX[key];
    },
};

describe("PrefetchedTemplateSource", () => {
    it("has nothing before prefetching", () => {
        const source = new PrefetchedTemplateSource(BOOT_SECTORS_HEX);
        expect(source.hasSystemDisk(SYSTEM_DISK_NAME)).to.equal(false);
        expect(source.systemDisk(SYSTEM_DISK_NAME)).to.equal(undefined);
        expect(source.bootSectorsHex("ldos-5.3-single")).to.eql(BOOT_SECTORS_HEX["ldos-5.3-single"]);
        expect(source.bootSectorsHex("nonsense")).to.equal(undefined);
    });

    it("prefetches once", async () => {
        const source = new PrefetchedTemplateSource(BOOT_SECTORS_HEX);
        let loadCount = 0;
        const load = (name: string): Promise<Uint8Array> => {
            loadCount++;
            return loadGzipped(name);
        };
        await source.prefetchSystemDisk(SYSTEM_DISK_NAME, load);
        await source.prefetchSystemDisk(SYSTEM_DISK_NAME, load);
        expect(loadCount).to.equal(1);
        expect(source.hasSystemDisk(SYSTEM_DISK_NAME)).to.equal(true);
        expect(source.systemDisk(SYSTEM_DISK_NAME)).to.eql(FILE_TEMPLATES.systemDisk(SYSTEM_DISK_NAME));
    });

    it("takes bytes that a server already unzipped", async () => {
        const source = new PrefetchedTemplateSource(BOOT_SECTORS_HEX);
        const unzipped = FILE_TEMPLATES.systemDisk(SYSTEM_DISK_NAME);
        expect(unzipped).to.not.equal(undefined);
        await source.prefetchSystemDisk(SYSTEM_DISK_NAME, async () => unzipped as Uint8Array);
        expect(source.systemDisk(SYSTEM_DISK_NAME)).to.eql(unzipped);
    });

    it("makes the same disks as the file templates", async () => {
        const source = new PrefetchedTemplateSource(BOOT_SECTORS_HEX);
        await source.prefetchSystemDisk(SYSTEM_DISK_NAME, loadGzipped);
        const system = makeDiskBytes(source, true);
        expect(system.length).to.be.greaterThan(0);
        expect(system).to.eql(makeDiskBytes(FILE_TEMPLATES, true));
        expect(makeDiskBytes(source, false)).to.eql(makeDiskBytes(FILE_TEMPLATES, false));
    });
});
