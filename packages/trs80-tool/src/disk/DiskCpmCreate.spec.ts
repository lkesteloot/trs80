import fs from "fs";
import os from "os";
import path from "path";
import {fileURLToPath} from "url";
import {
    CPM_VERIFIED_LAYOUTS, Cpm, type CpmVerifiedLayout, decodeFloppyFileSystem, decodeTrs80File, type FloppyDisk,
    findCpmVerifiedLayout, findCpmVerifiedLayoutById, isFloppy, makeMontezumaTestDisk, SectorPosition,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {hasMontezumaBiosSystem} from "trs80-base";
import {
    getMontezumaNoSystemBootSector, getMontezumaSystemTracks, loadMontezumaSystemDisk, MONTEZUMA_SYSTEM_DISK_NAME,
} from "trs80-disk";
import {setColorLevel} from "../colors.js";
import {disk, diskJsonRun} from "./disk.js";
import {NODE_TEMPLATES} from "./NodeTemplates.js";
import {openDiskSession} from "./DiskFiles.js";

// The presets that can't be told from others without a banner (see FLOPPY_FORMATS.md, "Montezuma Micro CP/M 2.2").
const AMBIGUOUS_IDS = ["mm-1.26-system", "mm-1.26-ds-system", "mm-1.42-ds-system"];

/**
 * The shipped 2.32 system tracks of each of the four BIOS 2.x system presets, as hex, read from the template file itself.
 */
const SYSTEM_TRACKS_HEX: {[id: string]: string} = JSON.parse(fs.readFileSync(
    fileURLToPath(new URL("../../../trs80-disk/templates/montezuma-cpm-2.32-system-tracks.json", import.meta.url)),
    "utf8"));

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

describe("create cpm and format cpm", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        setColorLevel("off");
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-cpm-create-"));
        imagePathname = path.join(dir, "new.dmk");
        process.exitCode = undefined;
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
        process.exitCode = undefined;
    });

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
     * Make a host file with a pattern of bytes that differs along it, and return its pathname.
     */
    function makeHostFile(name: string, size: number): string {
        const pathname = path.join(dir, name);
        fs.writeFileSync(pathname, Uint8Array.from({length: size}, (_, i) => (i*7 + (i >> 8)*13 + 31) & 0xFF));
        return pathname;
    }

    /**
     * The image, decoded as a floppy.
     */
    function readFloppy(pathname = imagePathname): FloppyDisk {
        const floppy = decodeTrs80File(new Uint8Array(fs.readFileSync(pathname)), {filename: pathname});
        if (!isFloppy(floppy)) {
            throw new Error("Not a floppy");
        }
        return floppy;
    }

    /**
     * What a fresh open of the image, with no --cpm-format, reads it as: the CP/M file system, or undefined.
     */
    function detected(pathname = imagePathname): Cpm | undefined {
        const fileSystem = decodeFloppyFileSystem(readFloppy(pathname));
        return fileSystem instanceof Cpm ? fileSystem : undefined;
    }

    /**
     * The preset id of the layout that a fresh open of the image reads, or undefined if it reads none.
     */
    function detectedId(pathname = imagePathname): string | undefined {
        const cpm = detected(pathname);
        return cpm === undefined ? undefined : findCpmVerifiedLayout(cpm)?.id;
    }

    /**
     * The sector data of a position on the image.
     */
    function sectorBytes(cylinder: number, side: number, sector: number, floppy = readFloppy()): number[] {
        const found = floppy.readSector(SectorPosition.make(cylinder, side, sector));
        if (found === undefined) {
            throw new Error("No sector");
        }
        return Array.from(found.data);
    }

    /**
     * The BIOS 2.32 system disk's template, which "create cpm --system" copies.
     */
    function systemTemplate(): FloppyDisk {
        return loadMontezumaSystemDisk(NODE_TEMPLATES);
    }

    describe("templates", () => {
        it("has FORMAT's boot sector in both sector sizes, the larger starting with the smaller", () => {
            const small = getMontezumaNoSystemBootSector(NODE_TEMPLATES, 256)!;
            const large = getMontezumaNoSystemBootSector(NODE_TEMPLATES, 512)!;
            expect(small).to.have.length(256);
            expect(large).to.have.length(512);
            expect(Array.from(large.subarray(0, 256))).to.eql(Array.from(small));
            expect(Buffer.from(small).toString("latin1")).to.contain("There is NO CP/M on this disk!");
            expect(getMontezumaNoSystemBootSector(NODE_TEMPLATES, 128)).to.equal(undefined);
        });

        it("has system tracks for exactly the four BIOS 2.x system presets, each 18 sectors of 256 bytes on two tracks", () => {
            const ids = CPM_VERIFIED_LAYOUTS.filter(hasMontezumaBiosSystem).map(layout => layout.id);
            expect(Object.keys(SYSTEM_TRACKS_HEX)).to.eql(ids);
            for (const id of CPM_VERIFIED_LAYOUTS.map(layout => layout.id)) {
                const tracks = getMontezumaSystemTracks(NODE_TEMPLATES, id);
                if (ids.includes(id)) {
                    expect(Buffer.from(tracks!).toString("hex")).to.equal(SYSTEM_TRACKS_HEX[id]);
                } else {
                    expect(tracks).to.equal(undefined);
                }
            }
        });

        it("has the system disk as a writable one-sided disk of 22 files", () => {
            const template = systemTemplate();
            expect(template.getGeometry().sideCount).to.equal(1);
            expect(template.binary[0]).to.equal(0);
            expect((decodeFloppyFileSystem(template) as Cpm).getDirEntries(true)).to.have.length(22);
        });
    });

    describe("create cpm", () => {
        for (const layout of CPM_VERIFIED_LAYOUTS) {
            it(`makes ${layout.id}, and a 33,000-byte file saved on it reads back`, async () => {
                await runDisk("create", "cpm", "--cpm-format", layout.id);
                const blank = readFloppy();
                expect(blank.getGeometry().cylinderCount).to.equal(layout.cylinders);
                expect(blank.getGeometry().sideCount).to.equal(layout.sides);
                // Opened with its name, the new disk has the layout and no files.
                const named = openDiskSession(imagePathname, {cpmFormat: layout});
                expect((named.fileSystem as Cpm).getDirEntries(true)).to.have.length(0);
                if (!AMBIGUOUS_IDS.includes(layout.id)) {
                    expect(detectedId()).to.equal(layout.id);
                }

                // The layout counts as named, so writing works in the same run.
                const hostPathname = makeHostFile("BIG.DAT", 33000);
                await runDisk("--cpm-format", layout.id, "add", hostPathname);
                const reopened = openDiskSession(imagePathname, {cpmFormat: layout});
                const cpm = reopened.fileSystem as Cpm;
                const files = cpm.getDirEntries(true);
                expect(files.map(file => file.getFilename("."))).to.eql(["BIG.DAT"]);
                const bytes = cpm.readFile(files[0]);
                // CP/M files are whole records, padded with Ctrl-Z.
                const expected = new Uint8Array(fs.readFileSync(hostPathname));
                expect(bytes.length).to.equal(Math.ceil(expected.length/128)*128);
                expect(Array.from(bytes.subarray(0, expected.length))).to.eql(Array.from(expected));
            });
        }

        it("saves in the same run, with the layout named, and writes at once", async () => {
            const hostPathname = makeHostFile("HELLO.TXT", 1500);
            const lines = await runDisk("create", "cpm", "--cpm-format", "mm-ds-data", ":", "add", hostPathname);
            expect(lines.some(line => line.includes("mm-ds-data"))).to.equal(true);
            expect(lines[lines.length - 1]).to.equal("Saved " + imagePathname + ".");
            expect(detectedId()).to.equal("mm-ds-data");
        });

        it("accepts --cpm-format before the command, too", async () => {
            await runDisk("--cpm-format", "mm-80-data", "create", "cpm");
            expect(detectedId()).to.equal("mm-80-data");
        });

        describe("without a preset", () => {
            const cases: [string[], string][] = [
                [[], "mm-data"],
                [["--sides", "2"], "mm-ds-data"],
                [["--cylinders", "80"], "mm-80-data"],
                [["--sides", "2", "--cylinders", "80"], "mm-80-ds-data"],
                [["--cylinders", "40", "--sides", "1"], "mm-data"],
            ];
            for (const [words, id] of cases) {
                it(`${words.join(" ") || "no options"} makes ${id}`, async () => {
                    await runDisk("create", "cpm", ...words);
                    expect(detectedId()).to.equal(id);
                });
            }

            it("makes a data disk with no system tracks and shows the preset", async () => {
                const lines = await runDisk("create", "cpm");
                expect(lines[0]).to.contain("Montezuma Micro CP/M, Standard data (mm-data), 0 files");
                expect(lines.some(line => line.startsWith("System tracks:"))).to.equal(false);
            });
        });

        describe("system presets", () => {
            for (const layout of CPM_VERIFIED_LAYOUTS.filter(hasMontezumaBiosSystem)) {
                it(`${layout.id} shows the 2.32 banner with an empty directory, and has its own system tracks`, async () => {
                    const lines = await runDisk("create", "cpm", "--cpm-format", layout.id);
                    expect(lines.some(line => line.includes("the BIOS 2.32 system tracks, configured for this layout"))).to.equal(true);
                    const cpm = detected()!;
                    expect(cpm.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.32");
                    expect(findCpmVerifiedLayout(cpm)?.id).to.equal(layout.id);
                    expect(cpm.getDirEntries(true)).to.have.length(0);

                    // Each reserved track is the preset's entry in the template file, at the right place: the
                    // second is on cylinder 0 side 1 on a two-sided disk, and on cylinder 1 on a one-sided one.
                    const floppy = readFloppy();
                    const expected = Buffer.from(SYSTEM_TRACKS_HEX[layout.id], "hex");
                    expect(expected).to.have.length(2*18*256);
                    for (let track = 0; track < 2; track++) {
                        for (let sector = 1; sector <= 18; sector++) {
                            const actual = sectorBytes(track >> (layout.sides - 1), track & (layout.sides - 1), sector, floppy);
                            const offset = (track*18 + sector - 1)*256;
                            expect(actual).to.eql(Array.from(expected.subarray(offset, offset + 256)));
                        }
                    }
                    if (layout.sides === 2) {
                        // Nothing of the system is on cylinder 1.
                        expect(sectorBytes(1, 0, 3, floppy)).to.eql(new Array(256).fill(0xE5));
                    }

                    // No startup command, and the boot sector says whether the disk is two-sided.
                    expect(sectorBytes(0, 0, 3, floppy)[7]).to.equal(0);
                    expect(sectorBytes(0, 0, 1, floppy)[0xCE]).to.equal(layout.sides === 2 ? 1 : 0);
                });
            }

            for (const layout of CPM_VERIFIED_LAYOUTS.filter(l => l.reservedTracks > 0 && !hasMontezumaBiosSystem(l))) {
                it(`${layout.id} has FORMAT's boot sector and no banner`, async () => {
                    const lines = await runDisk("create", "cpm", "--cpm-format", layout.id);
                    expect(lines.some(line => line.includes("FORMAT's no-system boot sector"))).to.equal(true);
                    const cpm = detected()!;
                    expect(cpm.nameAndVersion).to.equal("Montezuma Micro CP/M");
                    const first = sectorBytes(0, 0, 1);
                    expect(first[0]).to.equal(0x3E);
                    expect(Buffer.from(first).toString("latin1")).to.contain("There is NO CP/M on this disk!");
                    // The rest of the reserved tracks is filler.
                    expect(sectorBytes(0, 0, 2)).to.eql(new Array(layout.sectorSize).fill(0xE5));
                });
            }

            it("warns, when saving, that a skew-4 preset needs --cpm-format to be read again", async () => {
                const lines = await runDisk("create", "cpm", "--cpm-format", "mm-1.26-system");
                expect(lines).to.contain("To read this disk again, give --cpm-format mm-1.26-system.");
                expect(detectedId()).to.equal("mm-system");
            });
        });

        describe("--system", () => {
            it("copies the whole 2.32 system disk, byte for byte", async () => {
                const lines = await runDisk("create", "cpm", "--system");
                expect(lines.some(line => line.includes("Copied from the Montezuma Micro CP/M 2.2 BIOS 2.32 system disk for the Model 4"))).to.equal(true);
                const cpm = detected()!;
                expect(cpm.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.32");
                expect(findCpmVerifiedLayout(cpm)?.id).to.equal("mm-system");
                expect(cpm.getDirEntries(true)).to.have.length(22);

                const template = NODE_TEMPLATES.systemDisk(MONTEZUMA_SYSTEM_DISK_NAME)!;
                expect(new Uint8Array(fs.readFileSync(imagePathname))).to.eql(template);
            });

            it("accepts the options that agree with it", async () => {
                await runDisk("create", "cpm", "--system", "--cpm-format", "mm-system", "--sides", "1", "--cylinders", "40");
                expect(detected()!.getDirEntries(true)).to.have.length(22);
            });

            it("refuses options that don't agree, and --system-from", async () => {
                await expect(runDisk("create", "cpm", "--system", "--cpm-format", "mm-ds-system"))
                    .rejects.toThrow(/create --system can't use --cpm-format mm-ds-system/);
                await expect(runDisk("create", "cpm", "--system", "--sides", "2"))
                    .rejects.toThrow(/mm-system has 1 side and 40 cylinders, so it can't be made with --sides 2/);
                await expect(runDisk("create", "cpm", "--system", "--cylinders", "80"))
                    .rejects.toThrow(/--cylinders 80/);
                const source = path.join(dir, "source.dmk");
                fs.writeFileSync(source, makeMontezumaTestDisk(preset("mm-system"), [], {banner: "Model 4 64K System CP/M 2.2 v2.30"}).binary);
                await expect(runDisk("create", "cpm", "--system", "--system-from", source))
                    .rejects.toThrow(/--system-from can't be used with --system/);
                expect(fs.existsSync(imagePathname)).to.equal(false);
            });
        });

        describe("--system-from", () => {
            /**
             * Write a system disk of a preset, with a banner and a mark in each reserved track, to a host file.
             */
            function writeSystemSource(id: string, banner: string, name = "source.dmk"): string {
                const layout = preset(id);
                const source = makeMontezumaTestDisk(layout, [], {banner});
                for (let track = 0; track < layout.reservedTracks; track++) {
                    const position = SectorPosition.make(Math.floor(track/layout.sides), track % layout.sides, 4);
                    const sector = source.readSector(position)!;
                    sector.data.fill(0x50 + track);
                    source.writeSector(position, sector);
                }
                const pathname = path.join(dir, name);
                fs.writeFileSync(pathname, source.binary);
                return pathname;
            }

            it("copies the system tracks of a disk of the same layout, so that its banner shows", async () => {
                const source = writeSystemSource("mm-80-system", "Model 4 64K System CP/M 2.2 v2.30");
                const lines = await runDisk("create", "cpm", "--cpm-format", "mm-80-system", "--system-from", source);
                expect(lines.some(line => line.includes("the system tracks of the disk given with --system-from"))).to.equal(true);
                const cpm = detected()!;
                expect(cpm.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.30");
                expect(findCpmVerifiedLayout(cpm)?.id).to.equal("mm-80-system");
                expect(sectorBytes(1, 0, 4)).to.eql(new Array(256).fill(0x51));
            });

            it("copies a two-sided disk's second system track from the same place", async () => {
                const source = writeSystemSource("mm-ds-system", "Model 4 64K System CP/M 2.2 v2.30");
                await runDisk("create", "cpm", "--cpm-format", "mm-ds-system", "--system-from", source);
                expect(sectorBytes(0, 0, 4)).to.eql(new Array(256).fill(0x50));
                expect(sectorBytes(0, 1, 4)).to.eql(new Array(256).fill(0x51));
                expect(sectorBytes(1, 0, 4)).to.eql(new Array(256).fill(0xE5));
            });

            it("refuses a disk of another layout, because its system holds that layout's drive configuration", async () => {
                const source = writeSystemSource("mm-system", "Model 4 64K System CP/M 2.2 v2.30");
                for (const id of ["mm-ds-system", "mm-80-system", "mm-ext-system"]) {
                    await expect(runDisk("create", "cpm", "--cpm-format", id, "--system-from", source))
                        .rejects.toThrow(new RegExp(`reads as mm-system, and its system is configured for ` +
                            `mm-system's drives, so it doesn't fit ${id}`));
                    expect(fs.existsSync(imagePathname)).to.equal(false);
                }
            });

            it("refuses a data preset, which has no system tracks, and a file that isn't there", async () => {
                const source = writeSystemSource("mm-system", "Model 4 64K System CP/M 2.2 v2.30");
                await expect(runDisk("create", "cpm", "--system-from", source))
                    .rejects.toThrow(/mm-data is a data format, with no system tracks to copy to/);
                await expect(runDisk("create", "cpm", "--cpm-format", "mm-system", "--system-from", path.join(dir, "none.dmk")))
                    .rejects.toThrow(/Can't read --system-from/);
            });
        });

        describe("option errors", () => {
            it("refuses options that don't apply to CP/M", async () => {
                await expect(runDisk("create", "cpm", "--name", "X")).rejects.toThrow(/--name doesn't apply to cpm disks/);
                await expect(runDisk("create", "cpm", "--date", "1984-01-01")).rejects.toThrow(/--date doesn't apply to cpm disks/);
                await expect(runDisk("create", "cpm", "--model", "4")).rejects.toThrow(/--model doesn't apply to cpm disks/);
                await expect(runDisk("create", "cpm", "--minimal")).rejects.toThrow(/--minimal doesn't apply to cpm disks/);
                await expect(runDisk("create", "cpm", "--density", "single")).rejects.toThrow(/double density, so --density can only be double/);
                // --keep-system is format's.
                await expect(runDisk("create", "cpm", "--keep-system")).rejects.toThrow(/unknown option '--keep-system'/);
            });

            it("accepts double density", async () => {
                await runDisk("create", "cpm", "--density", "double");
                expect(detectedId()).to.equal("mm-data");
            });

            it("needs --sides and --cylinders to agree with the preset", async () => {
                await expect(runDisk("create", "cpm", "--cpm-format", "mm-data", "--sides", "2"))
                    .rejects.toThrow(/mm-data has 1 side and 40 cylinders, so it can't be made with --sides 2/);
                await expect(runDisk("create", "cpm", "--cpm-format", "mm-ds-data", "--cylinders", "80"))
                    .rejects.toThrow(/--cylinders 80/);
                await expect(runDisk("create", "cpm", "--cylinders", "35"))
                    .rejects.toThrow(/no CP\/M data format with 35 cylinders/);
            });

            it("lists the presets for an unknown one", async () => {
                await expect(runDisk("create", "cpm", "--cpm-format", "mm-nothing"))
                    .rejects.toThrow(/Unknown CP\/M format "mm-nothing"[\s\S]*mm-1\.42-ds-system/);
            });

            it("refuses cpm options for other DOSes and for hard disks", async () => {
                await expect(runDisk("create", "ldos-5.3", "--cpm-format", "mm-data"))
                    .rejects.toThrow(/--cpm-format only applies to cpm disks, not this DOS/);
                await expect(runDisk("create", "trsdos-2.3", "--system-from", "x"))
                    .rejects.toThrow(/--system-from only applies to cpm disks/);
                await expect(captureLog(() => disk([path.join(dir, "new.hdv"), "create", "cpm"])))
                    .rejects.toThrow(/CP\/M hard disks aren't supported yet/);
                await expect(captureLog(() => disk([path.join(dir, "new.hdv"), "create", "ldos-5.3", "--system-from", "x"])))
                    .rejects.toThrow(/--system-from only applies to cpm disks, not hard disks/);
            });

            it("lists cpm among the DOSes", async () => {
                await expect(runDisk("create", "nothing")).rejects.toThrow(/cpm {2,}Montezuma Micro CP\/M 2\.2 \(data or system disk; see --cpm-format\)/);
                await expect(runDisk("create")).rejects.toThrow(/Montezuma Micro CP\/M 2\.2/);
            });

            it("needs --force to replace a disk, and keeps it otherwise", async () => {
                await runDisk("create", "cpm");
                const before = fs.readFileSync(imagePathname);
                await expect(runDisk("create", "cpm", "--cylinders", "80")).rejects.toThrow(/already has a disk; use --force/);
                expect(fs.readFileSync(imagePathname)).to.eql(before);
                await runDisk("create", "cpm", "--cylinders", "80", "--force");
                expect(detectedId()).to.equal("mm-80-data");
            });

            it("refuses a file name for another kind of image", async () => {
                await expect(captureLog(() => disk([path.join(dir, "new.jv1"), "create", "cpm"])))
                    .rejects.toThrow(/create makes DMK images/);
            });
        });

        describe("--json", () => {
            it("adds the preset's id to the result", async () => {
                const {json, exitCode} = await diskJsonRun(imagePathname, ["create", "cpm", "--cpm-format", "mm-ext-ds-system"], false);
                expect(exitCode).to.equal(0);
                const result = json.commands[0].result as {description: string, replaced: boolean, cpmFormat: string};
                expect(result.cpmFormat).to.equal("mm-ext-ds-system");
                expect(result.replaced).to.equal(false);
                expect(result.description).to.contain("mm-ext-ds-system");
            });

            it("describes the system disk for --system", async () => {
                const {json} = await diskJsonRun(imagePathname, ["create", "cpm", "--system"], false);
                const result = json.commands[0].result as {cpmFormat: string, systemDisk: {description: string, removed: string[]}};
                expect(result.cpmFormat).to.equal("mm-system");
                expect(result.systemDisk.description).to.contain("BIOS 2.32");
                expect(result.systemDisk.removed).to.eql([]);
            });
        });
    });

    describe("format cpm", () => {
        /**
         * Write a test disk of a preset, with a banner, to the image file.
         */
        function writeTestDisk(id: string, banner: string, files: {name: string, contents: Uint8Array}[] = []): void {
            fs.writeFileSync(imagePathname, makeMontezumaTestDisk(preset(id), files, {banner}).binary);
        }

        const SOME_FILE = {name: "A.TXT", contents: new TextEncoder().encode("Hello.\r\n\x1A")};

        it("keeps the disk's own preset by default, and erases the files with --force", async () => {
            writeTestDisk("mm-80-ds-data", "", [SOME_FILE]);
            await expect(runDisk("format", "cpm")).rejects.toThrow(/format would erase 1 file from the disk; use --force/);
            const lines = await runDisk("format", "cpm", "--force");
            expect(lines[0]).to.contain("Replaced the disk in memory with a blank Montezuma Micro CP/M disk (mm-80-ds-data)");
            expect(detectedId()).to.equal("mm-80-ds-data");
            expect(detected()!.getDirEntries(true)).to.have.length(0);
        });

        it("formats a CP/M disk again with no DOS", async () => {
            writeTestDisk("mm-ds-data", "", [SOME_FILE]);
            const lines = await runDisk("format", "--force");
            expect(lines[0]).to.contain("(mm-ds-data)");
            expect(detected()!.getDirEntries(true)).to.have.length(0);
        });

        it("formats as another preset with --cpm-format, which also settles the disk to write", async () => {
            writeTestDisk("mm-data", "", [SOME_FILE]);
            await runDisk("format", "cpm", "--cpm-format", "mm-ds-data", "--force");
            expect(detectedId()).to.equal("mm-ds-data");
            expect(readFloppy().getGeometry().sideCount).to.equal(2);
        });

        it("takes sides and cylinders for a data format", async () => {
            writeTestDisk("mm-data", "", []);
            await runDisk("format", "cpm", "--cylinders", "80");
            expect(detectedId()).to.equal("mm-80-data");
        });

        it("formats a disk of another file system as the data format of its own sides and cylinders", async () => {
            await runDisk("create", "ldos-5.3", "--model", "3", "--sides", "2");
            await runDisk("format", "cpm");
            expect(detectedId()).to.equal("mm-ds-data");
            // A shape with no data preset (35 cylinders) says so.
            fs.rmSync(imagePathname);
            await runDisk("create", "trsdos-2.3");
            await expect(runDisk("format", "cpm", "--force")).rejects.toThrow(/no CP\/M data format with 35 cylinders/);
        });

        it("refuses --sides and --cylinders that disagree with --cpm-format", async () => {
            writeTestDisk("mm-data", "", []);
            await expect(runDisk("format", "cpm", "--cpm-format", "mm-data", "--sides", "2"))
                .rejects.toThrow(/mm-data has 1 side and 40 cylinders/);
        });

        it("refuses options that don't apply to CP/M", async () => {
            writeTestDisk("mm-data", "", []);
            await expect(runDisk("format", "cpm", "--name", "X")).rejects.toThrow(/--name doesn't apply to cpm disks/);
            await expect(runDisk("format", "cpm", "--model", "3")).rejects.toThrow(/--model doesn't apply to cpm disks/);
            await expect(runDisk("format", "cpm", "--date", "1984-01-01")).rejects.toThrow(/--date doesn't apply to cpm disks/);
            await expect(runDisk("format", "cpm", "--density", "single")).rejects.toThrow(/--density can only be double/);
            await expect(runDisk("format", "cpm", "--keep-system", "--system-from", imagePathname))
                .rejects.toThrow(/--keep-system and --system-from both say where/);
        });

        describe("system tracks", () => {
            it("gives a system preset the 2.32 system tracks, in place of a banner that was there", async () => {
                writeTestDisk("mm-system", "Model 4 60K System CP/M 2.2 v2.25");
                expect(detected()!.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.25");
                await runDisk("format", "cpm");
                expect(detected()!.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.32");
            });

            it("--keep-system keeps the banner, and erasing them without it takes the banner away", async () => {
                // An extended system disk: its reserved tracks aren't the 2.32 system's, so FORMAT's boot sector replaces them.
                writeTestDisk("mm-ext-system", "Model 4 60K System CP/M 2.2 v2.25");
                expect(detected()!.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.25");
                const imageBefore = fs.readFileSync(imagePathname);

                await runDisk("format", "cpm", "--keep-system");
                expect(detected()!.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.25");
                for (let sector = 1; sector <= 10; sector++) {
                    expect(sectorBytes(0, 0, sector))
                        .to.eql(sectorBytes(0, 0, sector, decodeFloppy(imageBefore)));
                    expect(sectorBytes(1, 0, sector))
                        .to.eql(sectorBytes(1, 0, sector, decodeFloppy(imageBefore)));
                }

                writeTestDisk("mm-ext-system", "Model 4 60K System CP/M 2.2 v2.25");
                await runDisk("format", "cpm");
                expect(detected()!.nameAndVersion).to.equal("Montezuma Micro CP/M");
                expect(Buffer.from(sectorBytes(0, 0, 1)).toString("latin1")).to.contain("There is NO CP/M");
            });

            it("--keep-system on a BIOS 2.32 system disk keeps its files out but its tracks in", async () => {
                await runDisk("create", "cpm", "--system");
                await expect(runDisk("format", "cpm", "--keep-system")).rejects.toThrow(/format would erase 22 files/);
                await runDisk("format", "cpm", "--keep-system", "--force");
                const cpm = detected()!;
                expect(cpm.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.32");
                expect(cpm.getDirEntries(true)).to.have.length(0);
                // The BIOS tracks are the template's.
                const template = systemTemplate();
                expect(sectorBytes(0, 0, 5)).to.eql(sectorBytes(0, 0, 5, template));
                expect(sectorBytes(1, 0, 5)).to.eql(sectorBytes(1, 0, 5, template));
            });

            it("--keep-system refuses a new layout other than the disk's own, because the system holds the drive configuration", async () => {
                await runDisk("create", "cpm", "--system");
                await expect(runDisk("format", "cpm", "--keep-system", "--cpm-format", "mm-ds-system", "--force"))
                    .rejects.toThrow(/reads as mm-system, and its system is configured for mm-system's drives, so it doesn't fit mm-ds-system/);
                await expect(runDisk("format", "cpm", "--keep-system", "--cpm-format", "mm-ext-system", "--force"))
                    .rejects.toThrow(/configured for mm-system's drives, so it doesn't fit mm-ext-system/);
            });

            it("--keep-system on a two-sided system disk keeps its tracks in place", async () => {
                await runDisk("create", "cpm", "--cpm-format", "mm-ds-system");
                const before = [sectorBytes(0, 0, 5), sectorBytes(0, 1, 5)];
                await runDisk("format", "cpm", "--keep-system");
                expect(detectedId()).to.equal("mm-ds-system");
                expect([sectorBytes(0, 0, 5), sectorBytes(0, 1, 5)]).to.eql(before);
            });

            it("--keep-system has nothing to keep on a data format, or on a disk that isn't CP/M", async () => {
                await runDisk("create", "cpm", "--system");
                await expect(runDisk("format", "cpm", "--keep-system", "--cpm-format", "mm-data", "--force"))
                    .rejects.toThrow(/mm-data is a data format, with no system tracks, so there's nothing for --keep-system to keep/);
                fs.rmSync(imagePathname);
                await runDisk("create", "ldos-5.3");
                await expect(runDisk("format", "cpm", "--keep-system", "--cylinders", "40", "--force"))
                    .rejects.toThrow(/--keep-system needs a disk that reads as one of the CP\/M presets/);
            });

            it("--system-from replaces the tracks, as for create", async () => {
                writeTestDisk("mm-system", "Model 4 60K System CP/M 2.2 v2.25");
                const source = path.join(dir, "source.dmk");
                fs.writeFileSync(source, makeMontezumaTestDisk(preset("mm-system"), [], {banner: "Model 4 64K System CP/M 2.2 v2.31"}).binary);
                await runDisk("format", "cpm", "--system-from", source);
                expect(detected()!.nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.31");
            });
        });

        it("refuses a hard disk", async () => {
            const hdv = path.join(dir, "new.hdv");
            await captureLog(() => disk([hdv, "create", "ldos-5.3"]));
            await expect(captureLog(() => disk([hdv, "format", "cpm"])))
                .rejects.toThrow(/CP\/M hard disks aren't supported yet/);
            await expect(captureLog(() => disk([hdv, "format", "--keep-system"])))
                .rejects.toThrow(/--keep-system only applies to cpm disks, not hard disks/);
        });

        it("reports the preset in JSON", async () => {
            writeTestDisk("mm-data", "", []);
            const {json, exitCode} = await diskJsonRun(imagePathname, ["format", "cpm", "--cpm-format", "mm-80-data"], false);
            expect(exitCode).to.equal(0);
            const result = json.commands[0].result as {cpmFormat: string, replaced: boolean};
            expect(result.cpmFormat).to.equal("mm-80-data");
            expect(result.replaced).to.equal(true);
        });
    });
});

/**
 * Decode image bytes as a floppy.
 */
function decodeFloppy(binary: Uint8Array): FloppyDisk {
    const floppy = decodeTrs80File(new Uint8Array(binary), {filename: "x.dmk"});
    if (!isFloppy(floppy)) {
        throw new Error("Not a floppy");
    }
    return floppy;
}
