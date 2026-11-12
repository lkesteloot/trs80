import {describe, expect, it} from "vitest";
import {
    decodeDirEntry, decodeTrsdos, encodeTrsdos13DirEntry, encodeTrsdos23DirEntry, encodeTrsdos23ExtendedDirEntry,
    hashTrsdosPassword, parseTrsdosProtectionLevel, TRSDOS_13_BLANK_PASSWORD_HASH, TRSDOS_BLANK_PASSWORD_HASH, TRSDOS_DEFAULT_PASSWORD_HASH, TrsdosDirEntry,
    Trsdos, TrsdosProtectionLevel, TrsdosProtectionNames, trsdosProtectionLevels, trsdosProtectionLevelToString,
    trsdosProtectionNamesFor, TrsdosVersion, type Trsdos13DirEntryFields, type Trsdos23DirEntryFields,
} from "./Trsdos.js";
import {formatTrsdosDataDisk, hashTrsdos13Password, TrsdosFormatDos} from "./TrsdosFormat.js";
import {Density, SectorData, type SectorPosition} from "./FloppyDisk.js";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";
import {DosFamily, isUnknownDosName, makeDosName, UNKNOWN_DOS_NAME} from "./DosName.js";

/**
 * Make a directory entry with the given date fields, and placeholders for everything else.
 */
function makeDirEntry(day: number, month: number, year: number | undefined,
                      hour: number | undefined = undefined, minute: number | undefined = undefined): TrsdosDirEntry {

    return new TrsdosDirEntry(TrsdosVersion.V2_3, 0, day, month, year, hour, minute,
        0, 0, "FILE    BAS", undefined, undefined, 0, undefined, undefined, []);
}

describe("TrsdosDirEntry.getDate", () => {
    it("returns a full date", () => {
        expect(makeDirEntry(15, 6, 1983).getDate()).to.eql(new Date(1983, 5, 15));
    });

    it("includes the time when the entry has one", () => {
        expect(makeDirEntry(15, 6, 1983, 13, 45).getDate()).to.eql(new Date(1983, 5, 15, 13, 45));
    });

    it("has no date when the month is zero, whatever the year", () => {
        expect(makeDirEntry(0, 0, 1980).hasDate()).to.equal(false);
        expect(makeDirEntry(0, 0, 1980).getDate()).to.be.undefined;
        expect(makeDirEntry(0, 0, 1985).getFullDateString()).to.equal("");
    });

    it("treats a missing day as the first of the month", () => {
        expect(makeDirEntry(0, 11, 1980).getDate()).to.eql(new Date(1980, 10, 1));
    });

    it("returns undefined when there's no year", () => {
        expect(makeDirEntry(0, 0, undefined).getDate()).to.be.undefined;
        expect(makeDirEntry(15, 6, undefined).hasDate()).to.equal(false);
    });

    it("formats a date with and without a day", () => {
        expect(makeDirEntry(15, 6, 1983).getFullDateString()).to.equal("15/06/1983");
        expect(makeDirEntry(0, 6, 1983).getFullDateString()).to.equal("   06/1983");
    });
});

/**
 * Fields for an entry that uses every part of the layout, to change a little for each test.
 */
function makeEntryFields(): Trsdos23DirEntryFields {
    return {
        flags: 0x58,
        byte1: 0x45,
        byte2: (17 << 3) | 3,
        eofOffset: 200,
        lrl: 0,
        rawFilename: "HELLO   BAS",
        updatePassword: 0x1234,
        accessPassword: 0xABCD,
        sectorCount: 0x0123,
        extents: [
            {lump: 3, granuleOffset: 1, granuleCount: 32},
            {lump: 20, granuleOffset: 0, granuleCount: 1},
            {lump: 30, granuleOffset: 7, granuleCount: 5},
            {lump: 0xFD, granuleOffset: 2, granuleCount: 2},
        ],
        nextDec: 0x62,
    };
}

describe("encodeTrsdos23DirEntry", () => {
    // The geometry is only used to read the entry back.
    const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]));
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }

    /**
     * Decode the bytes as a 2.3-family entry, failing the test if they don't decode.
     */
    function decode(binary: Uint8Array, hasTimeStamps = false): TrsdosDirEntry {
        const dirEntry = decodeDirEntry(binary, trsdos!.geometry, TrsdosVersion.V2_3, undefined, hasTimeStamps);
        if (dirEntry === undefined || typeof dirEntry === "string") {
            throw new Error("Entry didn't decode: " + dirEntry);
        }
        return dirEntry;
    }

    it("round-trips every field", () => {
        const fields = makeEntryFields();

        const binary = encodeTrsdos23DirEntry(fields);
        const dirEntry = decode(binary);

        expect(binary.length).to.eql(32);
        expect(dirEntry.flags).to.eql(0x58);
        expect(dirEntry.month).to.eql(5);
        expect(dirEntry.day).to.eql(17);
        expect(dirEntry.year).to.eql(1983);
        expect(dirEntry.lastSectorSize).to.eql(200);
        expect(dirEntry.lrl).to.eql(256);
        expect(dirEntry.rawFilename).to.eql("HELLO   BAS");
        expect(dirEntry.updatePassword).to.eql(0x1234);
        expect(dirEntry.accessPassword).to.eql(0xABCD);
        expect(dirEntry.sectorCount).to.eql(0x0123);
        expect(dirEntry.extents.map(e => [e.cylinderNumber, e.granuleOffset, e.granuleCount])).to.eql([
            [3, 1, 32], [20, 0, 1], [30, 7, 5], [0xFD, 2, 2],
        ]);
        expect(dirEntry.nextDec).to.eql(0x62);
    });

    it("writes 0xFF for unused extents and for no link", () => {
        const fields = {...makeEntryFields(), extents: [{lump: 5, granuleOffset: 0, granuleCount: 2}], nextDec: undefined};

        const binary = encodeTrsdos23DirEntry(fields);

        expect(Array.from(binary.subarray(22))).to.eql([5, 1, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
        const dirEntry = decode(binary);
        expect(dirEntry.extents.length).to.eql(1);
        expect(dirEntry.nextDec).to.be.undefined;
    });

    it("writes a time stamp in place of the access password", () => {
        const fields = {
            ...makeEntryFields(), flags: 0x10, byte1: 0x40 | 11, byte2: (20 << 3) | ((2005 - 1980) & 7),
            timeStamp: {hour: 14, minute: 35, year: 2005},
        };

        const binary = encodeTrsdos23DirEntry(fields);
        const dirEntry = decode(binary, true);

        expect(dirEntry.hour).to.eql(14);
        expect(dirEntry.minute).to.eql(35);
        expect(dirEntry.year).to.eql(2005);
        expect(dirEntry.accessPassword).to.be.undefined;
        // Without time stamps on the disk, the same bytes are a password, stored little endian.
        const stamp = (14 << 11) | (35 << 5) | (2005 - 1980);
        expect(decode(binary, false).accessPassword).to.eql(((stamp & 0xFF) << 8) | (stamp >> 8));
    });

    it("round-trips an empty file with blank passwords", () => {
        const fields: Trsdos23DirEntryFields = {
            flags: 0x10, byte1: 0, byte2: 0, eofOffset: 0, lrl: 256, rawFilename: "EMPTY      ",
            updatePassword: TRSDOS_BLANK_PASSWORD_HASH, accessPassword: TRSDOS_BLANK_PASSWORD_HASH,
            sectorCount: 0, extents: [], nextDec: undefined,
        };

        const dirEntry = decode(encodeTrsdos23DirEntry(fields));

        expect(dirEntry.getSize()).to.eql(0);
        expect(dirEntry.extents).to.eql([]);
        expect(dirEntry.lrl).to.eql(256);
        expect(dirEntry.updatePassword).to.eql(0x4296);
    });

    it("refuses fields that don't fit", () => {
        const fields = makeEntryFields();
        const extent = fields.extents[0];

        expect(() => encodeTrsdos23DirEntry({...fields, extents: [...fields.extents, extent]})).to.throw("4 extents");
        expect(() => encodeTrsdos23DirEntry({...fields, rawFilename: "SHORT"})).to.throw("11 characters");
        expect(() => encodeTrsdos23DirEntry({...fields, sectorCount: 0x10000})).to.throw("16 bits");
        expect(() => encodeTrsdos23DirEntry({...fields, extents: [{...extent, granuleCount: 33}]})).to.throw("doesn't fit");
        expect(() => encodeTrsdos23DirEntry({...fields, extents: [{...extent, lump: 0xFE}]})).to.throw("doesn't fit");
    });
});

describe("encodeTrsdos23ExtendedDirEntry", () => {
    // The geometry is only used to read the entry back.
    const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]));
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }

    /**
     * Decode the bytes as a 2.3-family entry, failing the test if they don't decode.
     */
    function decode(binary: Uint8Array): TrsdosDirEntry {
        const dirEntry = decodeDirEntry(binary, trsdos!.geometry, TrsdosVersion.V2_3, undefined, false);
        if (dirEntry === undefined || typeof dirEntry === "string") {
            throw new Error("Entry didn't decode: " + dirEntry);
        }
        return dirEntry;
    }

    it("round-trips the extents and both links", () => {
        const binary = encodeTrsdos23ExtendedDirEntry({
            prevDec: 0x42,
            extents: [{lump: 3, granuleOffset: 1, granuleCount: 32}, {lump: 20, granuleOffset: 0, granuleCount: 1}],
            nextDec: 0x62,
        });
        const dirEntry = decode(binary);

        expect(binary.length).to.eql(32);
        expect(binary[0]).to.eql(0x90);
        expect(binary[1]).to.eql(0x42);
        expect(binary.subarray(2, 22)).to.eql(new Uint8Array(20));
        expect(dirEntry.isExtendedEntry()).to.eql(true);
        expect(dirEntry.prevDec).to.eql(0x42);
        expect(dirEntry.nextDec).to.eql(0x62);
        expect(dirEntry.extents.map(e => [e.cylinderNumber, e.granuleOffset, e.granuleCount])).to.eql([
            [3, 1, 32], [20, 0, 1],
        ]);
    });

    it("writes 0xFF for unused extents and for no link", () => {
        const binary = encodeTrsdos23ExtendedDirEntry({
            prevDec: 0x22, extents: [{lump: 5, granuleOffset: 0, granuleCount: 2}], nextDec: undefined,
        });

        expect(Array.from(binary.subarray(22))).to.eql([5, 1, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
        expect(decode(binary).nextDec).to.be.undefined;
    });

    it("rejects more than four extents and a bad extent", () => {
        const extent = {lump: 5, granuleOffset: 0, granuleCount: 2};
        expect(() => encodeTrsdos23ExtendedDirEntry({
            prevDec: 0x22, extents: [extent, extent, extent, extent, extent], nextDec: undefined,
        })).to.throw("holds 4 extents");
        expect(() => encodeTrsdos23ExtendedDirEntry({
            prevDec: 0x22, extents: [{lump: 5, granuleOffset: 8, granuleCount: 2}], nextDec: undefined,
        })).to.throw("doesn't fit");
    });
});

describe("hashTrsdosPassword", () => {
    it("hashes no password to the blank hash", () => {
        expect(hashTrsdosPassword("")).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
        expect(hashTrsdosPassword("        ")).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
    });

    it("hashes PASSWORD to the default master password's hash, in any case", () => {
        expect(hashTrsdosPassword("PASSWORD")).to.eql(TRSDOS_DEFAULT_PASSWORD_HASH);
        expect(hashTrsdosPassword("password")).to.eql(0x42E0);
        expect(hashTrsdosPassword("PassWord")).to.eql(0x42E0);
    });

    it("pads short passwords with spaces", () => {
        expect(hashTrsdosPassword("A")).to.eql(hashTrsdosPassword("A       "));
        expect(hashTrsdosPassword("A")).to.not.eql(hashTrsdosPassword("B"));
    });

    it("refuses passwords the DOS wouldn't accept", () => {
        for (const bad of ["1ABC", "TOOLONGPW", "A B", "AB-C", "A.B", " A"]) {
            expect(() => hashTrsdosPassword(bad)).to.throw(Error, "Invalid password");
        }
        hashTrsdosPassword("A1234567");
    });
});

/**
 * The bytes of a boot sector from byte 3 on: some code, then a message.
 */
function bootCode(code: number[], message: string): Uint8Array {
    return new Uint8Array([...code, ...[...message].map(c => c.charCodeAt(0))]);
}

// Super Utility+ 3.x's boot code and message.
const SUPER_UTILITY_3_BOOT = bootCode([0xCD, 0x0B, 0x00, 0x11, 0x13, 0x00, 0x19, 0x7E, 0x23, 0xFE, 0x00, 0x28,
    0x05, 0xCD, 0x33, 0x00, 0x18, 0xF5, 0xCD, 0x40, 0x00, 0xC7, 0x1C, 0x1F], "Not A System Disk:");

// Super Utility+ 2.x's boot code and message.
const SUPER_UTILITY_2_BOOT = bootCode([0x21, 0x14, 0x42, 0x7E, 0x23, 0xB7, 0x28, 0x05, 0xCD, 0x33, 0x00, 0x18,
    0xF6, 0xCD, 0x40, 0x00, 0x76, 0x1C, 0x1F, 0x17], "NOT A SYSTEM DISK. ");

describe("Super Utility+ data disks", () => {
    /**
     * Decode a test disk with this boot code and GAT version byte, and return its DOS name.
     */
    function nameOf(code: Uint8Array, dosVersion: number): string {
        return decodeTrsdos(makeTrsdos23TestDisk([], {bootCode: code, dosVersion}))!.nameAndVersion;
    }

    it("names the disk by the Super Utility+ version at 0xCB", () => {
        expect(nameOf(SUPER_UTILITY_3_BOOT, 0x31)).to.equal("Super Utility+ 3.1 data disk");
        expect(nameOf(SUPER_UTILITY_3_BOOT, 0x32)).to.equal("Super Utility+ 3.2 data disk");
        expect(nameOf(SUPER_UTILITY_2_BOOT, 0x22)).to.equal("Super Utility+ 2.2 data disk");
        expect(nameOf(SUPER_UTILITY_2_BOOT, 0x21)).to.equal("Super Utility+ 2.1 data disk");
    });

    it("trusts 0xCB when it's from another major version", () => {
        expect(nameOf(SUPER_UTILITY_2_BOOT, 0x34)).to.equal("DOSPLUS 3.4");
        expect(nameOf(SUPER_UTILITY_2_BOOT, 0x50)).to.equal("Unknown DOS");
    });

    it("needs the whole boot code, not just the message", () => {
        const damaged = SUPER_UTILITY_3_BOOT.slice();
        damaged[0] = 0x00;
        expect(nameOf(damaged, 0x31)).to.equal("DOSPLUS 3.1");
    });

    it("counts as naming no DOS", () => {
        expect(isUnknownDosName(UNKNOWN_DOS_NAME)).to.equal(true);
        expect(isUnknownDosName(makeDosName(DosFamily.SUPER_UTILITY_PLUS, "3.1"))).to.equal(true);
        expect(isUnknownDosName(makeDosName(DosFamily.DOSPLUS, "3.4"))).to.equal(false);
    });
});

describe("protection level names", () => {
    it("uses the LDOS names on the 2.3 layout, and TRSDOS 6's names for TRSDOS 6 and LS-DOS 6", () => {
        expect(trsdosProtectionNamesFor(TrsdosVersion.V2_3, makeDosName(DosFamily.LDOS, "5.1.4"))).to.eql(TrsdosProtectionNames.LDOS);
        expect(trsdosProtectionNamesFor(TrsdosVersion.V2_3, makeDosName(DosFamily.TRSDOS, "2.x"))).to.eql(TrsdosProtectionNames.LDOS);
        expect(trsdosProtectionNamesFor(TrsdosVersion.V2_3, UNKNOWN_DOS_NAME)).to.eql(TrsdosProtectionNames.LDOS);
        expect(trsdosProtectionNamesFor(TrsdosVersion.V2_3, makeDosName(DosFamily.TRSDOS, "6.2"))).to.eql(TrsdosProtectionNames.TRSDOS_6);
        expect(trsdosProtectionNamesFor(TrsdosVersion.V2_3, makeDosName(DosFamily.LS_DOS, "6.3"))).to.eql(TrsdosProtectionNames.TRSDOS_6);
        expect(trsdosProtectionNamesFor(TrsdosVersion.V1_3, makeDosName(DosFamily.TRSDOS, "1.3"))).to.eql(TrsdosProtectionNames.TRSDOS_6);
        expect(trsdosProtectionNamesFor(TrsdosVersion.V2_7, makeDosName(DosFamily.TRSDOS, "2.7"))).to.eql(TrsdosProtectionNames.TRSDOS_6);
    });

    it("names levels 1, 3 and 4 differently", () => {
        const names = (protectionNames: TrsdosProtectionNames) => [0, 1, 2, 3, 4, 5, 6, 7].map(level =>
            trsdosProtectionLevelToString(level as TrsdosProtectionLevel, protectionNames));
        expect(names(TrsdosProtectionNames.LDOS)).to.eql(
            ["FULL", "KILL", "RENAME", "UNUSED", "WRITE", "READ", "EXEC", "NO_ACCESS"]);
        expect(names(TrsdosProtectionNames.TRSDOS_6)).to.eql(
            ["FULL", "REMOVE", "RENAME", "WRITE", "UPDATE", "READ", "EXEC", "NO_ACCESS"]);
    });

    it("decodes a test disk with the LDOS names", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]));
        expect(trsdos?.protectionNames).to.eql(TrsdosProtectionNames.LDOS);
    });

    it("lists the levels to choose from, leaving out LDOS's reserved 3", () => {
        expect(trsdosProtectionLevels(TrsdosProtectionNames.LDOS).map(level => level as number))
            .to.eql([0, 1, 2, 4, 5, 6, 7]);
        expect(trsdosProtectionLevels(TrsdosProtectionNames.TRSDOS_6).map(level => level as number))
            .to.eql([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it("parses names and numbers by the disk's names", () => {
        const ldos = TrsdosProtectionNames.LDOS;
        const trsdos6 = TrsdosProtectionNames.TRSDOS_6;
        expect(parseTrsdosProtectionLevel("write", ldos)).to.eql(4);
        expect(parseTrsdosProtectionLevel("write", trsdos6)).to.eql(3);
        expect(parseTrsdosProtectionLevel("update", trsdos6)).to.eql(4);
        expect(parseTrsdosProtectionLevel("update", ldos)).to.be.undefined;
        expect(parseTrsdosProtectionLevel("Kill", ldos)).to.eql(1);
        expect(parseTrsdosProtectionLevel("remove", ldos)).to.eql(1);
        expect(parseTrsdosProtectionLevel("kill", trsdos6)).to.eql(1);
        expect(parseTrsdosProtectionLevel("unused", ldos)).to.eql(3);
        expect(parseTrsdosProtectionLevel("all", ldos)).to.eql(0);
        expect(parseTrsdosProtectionLevel("execute", ldos)).to.eql(6);
        for (const none of ["none", "no access", "no-access", "NO_ACCESS", "7"]) {
            expect(parseTrsdosProtectionLevel(none, ldos)).to.eql(7);
        }
        expect(parseTrsdosProtectionLevel("0", ldos)).to.eql(0);
        expect(parseTrsdosProtectionLevel("8", ldos)).to.be.undefined;
        expect(parseTrsdosProtectionLevel("bogus", ldos)).to.be.undefined;
        expect(parseTrsdosProtectionLevel("", ldos)).to.be.undefined;
    });
});

describe("encodeTrsdos13DirEntry", () => {
    // The geometry is only used to read the entry back.
    const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]));
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }

    /**
     * Decode the bytes as a TRSDOS 1.3 entry, failing the test if they don't decode.
     */
    function decode(binary: Uint8Array): TrsdosDirEntry {
        const dirEntry = decodeDirEntry(binary, trsdos!.geometry, TrsdosVersion.V1_3, undefined, false);
        if (dirEntry === undefined || typeof dirEntry === "string") {
            throw new Error("Entry didn't decode: " + dirEntry);
        }
        return dirEntry;
    }

    /**
     * Fields that use every part of the entry.
     */
    function makeFields(): Trsdos13DirEntryFields {
        return {
            flags: 0x5A, month: 11, year: 83, eofOffset: 200, lrl: 0, rawFilename: "HELLO   BAS",
            updatePassword: 0x1234, accessPassword: 0xABCD, sectorCount: 0x0123,
            extents: Array.from({length: 13}, (_, i) => ({lump: 3 + i, granuleOffset: i % 6, granuleCount: 31 - i})),
        };
    }

    it("lays out the entry as the DOS does, with the count as is", () => {
        const binary = encodeTrsdos13DirEntry(makeFields());

        expect(binary.length).to.eql(48);
        expect([...binary.subarray(0, 5)]).to.eql([0x5A, 11, 83, 200, 0]);
        expect(String.fromCharCode(...binary.subarray(5, 16))).to.eql("HELLO   BAS");
        expect([...binary.subarray(16, 22)]).to.eql([0x34, 0x12, 0xCD, 0xAB, 0x23, 0x01]);
        expect([...binary.subarray(22, 26)]).to.eql([3, 31, 4, (1 << 5) | 30]);
    });

    it("round-trips every field through the decoder", () => {
        const fields = makeFields();
        const binary = encodeTrsdos13DirEntry(fields);
        const dirEntry = decode(binary);

        expect(dirEntry.flags).to.eql(0x5A);
        expect(dirEntry.month).to.eql(11);
        expect(dirEntry.year).to.eql(1983);
        expect(dirEntry.day).to.eql(0);
        expect(dirEntry.lastSectorSize).to.eql(200);
        expect(dirEntry.rawFilename).to.eql("HELLO   BAS");
        expect(dirEntry.updatePassword).to.eql(0x1234);
        expect(dirEntry.accessPassword).to.eql(0xABCD);
        expect(dirEntry.sectorCount).to.eql(0x0123);
        expect(dirEntry.getSize()).to.eql(0x0123*256 + 200);
        expect(dirEntry.extents.map(e => [e.cylinderNumber, e.granuleOffset, e.granuleCount])).to.eql(
            fields.extents.map(e => [e.lump, e.granuleOffset, e.granuleCount]));
    });

    it("re-encodes the bytes of an entry the DOS wrote", () => {
        // A 300-byte file in granule 1 of cylinder 0, with blank passwords, as a hand-made entry.
        const original = new Uint8Array(48).fill(0xFF);
        original.set([0x10, 5, 83, 44, 0], 0);
        original.set([...("HELLO   BAS")].map(c => c.charCodeAt(0)), 5);
        original.set([0xEF, 0x5C, 0xEF, 0x5C, 1, 0, 0, 0x21], 16);
        const dirEntry = decode(original);
        const bytes = encodeTrsdos13DirEntry({
            flags: dirEntry.flags, month: dirEntry.month, year: dirEntry.year! - 1900, eofOffset: dirEntry.lastSectorSize,
            lrl: dirEntry.lrl, rawFilename: dirEntry.rawFilename, updatePassword: dirEntry.updatePassword!,
            accessPassword: dirEntry.accessPassword!, sectorCount: dirEntry.sectorCount,
            extents: dirEntry.extents.map(e => ({lump: e.cylinderNumber, granuleOffset: e.granuleOffset, granuleCount: e.granuleCount})),
        });

        expect(bytes).to.eql(original);
        expect(dirEntry.updatePassword).to.eql(TRSDOS_13_BLANK_PASSWORD_HASH);
        expect(dirEntry.updatePassword).to.eql(hashTrsdos13Password(""));
    });

    it("leaves unused extents at 0xFF, and encodes an empty file", () => {
        const binary = encodeTrsdos13DirEntry({...makeFields(), sectorCount: 0, eofOffset: 0, extents: []});

        expect(binary.subarray(22)).to.eql(new Uint8Array(26).fill(0xFF));
        const dirEntry = decode(binary);
        expect(dirEntry.getSize()).to.eql(0);
        expect(dirEntry.extents).to.eql([]);
    });

    it("refuses fields that don't fit", () => {
        const fields = makeFields();
        const extent = fields.extents[0];

        expect(() => encodeTrsdos13DirEntry({...fields, extents: [...fields.extents, extent]})).to.throw("13 extents");
        expect(() => encodeTrsdos13DirEntry({...fields, rawFilename: "SHORT"})).to.throw("11 characters");
        expect(() => encodeTrsdos13DirEntry({...fields, sectorCount: 0x10000})).to.throw("16 bits");
        expect(() => encodeTrsdos13DirEntry({...fields, extents: [{...extent, granuleCount: 32}]})).to.throw("doesn't fit");
        expect(() => encodeTrsdos13DirEntry({...fields, extents: [{...extent, granuleCount: 0}]})).to.throw("doesn't fit");
        expect(() => encodeTrsdos13DirEntry({...fields, extents: [{...extent, lump: 0xFE}]})).to.throw("doesn't fit");
        expect(() => encodeTrsdos13DirEntry({...fields, year: 256})).to.throw("doesn't fit");
    });
});

describe("Trsdos.getGranuleSectorPositions", () => {
    /**
     * Decode the standard test disk (a single side, 10 sectors per track, 2 granules of 5 sectors per lump).
     */
    function decodeTestDisk(): Trsdos {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]));
        if (trsdos === undefined) {
            throw new Error("Test disk didn't decode as TRSDOS");
        }
        return trsdos;
    }

    /**
     * The positions of a granule as "cylinder:side:sector" strings.
     */
    function keys(trsdos: Trsdos, lump: number, granule: number): string[] {
        return trsdos.getGranuleSectorPositions(lump, granule).map(position => position.key());
    }

    it("lists the sectors of a granule that fits on a cylinder", () => {
        const trsdos = decodeTestDisk();
        expect(trsdos.firstSectorNumber).to.equal(0);
        expect(keys(trsdos, 3, 0)).to.eql(["3:0:0", "3:0:1", "3:0:2", "3:0:3", "3:0:4"]);
        expect(keys(trsdos, 3, 1)).to.eql(["3:0:5", "3:0:6", "3:0:7", "3:0:8", "3:0:9"]);
    });

    it("continues a granule onto the next cylinder when lumps don't line up with cylinders", () => {
        // Another reading of the same disk, with lumps of 3 granules of 4 sectors: 12 sectors, on 10-sector cylinders.
        const standard = decodeTestDisk();
        const trsdos = new Trsdos(standard.disk, standard.geometry, TrsdosVersion.V2_3, 1, 3, 4,
            standard.dirLumpNumber, 3, 0);
        expect(trsdos.lumpsAreCylinders).to.equal(false);
        expect(keys(trsdos, 0, 2)).to.eql(["0:0:8", "0:0:9", "1:0:0", "1:0:1"]);
        expect(keys(trsdos, 1, 1)).to.eql(["1:0:6", "1:0:7", "1:0:8", "1:0:9"]);
    });

    it("starts after the unused cylinders before the first data cylinder", () => {
        const standard = decodeTestDisk();
        const trsdos = new Trsdos(standard.disk, standard.geometry, TrsdosVersion.V2_3, 1, 2, 5,
            standard.dirLumpNumber, 2, 1);
        expect(keys(trsdos, 0, 0)).to.eql(["1:0:0", "1:0:1", "1:0:2", "1:0:3", "1:0:4"]);
    });
});

describe("Trsdos DOS name from the boot sector", () => {
    // The GAT is the first sector of cylinder 17, with 10 sectors per track.
    const GAT_OFFSET = 17*10*256;
    // BOOT/SYS is the first entry of the first directory sector (after the GAT and HIT), DIR/SYS
    // the first of the second.
    const BOOT_SYS_OFFSET = GAT_OFFSET + 2*256;
    const DIR_SYS_OFFSET = GAT_OFFSET + 3*256;

    /**
     * Name the DOS of a test disk whose boot sector starts with these bytes (after the directory
     * cylinder at byte 2, which is kept), whose GAT version byte is the given one, and whose
     * system sector (sector 2) starts with the given byte. The patch, if given, then changes
     * anything else in the image.
     */
    function nameOf(bootPrefix: number[], gatVersion: number, systemSectorByte = 0,
                    patch?: (binary: Uint8Array) => void): string {

        const disk = makeTrsdos23TestDisk([]);
        const binary = disk.binary;
        const dirCylinder = binary[2];
        binary.set(bootPrefix, 0);
        binary[2] = dirCylinder;
        binary[2*256] = systemSectorByte;
        binary[GAT_OFFSET + 0xCB] = gatVersion;
        patch?.(binary);
        const trsdos = decodeTrsdos(disk);
        if (trsdos === undefined) {
            throw new Error("Test disk didn't decode as TRSDOS");
        }
        return trsdos.nameAndVersion;
    }

    const TRSDOS_2_BOOT = [0x00, 0xFE, 0x11, 0xF3, 0x31, 0xFC, 0x41, 0x21, 0xE2, 0x42, 0xCD, 0x9A, 0x42, 0x3E, 0x01, 0x32, 0xE1, 0x37];
    const LDOS_BOOT = [0x00, 0xFE, 0x11, 0xF3, 0x31, 0xE0, 0x41, 0xFD, 0x21, 0x00, 0x00];
    const ESOTERIC_BOOT = [0x00, 0xFE, 0x11, 0xCD, 0x0B, 0x00, 0x11, 0x10, 0x00, 0x19, 0x7E, 0x23, 0xCD, 0x33, 0x00, 0xB7, 0x20, 0xF8];

    it("names MultiDOS/Esoteric from its boot sector", () => {
        expect(nameOf(ESOTERIC_BOOT, 0x21)).to.eql("MultiDOS or Esoteric");
    });

    it("tells NEWDOS 3.0 from LDOS 5.3 by the boot sector", () => {
        expect(nameOf(TRSDOS_2_BOOT, 0x53)).to.eql("NEWDOS 3.0");
        expect(nameOf(LDOS_BOOT, 0x53)).to.eql("LDOS 5.3");
    });

    it("names LDOS 5.0 only with LDOS's boot sector or system sector", () => {
        expect(nameOf(LDOS_BOOT, 0x50)).to.eql("LDOS 5.0");
        expect(nameOf(TRSDOS_2_BOOT, 0x50, 0x50)).to.eql("LDOS 5.0");
        expect(nameOf(TRSDOS_2_BOOT, 0x50)).to.eql("Unknown DOS");
    });

    /**
     * A patch that writes these bytes at this offset of the image.
     */
    function bytesAt(offset: number, bytes: number[]): (binary: Uint8Array) => void {
        return binary => binary.set(bytes, offset);
    }

    const TRSDOS_6_0_STUB = [0x00, 0xFE, 0x11, 0xF3, 0x21, 0x0E, 0x43];
    const TRSDOS_6_1_STUB = [0x00, 0xFE, 0x11, 0xF3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x11, 0x87, 0xFB];
    const NEWDOS_80_3_BOOT = [0x00, 0xFE, 0x11, 0xF3, 0x11, 0x05, 0x00, 0xD9, 0x31, 0xE0, 0x41, 0x21, 0xFF, 0x51,
        0xCD, 0x47, 0x43];
    const NEWDOS_80_2_BOOT = [...NEWDOS_80_3_BOOT.slice(0, 15), 0x45, 0x43];
    const BFLOADER_BOOT = [0x00, 0xFE, 0x11, 0x31, 0xFC, 0x41, 0xCD, 0xC9, 0x01, 0xF3, 0x21, 0xEC, 0x37, 0x36, 0xD0,
        0xCD, 0xA5, 0x42];

    it("tells TRSDOS 2.2 and 2.3 data disks by boot byte 0x7D", () => {
        expect(nameOf(TRSDOS_2_BOOT, 0x21, 0, bytesAt(0x7D, [0xB6]))).to.eql("TRSDOS 2.2 or 2.3");
        expect(nameOf(TRSDOS_2_BOOT, 0x21, 0, bytesAt(0x7D, [0xE1]))).to.eql("TRSDOS 2.x");
    });

    it("gives LDOS 5.1 data disks a third digit from BOOT/SYS's passwords", () => {
        expect(nameOf(LDOS_BOOT, 0x51, 0, bytesAt(BOOT_SYS_OFFSET + 0x10, [0x20, 0xC2, 0x52, 0xC3])))
            .to.eql("LDOS 5.1.0 or 5.1.1");
        const ldos513 = bytesAt(BOOT_SYS_OFFSET + 0x10, [0xAE, 0x01, 0xF5, 0x9C]);
        expect(nameOf(LDOS_BOOT, 0x51, 0, binary => {
            ldos513(binary);
            binary[BOOT_SYS_OFFSET + 0x1A] = 0x00;
        })).to.eql("LDOS 5.1.2 or 5.1.3");
        expect(nameOf(LDOS_BOOT, 0x51, 0, binary => {
            ldos513(binary);
            binary[BOOT_SYS_OFFSET + 0x1A] = 0xFF;
        })).to.eql("LDOS 5.1.4");
        expect(nameOf(LDOS_BOOT, 0x51, 0, bytesAt(BOOT_SYS_OFFSET + 0x10, [0x96, 0x42, 0x96, 0x42])))
            .to.eql("LDOS 5.1");
    });

    it("names LDOS 5.3.1 from DIR/SYS's passwords", () => {
        expect(nameOf(LDOS_BOOT, 0x53, 0, bytesAt(DIR_SYS_OFFSET + 0x10, [0xAE, 0x01, 0x96, 0x42])))
            .to.eql("LDOS 5.3.1");
        expect(nameOf(LDOS_BOOT, 0x53, 0, bytesAt(DIR_SYS_OFFSET + 0x10, [0xAE, 0x01, 0x00, 0x00])))
            .to.eql("LDOS 5.3");
    });

    it("prefers the system sector's release to the GAT's", () => {
        expect(nameOf(LDOS_BOOT, 0x34, 0x51)).to.eql("LDOS 5.1");
        expect(nameOf(TRSDOS_6_0_STUB, 0x62, 0x61)).to.eql("TRSDOS 6.1.0");
    });

    it("names TRSDOS 6.0 and 6.1 data disks by their stubs", () => {
        expect(nameOf(TRSDOS_6_0_STUB, 0x60, 0x60)).to.eql("TRSDOS 6.0.0");
        expect(nameOf(TRSDOS_6_1_STUB, 0x61, 0x61)).to.eql("TRSDOS 6.1.1 or 6.1.2");
    });

    it("names DOSPLUS IV from BOOT/SYS's password rather than TRSDOS 6.0", () => {
        expect(nameOf(TRSDOS_6_0_STUB, 0x60, 0, bytesAt(BOOT_SYS_OFFSET + 0x10, [0xDD, 0x23]))).to.eql("DOSPLUS IV");
    });

    it("names LS-DOS 6.3's release from the media block and BOOT/SYS's password", () => {
        const media = (text: string, password: number[]) => (binary: Uint8Array) => {
            binary.set([...text].map(c => c.charCodeAt(0)), GAT_OFFSET + 0xF6);
            binary.set(password, BOOT_SYS_OFFSET + 0x10);
        };
        expect(nameOf(LDOS_BOOT.slice(0, 3), 0x63, 0, media("631", [0xF4, 0x71]))).to.eql("LS-DOS 6.3.1");
        expect(nameOf(LDOS_BOOT.slice(0, 3), 0x63, 0, media("LSI", [0xF6, 0x37]))).to.eql("LS-DOS 6.3.0");
        expect(nameOf(LDOS_BOOT.slice(0, 3), 0x63, 0, media("631", [0xF6, 0x37]))).to.eql("LS-DOS 6.3");
    });

    it("gives NEWDOS/80 2.x data disks a list of releases, and tells 3.0 by its boot sector", () => {
        expect(nameOf(NEWDOS_80_2_BOOT, 0x82)).to.eql("NEWDOS/80 v2.0, v2.5 or v2.74");
        expect(nameOf(NEWDOS_80_3_BOOT, 0x82)).to.eql("NEWDOS/80 v3.0");
    });

    it("names Big Five's loader, which isn't a DOS", () => {
        expect(nameOf(BFLOADER_BOOT, 0x21)).to.eql("Big Five BFLOADER");
    });

    it("doesn't take a fill of MULTIDOS on the boot track for MultiDOS", () => {
        // In the boot track's second granule, outside BOOT/SYS, whose text is searched for banners.
        const fill = (binary: Uint8Array) => binary.set([..."MULTIDOS".repeat(32)].map(c => c.charCodeAt(0)), 7*256);
        expect(nameOf(TRSDOS_2_BOOT, 0x33, 0, fill)).to.eql("DOSPLUS 3.3");
    });

    it("gives MultiDOS data disks a version from their stub", () => {
        const stub15 = [0x00, 0xFE, 0x11, 0xCD, 0x0B, 0x00, 0x11, 0x2E, 0x00, 0x19, 0x7E, 0x23, 0xB7];
        const stub17 = [0x00, 0xFE, 0x11, 0x3A, 0x03, 0x00, 0xFE, 0x17, 0x28, 0x24, 0xCD, 0x0B, 0x00, 0x11, 0x2F, 0x00];
        // FORMAT's AUTO text in the GAT, which DIR/SYS covers, also reads as a MultiDOS banner.
        const autoText = (binary: Uint8Array) =>
            binary.set([..."MULTIDOS format."].map(c => c.charCodeAt(0)), GAT_OFFSET + 0xE0);
        expect(nameOf(stub15, 0x16)).to.eql("MultiDOS 1.6");
        expect(nameOf(stub15, 0x16, 0, autoText)).to.eql("MultiDOS 1.6");
        expect(nameOf(stub17, 0x17, 0, autoText)).to.eql("MultiDOS 2.00");
        expect(nameOf(stub17, 0xFF)).to.eql("MultiDOS 2.10");
    });

    it("names a MultiDOS or Esoteric disk by DIR/SYS's passwords", () => {
        expect(nameOf(ESOTERIC_BOOT, 0xFF, 0, bytesAt(DIR_SYS_OFFSET + 0x10, [0xD6, 0x63, 0x7B, 0xC0])))
            .to.eql("MultiDOS 6.20 or Esoteric 3.20");
    });

    it("names DoubleDOS from its boot sectors", () => {
        const system = [0x36, 0xFF, 0x36, 0xD0, 0x31, 0xFC, 0x41, 0xCD, 0xC9, 0x01];
        const stub = [0x21, 0x10, 0x42, 0x7E, 0xCD, 0x33, 0x00, 0x23, 0xFE, 0x0D, 0x20, 0xF7, 0xCD, 0x40, 0x00, 0x76];
        // nameOf() keeps byte 2, so put the stub's own byte back.
        const withStub = (formatVersion: number) => (binary: Uint8Array) => {
            binary.set(stub, 0);
            binary[0x4F] = formatVersion;
        };
        expect(nameOf(system, 0x21, 0, bytesAt(2, [system[2]]))).to.eql("DoubleDOS 4.2, 4.23 or 4.24");
        expect(nameOf(stub, 0x21, 0, withStub(0x30))).to.eql("DoubleDOS 4.2 or 4.23");
        expect(nameOf(stub, 0x21, 0, withStub(0x31))).to.eql("DoubleDOS 4.24");
        expect(nameOf(stub, 0x21, 0, withStub(0x20))).to.eql("DoubleDOS");
    });

    it("lists VTOS 3.0's releases, which write the same data disk", () => {
        const vtos3Boot = [0x00, 0xFE, 0x11, 0xF3, 0x31, 0xE0, 0x41, 0x21, 0xE2, 0x42, 0xCD, 0x9A, 0x42];
        expect(nameOf(vtos3Boot, 0x30)).to.eql("VTOS 3.0, 3.0.0 or 3.0.1");
    });

    it("names UltraDOS from its boot sector, then from its GAT", () => {
        const ultraDos41 = [0x00, 0xFE, 0x11, 0xF3, 0x31, 0x00, 0x42, 0xCD, 0xC9, 0x01, 0x01, 0x00, 0x4D];
        const ultraDos42System = [0x00, 0xFE, 0x11, 0xF3, 0x11, 0x01, 0x3C];
        const ultraDos42Data = [0x00, 0xFE, 0x11, 0xF3, 0x31, 0x00, 0x42, 0x21, 0x4A, 0x42];
        const u41 = bytesAt(GAT_OFFSET + 0xCB, [0x55, 0x34, 0x31]);
        expect(nameOf(ultraDos41, 0x55)).to.eql("UltraDOS 4.1");
        expect(nameOf(ultraDos42Data, 0x55)).to.eql("UltraDOS 4.2");
        // The boot sector is the system last put on the disk, which wins over the FORMAT's GAT.
        expect(nameOf(ultraDos42System, 0x55, 0, u41)).to.eql("UltraDOS 4.2");
        expect(nameOf(TRSDOS_2_BOOT, 0x55, 0, u41)).to.eql("UltraDOS 4.1");
        expect(nameOf(TRSDOS_2_BOOT, 0x55, 0, bytesAt(GAT_OFFSET + 0xCB, [0x55, 0x05, 0x01]))).to.eql("Unknown DOS");
    });

    it("names DOSPLUS from BOOT/SYS's passwords when the GAT doesn't", () => {
        expect(nameOf(TRSDOS_2_BOOT, 0x50, 0, bytesAt(BOOT_SYS_OFFSET + 0x10, [0x27, 0x0B, 0x82, 0x2A])))
            .to.eql("DOSPLUS 3.2.1, 3.3 or 3.4");
    });
});

describe("Trsdos DOS name of Model III TRSDOS data disks", () => {
    // Tandy's boot sector, as 1.2 through 1.5 write it.
    const TRSDOS_1_BOOT = [0xFE, 0x11, 0x3E, 0xD0, 0xD3, 0xF0, 0x21, 0x02, 0x00, 0x22, 0xEA, 0x43];

    /**
     * Change bytes of a sector of the disk, in place.
     */
    function patchSector(disk: DmkFloppyDisk, position: SectorPosition, offset: number, bytes: number[]): void {
        const data = disk.readSector(position)!.data.slice();
        data.set(bytes, offset);
        disk.writeSector(position, new SectorData(data, position, Density.DOUBLE));
    }

    /**
     * Name the DOS of a freshly formatted 1.3-layout data disk, given Tandy's boot sector with this
     * release byte at 0xFE (and 0x28 at 0xFF), after the patch changes anything else.
     */
    function nameOf(release: number, patch?: (disk: DmkFloppyDisk, trsdos: Trsdos) => void): string {
        const disk = formatTrsdosDataDisk({dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 40, sides: 1});
        if (typeof disk === "string") {
            throw new Error(disk);
        }
        const formatted = decodeTrsdos(disk)!;
        const boot = new Array<number>(256).fill(0);
        boot.splice(0, TRSDOS_1_BOOT.length, ...TRSDOS_1_BOOT);
        boot[0xFE] = release;
        boot[0xFF] = 0x28;
        patchSector(disk, formatted.geometry.bootTrack!.firstSectorPosition(), 0, boot);
        patch?.(disk, formatted);
        return decodeTrsdos(disk)!.nameAndVersion;
    }

    it("names the release that the boot sector's byte gives, other than 1.3's", () => {
        expect(nameOf(0x11)).to.eql("TRSDOS 1.1");
        expect(nameOf(0x12)).to.eql("TRSDOS 1.2");
        expect(nameOf(0x14)).to.eql("TRSDOS 1.4");
    });

    it("doesn't name a release that doesn't exist", () => {
        expect(nameOf(0x10)).to.eql("TRSDOS 1.x");
        expect(nameOf(0x16)).to.eql("TRSDOS 1.x");
    });

    it("names 1.3 when its FORMAT's PASSWORD is the master password", () => {
        expect(nameOf(0x13, (disk, trsdos) => patchSector(disk, trsdos.getGatPosition(), 0xCE, [0xD3, 0x8F])))
            .to.eql("TRSDOS 1.3");
    });

    it("lists 1.3.2, 1.3I and 1.4 for a blank master password", () => {
        expect(nameOf(0x13, (disk, trsdos) => patchSector(disk, trsdos.getGatPosition(), 0xCE, [0xEF, 0x5C])))
            .to.eql("TRSDOS 1.3.2, 1.3I or 1.4");
    });

    it("names 1.4 by 0xFF at HIT byte 0xC0", () => {
        expect(nameOf(0x13, (disk, trsdos) => {
            patchSector(disk, trsdos.getGatPosition(), 0xCE, [0xEF, 0x5C]);
            patchSector(disk, trsdos.getHitPosition(), 0xC0, [0xFF]);
        })).to.eql("TRSDOS 1.4");
    });

    it("names GRL's 1.5 by its FORMAT's master password hash", () => {
        expect(nameOf(0x13, (disk, trsdos) => patchSector(disk, trsdos.getGatPosition(), 0xCE, [0xF2, 0x92])))
            .to.eql("TRSDOS 1.5");
    });
});
