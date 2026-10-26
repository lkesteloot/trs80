import {describe, expect, it} from "vitest";
import {
    decodeDirEntry, decodeTrsdos, encodeTrsdos23DirEntry, TRSDOS_BLANK_PASSWORD_HASH, TrsdosDirEntry, TrsdosVersion,
    type Trsdos23DirEntryFields,
} from "./Trsdos.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";

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

    it("treats a year-only date as January 1", () => {
        expect(makeDirEntry(0, 0, 1980).getDate()).to.eql(new Date(1980, 0, 1));
    });

    it("treats a missing day as the first of the month", () => {
        expect(makeDirEntry(0, 11, 1980).getDate()).to.eql(new Date(1980, 10, 1));
    });

    it("returns undefined when there's no year", () => {
        expect(makeDirEntry(0, 0, undefined).getDate()).to.be.undefined;
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
