import {describe, expect, it} from "vitest";
import {decodeCpmWithLayout, Cpm, decodeCpm} from "./Cpm.js";
import {makeCpmTestDisk, type CpmTestDiskOptions, type CpmTestFile} from "./CpmTestDisk.js";
import {
    CPM_VERIFIED_LAYOUTS,
    type CpmVerifiedLayout,
    CpmWriteBlockerKind,
    describeCpmWithPreset,
    evaluateCpmWriteGate,
    findCpmLayoutsForGeometry,
    findCpmVerifiedLayout,
    findCpmVerifiedLayoutById,
    formatCpmPresetTable,
    isMontezumaPreset,
    makeCpmLayout,
} from "./CpmWriteGate.js";
import {decodeFloppyFileSystem} from "./FloppyFileSystem.js";
import {decodeTrsdos} from "./Trsdos.js";

// A banner that names a BIOS that didn't use skew 4, so that detection has no skew doubt.
const BANNER = "Model 4 64K System CP/M 2.2 v2.32";

/**
 * Several files of different sizes, which fit on every layout.
 */
function makeFiles(): CpmTestFile[] {
    return [
        {name: "A.TXT", contents: new TextEncoder().encode("Hello, world.\r\n".repeat(70))},
        {name: "B.BIN", contents: Uint8Array.from({length: 3000}, (_, i) => (i*7 + 2) & 0xFF)},
        {name: "D.DAT", contents: Uint8Array.from({length: 5000}, (_, i) => (i*31 + 3 + (i >> 7)*5) & 0xFF)},
    ];
}

/**
 * The options for a layout's test disk that give a system format Montezuma's banner, which only Montezuma's presets
 * support.
 *
 * @param layout the layout.
 * @param always whether to give the banner to a data format too.
 */
function bannerOptions(layout: CpmVerifiedLayout, always = false): CpmTestDiskOptions {
    if (!isMontezumaPreset(layout)) {
        return {};
    }
    return {banner: layout.reservedTracks > 0 || always ? BANNER : ""};
}

describe("CP/M presets", () => {
    it("have a unique id each, in the form that --cpm-format takes", () => {
        const ids = CPM_VERIFIED_LAYOUTS.map(layout => layout.id);
        expect(new Set(ids).size).to.equal(ids.length);
        expect(ids).to.have.length(21);
        for (const id of ids) {
            expect(id).to.match(/^(mm|lb|holmes|cpm3)-[a-z0-9.-]+$/);
        }
    });

    it("are found by id, in any case", () => {
        expect(findCpmVerifiedLayoutById("mm-system")?.name).to.equal("Standard system");
        expect(findCpmVerifiedLayoutById("MM-DS-Data")?.name).to.equal("Standard DS data");
        expect(findCpmVerifiedLayoutById("  mm-1.42-ds-system ")?.reservedTracks).to.equal(4);
        expect(findCpmVerifiedLayoutById("mm-nothing")).to.equal(undefined);
    });

    it("make a table with a header, a heading for each system, and a row for each", () => {
        const lines = formatCpmPresetTable();
        expect(lines[0]).to.match(/^ {2}Name +Format +Sides +Cylinders +Sectors +Capacity$/);

        // The headings, in the order of the table, each followed by its rows and then a blank line.
        const systems = Array.from(new Set(CPM_VERIFIED_LAYOUTS.map(layout => layout.system)));
        expect(systems).to.have.length(5);
        expect(lines.filter(line => line !== "" && !line.startsWith(" "))).to.eql(systems);
        expect(lines.filter(line => line === "")).to.have.length(systems.length);
        expect(lines).to.have.length(1 + systems.length*2 + CPM_VERIFIED_LAYOUTS.length);
        expect(lines[1]).to.equal("");
        expect(lines[2]).to.equal("Montezuma Micro CP/M 2.2 (Model 4)");
        expect(lines[3]).to.match(/^ {2}mm-system +Standard system +1 +40 +18 × 256 +170K$/);
        expect(lines[4]).to.match(/^ {2}mm-data +Standard data +1 +40 +10 × 512 +200K$/);

        // Every id is in one row, under its own system, and the columns line up.
        for (const layout of CPM_VERIFIED_LAYOUTS) {
            const matches = lines.filter(line => line.startsWith(`  ${layout.id} `));
            expect(matches, layout.id).to.have.length(1);
            expect(lines.lastIndexOf(layout.system), layout.id).to.be.lessThan(lines.indexOf(matches[0]));
        }
        const sidesColumn = lines[0].indexOf("Sides") + "Sides".length;
        for (const line of lines.filter(line => line.startsWith("  "))) {
            expect(line[sidesColumn - 1], line).to.match(/\d|s/);
        }
        expect(lines.filter(line => line.includes("lb-m2-ds-system"))[0]).to.match(
            /^ {2}lb-m2-ds-system +Lifeboat 2\.24A, Aton DS +2 +77 +8 × 1024 +1216K$/);
        expect(lines.filter(line => line.includes("lb-system"))[0]).to.match(
            /^ {2}lb-system +35-track system +1 +35 +18 × 128 +72K$/);
    });

    describe("makeCpmLayout", () => {
        for (const layout of CPM_VERIFIED_LAYOUTS) {
            it(`reads a ${layout.id} disk as ${layout.id}, with its files`, () => {
                const files = makeFiles();
                const disk = makeCpmTestDisk(layout, files, bannerOptions(layout));
                const cpmLayout = makeCpmLayout(layout, disk.getGeometry());
                expect(typeof cpmLayout).to.not.equal("string");
                if (typeof cpmLayout === "string") {
                    return;
                }

                const cpm = decodeCpmWithLayout(disk, cpmLayout, false);
                expect(findCpmVerifiedLayout(cpm)?.id).to.equal(layout.id);
                const entries = cpm.getDirEntries(true);
                expect(entries.map(entry => entry.getFilename("."))).to.eql(files.map(file => file.name));
                for (const [i, entry] of entries.entries()) {
                    expect(cpm.readFile(entry).subarray(0, files[i].contents.length)).to.eql(files[i].contents);
                }
            });
        }

        it("gives the same layout as detection where detection is sure", () => {
            for (const layout of CPM_VERIFIED_LAYOUTS) {
                const disk = makeCpmTestDisk(layout, makeFiles(), bannerOptions(layout, true));
                const detected = decodeCpm(disk, false);
                expect(detected).to.not.equal(undefined);
                if (detected === undefined || findCpmVerifiedLayout(detected)?.id !== layout.id) {
                    // Some layouts read equally well as others, so detection may choose another.
                    continue;
                }
                const named = makeCpmLayout(layout, disk.getGeometry());
                expect(typeof named).to.not.equal("string");
                if (typeof named !== "string") {
                    expect(decodeCpmWithLayout(disk, named, false).sameLayout(detected)).to.equal(true);
                }
            }
        });

        it("says why an image can't hold the layout", () => {
            const standard = findCpmVerifiedLayoutById("mm-system")!;
            const data = findCpmVerifiedLayoutById("mm-data")!;
            const doubleSided = findCpmVerifiedLayoutById("mm-ds-system")!;
            const disk = makeCpmTestDisk(standard, makeFiles(), {banner: BANNER});

            expect(makeCpmLayout(data, disk.getGeometry())).to.equal("the image's sectors are 256 bytes, not 512");
            expect(makeCpmLayout(doubleSided, disk.getGeometry())).to.equal("the image has only one side");

            const dataDisk = makeCpmTestDisk(data, makeFiles());
            const extended = findCpmVerifiedLayoutById("mm-ext-system")!;
            expect(typeof makeCpmLayout(extended, dataDisk.getGeometry())).to.equal("object");
            expect(makeCpmLayout(standard, dataDisk.getGeometry())).to.equal("the image's sectors are 512 bytes, not 256");
        });

        it("reads an image with more cylinders than the layout, using only the layout's", () => {
            const layout = findCpmVerifiedLayoutById("mm-system")!;
            const disk = makeCpmTestDisk(layout, makeFiles(), {banner: BANNER, cylinderCount: 41});
            const cpmLayout = makeCpmLayout(layout, disk.getGeometry());
            if (typeof cpmLayout === "string") {
                throw new Error(cpmLayout);
            }
            const cpm = decodeCpmWithLayout(disk, cpmLayout, false);
            expect(cpm.cylinderCount).to.equal(40);
            expect(findCpmVerifiedLayout(cpm)?.id).to.equal("mm-system");
            expect(cpm.getDirEntries(true)).to.have.length(3);
        });

        it("lists the presets that an image can hold", () => {
            const layout = findCpmVerifiedLayoutById("mm-data")!;
            const disk = makeCpmTestDisk(layout, makeFiles());
            expect(findCpmLayoutsForGeometry(disk.getGeometry()).map(preset => preset.id)).to.eql(
                ["mm-data", "mm-80-data", "mm-ext-system", "mm-ext-80-system"]);
        });

        it("refuses a layout whose sectors are numbered from another number", () => {
            const disk = makeCpmTestDisk(findCpmVerifiedLayoutById("mm-data")!, makeFiles());
            expect(makeCpmLayout(findCpmVerifiedLayoutById("holmes-system")!, disk.getGeometry()))
                .to.equal("the image's sectors are numbered from 1, not 0");
        });
    });

    describe("decodeFloppyFileSystem with a named layout", () => {
        it("reads a disk with an empty directory that detection doesn't recognize", () => {
            // A system format whose first sector looks like a directory isn't a blank Montezuma disk.
            const layout = findCpmVerifiedLayoutById("mm-system")!;
            const disk = makeCpmTestDisk(layout, [], {noBootSector: true});
            expect(decodeFloppyFileSystem(disk)).to.equal(undefined);

            const cpmLayout = makeCpmLayout(layout, disk.getGeometry());
            if (typeof cpmLayout === "string") {
                throw new Error(cpmLayout);
            }
            const cpm = decodeFloppyFileSystem(disk, false, {cpmLayout});
            expect(cpm).to.be.instanceOf(Cpm);
            expect(findCpmVerifiedLayout(cpm as Cpm)?.id).to.equal("mm-system");
        });

        it("reads a disk with the named layout even when detection finds something else", () => {
            // A two-sided disk named as one-sided reads as that, though detection says two sides.
            const doubleSided = findCpmVerifiedLayoutById("mm-ds-data")!;
            const disk = makeCpmTestDisk(doubleSided, makeFiles());
            expect((decodeFloppyFileSystem(disk) as Cpm).allocationSides).to.equal(2);

            const oneSide = findCpmVerifiedLayoutById("mm-data")!;
            const cpmLayout = makeCpmLayout(oneSide, disk.getGeometry());
            if (typeof cpmLayout === "string") {
                throw new Error(cpmLayout);
            }
            const cpm = decodeFloppyFileSystem(disk, false, {cpmLayout}) as Cpm;
            expect(cpm.allocationSides).to.equal(1);
            expect(decodeTrsdos(disk)).to.equal(undefined);
        });
    });

    describe("in the write gate's messages", () => {
        it("suggests the presets that an unsupported layout's image can hold", () => {
            const layout = findCpmVerifiedLayoutById("mm-system")!;
            const disk = makeCpmTestDisk(layout, makeFiles(), {banner: BANNER, cylinderCount: 35});
            const cpm = decodeCpm(disk, true)!;
            const gate = evaluateCpmWriteGate(cpm);
            const blocker = gate.blockers.find(b => b.kind === CpmWriteBlockerKind.UNSUPPORTED_LAYOUT)!;
            expect(blocker.message).to.contain("--cpm-format");
            expect(blocker.message).to.contain("mm-system");
            expect(blocker.message).to.not.contain("mm-data");
        });

        it("names the preset of each reading in a doubt, and the one in use", () => {
            const layout = findCpmVerifiedLayoutById("mm-system")!;
            // No banner and a short first file, so skew 2 and skew 4 read equally well.
            const files: CpmTestFile[] = [
                {name: "HELLO.TXT", contents: new TextEncoder().encode("Hello, world.\r\n")},
                {name: "DATA.BIN", contents: Uint8Array.from({length: 5000}, (_, i) => (i*7) & 0xFF)},
            ];
            const cpm = decodeCpm(makeCpmTestDisk(layout, files), true)!;
            const gate = evaluateCpmWriteGate(cpm);
            const blocker = gate.blockers.find(b => b.kind === CpmWriteBlockerKind.LAYOUT_DOUBT)!;
            expect(blocker.message).to.contain("skew 4 (mm-1.26-system)");
            expect(blocker.message).to.contain("The reading in use is mm-system; --cpm-format settles it.");
        });
    });

    it("describes a disk with its preset, when it has one", () => {
        const layout = findCpmVerifiedLayoutById("mm-system")!;
        const cpm = decodeCpm(makeCpmTestDisk(layout, makeFiles(), {banner: BANNER}), false)!;
        expect(describeCpmWithPreset(cpm)).to.equal("Montezuma Micro CP/M BIOS 2.32, Standard system (mm-system)");
    });
});
