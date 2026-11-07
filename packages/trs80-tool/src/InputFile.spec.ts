import {describe, expect, it} from "vitest";
import {decodeTrs80File} from "trs80-base";
import {InputFile, selectInputFiles} from "./InputFile.js";

/**
 * An empty input file with the given name, which may have directories.
 */
class TestInputFile extends InputFile {
    private readonly withDirectories: boolean;
    private readonly system: boolean;

    /**
     * @param filename the name of the file in its container.
     * @param withDirectories whether a "/" in the name separates directories.
     * @param system whether the file is a system file.
     */
    constructor(filename: string, withDirectories = false, system = false) {
        const binary = new Uint8Array(0);
        super(filename, binary, decodeTrs80File(binary, { filename }));
        this.withDirectories = withDirectories;
        this.system = system;
    }

    /**
     * Report whether this file was made as a system file.
     */
    public override isSystemFile(): boolean {
        return this.system;
    }

    /**
     * Report whether this file was made with directories.
     */
    public override hasDirectories(): boolean {
        return this.withDirectories;
    }
}

/**
 * Select from the files and return the names of the selected ones and the unmatched pattern.
 */
function select(inFiles: InputFile[], patterns: string[]): { names: string[], unmatchedPattern: string | undefined } {
    const { selected, unmatchedPattern } = selectInputFiles(inFiles, patterns);
    return { names: selected.map(inFile => inFile.filename), unmatchedPattern };
}

describe("selectInputFiles", () => {
    const floppy = ["HELLO.BAS", "GAME.CMD", "README.TXT", "BYE.BAS"].map(name => new TestInputFile(name));

    it("selects every file when there are no patterns", () => {
        expect(select(floppy, [])).to.eql({
            names: ["HELLO.BAS", "GAME.CMD", "README.TXT", "BYE.BAS"],
            unmatchedPattern: undefined,
        });
    });

    it("selects the files that match any pattern, in their original order", () => {
        expect(select(floppy, ["*.bas", "game/cmd"])).to.eql({
            names: ["HELLO.BAS", "GAME.CMD", "BYE.BAS"],
            unmatchedPattern: undefined,
        });
    });

    it("selects a file only once when several patterns match it", () => {
        expect(select(floppy, ["HELLO.*", "*.BAS"]).names).to.eql(["HELLO.BAS", "BYE.BAS"]);
    });

    it("reports the first pattern that matches nothing", () => {
        expect(select(floppy, ["*.BAS", "*.ASM", "*.DAT"])).to.eql({
            names: ["HELLO.BAS", "BYE.BAS"],
            unmatchedPattern: "*.ASM",
        });
    });

    it("reports a pattern as unmatched when no file is given", () => {
        expect(select([], ["*"]).unmatchedPattern).to.equal("*");
    });

    it("uses each file's own idea of directories", () => {
        const hardDisk = ["HARDA/BASIC.CMD", "HARDB/BASIC.CMD", "HARDB/EDIT.CMD"]
            .map(name => new TestInputFile(name, true));
        expect(select(hardDisk, ["basic.cmd"]).names).to.eql(["HARDA/BASIC.CMD", "HARDB/BASIC.CMD"]);
        expect(select(hardDisk, ["HARDB/*"]).names).to.eql(["HARDB/BASIC.CMD", "HARDB/EDIT.CMD"]);
    });
});

describe("selectInputFiles with system files", () => {
    const floppy = [
        new TestInputFile("HELLO.BAS"),
        new TestInputFile("BOOT.SYS", false, true),
        new TestInputFile("KERNEL.SYS", false, true),
    ];

    /**
     * The names of the selected files, or the unmatched pattern and whether only system files would match it.
     */
    function selectNoSystemWildcards(patterns: string[]): unknown {
        const { selected, unmatchedPattern, unmatchedOnlySystem } = selectInputFiles(floppy, patterns, false);
        return unmatchedPattern === undefined ? selected.map(f => f.filename) : { unmatchedPattern, unmatchedOnlySystem };
    }

    it("lets wildcards match system files by default", () => {
        expect(select(floppy, ["*"]).names).to.eql(["HELLO.BAS", "BOOT.SYS", "KERNEL.SYS"]);
        expect(select(floppy, []).names).to.eql(["HELLO.BAS", "BOOT.SYS", "KERNEL.SYS"]);
    });

    it("selects a system file by its name but never by a wildcard", () => {
        expect(selectNoSystemWildcards(["kernel/sys"])).to.eql(["KERNEL.SYS"]);
        expect(selectNoSystemWildcards(["*"])).to.eql(["HELLO.BAS"]);
        expect(selectNoSystemWildcards([])).to.eql(["HELLO.BAS"]);
        expect(selectNoSystemWildcards(["*", "BOOT/SYS"])).to.eql(["HELLO.BAS", "BOOT.SYS"]);
        expect(selectNoSystemWildcards(["K?RNEL.SYS"])).to.eql({ unmatchedPattern: "K?RNEL.SYS", unmatchedOnlySystem: true });
    });

    it("says only a system file would have matched a wildcard, not a missing name", () => {
        expect(selectNoSystemWildcards(["*.SYS"])).to.eql({ unmatchedPattern: "*.SYS", unmatchedOnlySystem: true });
        expect(selectNoSystemWildcards(["*.DAT"])).to.eql({ unmatchedPattern: "*.DAT", unmatchedOnlySystem: false });
        expect(selectNoSystemWildcards(["NOSUCH.SYS"])).to.eql({ unmatchedPattern: "NOSUCH.SYS", unmatchedOnlySystem: false });
    });
});
