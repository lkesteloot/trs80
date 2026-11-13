import {describe, expect, it} from "vitest";
import {
    compressForName, GZIP_SUFFIX, gunzipBytes, gzipBytes, isGzipName, uncompressFile, withoutGzipSuffix,
} from "./Gzip.js";
import {decodeTrs80File} from "./Trs80FileDecoder.js";
import {formatTrsdosDataDisk, TrsdosFormatDos} from "./TrsdosFormat.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";

/**
 * A plain DMK image of a small LS-DOS 6.3 data disk.
 */
function makeDmkBytes(): Uint8Array {
    const disk = formatTrsdosDataDisk({dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 35, sides: 1});
    if (typeof disk === "string") {
        throw new Error("Format failed: " + disk);
    }
    return disk.binary;
}

/**
 * A small CMD program: one load block of three bytes at 0x5000, and an entry point there.
 */
const CMD_BYTES = new Uint8Array([0x01, 0x05, 0x00, 0x50, 0x3E, 0x01, 0xC9, 0x02, 0x02, 0x00, 0x50]);

describe("isGzipName and withoutGzipSuffix", () => {
    it("recognizes .gz in any case", () => {
        expect(GZIP_SUFFIX).to.equal(".gz");
        expect(isGzipName("foo.dmk.gz")).to.equal(true);
        expect(isGzipName("FOO.DMK.GZ")).to.equal(true);
        expect(isGzipName("dir.gz/foo.dmk")).to.equal(false);
        expect(isGzipName("foo.dmk")).to.equal(false);
        expect(isGzipName("foo.gzip")).to.equal(false);
    });

    it("removes only a trailing .gz", () => {
        expect(withoutGzipSuffix("foo.dmk.gz")).to.equal("foo.dmk");
        expect(withoutGzipSuffix("FOO.DMK.GZ")).to.equal("FOO.DMK");
        expect(withoutGzipSuffix("foo.gz")).to.equal("foo");
        expect(withoutGzipSuffix("foo.dmk")).to.equal("foo.dmk");
        expect(withoutGzipSuffix("a.gz/foo.dmk")).to.equal("a.gz/foo.dmk");
    });
});

describe("compressForName and uncompressFile", () => {
    it("returns the same bytes for a plain name", () => {
        const bytes = new Uint8Array([1, 2, 3]);
        expect(compressForName("foo.dmk", bytes)).to.equal(bytes);
        const uncompressed = uncompressFile("foo.dmk", bytes);
        expect(uncompressed.name).to.equal("foo.dmk");
        expect(uncompressed.bytes).to.equal(bytes);
    });

    it("compresses for a .gz name and round-trips", () => {
        const bytes = new Uint8Array(1000).fill(7);
        const compressed = compressForName("foo.bin.gz", bytes);
        expect(compressed.length).to.be.lessThan(bytes.length);
        expect(compressed[0]).to.equal(0x1F);
        expect(compressed[1]).to.equal(0x8B);
        expect(Array.from(gunzipBytes(compressed))).to.eql(Array.from(bytes));

        const uncompressed = uncompressFile("FOO.BIN.GZ", gzipBytes(bytes));
        expect(uncompressed.name).to.equal("FOO.BIN");
        expect(Array.from(uncompressed.bytes)).to.eql(Array.from(bytes));
    });

    it("throws for a .gz name whose bytes aren't gzip", () => {
        expect(() => uncompressFile("foo.dmk.gz", new Uint8Array([1, 2, 3, 4]))).to.throw("not a valid gzip file");
        expect(() => gunzipBytes(new Uint8Array([1, 2, 3, 4]))).to.throw("not a valid gzip file");
    });
});

describe("decodeTrs80File with a .gz name", () => {
    it("decodes a gzipped DMK like a plain one, in any case", () => {
        const plain = makeDmkBytes();
        const plainFile = decodeTrs80File(plain, {filename: "foo.dmk"});
        expect(plainFile.className).to.equal("DmkFloppyDisk");

        for (const name of ["foo.dmk.gz", "FOO.DMK.GZ"]) {
            const file = decodeTrs80File(gzipBytes(plain), {filename: name});
            expect(file.error).to.equal(undefined);
            expect(file.className).to.equal(plainFile.className);
            expect(Array.from(file.binary)).to.eql(Array.from(plain));
        }
    });

    it("decodes a gzipped JV1, which has no header to recognize it by", () => {
        const plain = makeTrsdos23TestDisk([{name: "HELLO/TXT",
            extents: [{lump: 1, granuleOffset: 0, granuleCount: 2}], size: 1000}]).binary;
        const plainFile = decodeTrs80File(plain, {filename: "foo.jv1"});
        const file = decodeTrs80File(gzipBytes(plain), {filename: "foo.jv1.gz"});
        expect(file.error).to.equal(undefined);
        expect(file.className).to.equal(plainFile.className);
        expect(Array.from(file.binary)).to.eql(Array.from(plain));
    });

    it("doesn't sniff: gzip bytes under a plain name aren't decompressed", () => {
        const file = decodeTrs80File(gzipBytes(makeDmkBytes()), {filename: "foo.dmk"});
        expect(file.className).to.not.equal("DmkFloppyDisk");
    });

    it("gives a RawBinaryFile with an error for a .gz that isn't gzip", () => {
        const file = decodeTrs80File(makeDmkBytes(), {filename: "foo.dmk.gz"});
        expect(file.className).to.equal("RawBinaryFile");
        expect(file.error).to.be.a("string");
        expect(file.error).to.contain("gzip");
    });

    it("decodes foo.gz like a file with no extension", () => {
        const expected = decodeTrs80File(CMD_BYTES, {filename: ""});
        const file = decodeTrs80File(gzipBytes(CMD_BYTES), {filename: "foo.gz"});
        expect(file.error).to.equal(undefined);
        expect(file.className).to.equal(expected.className);
        expect(Array.from(file.binary)).to.eql(Array.from(CMD_BYTES));
    });
});
