import {describe, expect, it} from "vitest";
import {decodeTrs80File} from "trs80-base";
import {InputFile, selectInputFiles} from "./InputFile.js";

/**
 * An empty input file with the given name, which may have directories.
 */
class TestInputFile extends InputFile {
    private readonly withDirectories: boolean;

    /**
     * @param filename the name of the file in its container.
     * @param withDirectories whether a "/" in the name separates directories.
     */
    constructor(filename: string, withDirectories = false) {
        const binary = new Uint8Array(0);
        super(filename, binary, decodeTrs80File(binary, { filename }));
        this.withDirectories = withDirectories;
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
