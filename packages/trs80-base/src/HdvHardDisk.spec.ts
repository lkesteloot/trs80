import {describe, expect, it} from "vitest";
import {decodeHdvHardDisk} from "./HdvHardDisk.js";
import {decodeTrs80File} from "./Trs80FileDecoder.js";

const HEADER_SIZE = 256;
const TRACK_SIZE = 32*256;

/**
 * Options for makeHdv().
 */
interface MakeHdvOptions {
    version?: number;
    // Value of byte 26, the heads.
    headsByte?: number;
    // Value of byte 29, the sectors per cylinder (0 means 256).
    sectorsPerCylinderByte?: number;
    // The header's idea of the cylinder count, which the decoder is supposed to ignore.
    headerCylinders?: number;
    flags?: number;
    mediaType?: number;
    // Bytes to add to (positive) or remove from (negative) the end of the file.
    extraBytes?: number;
}

/**
 * Make an HDV file with the given number of tracks of data. Each sector's first two bytes say where
 * it is (its index in the file, low byte first) and the rest are 0xE5.
 */
function makeHdv(trackCount: number, options: MakeHdvOptions): Uint8Array {
    const binary = new Uint8Array(HEADER_SIZE + trackCount*TRACK_SIZE + (options.extraBytes ?? 0));
    binary.set([0x56, 0xCB, options.version ?? 0x10, 0x00, 1, 4, options.mediaType ?? 0, 0, options.flags ?? 0]);
    binary[26] = options.headsByte ?? 0;
    binary[27] = (options.headerCylinders ?? 0) >> 8;
    binary[28] = (options.headerCylinders ?? 0) & 0xFF;
    binary[29] = options.sectorsPerCylinderByte ?? 0;
    binary.fill(0xE5, HEADER_SIZE);
    const sectorCount = Math.floor((binary.length - HEADER_SIZE)/256);
    for (let i = 0; i < sectorCount; i++) {
        binary[HEADER_SIZE + i*256] = i & 0xFF;
        binary[HEADER_SIZE + i*256 + 1] = i >> 8;
    }
    return binary;
}

describe("decodeHdvHardDisk", () => {
    it("takes the heads from the sectors per cylinder", () => {
        // 6 heads, 3 cylinders.
        const disk = decodeHdvHardDisk(makeHdv(18, {sectorsPerCylinderByte: 192}))!;
        expect(disk).to.not.be.undefined;
        expect(disk.className).to.equal("HdvHardDisk");
        expect(disk.getGeometry()).to.eql({cylinderCount: 3, headCount: 6, sectorsPerTrack: 32, sectorSize: 256});
        expect(disk.headerVersion).to.equal(0x10);
        expect(disk.getDescription()).to.equal("HDV hard disk, 3 cylinders, 6 heads");
    });

    it("treats 0 sectors per cylinder as 256", () => {
        const disk = decodeHdvHardDisk(makeHdv(16, {sectorsPerCylinderByte: 0}))!;
        expect(disk.getGeometry().headCount).to.equal(8);
        expect(disk.getGeometry().cylinderCount).to.equal(2);
    });

    it("takes the heads from byte 26 if it's not zero", () => {
        const disk = decodeHdvHardDisk(makeHdv(12, {headsByte: 3, sectorsPerCylinderByte: 192}))!;
        expect(disk.getGeometry().headCount).to.equal(3);
        expect(disk.getGeometry().cylinderCount).to.equal(4);
    });

    it("accepts version 0x11", () => {
        const disk = decodeHdvHardDisk(makeHdv(8, {version: 0x11}))!;
        expect(disk.headerVersion).to.equal(0x11);
    });

    it("takes the cylinder count from the length, not the header", () => {
        const disk = decodeHdvHardDisk(makeHdv(16, {headerCylinders: 203}))!;
        expect(disk.getGeometry().cylinderCount).to.equal(2);
    });

    it("counts a partial last cylinder, whose missing sectors can't be read", () => {
        // 8 heads, and the file ends after head 3 of the second cylinder.
        const disk = decodeHdvHardDisk(makeHdv(12, {}))!;
        expect(disk.getGeometry().cylinderCount).to.equal(2);
        expect(disk.readSector(1, 3, 31)).to.not.be.undefined;
        expect(disk.readSector(1, 4, 0)).to.be.undefined;
        expect(disk.readSector(1, 7, 31)).to.be.undefined;
    });

    it("reads sectors in cylinder, head, sector order", () => {
        const disk = decodeHdvHardDisk(makeHdv(18, {sectorsPerCylinderByte: 192}))!;
        // Cylinder 2, head 4, sector 5.
        const sector = disk.readSector(2, 4, 5)!;
        const index = (2*6 + 4)*32 + 5;
        expect(sector.length).to.equal(256);
        expect(sector[0]).to.equal(index & 0xFF);
        expect(sector[1]).to.equal(index >> 8);
    });

    it("doesn't read outside the geometry", () => {
        const disk = decodeHdvHardDisk(makeHdv(18, {sectorsPerCylinderByte: 192}))!;
        expect(disk.readSector(3, 0, 0)).to.be.undefined;
        expect(disk.readSector(0, 6, 0)).to.be.undefined;
        expect(disk.readSector(0, 0, 32)).to.be.undefined;
        expect(disk.readSector(-1, 0, 0)).to.be.undefined;
    });

    it("reports write protection and auto-boot in the description", () => {
        const binary = makeHdv(8, {flags: 1});
        binary[7] = 0x80;
        binary[11] = 1;
        const disk = decodeHdvHardDisk(binary)!;
        expect(disk.writeProtected).to.equal(true);
        expect(disk.autoBootDos).to.equal(1);
        expect(disk.getDescription()).to.equal("HDV hard disk, 1 cylinders, 8 heads, auto-boots Model III LDOS, write-protected");
    });

    it("doesn't care about byte 5", () => {
        const binary = makeHdv(8, {});
        binary[5] = 1;
        expect(decodeHdvHardDisk(binary)).to.not.be.undefined;
    });

    it("rejects a bad magic number", () => {
        const binary = makeHdv(8, {});
        binary[1] = 0xCC;
        expect(decodeHdvHardDisk(binary)).to.be.undefined;
    });

    it("rejects a bad version", () => {
        expect(decodeHdvHardDisk(makeHdv(8, {version: 0x12}))).to.be.undefined;
    });

    it("rejects a length that isn't a whole number of sectors", () => {
        expect(decodeHdvHardDisk(makeHdv(8, {extraBytes: 100}))).to.be.undefined;
    });

    it("rejects a file without a whole track", () => {
        expect(decodeHdvHardDisk(makeHdv(0, {}))).to.be.undefined;
    });

    it("rejects other media types, header block counts, and F48 images", () => {
        expect(decodeHdvHardDisk(makeHdv(8, {mediaType: 1}))).to.be.undefined;
        expect(decodeHdvHardDisk(makeHdv(8, {flags: 2}))).to.be.undefined;
        const binary = makeHdv(8, {});
        binary[4] = 2;
        expect(decodeHdvHardDisk(binary)).to.be.undefined;
    });

    it("rejects sectors per cylinder that aren't whole tracks", () => {
        expect(decodeHdvHardDisk(makeHdv(8, {sectorsPerCylinderByte: 100}))).to.be.undefined;
    });
});

describe("decodeTrs80File with a hard disk", () => {
    it("decodes a file with the .HDV extension", () => {
        const trs80File = decodeTrs80File(makeHdv(8, {}), {filename: "disk.hdv"});
        expect(trs80File.className).to.equal("HdvHardDisk");
    });

    it("decodes a file with no extension by its magic number", () => {
        const trs80File = decodeTrs80File(makeHdv(8, {}), {filename: "hard4-0"});
        expect(trs80File.className).to.equal("HdvHardDisk");
    });

    it("leaves a bad .HDV file as raw bytes", () => {
        const trs80File = decodeTrs80File(new Uint8Array(1000), {filename: "disk.hdv"});
        expect(trs80File.className).to.equal("RawBinaryFile");
    });
});
