import {BasicDialect, makeTrsdos23TestDisk, type TestDiskOptions, type TestFile} from "trs80-base";
import {describe, expect, it} from "vitest";
import {DiskError} from "./DiskError.js";
import {type AddOptions, addFiles, planAdd} from "./DiskFileOperations.js";
import {buildDiskMap, MapCellKind, mapCellKindIsProblem, totalsText, type DiskMapModel} from "./DiskMap.js";
import {DiskSession} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 2, granuleOffset: 0, granuleCount: 3}], size: 3000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 1, granuleCount: 1}], size: 300};
const KERNEL: TestFile = {name: "KERNEL/SYS", extents: [{lump: 8, granuleOffset: 0, granuleCount: 2}], size: 2000, system: true};

/**
 * Open a small in-memory TRSDOS 2.3 disk with the given files.
 */
function makeSession(files: TestFile[] = [], options: TestDiskOptions = {cylinderCount: 18}): DiskSession {
    return DiskSession.fromBinary("test.jv1", makeTrsdos23TestDisk(files, options).binary);
}

/**
 * The kinds of the model's cells, in granule order.
 */
function kinds(model: DiskMapModel): MapCellKind[] {
    return model.cells.map(cell => cell.kind);
}

describe("buildDiskMap", () => {
    it("classifies the granules of a blank disk", () => {
        const model = buildDiskMap(makeSession(), []);
        expect(model.hasSelection).to.equal(false);
        expect(model.files).to.eql([]);
        expect(model.cells.length).to.equal(model.totals.granuleCount);
        expect(model.cells[0].kind).to.equal(MapCellKind.BOOT);
        expect(model.cells.some(cell => cell.kind === MapCellKind.DIRECTORY)).to.equal(true);
        expect(model.cells.filter(cell => cell.kind === MapCellKind.FREE).length).to.equal(model.totals.freeGranuleCount);
        expect(model.kindCounts.get(MapCellKind.FREE)).to.equal(model.totals.freeGranuleCount);
        expect(kinds(model).every(kind => !mapCellKindIsProblem(kind))).to.equal(true);
        expect(model.cells[0].sectors.length).to.be.greaterThan(0);
        expect(model.layout.lastCylinder).to.be.greaterThan(0);
        expect(totalsText(model.totals)).to.match(/^\d+ of \d+ granules used, \d+ free \(.* KB\)\. A granule is /);
    });

    it("gives each file a color index and its granules", () => {
        const model = buildDiskMap(makeSession([HELLO, WORLD, KERNEL]), []);
        expect(model.files.map(file => [file.name, file.colorIndex, file.granuleCount])).to.eql([
            ["HELLO/BAS", 0, 3], ["WORLD/BAS", 1, 1], ["KERNEL/SYS", 2, 2],
        ]);
        const hello = model.cells.filter(cell => cell.file?.name === "HELLO/BAS");
        expect(hello.length).to.equal(3);
        expect(hello.every(cell => cell.kind === MapCellKind.FILE && cell.label === "HELLO/BAS")).to.equal(true);
        expect(hello.every(cell => cell.lump === 2 || cell.lump === 3)).to.equal(true);
    });

    it("shows a file that addFiles put on the disk", () => {
        const session = makeSession();
        const options: AddOptions = {
            ascii: false, binary: true, basic: BasicDialect.MODEL_III, system: false, invisible: false, overwrite: false,
        };
        const source = {label: "x.bin", name: "x.bin", bytes: new Uint8Array(3000)};
        addFiles(session, planAdd(session, [source], options), options);
        const model = buildDiskMap(session, []);
        expect(model.files.map(file => file.name)).to.eql(["X/BIN"]);
        expect(model.files[0].granuleCount).to.be.greaterThan(0);
        expect(model.cells.filter(cell => cell.kind === MapCellKind.FILE).length).to.equal(model.files[0].granuleCount);
    });

    it("colors only the files that the patterns select", () => {
        const model = buildDiskMap(makeSession([HELLO, WORLD, KERNEL]), ["WORLD/BAS"]);
        expect(model.hasSelection).to.equal(true);
        expect(model.files.map(file => [file.name, file.colorIndex])).to.eql([["WORLD/BAS", 0]]);
        expect(model.kindCounts.get(MapCellKind.FILE)).to.equal(1);
        // HELLO's three granules and KERNEL's two aren't selected.
        expect(model.kindCounts.get(MapCellKind.OTHER_FILE)).to.equal(5);
    });

    it("lists a selected file that has no granules, without a color", () => {
        const model = buildDiskMap(makeSession([HELLO, {name: "EMPTY/DAT", extents: [], size: 0}]), ["EMPTY/DAT"]);
        expect(model.files.map(file => [file.name, file.colorIndex, file.granuleCount])).to.eql([["EMPTY/DAT", undefined, 0]]);
    });

    it("reports a pattern that matches nothing", () => {
        const session = makeSession([HELLO, KERNEL]);
        expect(() => buildDiskMap(session, ["NOPE"])).to.throw(DiskError, "No file on the disk matches \"NOPE\"");
        expect(() => buildDiskMap(session, ["*"])).to.not.throw();
        expect(() => buildDiskMap(session, ["KERNEL*"])).to.throw(DiskError, "No file on the disk matches \"KERNEL*\"");
    });

    it("marks damaged and locked-out granules", () => {
        const session = makeSession([HELLO], {
            cylinderCount: 18, gatUsed: [{lump: 12, granule: 1}], gatFree: [{lump: 2, granule: 0}], lockedOut: [14],
        });
        const model = buildDiskMap(session, []);
        expect(model.kindCounts.get(MapCellKind.UNCLAIMED)).to.equal(1);
        expect(model.kindCounts.get(MapCellKind.CLAIMED_BUT_FREE)).to.equal(1);
        expect(model.kindCounts.get(MapCellKind.LOCKED_OUT)).to.be.greaterThan(0);
        expect(model.totals.lockedOutGranuleCount).to.be.greaterThan(0);
    });
});
