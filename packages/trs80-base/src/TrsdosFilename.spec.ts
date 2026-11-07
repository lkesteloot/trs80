import {describe, expect, it} from "vitest";
import {
    parseTrsdosFilename,
    trsdosFilenameFromHost,
    trsdosFilenameToRaw,
    trsdosFilenameToString,
} from "./TrsdosFilename.js";

/**
 * Parse a name and show it as TRSDOS does, or return the error.
 */
function parse(text: string): string {
    const filename = parseTrsdosFilename(text);
    return typeof filename === "string" ? filename : trsdosFilenameToString(filename);
}

/**
 * Convert a host name and show the result as TRSDOS does, with "*" after it if it was changed, or
 * return the error.
 */
function fromHost(hostFilename: string): string {
    const conversion = trsdosFilenameFromHost(hostFilename);
    return typeof conversion === "string" ? conversion :
        trsdosFilenameToString(conversion.filename) + (conversion.changed ? "*" : "");
}

describe("parseTrsdosFilename", () => {
    it("accepts either separator and any case", () => {
        expect(parse("HELLO/BAS")).to.equal("HELLO/BAS");
        expect(parse("hello.bas")).to.equal("HELLO/BAS");
        expect(parse("Prog1")).to.equal("PROG1");
        expect(parse("A/B")).to.equal("A/B");
        expect(parse("ABCDEFGH/XYZ")).to.equal("ABCDEFGH/XYZ");
    });

    it("rejects what TRSDOS can't hold", () => {
        expect(parse("HELLOWORLD/BAS")).to.match(/name is longer than 8 characters/);
        expect(parse("HELLO/BASIC")).to.match(/extension is longer than 3 characters/);
        expect(parse("1HELLO/BAS")).to.match(/name must be letters and digits, starting with a letter/);
        expect(parse("HELLO/1AS")).to.match(/extension must be letters and digits/);
        expect(parse("HEL-LO/BAS")).to.match(/name must be letters and digits/);
        expect(parse("/BAS")).to.match(/no name before the extension/);
        expect(parse("")).to.match(/no name before the extension/);
        expect(parse("A/B/C")).to.match(/more than one/);
        expect(parse("HELLO/BAS.SECRET")).to.match(/more than one/);
        expect(parse("HELLO/BAS:1")).to.match(/drive number/);
    });

    it("pads the name and extension for the directory", () => {
        const filename = parseTrsdosFilename("hello.bas");
        expect(typeof filename === "string" ? filename : trsdosFilenameToRaw(filename)).to.equal("HELLO   BAS");
        const bare = parseTrsdosFilename("x");
        expect(typeof bare === "string" ? bare : trsdosFilenameToRaw(bare)).to.equal("X          ");
    });
});

describe("trsdosFilenameFromHost", () => {
    it("upper-cases a name that fits", () => {
        expect(fromHost("hello.bas")).to.equal("HELLO/BAS");
        expect(fromHost("README")).to.equal("README");
    });

    it("drops what TRSDOS can't hold, and says so", () => {
        expect(fromHost("hello-world.bas")).to.equal("HELLOWOR/BAS*");
        expect(fromHost("program.basic")).to.equal("PROGRAM/BAS*");
        expect(fromHost("my file.txt")).to.equal("MYFILE/TXT*");
        expect(fromHost("archive.tar.gz")).to.equal("ARCHIVET/GZ*");
    });

    it("leaves off an extension that starts with a digit", () => {
        expect(fromHost("game.3bn")).to.equal("GAME*");
    });

    it("treats a leading period as part of the name", () => {
        expect(fromHost(".profile")).to.equal("PROFILE*");
    });

    it("refuses a name that doesn't start with a letter", () => {
        expect(fromHost("1984.bas")).to.match(/start with a letter/);
        expect(fromHost("---.bas")).to.match(/start with a letter/);
    });
});
