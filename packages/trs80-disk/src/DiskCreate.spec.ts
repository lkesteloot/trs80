import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import zlib from "zlib";
import {convertFloppy, FloppyImageFormat, makeTrsdos23TestDisk, TRSDOS_FORMAT_DOSES, TrsdosFormatDos} from "trs80-base";
import {describe, expect, it} from "vitest";
import {
    createFloppy, type CreateFloppyRequest, createHardDisk, countFilesToErase, formatFloppy, formatHardDiskPartition,
    getSessionFormatDos, isHardDiskPathname,
} from "./DiskCreate.js";
import {DiskError} from "./DiskError.js";
import {addPartition, deletePartition} from "./DiskPartition.js";
import {DiskSession} from "./DiskSession.js";
import type {DiskTemplateSource} from "./DiskTemplates.js";

/** The folder with trs80-tool's templates, which these tests read as a browser would fetch them. */
const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../trs80-tool/templates");

/**
 * Templates from the real files, as a browser page would get them from the server.
 */
const TEMPLATES: DiskTemplateSource = {
    systemDisk(name: string): Uint8Array | undefined {
        const pathname = path.join(TEMPLATES_DIR, name + ".dmk.gz");
        return fs.existsSync(pathname) ? new Uint8Array(zlib.gunzipSync(fs.readFileSync(pathname))) : undefined;
    },
    bootSectorsHex(key: string): readonly string[] | undefined {
        const all = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, "data-disk-boot-sectors.json"), "utf8"));
        return all[key];
    },
};

/**
 * Open a session with no disk, ready to make one.
 *
 * @param name the image's name.
 */
function makeEmptySession(name: string): DiskSession {
    return DiskSession.fromBinary(name, undefined, {templates: TEMPLATES});
}

/**
 * A request to make a floppy.
 */
function floppyRequest(dos: TrsdosFormatDos, extra: Partial<CreateFloppyRequest> = {}): CreateFloppyRequest {
    return {
        format: {dos, cylinders: undefined, sides: undefined, density: undefined, model: undefined,
            name: undefined, date: undefined},
        system: false,
        minimal: false,
        force: false,
        ...extra,
    };
}

describe("createFloppy", () => {
    for (const dos of TRSDOS_FORMAT_DOSES) {
        it("makes a blank data disk for DOS " + dos, () => {
            const session = makeEmptySession("new.dmk");
            const result = createFloppy(session, floppyRequest(dos));
            expect(result.replaced).to.equal(false);
            expect(result.systemCopy).to.equal(undefined);
            expect(session.hasDisk()).to.equal(true);
            expect(session.fileSystem).to.not.equal(undefined);
            expect(countFilesToErase(session)).to.equal(0);
            expect(session.hasChanges()).to.equal(true);
        });
    }

    it("makes a system disk and trims it with --minimal", () => {
        const full = makeEmptySession("new.dmk");
        const fullResult = createFloppy(full, floppyRequest(TrsdosFormatDos.LDOS_5_3, {system: true}));
        expect(fullResult.systemCopy!.description).to.contain("system disk");
        expect(fullResult.systemCopy!.removedNames).to.eql([]);

        const minimal = makeEmptySession("new.dmk");
        const minimalResult = createFloppy(minimal, floppyRequest(TrsdosFormatDos.LDOS_5_3,
            {system: true, minimal: true}));
        expect(minimalResult.systemCopy!.removedNames.length).to.be.greaterThan(0);
        expect(minimal.fileSystem!.getDirEntries(false).length).to.equal(0);
        expect(full.fileSystem!.getDirEntries(false).length).to.equal(minimalResult.systemCopy!.removedNames.length);
    });

    it("refuses a system disk of a different shape, --minimal without --system, and a JV1 name", () => {
        const request = floppyRequest(TrsdosFormatDos.LDOS_5_3, {system: true});
        request.format.cylinders = 80;
        expect(() => createFloppy(makeEmptySession("new.dmk"), request)).to.throw(DiskError, "can't use --cylinders 80");
        expect(() => createFloppy(makeEmptySession("new.dmk"), floppyRequest(TrsdosFormatDos.LDOS_5_3, {minimal: true})))
            .to.throw(DiskError, "--minimal only applies with --system");
        expect(() => createFloppy(makeEmptySession("new.jv1"), floppyRequest(TrsdosFormatDos.LDOS_5_3)))
            .to.throw(DiskError, "create makes DMK images");
    });

    it("replaces a disk only with force", () => {
        const session = makeEmptySession("new.dmk");
        createFloppy(session, floppyRequest(TrsdosFormatDos.LDOS_5_3));
        expect(() => createFloppy(session, floppyRequest(TrsdosFormatDos.LDOS_5_3))).to.throw(DiskError, "already has a disk");
        const result = createFloppy(session, floppyRequest(TrsdosFormatDos.TRSDOS_1_3, {force: true}));
        expect(result.replaced).to.equal(true);
    });

    it("leaves the disk alone when a system disk's name is bad", () => {
        const session = makeEmptySession("new.dmk");
        createFloppy(session, floppyRequest(TrsdosFormatDos.TRSDOS_1_3));
        const before = session.image;
        const request = floppyRequest(TrsdosFormatDos.LDOS_5_3, {system: true, force: true});
        request.format.name = "TOOLONGNAME";
        expect(() => createFloppy(session, request)).to.throw(DiskError, "too long");
        expect(session.image).to.equal(before);
        expect(session.fileSystem!.nameAndVersion).to.equal("TRSDOS 1.3");
    });

    it("needs templates", () => {
        const session = DiskSession.fromBinary("new.dmk", undefined);
        expect(() => createFloppy(session, floppyRequest(TrsdosFormatDos.LDOS_5_3)))
            .to.throw(DiskError, "This build has no disk templates");
    });
});

describe("formatFloppy", () => {
    /**
     * Open a TRSDOS 2.3 DMK disk with one file.
     */
    function makeSessionWithFile(): DiskSession {
        const jv1 = makeTrsdos23TestDisk([{name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}],
            size: 1000}], {});
        const dmk = convertFloppy(jv1, FloppyImageFormat.DMK);
        if (typeof dmk === "string") {
            throw new Error(dmk);
        }
        return DiskSession.fromBinary("test.dmk", dmk.binary, {templates: TEMPLATES});
    }

    it("refuses a disk with files unless forced", () => {
        const session = makeSessionWithFile();
        expect(getSessionFormatDos(session)).to.equal(TrsdosFormatDos.TRSDOS_2_3);
        expect(countFilesToErase(session)).to.equal(1);
        const request = {format: {dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: undefined, sides: undefined,
            density: undefined, model: undefined, name: undefined, date: undefined}, force: false};
        expect(() => formatFloppy(session, request)).to.throw(DiskError, "format would erase 1 file from the disk");

        formatFloppy(session, {...request, force: true});
        expect(countFilesToErase(session)).to.equal(0);
    });
});

describe("hard disks", () => {
    /**
     * Make an HDV disk with two LDOS partitions.
     */
    function makeHardSession(): DiskSession {
        const session = makeEmptySession("new.hdv");
        expect(isHardDiskPathname(session)).to.equal(true);
        const result = createHardDisk(session, {dos: TrsdosFormatDos.LDOS_5_3, heads: 4, cylinders: 100,
            partitions: 2, model: undefined, name: undefined, date: undefined, force: false});
        expect(result.partitionCount).to.equal(2);
        expect(result.size).to.contain("MB");
        return session;
    }

    it("creates a hard disk with partitions", () => {
        const session = makeHardSession();
        const partitions = session.getPartitions();
        expect(partitions.map(p => p.diskName)).to.eql(["HARDA", "HARDB"]);
        expect(partitions.map(p => p.partition.cylinderCount)).to.eql([50, 50]);
    });

    it("creates a blank hard disk and refuses a bad request", () => {
        const blank = makeEmptySession("new.hdv");
        const result = createHardDisk(blank, {dos: undefined, heads: undefined, cylinders: 100, partitions: undefined,
            model: undefined, name: undefined, date: undefined, force: false});
        expect(result.partitionCount).to.equal(0);
        expect(blank.getPartitions().length).to.equal(0);

        expect(() => createHardDisk(blank, {dos: undefined, heads: undefined, cylinders: 100, partitions: undefined,
            model: undefined, name: undefined, date: undefined, force: false})).to.throw(DiskError, "already has a disk");
        expect(() => createHardDisk(makeEmptySession("new.hdv"), {dos: TrsdosFormatDos.LDOS_5_3, heads: 4,
            cylinders: 100, partitions: 5, model: undefined, name: undefined, date: undefined, force: false}))
            .to.throw(DiskError, "would be 20 cylinders each");
    });

    it("adds and deletes a partition", () => {
        const session = createBlank();
        const placement = {cylinders: 40, heads: undefined, startCylinder: undefined, startHead: undefined};
        const added = addPartition(session, {dos: TrsdosFormatDos.LDOS_5_3, placement, granulesPerCylinder: undefined,
            name: undefined, date: undefined, model: undefined, force: false});
        expect(added.number).to.equal(1);
        expect(added.partition.diskName).to.equal("HARDA");
        expect(session.getPartitions().length).to.equal(1);

        const deleted = deletePartition(session, "HARDA", false);
        expect(deleted.number).to.equal(1);
        expect(deleted.label).to.equal("partition 1 (HARDA)");
        expect(deleted.renumbered).to.equal(false);
        expect(session.getPartitions().length).to.equal(0);
        expect(() => deletePartition(session, undefined, false)).to.throw(DiskError, "No partition is selected");
    });

    it("formats a partition again", () => {
        const session = makeHardSession();
        session.selectPartition("HARDB");
        const result = formatHardDiskPartition(session, {dos: TrsdosFormatDos.LDOS_5_3, model: undefined,
            name: "NEWNAME", date: undefined, force: false});
        expect(result.label).to.equal("partition 2 (HARDB)");
        expect(session.getPartitions()[1].diskName).to.equal("NEWNAME");
    });

    /**
     * Make a blank hard disk with no partitions.
     */
    function createBlank(): DiskSession {
        const session = makeEmptySession("new.hdv");
        createHardDisk(session, {dos: undefined, heads: 4, cylinders: 100, partitions: undefined,
            model: undefined, name: undefined, date: undefined, force: false});
        return session;
    }
});
