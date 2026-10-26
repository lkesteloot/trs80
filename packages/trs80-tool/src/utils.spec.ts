import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {
    expandInputPattern, expandInputPatterns, fileNameMatchesPattern, ToolError, wordsAfterSubcommand,
    writeFileAtomically,
} from "./utils.js";

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

describe("wordsAfterSubcommand", () => {
    const withValues = ["--color", "--trace", "--log-file"];

    /**
     * Find the words after "disk" with the usual program options.
     */
    function after(...argv: string[]): string[] | undefined {
        return wordsAfterSubcommand(argv, "disk", withValues);
    }

    it("returns the words after the subcommand unchanged", () => {
        expect(after("disk", "d.dmk", "dir")).to.eql(["d.dmk", "dir"]);
        expect(after("disk", "d.dmk", "rm", "--", "--color")).to.eql(["d.dmk", "rm", "--", "--color"]);
        expect(after("disk", "d.dmk", "--help", "--no-pager")).to.eql(["d.dmk", "--help", "--no-pager"]);
        expect(after("disk")).to.eql([]);
    });

    it("skips program options before the subcommand", () => {
        expect(after("--color", "off", "disk", "d.dmk", "dir")).to.eql(["d.dmk", "dir"]);
        expect(after("--color=16", "--no-pager", "disk", "x")).to.eql(["x"]);
        expect(after("--trace", "disk", "--log-file", "a.log", "disk", "d.dmk")).to.eql(["d.dmk"]);
    });

    it("only recognizes the first word that isn't an option", () => {
        expect(after("dir", "disk")).to.equal(undefined);
        expect(after("--color", "disk")).to.equal(undefined);
        expect(after("--no-pager", "disk", "disk")).to.eql(["disk"]);
    });

    it("returns undefined without a subcommand", () => {
        expect(after()).to.equal(undefined);
        expect(after("--no-pager")).to.equal(undefined);
    });
});

describe("writeFileAtomically", () => {
    let dir = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-atomic-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("writes the content of a new file", () => {
        const pathname = path.join(dir, "new.bin");
        writeFileAtomically(pathname, new Uint8Array([1, 2, 3]));
        expect(Array.from(fs.readFileSync(pathname))).to.eql([1, 2, 3]);
        expect(fs.readdirSync(dir)).to.eql(["new.bin"]);
    });

    it("replaces an existing file, keeping its mode", () => {
        const pathname = path.join(dir, "old.bin");
        fs.writeFileSync(pathname, "old content that is longer");
        fs.chmodSync(pathname, 0o640);
        writeFileAtomically(pathname, new Uint8Array([9, 8]));
        expect(Array.from(fs.readFileSync(pathname))).to.eql([9, 8]);
        // Windows doesn't have these permission bits.
        if (process.platform !== "win32") {
            expect(fs.statSync(pathname).mode & 0o777).to.equal(0o640);
        }
        expect(fs.readdirSync(dir)).to.eql(["old.bin"]);
    });

    it("leaves no temporary file and keeps the target when the rename fails", () => {
        // A directory can't be replaced by a file.
        const pathname = path.join(dir, "target");
        fs.mkdirSync(pathname);
        fs.writeFileSync(path.join(pathname, "inside"), "x");
        expect(() => writeFileAtomically(pathname, new Uint8Array([1]))).to.throw();
        expect(fs.readdirSync(dir)).to.eql(["target"]);
        expect(fs.readFileSync(path.join(pathname, "inside"), "utf8")).to.equal("x");
    });

    it("fails without leaving anything when the directory doesn't exist", () => {
        const pathname = path.join(dir, "missing", "file.bin");
        expect(() => writeFileAtomically(pathname, new Uint8Array([1]))).to.throw();
        expect(fs.readdirSync(dir)).to.eql([]);
    });
});
