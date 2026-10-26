import {describe, expect, it} from "vitest";
import {parseTrsdosRuleSet, TRSDOS_RULE_SETS, TrsdosRuleSet, trsdosRuleSetAliases} from "trs80-base";
import {ToolError} from "../utils.js";
import {type DiskCommandSpec, type DiskOptionSpec} from "./DiskCommandParser.js";
import {diskCommandHelpLines, diskHelpLines, dosHelpLines, parseDosName} from "./DiskHelp.js";

const COMMANDS: DiskCommandSpec[] = [
    {
        name: "dir", aliases: ["ls"], usage: "[PATTERN...] [--system]", summary: "list the files",
        minArgs: 0, maxArgs: Infinity,
        options: [{ name: "--system", valueName: undefined, description: "include system files" }],
    },
    {
        name: "free", aliases: [], usage: "", summary: "show the free space",
        minArgs: 0, maxArgs: 0, options: [],
    },
    {
        name: "rm", aliases: ["del", "kill"], usage: "NAME...", summary: "remove files",
        minArgs: 1, maxArgs: Infinity,
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
            "\"help COMMAND\" describes a command and its options; \"help dos\" lists the names for --dos.",
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

describe("help dos", () => {
    it("lists every rule set with its DOS and aliases", () => {
        expect(diskCommandHelpLines("dos", COMMANDS)).to.eql([
            "--dos NAME says which DOS's rules to write a TRSDOS-family disk by, for a disk that doesn't say which " +
            "DOS wrote it or to override what it says. The names are:",
            "  trsdos-2    TRSDOS 2.x",
            "  trsdos-1.3  TRSDOS 1.3",
            "  ldos-5      LDOS 5",
            "  trsdos-6    TRSDOS 6 and LS-DOS 6 (also ldos-6, ls-dos-6)",
            "  dosplus     DOSPLUS 3",
        ]);
        expect(dosHelpLines()).to.eql(diskCommandHelpLines("DOS", COMMANDS));
    });

    it("gives way to a command named dos", () => {
        const commands = [...COMMANDS, {
            name: "dos", aliases: [], usage: "", summary: "do the DOS thing", minArgs: 0, maxArgs: 0, options: [],
        }];
        expect(diskCommandHelpLines("dos", commands)).to.eql(["dos", "  do the DOS thing"]);
    });

    it("lists aliases that parse to their rule sets", () => {
        for (const ruleSet of TRSDOS_RULE_SETS) {
            for (const alias of trsdosRuleSetAliases(ruleSet)) {
                expect(parseTrsdosRuleSet(alias)).to.equal(ruleSet);
            }
        }
    });
});

describe("parseDosName", () => {
    it("accepts names and aliases in any case", () => {
        expect(parseDosName("ldos-5")).to.equal(TrsdosRuleSet.LDOS_5);
        expect(parseDosName("TRSDOS-1.3")).to.equal(TrsdosRuleSet.TRSDOS_1_3);
        expect(parseDosName("ls-dos-6")).to.equal(TrsdosRuleSet.TRSDOS_6);
    });

    it("rejects an unknown name and lists the choices", () => {
        expect(() => parseDosName("bogus")).to.throw(ToolError,
            "Unknown DOS \"bogus\" for --dos. The choices are trsdos-2, trsdos-1.3, ldos-5, trsdos-6, dosplus");
    });
});
