import {describe, expect, it} from "vitest";
import {ToolError} from "../utils.js";
import {type DiskCommandSpec, type DiskOptionSpec} from "./DiskCommandParser.js";
import {diskCommandHelpLines, diskHelpLines} from "./DiskHelp.js";

const COMMANDS: DiskCommandSpec[] = [
    {
        name: "dir", aliases: ["ls"], usage: "[PATTERN...] [--system]", summary: "list the files",
        minArgs: 0, maxArgs: undefined,
        options: [{ name: "--system", valueName: undefined, description: "include system files" }],
    },
    {
        name: "free", aliases: [], usage: "", summary: "show the free space",
        minArgs: 0, maxArgs: 0, options: [],
    },
    {
        name: "rm", aliases: ["del", "kill"], usage: "NAME...", summary: "remove files",
        minArgs: 1, maxArgs: undefined,
        options: [
            { name: "--quiet", valueName: undefined, description: "say nothing" },
            { name: "--out-dir", shortName: "-d", valueName: "DIR", description: "where to go" },
        ],
    },
];

const GLOBAL_OPTIONS: DiskOptionSpec[] = [
    { name: "--force", valueName: undefined, description: "write anyway" },
];

describe("diskHelpLines", () => {
    it("lists every command once, without aliases, and the global options", () => {
        expect(diskHelpLines(COMMANDS, GLOBAL_OPTIONS)).to.eql([
            "Commands (separate several with a lone \":\"):",
            "  dir   list the files",
            "  free  show the free space",
            "  rm    remove files",
            "",
            "Options for the whole run, before the first command:",
            "  --force  write anyway",
            "",
            "\"help COMMAND\" describes a command and its options.",
        ]);
    });

    it("leaves out the options section when there are none", () => {
        expect(diskHelpLines(COMMANDS, [])).to.not.include("Options for the whole run, before the first command:");
    });
});

describe("diskCommandHelpLines", () => {
    it("describes a command with its options and aliases", () => {
        expect(diskCommandHelpLines("rm", COMMANDS)).to.eql([
            "rm NAME...",
            "  remove files",
            "Options:",
            "  --quiet            say nothing",
            "  -d, --out-dir DIR  where to go",
            "Also called: del, kill",
        ]);
    });

    it("finds a command by an alias, in any case", () => {
        expect(diskCommandHelpLines("KILL", COMMANDS)[0]).to.equal("rm NAME...");
    });

    it("leaves out what a command doesn't have", () => {
        expect(diskCommandHelpLines("free", COMMANDS)).to.eql(["free", "  show the free space"]);
    });

    it("rejects an unknown command", () => {
        expect(() => diskCommandHelpLines("bogus", COMMANDS)).to.throw(ToolError, /Unknown command "bogus"/);
    });
});
