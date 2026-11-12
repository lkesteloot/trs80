import {describe, expect, it} from "vitest";
import {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {decodeTrsdos, hashForFilename, type Trsdos, type TrsdosDirEntry, TrsdosVersion} from "./Trsdos.js";
import {checkTrsdos, TrsdosFindingKind, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {readTrsdosDiskInfo} from "./TrsdosDiskInfo.js";
import {parseTrsdosFilename, type TrsdosFilename} from "./TrsdosFilename.js";
import {formatTrsdosDataDisk, hashTrsdos27Password, TrsdosFormatDos} from "./TrsdosFormat.js";
import {identifyTrsdosRuleSet, TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";
import {evaluateTrsdosWriteGate, TrsdosWriteAccess} from "./TrsdosWriteGate.js";
import {TrsdosWriteError, TrsdosWriter} from "./TrsdosWriter.js";

/**
 * The directory cylinder of every TRSDOS 2.7 and 2.8 disk.
 */
const DIR_CYLINDER = 17;

/**
 * Granules per cylinder and sectors per granule on a double-density TRSDOS 2.7 disk.
 */
const GRANULES_PER_LUMP = 6;
const SECTORS_PER_GRANULE = 3;

/**
 * A file to put on the 2.7 test disk, in one extent.
 */
interface Test27File {
    /** The name with a slash for the extension, such as "MEMTEST/CMD". */
    name: string;
    /** The entry's byte 0. */
    flags: number;
    /** The cylinder and first granule of its one extent, and the number of granules. */
    cylinder: number;
    granule: number;
    granuleCount: number;
    /** The size in bytes, which must fit the granules. */
    size: number;
    /** The byte that fills its sectors. */
    data: number;
}

/**
 * Files like those on a TRSDOS 2.8 system disk: a system file and two user files, each where the DOS's
 * own disks have them.
 */
const FILES: Test27File[] = [
    {name: "BASIC/CMD", flags: 0x5E, cylinder: 5, granule: 0, granuleCount: 8, size: 22*256, data: 0xB1},
    {name: "MEMTEST/CMD", flags: 0x18, cylinder: 7, granule: 0, granuleCount: 3, size: 8*256, data: 0x3E},
    {name: "HELLO/BAS", flags: 0x10, cylinder: 8, granule: 0, granuleCount: 2, size: 4*256 + 100, data: 0x48},
];

/**
 * The raw 11-character name of a file.
 */
function rawName(name: string): string {
    const [base, extension] = name.split("/");
    return base.padEnd(8, " ") + (extension ?? "").padEnd(3, " ");
}

/**
 * Read a sector, failing the test if it's missing.
 */
function readBytes(volume: { readSector(sectorPosition: SectorPosition): { data: Uint8Array } | undefined },
                   sectorPosition: SectorPosition): Uint8Array {

    const sector = volume.readSector(sectorPosition);
    if (sector === undefined) {
        throw new Error("Missing sector " + sectorPosition.key());
    }
    return sector.data;
}

/**
 * Make a TRSDOS 2.8 test disk: a 35-cylinder TRSDOS 1.3 data disk, which has 2.7's geometry (18 sectors numbered
 * from 1, granules of three), with its directory cylinder and cylinder 1 written over the way 2.8's own disks
 * have them (see "Which DOSes share a layout" in FLOPPY_FORMATS.md): the GAT, a dense HIT of 128 slots, 32-byte
 * entries, and the version banner on cylinder 1. Cylinder 0 is double density here, unlike the DOS's, which
 * doesn't matter to the writer, since it never allocates there. Cylinders 0, 1 and 17 are all marked used, as on a
 * system disk, so cylinder 1's granules are used but unclaimed, as the DOS's system files' are.
 *
 * @param patch changes the GAT (sector 1 of the directory cylinder) and the HIT (sector 2) before the disk is
 * decoded, or undefined to leave them.
 * @param options what to put in place of the banner and the boot sector: no banner, and the boot sector's bytes.
 * @return the disk under an overlay, decoded, with a writer under TRSDOS 2.7's rules.
 */
function make27Fixture(patch?: (gat: Uint8Array, hit: Uint8Array) => void,
                       options: {noBanner?: boolean, bootSector?: Uint8Array} = {}) {
    const disk = formatTrsdosDataDisk({dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 35, sides: 1,
        date: new Date(1982, 11, 15)});
    if (typeof disk === "string") {
        throw new Error(disk);
    }

    const gat = new Uint8Array(256);
    const hit = new Uint8Array(256);
    const dirSectors: Uint8Array[] = [];
    for (let i = 0; i < 16; i++) {
        dirSectors.push(new Uint8Array(256));
    }
    gat[0] = 0x3F;
    gat[1] = 0x3F;
    gat[DIR_CYLINDER] = 0x3F;
    gat[0xC0] = 0x27;
    gat[0xCE] = 0x13;
    gat[0xCF] = 0xCC;
    gat.set([..."TRSDOS  12/15/82"].map(c => c.charCodeAt(0)), 0xD0);
    gat.fill(0x20, 0xE0, 0xFF);
    gat[0xE0] = 0x0D;
    gat[0xFF] = 0x0D;
    // The system file table, which we don't decode, holds no slots here.
    hit.fill(0xFF, 0xD0, 0x100);

    const sectorData: [SectorPosition, Uint8Array][] = [];
    FILES.forEach((file, dec) => {
        const entry = dirSectors[Math.floor(dec/8)].subarray((dec % 8)*32, (dec % 8)*32 + 32);
        entry.fill(0xFF, 22);
        entry.set([file.flags, 0x03, 82, file.size % 256, 0], 0);
        entry.set([...rawName(file.name)].map(c => c.charCodeAt(0)), 5);
        entry.set([0xCD, 0x40, 0xCD, 0x40, Math.floor(file.size/256) & 0xFF, Math.floor(file.size/256) >> 8], 16);
        entry.set([file.cylinder, (file.granule << 5) | file.granuleCount], 22);
        hit[dec] = hashForFilename(rawName(file.name));
        for (let i = 0; i < file.granuleCount; i++) {
            const index = file.cylinder*GRANULES_PER_LUMP + file.granule + i;
            gat[Math.floor(index/GRANULES_PER_LUMP)] |= 1 << (index % GRANULES_PER_LUMP);
            for (let s = 0; s < SECTORS_PER_GRANULE; s++) {
                const sector = (index % GRANULES_PER_LUMP)*SECTORS_PER_GRANULE + s + 1;
                sectorData.push([SectorPosition.make(Math.floor(index/GRANULES_PER_LUMP), 0, sector),
                    new Uint8Array(256).fill(file.data)]);
            }
        }
    });
    patch?.(gat, hit);

    const banner = new Uint8Array(256).fill(0xE5);
    if (options.noBanner !== true) {
        banner.set([..."TRSDOS version 2.8.0  Wed Dec 15, 1982"].map(c => c.charCodeAt(0)), 0x40);
    }

    const setup = new SectorOverlay(disk);
    setup.writeSector(SectorPosition.make(DIR_CYLINDER, 0, 1), gat);
    setup.writeSector(SectorPosition.make(DIR_CYLINDER, 0, 2), hit);
    dirSectors.forEach((bytes, i) => setup.writeSector(SectorPosition.make(DIR_CYLINDER, 0, i + 3), bytes));
    setup.writeSector(SectorPosition.make(1, 0, 13), banner);
    if (options.bootSector !== undefined) {
        setup.writeSector(SectorPosition.make(0, 0, 1), options.bootSector);
    }
    for (const [position, bytes] of sectorData) {
        setup.writeSector(position, bytes);
    }
    setup.commit();

    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined || trsdos.version !== TrsdosVersion.V2_7) {
        throw new Error("Test disk didn't decode as TRSDOS 2.7");
    }
    return {disk, overlay, trsdos, writer: new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_2_7)};
}

/**
 * Parse a file name, failing the test if it's bad.
 */
function name(text: string): TrsdosFilename {
    const filename = parseTrsdosFilename(text);
    if (typeof filename === "string") {
        throw new Error(filename);
    }
    return filename;
}

/**
 * Get a file, failing the test if it's missing.
 */
function getFile(source: Trsdos | TrsdosWriter, fileName: string): TrsdosDirEntry {
    const dirEntry = source.findFile(fileName);
    if (dirEntry === undefined) {
        throw new Error("No file " + fileName);
    }
    return dirEntry;
}

/**
 * The 32 bytes of a file's directory entry, and where they are.
 */
function entryOf(trsdos: Trsdos, fileName: string): { bytes: Uint8Array, dec: number, position: SectorPosition, offset: number } {
    const slot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === fileName);
    if (slot === undefined) {
        throw new Error("No slot for " + fileName);
    }
    const {sectorPosition, offset} = trsdos.getDirEntryLocation(slot.hitIndex);
    return {
        bytes: readBytes(trsdos.disk, sectorPosition).slice(offset, offset + 32),
        dec: slot.hitIndex,
        position: sectorPosition,
        offset,
    };
}

/**
 * Make test contents: a pattern that differs from byte to byte.
 */
function makeContents(size: number, seed = 1): Uint8Array {
    const contents = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        contents[i] = (i*7 + (i >> 8)*13 + seed*31) & 0xFF;
    }
    return contents;
}

/**
 * The layout and damage findings of a disk, which a write must not add.
 */
function problems(trsdos: Trsdos): string[] {
    return checkTrsdos(trsdos).findings
        .filter(finding => [TrsdosFindingSeverity.LAYOUT, TrsdosFindingSeverity.DAMAGE]
            .includes(trsdosFindingKindSeverity(finding.kind)))
        .map(finding => finding.message);
}

describe("TrsdosWriter on TRSDOS 2.7 and 2.8 disks", () => {
    it("decodes the test disk as TRSDOS 2.8, whose rules we have, and may write it", () => {
        const {trsdos} = make27Fixture();
        expect(trsdos.nameAndVersion).to.equal("TRSDOS 2.8.0");
        expect(identifyTrsdosRuleSet(trsdos).ruleSet).to.equal(TrsdosRuleSet.TRSDOS_2_7);
        expect(problems(trsdos)).to.eql([]);
        const gate = evaluateTrsdosWriteGate(trsdos);
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(gate.ruleSet).to.equal(TrsdosRuleSet.TRSDOS_2_7);
    });

    it("refuses rules that don't fit the layout, either way", () => {
        const {trsdos} = make27Fixture();
        expect(() => new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_2))
            .to.throw(TrsdosWriteError, "TRSDOS 2.x rules don't fit a disk in the TRSDOS 2.7 layout");
        const other = decodeTrsdos(new SectorOverlay(makeTrsdos23TestDisk([])))!;
        expect(() => new TrsdosWriter(other, TrsdosRuleSet.TRSDOS_2_7))
            .to.throw(TrsdosWriteError, "TRSDOS 2.7 and 2.8 rules don't fit a disk in the 2.3 family layout");
    });

    it("deletes a file as the DOS's KILL does: entry byte 0's bit 4, the HIT byte and the GAT bits, and nothing else", () => {
        const {disk, overlay, trsdos, writer} = make27Fixture();
        const memtest = entryOf(trsdos, "MEMTEST/CMD");
        const gatPosition = trsdos.getGatPosition();
        const hitPosition = trsdos.getHitPosition();
        const oldGat = readBytes(disk, gatPosition).slice();
        const oldHit = readBytes(disk, hitPosition).slice();
        const oldDirSector = readBytes(disk, memtest.position).slice();
        const dataPosition = SectorPosition.make(7, 0, 1);
        const oldData = readBytes(disk, dataPosition).slice();

        writer.deleteFile(getFile(writer, "MEMTEST/CMD"));
        const newTrsdos = writer.flush();
        expect(newTrsdos.findFile("MEMTEST/CMD")).to.be.undefined;

        // 18h becomes 08h, and the rest of the entry stays, so that the DOS's UNKILL can bring it back.
        const expectedDirSector = oldDirSector.slice();
        expectedDirSector[memtest.offset] = 0x08;
        expect(readBytes(overlay, memtest.position)).to.eql(expectedDirSector);
        const expectedHit = oldHit.slice();
        expectedHit[memtest.dec] = 0;
        expect(readBytes(overlay, hitPosition)).to.eql(expectedHit);
        // The three granules on cylinder 7 (07h) are freed.
        const expectedGat = oldGat.slice();
        expectedGat[7] = 0x00;
        expect(readBytes(overlay, gatPosition)).to.eql(expectedGat);
        // The file's data is left alone.
        expect(readBytes(overlay, dataPosition)).to.eql(oldData);
        expect(problems(newTrsdos)).to.eql([]);
    });

    it("writes a new entry byte for byte as the DOS's own entries are", () => {
        const {overlay, trsdos, writer} = make27Fixture();
        const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
        const oldHit = readBytes(overlay, trsdos.getHitPosition()).slice();
        const contents = makeContents(5*256 + 22);
        writer.addFile(name("PHONE/BLD"), contents, {date: new Date(1982, 9, 7)});
        const newTrsdos = writer.flush();

        const expected = new Uint8Array(32).fill(0xFF);
        // In use; October 1982 as month and year minus 1900; 22 bytes in the last sector; a record length of 256.
        expected.set([0x10, 10, 82, 22, 0], 0);
        expected.set([...rawName("PHONE/BLD")].map(c => c.charCodeAt(0)), 5);
        // Both passwords blank under 2.7's hash; five full sectors, with the EOF byte adding the sixth; and two
        // granules (stored as two, not one) at the start of the smallest free run that holds them, granules 3-5 of
        // cylinder 7.
        expected.set([0xCD, 0x40, 0xCD, 0x40, 5, 0, 7, (3 << 5) | 2], 16);
        const entry = entryOf(newTrsdos, "PHONE/BLD");
        expect(entry.bytes).to.eql(expected);

        // The lowest free slot in the dense HIT, and the GAT bits, and nothing else.
        expect(entry.dec).to.equal(FILES.length);
        const expectedHit = oldHit.slice();
        expectedHit[FILES.length] = hashForFilename(rawName("PHONE/BLD"));
        expect(readBytes(overlay, newTrsdos.getHitPosition())).to.eql(expectedHit);
        const expectedGat = oldGat.slice();
        expectedGat[7] = 0x1F;
        expect(readBytes(overlay, newTrsdos.getGatPosition())).to.eql(expectedGat);

        const dirEntry = getFile(newTrsdos, "PHONE/BLD");
        expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
        expect([dirEntry.month, dirEntry.year]).to.eql([10, 1982]);
        expect(problems(newTrsdos)).to.eql([]);
    });

    it("adds files of every size around the sector and granule boundaries, and reads them back", () => {
        const {writer} = make27Fixture();
        const sizes = [0, 1, 255, 256, 257, 767, 768, 769, 5000];
        const contents = sizes.map((size, i) => makeContents(size, i + 1));
        sizes.forEach((size, i) => writer.addFile(name(`F${size}/DAT`), contents[i]));
        const newTrsdos = writer.flush();

        sizes.forEach((size, i) => {
            const dirEntry = getFile(newTrsdos, `F${size}/DAT`);
            expect(newTrsdos.readFile(dirEntry)).to.eql(contents[i]);
            expect(dirEntry.getSize()).to.equal(size);
            expect(dirEntry.sectorCount).to.equal(Math.floor(size/256));
        });
        expect(problems(newTrsdos)).to.eql([]);
    });

    it("stores no date when given none, and refuses a year the DOS can't enter", () => {
        const {writer} = make27Fixture();
        const result = writer.addFile(name("NODATE/DAT"), makeContents(10));
        expect(result.warning).to.be.undefined;
        expect(() => writer.addFile(name("LATE/DAT"), makeContents(10), {date: new Date(2003, 0, 1)}))
            .to.throw(TrsdosWriteError, "1999");
        const newTrsdos = writer.flush();
        const entry = entryOf(newTrsdos, "NODATE/DAT");
        expect([entry.bytes[1], entry.bytes[2]]).to.eql([0, 0]);
    });

    it("never gives a file the boot cylinder, even if the GAT says it's free", () => {
        // Granule 5 of cylinder 0 free would be the smallest free run, which the allocator prefers.
        const {writer} = make27Fixture(gat => {
            gat[0] = 0x1F;
        });
        writer.addFile(name("SMALL/DAT"), makeContents(100));
        const newTrsdos = writer.flush();
        expect(entryOf(newTrsdos, "SMALL/DAT").bytes.subarray(22, 24)).to.eql(new Uint8Array([7, (3 << 5) | 1]));
    });

    it("refuses a file that would need an extended entry", () => {
        // Every other granule of the empty cylinders used, so the largest free runs are 4, 4 and 3 granules (on
        // cylinders 6, 8 and 7, beside the files), and then single granules.
        const fragment = (gat: Uint8Array) => {
            for (let lump = 2; lump < 35; lump++) {
                if (gat[lump] === 0) {
                    gat[lump] = 0x15;
                }
            }
        };
        const granuleBytes = SECTORS_PER_GRANULE*256;
        const {writer} = make27Fixture(fragment);
        writer.addFile(name("FOUR/DAT"), makeContents(12*granuleBytes));
        const newTrsdos = writer.flush();
        expect([...newTrsdos.getFileExtents(getFile(newTrsdos, "FOUR/DAT"))].length).to.equal(4);

        const second = make27Fixture(fragment).writer;
        expect(() => second.addFile(name("FIVE/DAT"), makeContents(13*granuleBytes)))
            .to.throw(TrsdosWriteError, "TRSDOS 2.7's extended directory entries");
    });

    it("renames a file, changing only its name and HIT byte", () => {
        const {overlay, trsdos, writer} = make27Fixture();
        const hello = entryOf(trsdos, "HELLO/BAS");
        writer.renameFile(getFile(writer, "HELLO/BAS"), name("GREET/BAS"));
        const newTrsdos = writer.flush();

        const expected = hello.bytes.slice();
        expected.set([...rawName("GREET/BAS")].map(c => c.charCodeAt(0)), 5);
        expect(readBytes(overlay, hello.position).slice(hello.offset, hello.offset + 32)).to.eql(expected);
        expect(readBytes(overlay, newTrsdos.getHitPosition())[hello.dec]).to.equal(hashForFilename(rawName("GREET/BAS")));
        expect(newTrsdos.readFile(getFile(newTrsdos, "GREET/BAS")).length).to.equal(4*256 + 100);
    });

    it("sets passwords with 2.7's hash, and dates as a month and a year", () => {
        const {writer} = make27Fixture();
        writer.setAttributes(getFile(writer, "HELLO/BAS"), {
            updatePassword: "SECRET",
            accessPassword: "PASSWORD",
            protectionLevel: 5,
            invisible: true,
            date: new Date(1983, 1, 20),
        });
        const newTrsdos = writer.flush();

        const entry = entryOf(newTrsdos, "HELLO/BAS").bytes;
        expect(entry[0]).to.equal(0x10 | 0x08 | 5);
        expect([entry[1], entry[2]]).to.eql([2, 83]);
        expect([...entry.subarray(16, 20)]).to.eql([0x3C, 0xD1, 0x13, 0xCC]);
        expect(hashTrsdos27Password("SECRET")).to.equal(0xD13C);
        const dirEntry = getFile(newTrsdos, "HELLO/BAS");
        expect([dirEntry.month, dirEntry.day, dirEntry.year]).to.eql([2, 0, 1983]);
    });

    it("changes the disk's name, date, master password and AUTO command, leaving the GAT's last byte", () => {
        const {overlay, trsdos, writer} = make27Fixture();
        const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
        writer.setDiskInfo({name: "mydisk", date: new Date(1984, 9, 7), masterPassword: "SECRET", autoCommand: "BASIC"});
        const newTrsdos = writer.flush();

        expect(readTrsdosDiskInfo(newTrsdos, TrsdosRuleSet.TRSDOS_2_7)).to.eql({
            name: "MYDISK",
            date: "10/07/84",
            passwordHash: 0xD13C,
            version: TrsdosVersion.V2_7,
            autoCommand: "BASIC",
        });
        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        expect(new TextDecoder().decode(gat.subarray(0xE0, 0xE6))).to.equal("BASIC\r");
        expect(gat.subarray(0xE6, 0xFF).every(byte => byte === 0x20)).to.be.true;
        expect(gat[0xFF]).to.equal(0x0D);
        expect(gat.subarray(0, 0xCE)).to.eql(oldGat.subarray(0, 0xCE));
    });

    it("refuses an AUTO command that would reach the GAT's last byte", () => {
        const {writer} = make27Fixture();
        expect(() => writer.setDiskInfo({autoCommand: "X".repeat(31)})).to.throw(TrsdosWriteError, "at most 30");
        writer.setDiskInfo({autoCommand: "X".repeat(30)});
        writer.flush();
    });

    it("repairs a granule that the GAT says is free, but keeps the granules that no entry claims", () => {
        // HELLO/BAS's second granule free in the GAT.
        const {overlay, trsdos, writer} = make27Fixture(gat => {
            gat[8] = 0x01;
        });
        const findings = checkTrsdos(trsdos).findings.map(finding => finding.kind);
        expect(findings).to.include(TrsdosFindingKind.CLAIMED_BUT_FREE);
        expect(findings).to.include(TrsdosFindingKind.USED_BUT_UNCLAIMED);

        const result = writer.repair();
        expect(result.changes).to.eql(["Marked 1 granule used in the GAT for HELLO/BAS."]);
        // Cylinder 1's granules are used and unclaimed, as the DOS's system files' are, and kept.
        expect(result.freeableUnclaimed).to.eql([]);
        expect(result.keptUnclaimed.map(granule => granule.lump)).to.include(1);
        const newTrsdos = writer.flush();
        expect(readBytes(overlay, newTrsdos.getGatPosition())[8]).to.equal(0x03);
        expect(problems(newTrsdos)).to.eql([]);
    });

    it("refuses to free unclaimed granules", () => {
        const {writer} = make27Fixture();
        expect(() => writer.repair({freeUnclaimed: true})).to.throw(TrsdosWriteError, "system files");
    });
});

describe("Trsdos DOS name of TRSDOS 2.7 and 2.8 disks without a banner", () => {
    /**
     * Name the DOS of the test disk with no banner and a boot sector that starts with these bytes,
     * and has these at 0xF6.
     */
    function nameOf(prefix: number[], release: number[] = []): string {
        const bootSector = new Uint8Array(256);
        bootSector.set(prefix);
        bootSector.set(release, 0xF6);
        return make27Fixture(undefined, {noBanner: true, bootSector}).trsdos.nameAndVersion;
    }

    const TANDY_SYSTEM_BOOT = [0xFE, 0x11, 0x3E, 0x81, 0x32, 0xEE, 0x37];
    const PERCOM_SYSTEM_BOOT = [0xFE, 0x11, 0x3E, 0xFF, 0x32, 0xEC, 0x37];

    it("names the release from the system boot sector's bytes 0xF6-0xF8", () => {
        expect(nameOf(TANDY_SYSTEM_BOOT, [0x00, 0x52, 0x08])).to.eql("TRSDOS 2.7DD");
        expect(nameOf(TANDY_SYSTEM_BOOT, [0x01, 0x21, 0x58])).to.eql("TRSDOS 2.8");
        expect(nameOf(PERCOM_SYSTEM_BOOT, [0x00, 0x52, 0x08])).to.eql("TRSDOS 2.7DD");
        expect(nameOf(PERCOM_SYSTEM_BOOT)).to.eql("TRSDOS 2.7");
    });

    it("names both releases from the data-disk stub, and 2.7SD from its boot sector", () => {
        expect(nameOf([0xFE, 0x11, 0xF3, 0x31, 0x71, 0x40, 0xCD, 0xC9, 0x01])).to.eql("TRSDOS 2.7 or 2.8");
        expect(nameOf([0xFE, 0x11, 0x31, 0xFF, 0x41, 0x3E, 0xA0])).to.eql("TRSDOS 2.7SD");
    });

    it("says 2.7 for a boot sector it doesn't know", () => {
        expect(nameOf([0x00, 0xFE, 0x11])).to.eql("TRSDOS 2.7");
    });

    it("still takes the banner first", () => {
        const bootSector = new Uint8Array(256);
        bootSector.set([0xFE, 0x11, 0x31, 0xFF, 0x41, 0x3E, 0xA0]);
        expect(make27Fixture(undefined, {bootSector}).trsdos.nameAndVersion).to.eql("TRSDOS 2.8.0");
    });
});
