import {describe, expect, it} from "vitest";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {Density, SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {decodeTrsdos, hashTrsdosPassword, type Trsdos, TrsdosVersion} from "./Trsdos.js";
import {checkTrsdos, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {parseTrsdosFilename} from "./TrsdosFilename.js";
import {
    formatTrsdosDataDisk,
    hashTrsdos13Password,
    parseTrsdosFormatDos,
    TRSDOS_FORMAT_DOSES,
    trsdosFormatDosCliName,
    TrsdosFormatDos,
    trsdosFormatDosToString,
    type TrsdosFormatOptions,
} from "./TrsdosFormat.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {evaluateTrsdosWriteGate, TrsdosWriteAccess, TrsdosWriteBlockerKind} from "./TrsdosWriteGate.js";
import {TrsdosWriter} from "./TrsdosWriter.js";

/**
 * Format a disk, failing the test if the options are refused.
 */
function format(options: TrsdosFormatOptions): DmkFloppyDisk {
    const disk = formatTrsdosDataDisk(options);
    if (typeof disk === "string") {
        throw new Error("Format failed: " + disk);
    }
    return disk;
}

/**
 * Decode a disk as TRSDOS, failing the test if it doesn't.
 */
function decode(disk: DmkFloppyDisk): Trsdos {
    const trsdos = decodeTrsdos(disk);
    if (trsdos === undefined) {
        throw new Error("Disk didn't decode as TRSDOS");
    }
    return trsdos;
}

/**
 * Read a sector's data, failing the test if it's missing.
 */
function readBytes(disk: DmkFloppyDisk, cylinder: number, side: number, sector: number): Uint8Array {
    const sectorData = disk.readSector(SectorPosition.make(cylinder, side, sector));
    if (sectorData === undefined) {
        throw new Error(`Missing sector ${cylinder}/${side}/${sector}`);
    }
    return sectorData.data;
}

/**
 * Make a file name, failing the test if it's invalid.
 */
function name(text: string) {
    const filename = parseTrsdosFilename(text);
    if (typeof filename === "string") {
        throw new Error(filename);
    }
    return filename;
}

/**
 * Make some bytes to put in a file.
 */
function makeContents(size: number): Uint8Array {
    const contents = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        contents[i] = (i*7 + (i >> 8)*13 + 31) & 0xFF;
    }
    return contents;
}

/**
 * One kind of disk to format and check.
 */
interface Config {
    options: TrsdosFormatOptions;

    /**
     * What the decoder should call the DOS.
     */
    dosName: string;

    /**
     * The layout the decoder should choose, and the rules that the writer follows.
     */
    version: TrsdosVersion;
    ruleSet: TrsdosRuleSet;

    /**
     * The cylinder that FORMAT puts the directory on.
     */
    directoryCylinder: number;

    /**
     * Granules on a cylinder (both sides).
     */
    granulesPerCylinder: number;
}

/**
 * Every combination that we check.
 */
function makeConfigs(): Config[] {
    const configs: Config[] = [];

    for (const cylinders of [35, 40]) {
        configs.push({
            options: {dos: TrsdosFormatDos.TRSDOS_2_3, cylinders, sides: 1},
            dosName: "TRSDOS 2.x", version: TrsdosVersion.V2_3, ruleSet: TrsdosRuleSet.TRSDOS_2,
            directoryCylinder: 17, granulesPerCylinder: 2,
        });
        configs.push({
            options: {dos: TrsdosFormatDos.TRSDOS_1_3, cylinders, sides: 1},
            dosName: "TRSDOS 1.x", version: TrsdosVersion.V1_3, ruleSet: TrsdosRuleSet.TRSDOS_1_3,
            directoryCylinder: 17, granulesPerCylinder: 6,
        });
    }

    // The LDOS line takes either density and either number of sides. Formatting an 80-cylinder
    // two-sided disk takes a while, so each DOS gets a spread of combinations rather than all of them.
    const ldosLine: {dos: TrsdosFormatDos, dosName: string, ruleSet: TrsdosRuleSet}[] = [
        {dos: TrsdosFormatDos.LDOS_5_3, dosName: "LDOS 5.3", ruleSet: TrsdosRuleSet.LDOS_5},
        {dos: TrsdosFormatDos.TRSDOS_6_2, dosName: "TRSDOS 6.2", ruleSet: TrsdosRuleSet.TRSDOS_6},
        {dos: TrsdosFormatDos.LSDOS_6_3, dosName: "LS-DOS 6.3", ruleSet: TrsdosRuleSet.TRSDOS_6},
    ];
    const spread: {cylinders: number, sides: number, density: Density}[] = [
        {cylinders: 35, sides: 1, density: Density.SINGLE},
        {cylinders: 35, sides: 2, density: Density.DOUBLE},
        {cylinders: 40, sides: 1, density: Density.DOUBLE},
        {cylinders: 40, sides: 2, density: Density.SINGLE},
        {cylinders: 80, sides: 1, density: Density.SINGLE},
        {cylinders: 80, sides: 2, density: Density.DOUBLE},
    ];
    for (const {dos, dosName, ruleSet} of ldosLine) {
        for (const {cylinders, sides, density} of spread) {
            configs.push({
                options: {dos, cylinders, sides, density},
                dosName, version: TrsdosVersion.V2_3, ruleSet,
                directoryCylinder: cylinders >> 1,
                granulesPerCylinder: (density === Density.SINGLE ? 2 : 3)*sides,
            });
        }
    }

    return configs;
}

/**
 * Describe a configuration for the name of a test.
 */
function describeConfig(config: Config): string {
    const {dos, cylinders, sides, density} = config.options;
    const densityName = density === undefined ? "default density" : density === Density.SINGLE ? "single" : "double";
    return `${trsdosFormatDosToString(dos)}, ${cylinders} cylinders, ${sides} side(s), ${densityName}`;
}

describe("formatTrsdosDataDisk", () => {
    for (const config of makeConfigs()) {
        const {options, dosName, version, ruleSet, directoryCylinder, granulesPerCylinder} = config;

        it(`makes an empty disk that decodes and checks clean: ${describeConfig(config)}`, () => {
            const disk = format(options);
            const trsdos = decode(disk);

            expect(trsdos.nameAndVersion).to.eql(dosName);
            expect(trsdos.version).to.eql(version);
            expect(trsdos.dirLumpNumber).to.eql(directoryCylinder);
            expect(trsdos.lumpsAreCylinders).to.eql(true);
            expect(trsdos.allocationSides).to.eql(options.sides);
            expect(trsdos.granulesPerLump).to.eql(granulesPerCylinder);
            expect(trsdos.getDirEntries(false)).to.eql([]);

            // Nothing is wrong with the disk, though TRSDOS 1.3 has a note about its boot granule.
            const findings = checkTrsdos(trsdos).findings;
            expect(findings.filter(finding => trsdosFindingKindSeverity(finding.kind) !== TrsdosFindingSeverity.NOTE)).to.eql([]);
            if (version !== TrsdosVersion.V1_3) {
                expect(findings).to.eql([]);
            }

            // The boot granule and the directory cylinder are the only space in use.
            const granuleMap = TrsdosGranuleMap.make(trsdos);
            if (typeof granuleMap === "string") {
                throw new Error(granuleMap);
            }
            expect(granuleMap.getFreeGranuleCount()).to.eql(
                options.cylinders*granulesPerCylinder - 1 - granulesPerCylinder);
        });

        it(`is writable, and takes and gives up a file: ${describeConfig(config)}`, () => {
            const disk = format(options);

            // The DOS is known from the GAT, and so is the rule set. On two sides the decoder reads the
            // directory as the first side's granules only, as it does on disks the DOS formatted, and
            // the gate then wants the user's say-so about the directory's size; nothing else is wrong.
            const gate = evaluateTrsdosWriteGate(decode(disk));
            expect(gate.ruleSet).to.eql(ruleSet);
            if (options.sides === 1) {
                expect(gate.access).to.eql(TrsdosWriteAccess.WRITABLE);
                expect(gate.blockers).to.eql([]);
                const explicitGate = evaluateTrsdosWriteGate(decode(disk), ruleSet);
                expect(explicitGate.access).to.eql(TrsdosWriteAccess.WRITABLE);
            } else {
                expect(gate.blockers.map(blocker => blocker.kind))
                    .to.eql([TrsdosWriteBlockerKind.DIRECTORY_SIZE_UNPROVEN]);
            }

            // The writer doesn't write the TRSDOS 1.3 layout yet. Adding a file to an 80-cylinder disk
            // is slow, so only the largest disk of the DOS that writes the most (LS-DOS 6.3) does it.
            const slowDisk = options.cylinders === 80 && !(options.dos === TrsdosFormatDos.LSDOS_6_3 && options.sides === 2);
            if (version === TrsdosVersion.V1_3 || slowDisk) {
                return;
            }

            // Add a file that takes several granules. The writer verifies what it wrote.
            const contents = makeContents(5000);
            let overlay = new SectorOverlay(disk);
            let writer = new TrsdosWriter(decodeTrsdosOrFail(overlay), ruleSet);
            writer.addFile(name("HELLO/TXT"), contents);
            let newTrsdos = writer.flush();
            overlay.commit();
            expect(newTrsdos.getDirEntries(false).map(dirEntry => dirEntry.getFilename("/"))).to.eql(["HELLO/TXT"]);

            // It reads back from the disk itself.
            const afterAdd = decode(disk);
            const hello = afterAdd.findFile("HELLO/TXT");
            expect(hello).not.to.be.undefined;
            expect(afterAdd.readFile(hello!)).to.eql(contents);
            expect(checkTrsdos(afterAdd).findings.filter(finding =>
                trsdosFindingKindSeverity(finding.kind) !== TrsdosFindingSeverity.NOTE)).to.eql([]);

            // Delete it again.
            overlay = new SectorOverlay(disk);
            writer = new TrsdosWriter(decodeTrsdosOrFail(overlay), ruleSet);
            writer.deleteFile(writer.findFile("HELLO/TXT")!);
            newTrsdos = writer.flush();
            overlay.commit();
            expect(newTrsdos.getDirEntries(false)).to.eql([]);

            const afterDelete = decode(disk);
            const granuleMap = TrsdosGranuleMap.make(afterDelete);
            if (typeof granuleMap === "string") {
                throw new Error(granuleMap);
            }
            expect(granuleMap.getFreeGranuleCount()).to.eql(
                options.cylinders*granulesPerCylinder - 1 - granulesPerCylinder);
        });
    }

    it("writes the GAT's fields", () => {
        const disk = format({
            dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 80, sides: 2, name: "mydisk", masterPassword: "secret",
            date: new Date(2026, 9, 5),
        });
        const gatInfo = decode(disk).getGatInfo();
        if (typeof gatInfo === "string") {
            throw new Error(gatInfo);
        }

        expect(gatInfo.name).to.eql("MYDISK");
        expect(gatInfo.date).to.eql("10/05/26");
        expect(gatInfo.password).to.eql(hashTrsdosPassword("SECRET"));
        expect(gatInfo.osVersion).to.eql(0x63);
        expect(gatInfo.cylinderCount).to.eql(80);
        expect(gatInfo.sideCount).to.eql(2);
        expect(gatInfo.density).to.eql(Density.DOUBLE);
        expect(gatInfo.granulesPerTrack).to.eql(3);

        // Bytes 0xCC and 0xCD: cylinders minus 35, then data disk, double density, two sides, new
        // date style, and granules per side minus one.
        const gat = readBytes(disk, 40, 0, 0);
        expect(gat[0xCC]).to.eql(45);
        expect(gat[0xCD]).to.eql(0xEA);
    });

    it("defaults to the name, password and date that FORMAT uses", () => {
        const before = new Date();
        const disk = format({dos: TrsdosFormatDos.LDOS_5_3, model: 3, cylinders: 40, sides: 1});
        const gatInfo = decode(disk).getGatInfo();
        if (typeof gatInfo === "string") {
            throw new Error(gatInfo);
        }

        expect(gatInfo.name).to.eql("DATADISK");
        expect(gatInfo.password).to.eql(0x42E0);
        expect(gatInfo.date).to.have.length(8);
        expect(gatInfo.date.substring(6)).to.eql(String(before.getFullYear() % 100).padStart(2, "0"));
    });

    it("chooses LDOS's density from the model", () => {
        const model1 = decode(format({dos: TrsdosFormatDos.LDOS_5_3, model: 1, cylinders: 35, sides: 1}));
        expect(model1.granulesPerLump).to.eql(2);
        const model3 = decode(format({dos: TrsdosFormatDos.LDOS_5_3, model: 3, cylinders: 40, sides: 1}));
        expect(model3.granulesPerLump).to.eql(3);

        // The Model I's double-density disks have a cylinder 0 that we don't make.
        expect(formatTrsdosDataDisk({dos: TrsdosFormatDos.LDOS_5_3, model: 1, density: Density.DOUBLE, cylinders: 40, sides: 1}))
            .to.be.a("string");
    });

    it("puts the directory cylinder in the boot sectors we write", () => {
        const tests: {dos: TrsdosFormatDos, cylinders: number, sectors: number[], offset: number, directoryCylinder: number}[] = [
            {dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 40, sectors: [0], offset: 2, directoryCylinder: 17},
            {dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 35, sectors: [1], offset: 1, directoryCylinder: 17},
            {dos: TrsdosFormatDos.LDOS_5_3, cylinders: 80, sectors: [0, 1], offset: 2, directoryCylinder: 40},
            {dos: TrsdosFormatDos.TRSDOS_6_2, cylinders: 35, sectors: [0, 1], offset: 2, directoryCylinder: 17},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, sectors: [0, 1], offset: 2, directoryCylinder: 20},
        ];
        for (const test of tests) {
            const disk = format({dos: test.dos, cylinders: test.cylinders, sides: 1});
            for (const sector of test.sectors) {
                const bytes = readBytes(disk, 0, 0, sector);
                expect(bytes[test.offset]).to.eql(test.directoryCylinder);
            }
        }
    });

    it("copies the boot sectors it's given, with the directory cylinder patched in", () => {
        const first = makeContents(256);
        const second = makeContents(256).map(b => b ^ 0x5A);
        const disk = format({dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 80, sides: 1, bootSectors: [first, second]});

        const expectedFirst = new Uint8Array(first);
        expectedFirst[2] = 40;
        const expectedSecond = new Uint8Array(second);
        expectedSecond[2] = 40;
        expect(readBytes(disk, 0, 0, 0)).to.eql(expectedFirst);
        expect(readBytes(disk, 0, 0, 1)).to.eql(expectedSecond);
        // The given sectors are left alone.
        expect(first[2]).not.to.eql(40);
        expect(decode(disk).nameAndVersion).to.eql("LS-DOS 6.3");

        // TRSDOS 1.3 numbers its sectors from 1 and patches only the boot sector's byte 1.
        const disk13 = format({dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 35, sides: 1, bootSectors: [first, second]});
        const expectedBoot13 = new Uint8Array(first);
        expectedBoot13[1] = 17;
        expect(readBytes(disk13, 0, 0, 1)).to.eql(expectedBoot13);
        expect(readBytes(disk13, 0, 0, 2)).to.eql(second);
    });

    it("marks the directory sectors and boot sectors the way each DOS does", () => {
        const tests: {dos: TrsdosFormatDos, cylinders: number, directoryMark: number, bootMark: number}[] = [
            {dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 35, directoryMark: 0xFA, bootMark: 0xFB},
            {dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 35, directoryMark: 0xFB, bootMark: 0xF8},
            {dos: TrsdosFormatDos.LDOS_5_3, cylinders: 40, directoryMark: 0xF8, bootMark: 0xFB},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, directoryMark: 0xF8, bootMark: 0xFB},
        ];
        for (const test of tests) {
            const disk = format({dos: test.dos, cylinders: test.cylinders, sides: 1});
            const first = test.dos === TrsdosFormatDos.TRSDOS_1_3 ? 1 : 0;
            const directoryCylinder = test.dos === TrsdosFormatDos.TRSDOS_2_3 || test.dos === TrsdosFormatDos.TRSDOS_1_3 ?
                17 : test.cylinders >> 1;
            for (let i = 0; i < 4; i++) {
                const directorySector = disk.readSector(SectorPosition.make(directoryCylinder, 0, first + i));
                expect(directorySector?.getDataAddressMark()).to.eql(test.directoryMark);
            }
            const bootSector = disk.readSector(SectorPosition.make(0, 0, first));
            expect(bootSector?.getDataAddressMark()).to.eql(test.bootMark);
        }
    });

    it("refuses what the DOS can't format", () => {
        const refused: TrsdosFormatOptions[] = [
            {dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 35, sides: 2},
            {dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 80, sides: 1},
            {dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 35, sides: 1, density: Density.DOUBLE},
            {dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 35, sides: 1, density: Density.SINGLE},
            {dos: TrsdosFormatDos.LDOS_5_3, cylinders: 34, sides: 1},
            {dos: TrsdosFormatDos.LDOS_5_3, cylinders: 96, sides: 1},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, sides: 3},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, sides: 1, name: "9LIVES"},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, sides: 1, name: "TOOLONGNAME"},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, sides: 1, masterPassword: "A B"},
            {dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 35, sides: 1, masterPassword: "TOOLONGPASSWORD"},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, sides: 1, bootSectors: [new Uint8Array(256)]},
            {dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 40, sides: 1, bootSectors: [new Uint8Array(256), new Uint8Array(255)]},
        ];
        for (const options of refused) {
            expect(formatTrsdosDataDisk(options), JSON.stringify(options)).to.be.a("string");
        }
    });

    it("lists its DOSes by name", () => {
        for (const dos of TRSDOS_FORMAT_DOSES) {
            expect(parseTrsdosFormatDos(trsdosFormatDosCliName(dos))).to.eql(dos);
            expect(parseTrsdosFormatDos(trsdosFormatDosCliName(dos).toUpperCase())).to.eql(dos);
            expect(trsdosFormatDosToString(dos)).not.to.eql("");
        }
        expect(parseTrsdosFormatDos("newdos")).to.be.undefined;
    });
});

describe("hashTrsdos13Password", () => {
    it("matches the hashes that real TRSDOS 1.3 disks hold", () => {
        expect(hashTrsdos13Password("PASSWORD")).to.eql(0x8FD3);
        expect(hashTrsdos13Password("")).to.eql(0x5CEF);
        expect(hashTrsdos13Password("password")).to.eql(0x8FD3);
    });

    it("rejects what the DOS would", () => {
        expect(() => hashTrsdos13Password("1ABC")).to.throw();
        expect(() => hashTrsdos13Password("TOOLONGPASSWORD")).to.throw();
    });
});

/**
 * Decode an overlay as TRSDOS, failing the test if it doesn't.
 */
function decodeTrsdosOrFail(overlay: SectorOverlay): Trsdos {
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined) {
        throw new Error("Overlay didn't decode as TRSDOS");
    }
    return trsdos;
}
