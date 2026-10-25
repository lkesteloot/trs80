import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {expandInputPattern, expandInputPatterns, fileNameMatchesPattern, ToolError} from "./utils.js";

describe("fileNameMatchesPattern", () => {
    /**
     * Whether a name on a disk without directories matches the pattern.
     */
    function flat(filename: string, pattern: string): boolean {
        return fileNameMatchesPattern(filename, false, pattern);
    }

    /**
     * Whether a path on a disk with directories matches the pattern.
     */
    function nested(filename: string, pattern: string): boolean {
        return fileNameMatchesPattern(filename, true, pattern);
    }

    it("matches a literal name", () => {
        expect(flat("HELLO.BAS", "HELLO.BAS")).to.be.true;
        expect(flat("HELLO.BAS", "HELLO.BA")).to.be.false;
        expect(flat("HELLO.BAS", "ELLO.BAS")).to.be.false;
    });

    it("ignores case", () => {
        expect(flat("HELLO.BAS", "hello.bas")).to.be.true;
        expect(flat("hello.bas", "HELLO.BAS")).to.be.true;
        expect(flat("HELLO.BAS", "*.bas")).to.be.true;
    });

    it("matches any run of characters with *", () => {
        expect(flat("HELLO.BAS", "*.BAS")).to.be.true;
        expect(flat("HELLO.BAS", "H*")).to.be.true;
        expect(flat("HELLO.BAS", "*")).to.be.true;
        expect(flat("HELLO.BAS", "HELLO*.BAS")).to.be.true;
        expect(flat("HELLO.BAS", "*.CMD")).to.be.false;
        expect(flat("HELLO", "*.*")).to.be.false;
    });

    it("matches one character with ?", () => {
        expect(flat("HELLO.BAS", "HELL?.BAS")).to.be.true;
        expect(flat("HELLO.BAS", "?????.???")).to.be.true;
        expect(flat("HELLO.BAS", "HELLO?.BAS")).to.be.false;
        expect(flat("HELLO.BAS", "????.BAS")).to.be.false;
    });

    it("treats regular expression characters literally", () => {
        expect(flat("HELLOXBAS", "HELLO.BAS")).to.be.false;
        expect(flat("A+B", "A+B")).to.be.true;
        expect(flat("AAB", "A+B")).to.be.false;
        expect(flat("(X)", "(X)")).to.be.true;
        expect(flat("X", "(X)")).to.be.false;
        expect(flat("$A^", "$A^")).to.be.true;
        expect(flat("A|B", "A|B")).to.be.true;
        expect(flat("A", "A|B")).to.be.false;
        expect(flat("A\\B", "A\\B")).to.be.true;
        expect(flat("A-B", "A-B")).to.be.true;
    });

    it("treats brackets and braces literally", () => {
        expect(flat("[A].BAS", "[A].BAS")).to.be.true;
        expect(flat("A.BAS", "[A].BAS")).to.be.false;
        expect(flat("{A,B}", "{A,B}")).to.be.true;
        expect(flat("A", "{A,B}")).to.be.false;
    });

    it("treats a / as a . on a disk without directories", () => {
        expect(flat("HELLO.BAS", "HELLO/BAS")).to.be.true;
        expect(flat("HELLO.BAS", "hello/*")).to.be.true;
        expect(flat("HELLO.BAS", "*/BAS")).to.be.true;
    });

    it("matches a pattern without / against the last part of a path", () => {
        expect(nested("HARDA/BASIC.CMD", "*.CMD")).to.be.true;
        expect(nested("HARDA/BASIC.CMD", "BASIC.CMD")).to.be.true;
        expect(nested("usr/lib/x/BASIC.CMD", "basic.*")).to.be.true;
        expect(nested("HARDA/BASIC.CMD", "HARDA*")).to.be.false;
        expect(nested("BASIC.CMD", "*.CMD")).to.be.true;
    });

    it("matches a pattern with / against the whole path", () => {
        expect(nested("HARDA/BASIC.CMD", "HARDA/*.CMD")).to.be.true;
        expect(nested("HARDA/BASIC.CMD", "harda/basic.cmd")).to.be.true;
        expect(nested("HARDA/BASIC.CMD", "HARDB/*.CMD")).to.be.false;
        expect(nested("HARDA/BASIC.CMD", "ARDA/*.CMD")).to.be.false;
        expect(nested("HARDA/BASIC.CMD", "*/BASIC.CMD")).to.be.true;
    });

    it("doesn't let * or ? cross a /", () => {
        expect(nested("usr/lib/FOO", "usr/*")).to.be.false;
        expect(nested("usr/lib/FOO", "usr/*/FOO")).to.be.true;
        expect(nested("usr/FOO", "usr?FOO")).to.be.false;
    });

    it("lets ** cross a /", () => {
        expect(nested("usr/lib/FOO", "usr/**")).to.be.true;
        expect(nested("usr/FOO", "usr/**")).to.be.true;
        expect(nested("usr/lib/x/FOO.C", "**/*.C")).to.be.true;
        expect(nested("usr/lib/x/FOO.C", "usr/**/FOO.C")).to.be.true;
        expect(nested("usr/lib/x/FOO.C", "bin/**")).to.be.false;
    });
});

describe("expandInputPatterns", () => {
    let dir = "";

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-test-"));
        for (const name of ["b.dmk", "a.dmk", "c.dsk", "Zork [a].dsk", "sub/d.dmk"]) {
            const pathname = path.join(dir, name);
            fs.mkdirSync(path.dirname(pathname), { recursive: true });
            fs.writeFileSync(pathname, "");
        }
        // A directory whose name matches a pattern, which must not be returned.
        fs.mkdirSync(path.join(dir, "e.dmk"));
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Make an absolute path in the test directory, with "/" separators so that it's a valid pattern.
     */
    function p(name: string): string {
        return path.join(dir, name).replace(/\\/g, "/");
    }

    /**
     * Expand the patterns and return the results relative to the test directory.
     */
    function expand(...names: string[]): string[] {
        return expandInputPatterns(names.map(p)).map(file => path.relative(dir, file).replace(/\\/g, "/"));
    }

    it("expands a pattern to the sorted regular files it matches", () => {
        expect(expand("*.dmk")).to.eql(["a.dmk", "b.dmk"]);
        expect(expand("?.d*")).to.eql(["a.dmk", "b.dmk", "c.dsk"]);
        expect(expand("**/*.dmk")).to.eql(["a.dmk", "b.dmk", "sub/d.dmk"]);
    });

    it("keeps the order of the arguments", () => {
        expect(expand("c.dsk", "*.dmk")).to.eql(["c.dsk", "a.dmk", "b.dmk"]);
    });

    it("uses an existing file's name as it is, even with glob characters", () => {
        expect(expand("Zork [a].dsk")).to.eql(["Zork [a].dsk"]);
    });

    it("passes through a missing file without glob characters", () => {
        expect(expand("missing.dmk")).to.eql(["missing.dmk"]);
    });

    it("throws if a pattern matches nothing", () => {
        expect(() => expand("*.zzz")).to.throw(ToolError, "No files match");
    });

    it("requires exactly one match for a single file", () => {
        expect(path.relative(dir, expandInputPattern(p("c.*")))).to.equal("c.dsk");
        expect(() => expandInputPattern(p("*.dmk"))).to.throw(ToolError, "matches 2 files");
    });
});
