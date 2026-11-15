import {describe, expect, it} from "vitest";
import {type Cpm, CpmFile, decodeCpm, decodeCpmWithLayout} from "./Cpm.js";
import {type CpmFilename} from "./CpmFilename.js";
import {cpmTestRecordLocation, type CpmTestFile, makeMontezumaTestDisk} from "./CpmTestDisk.js";
import {CPM_VERIFIED_LAYOUTS, type CpmVerifiedLayout} from "./CpmWriteGate.js";
import {CpmWriteError, CpmWriteErrorKind, CpmWriter, findCpmFreeBlocks} from "./CpmWriter.js";
import {setDmkConverterCrcMarker} from "./DmkTestArtifacts.js";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";

const RECORD_SIZE = 128;
const DIR_ENTRY_SIZE = 32;
const BLOCK_SIZE = 2048;

/**
 * The verified layout with a name.
 */
function layoutNamed(name: string): CpmVerifiedLayout {
    const layout = CPM_VERIFIED_LAYOUTS.find(layout => layout.name === name);
    if (layout === undefined) {
        throw new Error("No layout " + name);
    }
    return layout;
}

/**
 * Make a filename from "NAME.EXT" text that's already valid.
 */
function name(text: string): CpmFilename {
    const [fileName, extension = ""] = text.split(".");
    return {name: fileName, extension};
}

/**
 * Bytes that differ from each other along the file, so that a misplaced record shows.
 */
function pattern(length: number, seed: number): Uint8Array {
    return Uint8Array.from({length}, (_, i) => (i*31 + seed + (i >> 7)*5) & 0xFF);
}

/**
 * The files that every test disk starts with: one block, and two. The first free block is 5, and the
 * first free slot is 2.
 */
function seedFiles(): CpmTestFile[] {
    return [
        {name: "A.TXT", contents: pattern(100, 1)},
        {name: "B.BIN", contents: pattern(3000, 2)},
    ];
}

/**
 * Read the directory's 4096 bytes straight from the sectors with the test helper's own record mapping,
 * which doesn't share code with the reader.
 */
function readDirectory(disk: DmkFloppyDisk, layout: CpmVerifiedLayout): Uint8Array {
    return readRecords(disk, layout, 0, 32);
}

/**
 * Read records of the data area with the test helper's own mapping.
 */
function readRecords(disk: DmkFloppyDisk, layout: CpmVerifiedLayout, firstRecord: number, count: number): Uint8Array {
    const result = new Uint8Array(count*RECORD_SIZE);
    for (let i = 0; i < count; i++) {
        const {position, offset} = cpmTestRecordLocation(layout, firstRecord + i);
        result.set(disk.readSector(position)!.data.subarray(offset, offset + RECORD_SIZE), i*RECORD_SIZE);
    }
    return result;
}

/**
 * Read the first byteCount bytes held in a list of blocks, with the test helper's own mapping.
 */
function readBlocks(disk: DmkFloppyDisk, layout: CpmVerifiedLayout, blocks: number[], byteCount: number): Uint8Array {
    const recordsPerBlock = BLOCK_SIZE/RECORD_SIZE;
    const parts = blocks.map(block => readRecords(disk, layout, block*recordsPerBlock, recordsPerBlock));
    const all = new Uint8Array(parts.length*BLOCK_SIZE);
    parts.forEach((part, i) => all.set(part, i*BLOCK_SIZE));
    return all.subarray(0, byteCount);
}

/**
 * Open a writer on a disk, the way the session does: decode it, lay an overlay over it, and decode the overlay
 * with the same layout and whole records.
 */
function openWriter(disk: DmkFloppyDisk): {writer: CpmWriter, overlay: SectorOverlay, layout: Cpm} {
    const found = decodeCpm(disk, true);
    if (found === undefined) {
        throw new Error("Not CP/M");
    }
    const overlay = new SectorOverlay(disk);
    const cpm = decodeCpmWithLayout(overlay, found, true);
    return {writer: new CpmWriter(overlay, cpm), overlay, layout: found};
}

/**
 * Make a change, flush it, commit it, and return the file system as read from the disk afterward, with the
 * layout it had before.
 */
function change(disk: DmkFloppyDisk, run: (writer: CpmWriter) => void): Cpm {
    const {writer, overlay, layout} = openWriter(disk);
    run(writer);
    writer.flush();
    overlay.commit();
    return decodeCpmWithLayout(disk, layout, true);
}

/**
 * The names of the files, sorted.
 */
function names(cpm: Cpm): string[] {
    return cpm.getDirEntries(true).map(file => file.getFilename(".")).sort();
}

/**
 * The file with a name (user 0), read back as whole records.
 */
function readNamed(cpm: Cpm, text: string): Uint8Array {
    const file = cpm.getDirEntries(true).find(file => file.getFilename(".") === text);
    if (file === undefined) {
        throw new Error("No file " + text);
    }
    return cpm.readFile(file);
}

/**
 * The file with a name.
 */
function fileNamed(writer: CpmWriter, text: string): CpmFile {
    const file = writer.findFiles(name(text))[0];
    if (file === undefined) {
        throw new Error("No file " + text);
    }
    return file;
}

/**
 * The slot's 32 bytes of a directory.
 */
function slotOf(directory: Uint8Array, slot: number): Uint8Array {
    return directory.slice(slot*DIR_ENTRY_SIZE, (slot + 1)*DIR_ENTRY_SIZE);
}

// What each file size of the tests makes, worked out by hand from the rules for entries: for each entry, its EX,
// its RC, and how many blocks it holds. With 16-bit pointers (EXM 0) an entry holds 128 records and 8 blocks.
// With 8-bit pointers (EXM 1) it holds 256 records and 16 blocks, and its EX counts 16K logical extents.
const NARROW_ENTRIES: Record<number, [number, number, number][]> = {
    0: [[0, 0, 0]],
    1: [[0, 1, 1]],
    127: [[0, 1, 1]],
    128: [[0, 1, 1]],
    129: [[0, 2, 1]],
    16384: [[0, 128, 8]],
    16385: [[1, 1, 9]],
    32768: [[1, 128, 16]],
    32896: [[1, 128, 16], [2, 1, 1]],
};
const WIDE_ENTRIES: Record<number, [number, number, number][]> = {
    0: [[0, 0, 0]],
    1: [[0, 1, 1]],
    127: [[0, 1, 1]],
    128: [[0, 1, 1]],
    129: [[0, 2, 1]],
    16384: [[0, 128, 8]],
    16385: [[0, 128, 8], [1, 1, 1]],
    32768: [[0, 128, 8], [1, 128, 8]],
    32896: [[0, 128, 8], [1, 128, 8], [2, 1, 1]],
};

// The four shapes of Montezuma disk: 18 × 256 and 10 × 512, one and two sides, and 80 tracks double-sided, which
// has more than 256 blocks, so its pointers are 16 bits and its EXM is 0.
const SHAPES = ["Standard system", "Standard data", "Standard DS data", "80T DS system"];

describe("CpmWriter", () => {
    for (const shapeName of SHAPES) {
        const layout = layoutNamed(shapeName);
        const wide = layout.dsm >= 256;

        describe(shapeName, () => {
            it("starts from the shape it should", () => {
                const cpm = decodeCpm(makeMontezumaTestDisk(layout, seedFiles()), true)!;
                expect(cpm.wideBlockPointers).to.equal(wide);
                expect(cpm.extentMask).to.equal(wide ? 0 : 1);
            });

            for (const size of [0, 1, 127, 128, 129, 16384, 16385, 32768, 32896]) {
                it(`adds and kills a file of ${size} bytes`, () => {
                    const disk = makeMontezumaTestDisk(layout, seedFiles());
                    const before = readDirectory(disk, layout);
                    const contents = pattern(size, 9);
                    const cpm = change(disk, writer => {
                        expect(writer.addFile(name("NEW.DAT"), contents)).to.eql({name: "NEW.DAT", size});
                    });

                    // The entries, from the raw directory bytes.
                    const after = readDirectory(disk, layout);
                    const expected = (wide ? WIDE_ENTRIES : NARROW_ENTRIES)[size];
                    let nextBlock = 5;
                    expected.forEach(([ex, rc, blockCount], i) => {
                        const entry = slotOf(after, 2 + i);
                        expect(entry[0], "user").to.equal(0);
                        expect(Array.from(entry.subarray(1, 12)), "name").to.eql(Array.from("NEW     DAT", c => c.charCodeAt(0)));
                        expect(entry[12], "EX").to.equal(ex);
                        expect(entry[13], "S1").to.equal(0);
                        expect(entry[14], "S2").to.equal(0);
                        expect(entry[15], "RC").to.equal(rc);
                        const pointers: number[] = [];
                        for (let p = 0; p < (wide ? 8 : 16); p++) {
                            pointers.push(wide ? entry[16 + 2*p] | (entry[17 + 2*p] << 8) : entry[16 + p]);
                        }
                        const want = Array.from({length: blockCount}, (_, p) => nextBlock + p);
                        nextBlock += blockCount;
                        expect(pointers, "pointers").to.eql([...want, ...new Array(pointers.length - blockCount).fill(0)]);
                    });
                    // The slot after the file's last entry wasn't touched.
                    expect(slotOf(after, 2 + expected.length)).to.eql(slotOf(before, 2 + expected.length));

                    // The data, read without sharing code with the reader, and padded with Ctrl-Z.
                    const records = Math.ceil(size/RECORD_SIZE);
                    const padded = new Uint8Array(records*RECORD_SIZE).fill(0x1A);
                    padded.set(contents);
                    const blocks = Array.from({length: Math.ceil(records/16)}, (_, i) => 5 + i);
                    expect(readBlocks(disk, layout, blocks, padded.length)).to.eql(padded);
                    expect(readNamed(cpm, "NEW.DAT")).to.eql(padded);

                    // The files that were there still read the same.
                    expect(names(cpm)).to.eql(["A.TXT", "B.BIN", "NEW.DAT"]);
                    expect(readNamed(cpm, "A.TXT").subarray(0, 100)).to.eql(pattern(100, 1));
                    expect(readNamed(cpm, "B.BIN").subarray(0, 3000)).to.eql(pattern(3000, 2));
                    expect(slotOf(after, 0)).to.eql(slotOf(before, 0));
                    expect(slotOf(after, 1)).to.eql(slotOf(before, 1));

                    // Kill it: the other slots and the files are unchanged, and the killed slots are unused.
                    const killed = change(disk, writer => writer.deleteFile(fileNamed(writer, "NEW.DAT")));
                    const afterKill = readDirectory(disk, layout);
                    for (let slot = 0; slot < 128; slot++) {
                        if (slot < 2) {
                            expect(slotOf(afterKill, slot), `slot ${slot}`).to.eql(slotOf(before, slot));
                        } else if (slot < 2 + expected.length) {
                            expect(afterKill[slot*DIR_ENTRY_SIZE], `slot ${slot}`).to.equal(0xE5);
                        } else {
                            expect(slotOf(afterKill, slot), `slot ${slot}`).to.eql(slotOf(before, slot));
                        }
                    }
                    expect(names(killed)).to.eql(["A.TXT", "B.BIN"]);
                    expect(readNamed(killed, "B.BIN").subarray(0, 3000)).to.eql(pattern(3000, 2));
                });
            }
        });
    }

    const standard = layoutNamed("Standard data");

    it("reuses the lowest slot and blocks after a delete", () => {
        const disk = makeMontezumaTestDisk(standard, [...seedFiles(), {name: "C.TXT", contents: pattern(100, 3)}]);
        // A is in slot 0 and block 2, B in slot 1 and blocks 3 and 4, and C in slot 2 and block 5.
        const cpm = change(disk, writer => {
            writer.deleteFile(fileNamed(writer, "B.BIN"));
            writer.addFile(name("D.BIN"), pattern(3500, 4));
        });
        const file = cpm.getDirEntries(true).find(file => file.getFilename(".") === "D.BIN")!;
        expect(file.extents[0].slot).to.equal(1);
        expect(file.getBlocks()).to.eql([3, 4]);
        expect(names(cpm)).to.eql(["A.TXT", "C.TXT", "D.BIN"]);
    });

    it("never allocates the blocks of a bad entry", () => {
        // A rejected entry (a bad extent number) that points at blocks 10 to 12.
        const bad = new Uint8Array(DIR_ENTRY_SIZE);
        bad[0] = 0;
        bad.set(Array.from("BAD     TXT", c => c.charCodeAt(0)), 1);
        bad[12] = 0xFF;
        bad.set([10, 11, 12], 16);
        const disk = makeMontezumaTestDisk(standard, [...seedFiles(),
            {name: "C.TXT", contents: pattern(100, 3)}, {name: "D.TXT", contents: pattern(100, 4)},
            {name: "E.TXT", contents: pattern(100, 5)}], {rawEntries: [{slot: 9, bytes: bad}]});
        const {writer} = openWriter(disk);
        expect(writer.cpm.evaluation.badEntryCount).to.equal(1);

        const cpm = change(disk, w => w.addFile(name("NEW.BIN"), pattern(3*BLOCK_SIZE, 5)));
        const file = cpm.getDirEntries(true).find(file => file.getFilename(".") === "NEW.BIN")!;
        expect(file.getBlocks()).to.eql([8, 9, 13]);
        // The bad entry is still there.
        expect(cpm.evaluation.badEntryCount).to.equal(1);
    });

    it("never allocates a block with a sector that has a CRC error", () => {
        let disk = makeMontezumaTestDisk(standard, seedFiles());
        // Block 5's first record.
        disk = setDmkConverterCrcMarker(disk, cpmTestRecordLocation(standard, 5*16).position);
        const {writer} = openWriter(disk);
        const free = findCpmFreeBlocks(writer.cpm);
        expect(free.unusable).to.include(5);
        expect(free.free).not.to.include(5);

        const cpm = change(disk, w => w.addFile(name("NEW.BIN"), pattern(2*BLOCK_SIZE, 5)));
        const file = cpm.getDirEntries(true).find(file => file.getFilename(".") === "NEW.BIN")!;
        expect(file.getBlocks()).to.not.include(5);
        expect(file.getBlocks().length).to.equal(2);
    });

    it("throws NO_SPACE when the blocks run out, and leaves the disk alone", () => {
        const disk = makeMontezumaTestDisk(standard, seedFiles());
        const before = new Uint8Array(disk.binary);
        const {writer, overlay} = openWriter(disk);
        const freeCount = findCpmFreeBlocks(writer.cpm).free.length;
        let thrown: unknown;
        try {
            writer.addFile(name("BIG.BIN"), new Uint8Array((freeCount + 1)*BLOCK_SIZE));
        } catch (e) {
            thrown = e;
        }
        expect(thrown).to.be.instanceOf(CpmWriteError);
        expect((thrown as CpmWriteError).kind).to.equal(CpmWriteErrorKind.NO_SPACE);
        expect(writer.hasChanges()).to.equal(false);
        overlay.discard();
        expect(disk.binary).to.eql(before);

        // Exactly the free space fits.
        const cpm = change(disk, w => w.addFile(name("BIG.BIN"), pattern(freeCount*BLOCK_SIZE, 6)));
        expect(findCpmFreeBlocks(cpm).free).to.eql([]);
        expect(readNamed(cpm, "BIG.BIN")).to.eql(pattern(freeCount*BLOCK_SIZE, 6));
    });

    it("throws NO_SPACE when the directory is full", () => {
        // 126 files of no bytes and the two seeds fill all 128 slots.
        const files = [...seedFiles()];
        for (let i = 0; i < 126; i++) {
            files.push({name: `Z${i}.EMP`, contents: new Uint8Array(0)});
        }
        const disk = makeMontezumaTestDisk(standard, files);
        const before = new Uint8Array(disk.binary);
        const {writer, overlay} = openWriter(disk);
        let thrown: unknown;
        try {
            writer.addFile(name("NEW.TXT"), new Uint8Array(10));
        } catch (e) {
            thrown = e;
        }
        expect(thrown).to.be.instanceOf(CpmWriteError);
        expect((thrown as CpmWriteError).kind).to.equal(CpmWriteErrorKind.NO_SPACE);
        expect(writer.hasChanges()).to.equal(false);
        overlay.discard();
        expect(disk.binary).to.eql(before);
    });

    it("refuses a name that user 0 already has, in any case", () => {
        const disk = makeMontezumaTestDisk(standard, seedFiles());
        const {writer} = openWriter(disk);
        expect(() => writer.addFile(name("A.TXT"), new Uint8Array(1))).to.throw("already on the disk");
        expect(writer.hasChanges()).to.equal(false);
        expect(writer.findFiles(name("A.TXT")).length).to.equal(1);
    });

    it("renames in every slot and keeps the high bits", () => {
        // A file in two entries, whose names have f1' and R/O bits set.
        const disk = makeMontezumaTestDisk(standard, [
            {name: "OLD.DAT", contents: pattern(40000, 7), readOnly: true},
            {name: "OTHER.TXT", contents: pattern(50, 8)},
        ]);
        // Set f1' and f8' on the first entry by hand, as a program that uses interface attributes would.
        const {writer: probe} = openWriter(disk);
        const slots = probe.getFiles()[0].extents.map(extent => extent.slot);
        expect(slots.length).to.equal(2);
        const cpm = change(disk, writer => {
            writer.renameFile(fileNamed(writer, "OLD.DAT"), name("NEW.BIN"));
            // The renamed file is found under its new name, and by the old object too.
            expect(writer.findFiles(name("NEW.BIN")).length).to.equal(1);
            expect(writer.findFiles(name("OLD.DAT")).length).to.equal(0);
        });
        expect(names(cpm)).to.eql(["NEW.BIN", "OTHER.TXT"]);
        const file = cpm.getDirEntries(true).find(file => file.getFilename(".") === "NEW.BIN")!;
        expect(file.isReadOnly()).to.equal(true);
        expect(file.extents.map(extent => extent.slot)).to.eql(slots);
        expect(cpm.readFile(file).subarray(0, 40000)).to.eql(pattern(40000, 7));
    });

    it("keeps the high bits of the name's first 8 bytes when renaming", () => {
        const disk = makeMontezumaTestDisk(standard, seedFiles());
        // Put f1' and f8' on A.TXT's entry, which the reader accepts (it takes the low 7 bits).
        const directory = readDirectory(disk, standard);
        const entry = slotOf(directory, 0);
        entry[1] |= 0x80;
        entry[8] |= 0x80;
        entry[9] |= 0x80;
        const {position, offset} = cpmTestRecordLocation(standard, 0);
        const sector = disk.readSector(position)!;
        sector.data.set(entry, offset);
        disk.writeSector(position, sector);

        const cpm = change(disk, writer => writer.renameFile(fileNamed(writer, "A.TXT"), name("NEWNAME.XYZ")));
        expect(names(cpm)).to.eql(["B.BIN", "NEWNAME.XYZ"]);
        const renamed = slotOf(readDirectory(disk, standard), 0);
        expect(Array.from(renamed.subarray(1, 12)).map(b => b & 0x7F)).to.eql(Array.from("NEWNAME XYZ", c => c.charCodeAt(0)));
        expect(renamed[1] & 0x80).to.equal(0x80);
        expect(renamed[8] & 0x80).to.equal(0x80);
        expect(renamed[2] & 0x80).to.equal(0);
        // The R/O bit is the high bit of the extension's first byte.
        expect(renamed[9] & 0x80).to.equal(0x80);
        expect(renamed.subarray(12)).to.eql(entry.subarray(12));
    });

    it("refuses to rename onto another file's name, but not onto another user's", () => {
        const disk = makeMontezumaTestDisk(standard, [...seedFiles(), {name: "A.TXT", contents: pattern(10, 1), user: 3}]);
        const {writer} = openWriter(disk);
        expect(() => writer.renameFile(fileNamed(writer, "B.BIN"), name("a.txt"))).not.to.throw();
        const {writer: writer2} = openWriter(disk);
        const user0 = writer2.findFiles(name("A.TXT")).find(file => file.user === 0)!;
        expect(() => writer2.renameFile(user0, name("B.BIN"))).to.throw("already on the disk");
    });

    it("sets and clears R/O and SYS in every slot and leaves the archive bit", () => {
        const disk = makeMontezumaTestDisk(standard, [{name: "OLD.DAT", contents: pattern(40000, 7)}, ...seedFiles()]);
        // Archive bit (high bit of the extension's third byte) in both entries, as a backup program sets it.
        for (const slot of [0, 1]) {
            const {position, offset} = cpmTestRecordLocation(standard, 0);
            const sector = disk.readSector(position)!;
            sector.data[offset + slot*DIR_ENTRY_SIZE + 11] |= 0x80;
            disk.writeSector(position, sector);
        }
        const cpm = change(disk, writer => writer.setAttributes(fileNamed(writer, "OLD.DAT"), {readOnly: true, system: true}));
        const file = cpm.getDirEntries(true).find(file => file.getFilename(".") === "OLD.DAT")!;
        expect(file.getAttributesString()).to.equal("R/O SYS ARC");
        expect(file.extents.length).to.equal(2);
        for (const extent of file.extents) {
            expect(extent.readOnly && extent.system && extent.archived).to.equal(true);
        }

        const cleared = change(disk, writer => writer.setAttributes(fileNamed(writer, "OLD.DAT"), {system: false}));
        const again = cleared.getDirEntries(true).find(file => file.getFilename(".") === "OLD.DAT")!;
        expect(again.getAttributesString()).to.equal("R/O ARC");

        // Setting what's already set changes nothing.
        const {writer} = openWriter(disk);
        writer.setAttributes(fileNamed(writer, "OLD.DAT"), {readOnly: true});
        expect(writer.hasChanges()).to.equal(false);
    });

    it("replaces a file in place, keeping its attributes and the lowest slot and blocks", () => {
        const disk = makeMontezumaTestDisk(standard, [
            {name: "A.TXT", contents: pattern(100, 1), system: true},
            {name: "B.BIN", contents: pattern(3000, 2), readOnly: true},
            {name: "C.TXT", contents: pattern(100, 3)},
        ]);
        const cpm = change(disk, writer => {
            writer.replaceFile(fileNamed(writer, "B.BIN"), pattern(5000, 4));
            writer.replaceFile(fileNamed(writer, "A.TXT"), pattern(10, 5), {system: false});
        });
        const b = cpm.getDirEntries(true).find(file => file.getFilename(".") === "B.BIN")!;
        expect(b.isReadOnly()).to.equal(true);
        expect(b.extents[0].slot).to.equal(1);
        expect(cpm.readFile(b).subarray(0, 5000)).to.eql(pattern(5000, 4));
        const a = cpm.getDirEntries(true).find(file => file.getFilename(".") === "A.TXT")!;
        expect(a.isSystemFile()).to.equal(false);
        expect(cpm.readFile(a).subarray(0, 10)).to.eql(pattern(10, 5));
        expect(readNamed(cpm, "C.TXT").subarray(0, 100)).to.eql(pattern(100, 3));
        expect(cpm.evaluation.duplicateBlockCount).to.equal(0);
    });

    it("leaves a file alone when its replacement doesn't fit", () => {
        const disk = makeMontezumaTestDisk(standard, seedFiles());
        const {writer} = openWriter(disk);
        expect(() => writer.replaceFile(fileNamed(writer, "B.BIN"), new Uint8Array(500*BLOCK_SIZE))).to.throw("no room");
        expect(writer.hasChanges()).to.equal(false);
        expect(writer.getFiles().map(file => file.getFilename("."))).to.eql(["A.TXT", "B.BIN"]);
    });

    it("leaves a directory of unused slots when the last file is deleted, and can add to it", () => {
        const disk = makeMontezumaTestDisk(standard, seedFiles());
        const emptied = change(disk, writer => {
            for (const file of writer.getFiles()) {
                writer.deleteFile(file);
            }
        });
        expect(emptied.getDirEntries(true)).to.eql([]);
        expect(emptied.evaluation.goodEntryCount).to.equal(0);
        const directory = readDirectory(disk, standard);
        expect(directory.every((b, i) => i % DIR_ENTRY_SIZE !== 0 || b === 0xE5)).to.equal(true);
        // On its own an empty directory doesn't decode as CP/M, but the layout reads it as empty.
        expect(decodeCpm(disk, true)).to.equal(undefined);

        const overlay = new SectorOverlay(disk);
        const writer = new CpmWriter(overlay, decodeCpmWithLayout(overlay, emptied, true));
        writer.addFile(name("FRESH.TXT"), pattern(300, 11));
        writer.flush();
        overlay.commit();
        const again = decodeCpm(disk, true)!;
        expect(names(again)).to.eql(["FRESH.TXT"]);
        expect(again.readFile(again.getDirEntries(true)[0]).subarray(0, 300)).to.eql(pattern(300, 11));
        expect(again.getDirEntries(true)[0].getBlocks()).to.eql([2]);
    });

    it("allows a change that leaves the disk reading equally well another way", () => {
        // With one small file left, a two-sided reading with 4 reserved tracks finds the same directory and the same
        // file. The writer doesn't judge that; the session checks the layout when the disk is saved.
        const disk = makeMontezumaTestDisk(standard, [{name: "A.TXT", contents: pattern(100, 1)},
            {name: "B.BIN", contents: pattern(100, 2)}, {name: "C.BIN", contents: pattern(3000, 3)}]);
        const cpm = change(disk, writer => {
            writer.deleteFile(fileNamed(writer, "B.BIN"));
            writer.deleteFile(fileNamed(writer, "C.BIN"));
        });
        expect(names(cpm)).to.eql(["A.TXT"]);
    });

    it("does nothing, and verifies, when there are no changes", () => {
        const disk = makeMontezumaTestDisk(standard, seedFiles());
        const before = new Uint8Array(disk.binary);
        const {writer, overlay} = openWriter(disk);
        expect(writer.hasChanges()).to.equal(false);
        writer.flush();
        expect(overlay.hasChanges()).to.equal(false);
        expect(disk.binary).to.eql(before);
    });

    it("refuses to be used again after a flush", () => {
        const disk = makeMontezumaTestDisk(standard, seedFiles());
        const {writer} = openWriter(disk);
        writer.addFile(name("NEW.TXT"), new Uint8Array(5));
        writer.flush();
        expect(() => writer.addFile(name("MORE.TXT"), new Uint8Array(5))).to.throw("already been flushed");
    });

    it("leaves the reserved tracks as they were", () => {
        const layout = layoutNamed("Standard system");
        const disk = makeMontezumaTestDisk(layout, seedFiles(), {banner: "Model 4 64K System CP/M 2.2 v2.32"});
        /**
         * The bytes of every sector of the reserved tracks.
         */
        const reserved = (): number[][] => {
            const bytes: number[][] = [];
            for (let cylinder = 0; cylinder < layout.reservedTracks; cylinder++) {
                for (let sector = 1; sector <= layout.sectorsPerTrack; sector++) {
                    bytes.push(Array.from(disk.readSector(SectorPosition.make(cylinder, 0, sector))!.data));
                }
            }
            return bytes;
        };
        const before = reserved();
        const cpm = change(disk, writer => writer.addFile(name("NEW.BIN"), pattern(20000, 3)));
        expect(cpm.reservedTrackCount).to.equal(2);
        expect(reserved()).to.eql(before);
        expect(readNamed(cpm, "NEW.BIN").subarray(0, 20000)).to.eql(pattern(20000, 3));
    });
});
