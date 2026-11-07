import {describe, expect, it, vi} from "vitest";
import {DiskCommandSpec, DiskOptionSpec, parseDiskCommandLine, ParsedDiskCommandLine, splitCommandLine} from "./DiskCommandParser.js";
import {ToolError} from "../utils.js";

const GLOBAL_OPTIONS: DiskOptionSpec[] = [
    { name: "--force", valueName: undefined, description: "Overwrite without asking." },
    { name: "--output", shortName: "-o", valueName: "FILE", description: "Write the result here." },
];

const COMMANDS: DiskCommandSpec[] = [
    {
        name: "dir", aliases: ["ls"], args: "[PATTERN]", summary: "List files.",
        options: [{ name: "--system", valueName: undefined, description: "Include system files." }],
    },
    {
        name: "rm", aliases: ["del", "kill"], args: "<NAME...>", summary: "Remove files.", options: [],
    },
    {
        name: "mv", aliases: [], args: "<OLD> <NEW>", summary: "Rename a file.", options: [],
    },
    {
        name: "free", aliases: [], args: "", summary: "Show free space.", options: [],
    },
    {
        name: "get", aliases: [], args: "<NAME...>", summary: "Extract files.",
        options: [{ name: "--out-dir", shortName: "-d", valueName: "DIR", description: "Directory to write to." }],
    },
];

/**
 * Parse words with the fake specs of this test.
 */
function parse(...words: string[]): ParsedDiskCommandLine {
    return parseDiskCommandLine(words, GLOBAL_OPTIONS, COMMANDS);
}

describe("parseDiskCommandLine", () => {
    it("parses a single command", () => {
        const result = parse("dir");
        expect(result.commands.length).to.eql(1);
        expect(result.commands[0].spec.name).to.eql("dir");
        expect(result.commands[0].name).to.eql("dir");
        expect(result.commands[0].args).to.eql([]);
    });

    it("returns no commands for no words", () => {
        const result = parse();
        expect(result.commands).to.eql([]);
        expect(result.globalOptions.has("--force")).to.be.false;
    });

    it("returns no commands for only global options", () => {
        const result = parse("--force", "-o", "out.dmk");
        expect(result.commands).to.eql([]);
        expect(result.globalOptions.has("--force")).to.be.true;
        expect(result.globalOptions.getString("--output")).to.eql("out.dmk");
    });

    it("parses global options before the command", () => {
        const result = parse("--force", "--output=x.dmk", "dir");
        expect(result.globalOptions.has("--force")).to.be.true;
        expect(result.globalOptions.getString("--output")).to.eql("x.dmk");
        expect(result.commands.length).to.eql(1);
    });

    it("lets the last repeated option win", () => {
        const result = parse("-o", "a", "--output", "b");
        expect(result.globalOptions.getString("--output")).to.eql("b");
    });

    it("rejects an unknown global option", () => {
        expect(() => parse("--bogus", "dir")).to.throw(ToolError, /^Unknown option '--bogus'/);
    });

    it("does not treat a global option after the command as global", () => {
        expect(() => parse("dir", "--force")).to.throw(ToolError, /^dir: unknown option '--force'/);
    });

    it("matches names and aliases ignoring case", () => {
        for (const word of ["dir", "DIR", "Dir", "ls", "LS"]) {
            expect(parse(word).commands[0].spec.name).to.eql("dir");
        }
        const del = parse("Del", "A").commands[0];
        expect(del.spec.name).to.eql("rm");
        expect(del.name).to.eql("Del");
    });

    it("rejects an unknown command", () => {
        expect(() => parse("frobnicate")).to.throw(ToolError, /Unknown command "frobnicate"/);
        expect(() => parse("dir", ":", "nope")).to.throw(ToolError, /Unknown command "nope"/);
    });

    it("treats a lone dash as an unknown command name", () => {
        expect(() => parse("-")).to.throw(ToolError, /Unknown command "-"/);
    });

    it("parses flags and value options", () => {
        const dir = parse("dir", "--system").commands[0];
        expect(dir.options.has("--system")).to.be.true;
        expect(dir.args).to.eql([]);

        const get = parse("get", "A", "--out-dir", "out").commands[0];
        expect(get.options.getString("--out-dir")).to.eql("out");
        expect(get.args).to.eql(["A"]);
    });

    it("accepts --name=value and short names", () => {
        expect(parse("get", "A", "--out-dir=out dir").commands[0].options.getString("--out-dir")).to.eql("out dir");
        expect(parse("get", "A", "-d", "out").commands[0].options.getString("--out-dir")).to.eql("out");
        expect(parse("get", "A", "--out-dir=").commands[0].options.getString("--out-dir")).to.eql("");
    });

    it("accepts a value that starts with a dash", () => {
        expect(parse("get", "A", "-d", "-x").commands[0].options.getString("--out-dir")).to.eql("-x");
    });

    it("allows options before, between, and after arguments", () => {
        const before = parse("get", "-d", "out", "A", "B").commands[0];
        const between = parse("get", "A", "-d", "out", "B").commands[0];
        const after = parse("get", "A", "B", "-d", "out").commands[0];
        for (const get of [before, between, after]) {
            expect(get.args).to.eql(["A", "B"]);
            expect(get.options.getString("--out-dir")).to.eql("out");
        }
    });

    it("lets the last repeated command option win", () => {
        const get = parse("get", "A", "-d", "one", "--out-dir=two").commands[0];
        expect(get.options.getString("--out-dir")).to.eql("two");
    });

    it("rejects a value option at the end with no value", () => {
        expect(() => parse("get", "A", "--out-dir")).to.throw(ToolError, /option '-d, --out-dir <DIR>' argument missing/);
        expect(() => parse("get", "A", "-d")).to.throw(ToolError, /option '-d, --out-dir <DIR>' argument missing/);
        expect(() => parse("-o")).to.throw(ToolError, /Option '-o, --output <FILE>' argument missing/);
        // The colon isn't a value.
        expect(() => parse("get", "A", "-d", ":", "dir")).to.throw(ToolError, /argument missing/);
    });

    it("rejects a value on a flag", () => {
        expect(() => parse("dir", "--system=yes")).to.throw(ToolError, /unknown option '--system=yes'/);
        expect(() => parse("--force=1")).to.throw(ToolError, /^Unknown option '--force=1'/);
    });

    it("rejects an unknown command option, naming option and command", () => {
        expect(() => parse("rm", "A", "--wat")).to.throw(ToolError, /^rm: unknown option '--wat'/);
        expect(() => parse("DEL", "A", "--wat=3")).to.throw(ToolError, /^rm: unknown option '--wat=3'/);
    });

    it("ends option parsing at --", () => {
        const rm = parse("rm", "--", "-WEIRD", "--system").commands[0];
        expect(rm.args).to.eql(["-WEIRD", "--system"]);

        const dir = parse("dir", "--system", "--", "-X").commands[0];
        expect(dir.options.has("--system")).to.be.true;
        expect(dir.args).to.eql(["-X"]);
    });

    it("lets a colon after -- still separate commands", () => {
        const result = parse("rm", "--", "-A", ":", "dir", "--system");
        expect(result.commands.length).to.eql(2);
        expect(result.commands[0].args).to.eql(["-A"]);
        expect(result.commands[1].spec.name).to.eql("dir");
        expect(result.commands[1].options.has("--system")).to.be.true;
    });

    it("restores option parsing after a colon", () => {
        const result = parse("rm", "--", "A", ":", "get", "B", "-d", "out");
        expect(result.commands[1].options.getString("--out-dir")).to.eql("out");
    });

    it("treats a lone dash as an argument", () => {
        const get = parse("get", "-", "-d", "-").commands[0];
        expect(get.args).to.eql(["-"]);
        expect(get.options.getString("--out-dir")).to.eql("-");
    });

    it("keeps colons inside words", () => {
        const result = parse("rm", "HELLO/BAS:1", "games.dmk:ZAXXON/CMD", "A:", ":B");
        expect(result.commands.length).to.eql(1);
        expect(result.commands[0].args).to.eql(["HELLO/BAS:1", "games.dmk:ZAXXON/CMD", "A:", ":B"]);
    });

    it("parses several commands", () => {
        const result = parse("--force", "get", "A", "-d", "out", ":", "Rm", "B", "C", ":", "free", ":", "mv", "X", "Y");
        expect(result.globalOptions.has("--force")).to.be.true;
        expect(result.commands.map(c => c.spec.name)).to.eql(["get", "rm", "free", "mv"]);
        expect(result.commands[0].options.getString("--out-dir")).to.eql("out");
        expect(result.commands[1].args).to.eql(["B", "C"]);
        expect(result.commands[3].args).to.eql(["X", "Y"]);
    });

    it("keeps options separate between commands", () => {
        const result = parse("dir", "--system", ":", "dir");
        expect(result.commands[0].options.has("--system")).to.be.true;
        expect(result.commands[1].options.has("--system")).to.be.false;
    });

    it("checks the minimum argument count", () => {
        expect(() => parse("rm")).to.throw(ToolError, /^rm: missing required argument 'NAME'$/);
        expect(() => parse("kill")).to.throw(ToolError, /^rm: missing required argument 'NAME'/);
        expect(() => parse("mv", "A")).to.throw(ToolError, /^mv: missing required argument 'NEW'/);
        expect(() => parse("get", "-d", "out")).to.throw(ToolError, /^get: missing required argument 'NAME'/);
    });

    it("checks the maximum argument count", () => {
        expect(() => parse("free", "A")).to.throw(ToolError, /^free: too many arguments\. Expected 0 arguments but got 1: A\.$/);
        expect(() => parse("mv", "A", "B", "C")).to.throw(ToolError, /^mv: too many arguments\. Expected 2 arguments but got 3/);
        expect(() => parse("LS", "A", "B")).to.throw(ToolError, /^dir: too many arguments\. Expected 1 argument but got 2/);
    });

    it("counts arguments per command", () => {
        expect(() => parse("rm", "A", ":", "rm")).to.throw(ToolError, /^rm: missing required argument/);
        expect(() => parse("mv", "A", ":", "B")).to.throw(ToolError, /^mv: missing required argument/);
    });

    it("throws a ToolError, and does not exit, for any syntax error", () => {
        const exit = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exited"); }) as never);
        const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            for (const words of [["rm", "--bogus"], ["rm"], ["free", "A"], ["--bogus"], ["-o"], ["bogus"]]) {
                expect(() => parse(...words)).to.throw(ToolError);
            }
            expect(exit).not.toHaveBeenCalled();
            expect(write).not.toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            write.mockRestore();
        }
    });

    it("skips empty commands", () => {
        expect(parse(":").commands).to.eql([]);
        expect(parse(":", "dir").commands.map(c => c.spec.name)).to.eql(["dir"]);
        expect(parse("dir", ":").commands.map(c => c.spec.name)).to.eql(["dir"]);
        expect(parse("dir", ":", ":", "free").commands.map(c => c.spec.name)).to.eql(["dir", "free"]);
        expect(parse("--force", ":", "dir").commands.map(c => c.spec.name)).to.eql(["dir"]);
    });
});

describe("splitCommandLine", () => {
    it("splits on whitespace", () => {
        expect(splitCommandLine("dir")).to.eql(["dir"]);
        expect(splitCommandLine("  add  a.bas \t b.bas  ")).to.eql(["add", "a.bas", "b.bas"]);
    });

    it("returns nothing for blank lines", () => {
        expect(splitCommandLine("")).to.eql([]);
        expect(splitCommandLine("   \t ")).to.eql([]);
    });

    it("groups text in double quotes", () => {
        expect(splitCommandLine("add \"my file.bas\" x")).to.eql(["add", "my file.bas", "x"]);
    });

    it("groups text in single quotes", () => {
        expect(splitCommandLine("add 'my file.bas' x")).to.eql(["add", "my file.bas", "x"]);
        expect(splitCommandLine("'a\\b \"c\"'")).to.eql(["a\\b \"c\""]);
    });

    it("joins quoted text to adjacent text", () => {
        expect(splitCommandLine("--auto=\"BASIC RUN\"")).to.eql(["--auto=BASIC RUN"]);
        expect(splitCommandLine("a\"b c\"d'e f'g")).to.eql(["ab cde fg"]);
    });

    it("makes an empty word from empty quotes", () => {
        expect(splitCommandLine("a \"\" b")).to.eql(["a", "", "b"]);
        expect(splitCommandLine("''")).to.eql([""]);
    });

    it("handles escapes inside double quotes", () => {
        expect(splitCommandLine("\"RUN\\\"MENU\\\"\"")).to.eql(["RUN\"MENU\""]);
        expect(splitCommandLine("\"a\\\\b\"")).to.eql(["a\\b"]);
        // Other backslashes are literal.
        expect(splitCommandLine("\"a\\nb\"")).to.eql(["a\\nb"]);
    });

    it("handles escapes outside quotes", () => {
        expect(splitCommandLine("a\\ b c")).to.eql(["a b", "c"]);
        expect(splitCommandLine("\\\"x\\'")).to.eql(["\"x'"]);
        expect(splitCommandLine("\\#x")).to.eql(["#x"]);
        expect(splitCommandLine("a\\\\b")).to.eql(["a\\b"]);
    });

    it("keeps a trailing backslash", () => {
        expect(splitCommandLine("a\\")).to.eql(["a\\"]);
    });

    it("strips comments that start a word", () => {
        expect(splitCommandLine("# just a comment")).to.eql([]);
        expect(splitCommandLine("   #x")).to.eql([]);
        expect(splitCommandLine("dir # list \"unterminated")).to.eql(["dir"]);
        expect(splitCommandLine("dir #")).to.eql(["dir"]);
    });

    it("does not treat # inside a word or quotes as a comment", () => {
        expect(splitCommandLine("HELLO#2 x")).to.eql(["HELLO#2", "x"]);
        expect(splitCommandLine("\"#a\" '#b'")).to.eql(["#a", "#b"]);
        expect(splitCommandLine("\"\"#a")).to.eql(["#a"]);
    });

    it("leaves colons as words", () => {
        expect(splitCommandLine("rm A : dir")).to.eql(["rm", "A", ":", "dir"]);
        expect(splitCommandLine("rm HELLO/BAS:1 : dir")).to.eql(["rm", "HELLO/BAS:1", ":", "dir"]);
        // Quotes don't protect a colon from separating commands.
        expect(splitCommandLine("rm \":\"")).to.eql(["rm", ":"]);
    });

    it("rejects unterminated quotes", () => {
        expect(() => splitCommandLine("add \"abc")).to.throw(ToolError, /Unterminated double quote/);
        expect(() => splitCommandLine("add 'abc")).to.throw(ToolError, /Unterminated single quote/);
        expect(() => splitCommandLine("\"abc\\\"")).to.throw(ToolError, /Unterminated double quote/);
    });

    it("feeds the parser", () => {
        const words = splitCommandLine("get 'MY FILE' --out-dir=\"my dir\" : rm A  # done");
        const result = parse(...words);
        expect(result.commands[0].args).to.eql(["MY FILE"]);
        expect(result.commands[0].options.getString("--out-dir")).to.eql("my dir");
        expect(result.commands[1].args).to.eql(["A"]);
    });
});
