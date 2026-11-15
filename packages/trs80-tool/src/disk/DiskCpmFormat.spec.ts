import fs from "fs";
import os from "os";
import path from "path";
import {
    CPM_VERIFIED_LAYOUTS, Cpm, type CpmTestFile, type CpmTestDiskOptions, type CpmVerifiedLayout,
    findCpmVerifiedLayoutById, makeMontezumaTestDisk,
} from "trs80-base";
import {DiskError, resolveCpmFormat} from "trs80-disk";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {setColorLevel} from "../colors.js";
import {dir as dirCommand} from "../dir.js";
import {extract} from "../extract.js";
import {info} from "../info.js";
import {handleRequest} from "../mcp.js";
import {disk} from "./disk.js";
import {parseDosName} from "./DiskHelp.js";
import {openDiskSession, saveAndReport} from "./DiskFiles.js";

// A banner that names a BIOS that didn't use skew 4, so that disks with it have no skew doubt.
const BANNER = "Model 4 64K System CP/M 2.2 v2.32";
const ENCODER = new TextEncoder();

/**
 * The preset with an id, which must exist.
 */
function preset(id: string): CpmVerifiedLayout {
    const layout = findCpmVerifiedLayoutById(id);
    if (layout === undefined) {
        throw new Error("No preset " + id);
    }
    return layout;
}

/**
 * Bytes that differ along the file, so that a misplaced record shows.
 */
function pattern(length: number, seed: number): Uint8Array {
    return Uint8Array.from({length}, (_, i) => (i*31 + seed + (i >> 7)*5) & 0xFF);
}

/**
 * Files that fit every layout.
 */
function standardFiles(): CpmTestFile[] {
    return [
        {name: "A.TXT", contents: ENCODER.encode("Hello, world.\r\nSecond line.\r\n\x1A")},
        {name: "B.BIN", contents: pattern(3000, 2)},
        {name: "D.DAT", contents: pattern(5000, 3)},
    ];
}

/**
 * Files in which skew 2 and skew 4 read equally well, so that the layout is in doubt without a banner.
 */
function doubtfulFiles(): CpmTestFile[] {
    return [
        {name: "A.TXT", contents: ENCODER.encode("Hello, world.\r\n")},
        {name: "B.BIN", contents: pattern(5000, 3)},
    ];
}

describe("--cpm-format", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        setColorLevel("off");
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-cpm-format-"));
        imagePathname = path.join(dir, "test.dmk");
        process.exitCode = undefined;
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
        process.exitCode = undefined;
    });

    /**
     * Write a test disk to the image file, with a banner if the layout has reserved tracks.
     */
    function makeImage(layout: CpmVerifiedLayout, files: CpmTestFile[] = standardFiles(),
                       options: CpmTestDiskOptions = {}): void {
        const banner = layout.reservedTracks > 0 ? BANNER : "";
        fs.writeFileSync(imagePathname, makeMontezumaTestDisk(layout, files, {banner, ...options}).binary);
    }

    /**
     * Run a function while console.log is captured, and return what it printed.
     */
    async function captureLog(f: () => Promise<void> | void): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await f();
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run the "disk" command on the image with these words after the image, and return what it printed.
     */
    function runDisk(...words: string[]): Promise<string[]> {
        return captureLog(() => disk([imagePathname, ...words]));
    }

    /**
     * The names of the files on the image file, as a fresh open (with these options) reads them.
     */
    function fileNames(cpmFormat?: CpmVerifiedLayout): string[] {
        const fileSystem = openDiskSession(imagePathname, {cpmFormat}).fileSystem;
        return fileSystem === undefined ? [] : fileSystem.getDirEntries(true).map(file => file.getFilename("."));
    }

    describe("opening a session", () => {
        for (const layout of CPM_VERIFIED_LAYOUTS) {
            it(`opens a ${layout.id} disk with ${layout.id}, with no warning`, () => {
                makeImage(layout);
                const warnings: string[] = [];
                const session = openDiskSession(imagePathname, {cpmFormat: layout, warn: m => warnings.push(m)});
                expect(session.fileSystem).to.be.instanceOf(Cpm);
                expect(session.fileSystem!.getDirEntries(true).map(file => file.getFilename(".")))
                    .to.eql(["A.TXT", "B.BIN", "D.DAT"]);
                expect(session.describe()).to.contain(`${layout.name} (${layout.id}), 3 files`);
                expect(warnings).to.eql([]);
            });
        }

        it("fails, naming the preset and the reason, when the image can't hold it", () => {
            makeImage(preset("mm-system"));
            expect(() => openDiskSession(imagePathname, {cpmFormat: preset("mm-data")}))
                .to.throw(DiskError, "--cpm-format mm-data doesn't fit this disk: the image's sectors are 256 bytes, not 512.");
            expect(() => openDiskSession(imagePathname, {cpmFormat: preset("mm-ds-system")}))
                .to.throw(DiskError, "--cpm-format mm-ds-system doesn't fit this disk: the image has only one side.");
        });

        it("warns, once, when the disk reads as something else without it", () => {
            makeImage(preset("mm-ds-data"));
            const warnings: string[] = [];
            const session = openDiskSession(imagePathname, {cpmFormat: preset("mm-data"), warn: m => warnings.push(m)});
            expect((session.fileSystem as Cpm).allocationSides).to.equal(1);
            expect(warnings).to.have.length(1);
            expect(warnings[0]).to.match(/^--cpm-format mm-data overrides what the disk reads as without it: .*\(mm-ds-data\)\.$/);

            // Further reads don't repeat it.
            session.describe();
            session.getReadOnlyReason();
            expect(warnings).to.have.length(1);
        });

        it("says nothing when the disk reads the same apart from a spare cylinder", () => {
            makeImage(preset("mm-system"), standardFiles(), {cylinderCount: 41});
            const warnings: string[] = [];
            openDiskSession(imagePathname, {cpmFormat: preset("mm-system"), warn: m => warnings.push(m)});
            expect(warnings).to.eql([]);
        });

        it("refuses --dos with it", () => {
            makeImage(preset("mm-system"));
            expect(() => openDiskSession(imagePathname, {cpmFormat: preset("mm-system"), ruleSet: parseDosName("ldos-5")}))
                .to.throw(/--dos only applies to TRSDOS-family disks/);
        });

        it("resolves a name in any case, and lists the presets for an unknown one", () => {
            expect(resolveCpmFormat("MM-System").id).to.equal("mm-system");
            let message = "";
            try {
                resolveCpmFormat("mm-nothing");
            } catch (e: any) {
                message = e.message;
            }
            expect(message).to.contain("Unknown CP/M format \"mm-nothing\" for --cpm-format. The choices are:");
            expect(message).to.contain("mm-1.42-ds-system");
            expect(message).to.contain("18 × 256");
        });
    });

    describe("writing", () => {
        it("refuses a layout in doubt without the flag, and writes with it and no --force", async () => {
            makeImage(preset("mm-system"), doubtfulFiles(), {banner: ""});
            await expect(runDisk("kill", "A.TXT")).rejects.toThrow(/equally well/);
            expect(fileNames()).to.eql(["A.TXT", "B.BIN"]);

            const lines = await runDisk("--cpm-format", "mm-system", "kill", "A.TXT");
            expect(lines).to.eql(["Removed A.TXT.", "Saved " + imagePathname + "."]);
            expect(fileNames(preset("mm-system"))).to.eql(["B.BIN"]);
        });

        it("names the presets in the refusal, and says --cpm-format settles it", async () => {
            makeImage(preset("mm-system"), doubtfulFiles(), {banner: ""});
            await expect(runDisk("kill", "A.TXT")).rejects.toThrow(/mm-1\.26-system.*mm-system; --cpm-format settles it/);
        });

        it("saves a disk that detection wouldn't find again, with a warning that names the flag", async () => {
            // A bad entry outweighs the one good entry that's left, so a fresh open finds no CP/M at all.
            const bytes = new Uint8Array(32);
            bytes.set(Array.from("BAD     TXT", c => c.charCodeAt(0)), 1);
            bytes[12] = 0xFF;
            makeImage(preset("mm-system"), standardFiles(), {rawEntries: [{slot: 20, bytes}]});

            // Without the flag the save is refused (as in step 1), and the image is untouched.
            const before = fs.readFileSync(imagePathname);
            const session = openDiskSession(imagePathname, {force: true, warn: () => {}});
            session.changeCpm(0, writer => {
                for (const file of writer.getFiles().filter(file => file.getFilename(".") !== "D.DAT")) {
                    writer.deleteFile(file);
                }
            });
            expect(session.getSaveBlocker()).to.match(/wouldn't be recognized/);
            expect(session.getSaveWarning()).to.equal(undefined);
            expect(() => saveAndReport(session, false)).to.throw(/wouldn't be recognized/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);

            // With the flag it's saved, and says how to read it again.
            const named = openDiskSession(imagePathname, {cpmFormat: preset("mm-system"), force: true, warn: () => {}});
            named.changeCpm(0, writer => {
                for (const file of writer.getFiles().filter(file => file.getFilename(".") !== "D.DAT")) {
                    writer.deleteFile(file);
                }
            });
            expect(named.getSaveBlocker()).to.equal(undefined);
            expect(named.getSaveWarning()).to.equal("To read this disk again, give --cpm-format mm-system.");
            const lines = await captureLog(() => {
                saveAndReport(named, false);
            });
            expect(lines).to.eql(["To read this disk again, give --cpm-format mm-system.", "Saved " + imagePathname + "."]);
            expect(fileNames(preset("mm-system"))).to.eql(["D.DAT"]);
        });

        it("says nothing about reading again when the saved disk is recognized", async () => {
            makeImage(preset("mm-system"));
            const lines = await runDisk("--cpm-format", "mm-system", "kill", "A.TXT");
            expect(lines).to.eql(["Removed A.TXT.", "Saved " + imagePathname + "."]);
        });

        it("saves an empty directory, with a warning when it wouldn't be recognized", async () => {
            // With no boot sector the disk reads as a data format's directory, so a system format isn't recognized.
            makeImage(preset("mm-system"), standardFiles(), {noBootSector: true});
            const lines = await runDisk("--cpm-format", "mm-system", "kill", "A.TXT", "B.BIN", "D.DAT");
            expect(lines.slice(-2)).to.eql(["To read this disk again, give --cpm-format mm-system.",
                "Saved " + imagePathname + "."]);
            expect(fileNames(preset("mm-system"))).to.eql([]);
        });

        it("forgets the named layout when a new floppy replaces the disk", () => {
            makeImage(preset("mm-system"));
            const session = openDiskSession(imagePathname, {cpmFormat: preset("mm-system")});
            session.setFloppy(makeMontezumaTestDisk(preset("mm-system"), standardFiles(), {banner: BANNER}));
            expect(session.getSaveWarning()).to.equal(undefined);
        });
    });

    describe("the command line", () => {
        it("lists an empty disk with it, which isn't recognized without it", async () => {
            // No boot sector: track 0's first sector looks like a directory, which a system format's never does, and
            // no data format has 18 sectors of 256 bytes.
            makeImage(preset("mm-system"), [], {noBootSector: true});
            await expect(runDisk("dir")).rejects.toThrow(/Can't find a DOS directory/);
            const lines = await runDisk("--cpm-format", "mm-system", "dir");
            expect(lines.join("\n")).to.not.contain("Can't find");
        });

        it("fails on an unknown name, listing the presets", async () => {
            makeImage(preset("mm-system"));
            await expect(runDisk("--cpm-format", "nope", "dir")).rejects.toThrow(/Unknown CP\/M format "nope"/);
        });

        it("shows the preset in the description", async () => {
            makeImage(preset("mm-system"));
            const lines = await runDisk("info");
            expect(lines.join("\n")).to.contain("Montezuma Micro CP/M BIOS 2.32, Standard system (mm-system)");
        });

        it("lists the presets as a table in help cpm-format", async () => {
            makeImage(preset("mm-system"));
            const lines = (await runDisk("help", "cpm-format")).join("\n");
            expect(lines).to.contain("mm-ext-80-ds-system");
            expect(lines).to.match(/mm-system +Standard system +1 +40 +18 × 256 +170K/);
        });

        it("applies to the top-level dir, info, and extract", async () => {
            makeImage(preset("mm-data"), []);
            const empty = await captureLog(() => dirCommand([imagePathname], false, false, false, preset("mm-data")));
            expect(empty).to.eql(["No files"]);

            makeImage(preset("mm-ds-data"));
            const listing = await captureLog(() => dirCommand([imagePathname], false, false, false, preset("mm-ds-data")));
            expect(listing.join("\n")).to.contain("A.TXT");
            const json = await captureLog(() => dirCommand([imagePathname], false, false, true, preset("mm-ds-data")));
            expect(JSON.parse(json[0]).infiles[0].files.map((file: any) => file.name)).to.eql(["A.TXT", "B.BIN", "D.DAT"]);

            // An image that can't hold the layout is an error for that file.
            makeImage(preset("mm-system"));
            const failure = await captureLog(() => dirCommand([imagePathname], false, false, false, preset("mm-data")));
            expect(failure.join("\n")).to.contain("--cpm-format mm-data doesn't fit this disk");

            makeImage(preset("mm-ds-data"));
            const infoLines = await captureLog(() => info([imagePathname], false, false, false, preset("mm-ds-data")));
            expect(infoLines.join("\n")).to.contain("Standard DS data (mm-ds-data) with 3 files");

            const outDir = path.join(dir, "out");
            extract(imagePathname, outDir, [], false, false, false, false, false, preset("mm-ds-data"));
            expect(fs.readdirSync(outDir).sort()).to.eql(["A.TXT", "B.BIN", "D.DAT"]);

            const emptyOut = path.join(dir, "out2");
            makeImage(preset("mm-data"), []);
            extract(imagePathname, emptyOut, [], false, false, false, false, false, preset("mm-data"));
            expect(fs.readdirSync(emptyOut)).to.eql([]);
        });
    });

    describe("MCP", () => {
        /**
         * Call a tool through the request handler.
         */
        async function call(name: string, args: object): Promise<{text: string, isError: boolean}> {
            const response = await handleRequest({jsonrpc: "2.0", id: 7, method: "tools/call",
                params: {name, arguments: args}}) as any;
            return {text: response.result.content[0].text, isError: response.result.isError === true};
        }

        it("takes cpmFormat in dir, info, disk, and disk_write", async () => {
            makeImage(preset("mm-system"), [], {noBootSector: true});
            const withoutFlag = JSON.parse((await call("dir", {images: [imagePathname]})).text);
            expect(withoutFlag.infiles[0].errorCode).to.not.equal(undefined);
            const dirResult = await call("dir", {images: [imagePathname], cpmFormat: "mm-system"});
            expect(dirResult.isError).to.equal(false);
            expect(JSON.parse(dirResult.text).infiles[0].files).to.eql([]);

            const infoJson = JSON.parse((await call("info", {images: [imagePathname], cpmFormat: "mm-system"})).text);
            expect(infoJson.infiles[0].floppy.os.name).to.contain("Montezuma Micro CP/M");

            const diskResult = await call("disk", {image: imagePathname, cpmFormat: "mm-system", words: ["dir"]});
            expect(diskResult.isError).to.equal(false);

            makeImage(preset("mm-system"), doubtfulFiles(), {banner: ""});
            const refused = await call("disk_write", {image: imagePathname, words: ["kill", "A.TXT"]});
            expect(refused.isError).to.equal(true);
            const written = await call("disk_write", {image: imagePathname, cpmFormat: "mm-system", words: ["kill", "A.TXT"]});
            expect(written.isError).to.equal(false);
            expect(JSON.parse(written.text).saved).to.equal(imagePathname);
            expect(fileNames(preset("mm-system"))).to.eql(["B.BIN"]);

            const unknown = await call("dir", {images: [imagePathname], cpmFormat: "nope"});
            expect(unknown.isError).to.equal(true);
            expect(unknown.text).to.contain("Unknown CP/M format \"nope\"");
        });
    });
});
