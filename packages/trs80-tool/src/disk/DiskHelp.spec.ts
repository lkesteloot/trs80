import chalk from "chalk";
import {describe, expect, it} from "vitest";
import {parseTrsdosRuleSet, TRSDOS_RULE_SETS, TrsdosRuleSet, trsdosRuleSetAliases} from "trs80-base";
import {ToolError} from "../utils.js";
import {type DiskCommandSpec, type DiskOptionSpec} from "./DiskCommandParser.js";
import {DISK_COMMANDS} from "./DiskCommands.js";
import {parseDosName, printDiskHelp} from "./DiskHelp.js";

const COMMANDS: DiskCommandSpec[] = [
    {
        name: "dir", aliases: ["ls"], args: "[PATTERN...]", summary: "list the files",
        options: [{ name: "--system", valueName: undefined, description: "include system files" }],
    },
    {
        name: "free", aliases: [], args: "", summary: "show the free space", options: [],
    },
    {
        name: "rm", aliases: ["del", "kill"], args: "<NAME...>", summary: "remove files",
        options: [
            { name: "--quiet", valueName: undefined, description: "say nothing" },
            { name: "--out-dir", shortName: "-d", valueName: "DIR", description: "where to go" },
        ],
        extraHelp: [
            "A wildcard never matches a system file; to remove one, give its name.",
            { title: "Colors:", style: "command", items: [{ term: "red", description: "the color of blood" }] },
        ],
    },
];

const GLOBAL_OPTIONS: DiskOptionSpec[] = [
    { name: "--force", valueName: undefined, description: "write anyway" },
];

/**
 * The help for a topic as the lines that it prints, with no colors.
 *
 * @param topic the command to describe, or undefined for the list of commands.
 * @param width the width of the terminal.
 * @param commands the commands to know about.
 */
function helpLines(topic: string | undefined, width = 80, commands = COMMANDS): string[] {
    const written: string[] = [];
    printDiskHelp(topic, commands, GLOBAL_OPTIONS, { write: text => written.push(text), width });
    return written.join("").replace(/\n$/, "").split("\n");
}

/**
 * Run a function with the color level set, and restore it after.
 */
function withColorLevel(level: 0 | 1 | 2 | 3, f: () => void): void {
    const savedLevel = chalk.level;
    chalk.level = level;
    try {
        f();
    } finally {
        chalk.level = savedLevel;
    }
}

describe("help for the whole disk command", () => {
    it("lists every command once, without aliases, and the global options", () => {
        expect(helpLines(undefined)).to.eql([
            "Commands (separate several with a lone \":\"):",
            "  dir   list the files",
            "  free  show the free space",
            "  rm    remove files",
            "",
            "Options for the whole run, before the first command:",
            "  --force  write anyway",
            "",
            "\"help COMMAND\" describes a command and its options; \"help dos\" lists the names",
            "for --dos.",
        ]);
    });

    it("leaves out the options section when there are none", () => {
        const written: string[] = [];
        printDiskHelp(undefined, COMMANDS, [], { write: text => written.push(text) });
        expect(written.join("")).to.not.include("Options for the whole run");
    });

    it("wraps long summaries and the closing line at a narrow width, under the description", () => {
        const commands = [{
            name: "frob", aliases: [], args: "", options: [],
            summary: "frobnicate the widgets thoroughly and then frobnicate them again for good measure",
        }];
        const lines = helpLines(undefined, 60, commands);
        expect(lines.slice(0, 4)).to.eql([
            "Commands (separate several with a lone \":\"):",
            "  frob  frobnicate the widgets thoroughly and then",
            "        frobnicate them again for good measure",
            "",
        ]);
        expect(lines.length).to.be.greaterThan(5);
        for (const line of lines) {
            expect(line.length).to.be.at.most(60);
        }
    });
});

describe("help for one command", () => {
    it("describes a command with its usage, options, and aliases", () => {
        expect(helpLines("rm")).to.eql([
            "Usage: rm [options] <NAME...>",
            "",
            "remove files",
            "",
            "Options:",
            "  --quiet              say nothing",
            "  -d, --out-dir <DIR>  where to go",
            "",
            "Also called: del, kill",
            "",
            "A wildcard never matches a system file; to remove one, give its name.",
            "",
            "Colors:",
            "  red  the color of blood",
        ]);
    });

    it("finds a command by an alias, in any case", () => {
        expect(helpLines("KILL")[0]).to.equal("Usage: rm [options] <NAME...>");
    });

    it("leaves out what a command doesn't have", () => {
        expect(helpLines("free")).to.eql(["Usage: free", "", "show the free space"]);
    });

    it("names the aliases in the command's help, but not in the list", () => {
        expect(helpLines("dir").join("\n")).to.include("Also called: ls");
        expect(helpLines(undefined).join("\n")).to.not.match(/\b(ls|del|kill)\b/);
    });

    it("rejects an unknown command", () => {
        expect(() => helpLines("bogus")).to.throw(ToolError, /Unknown command "bogus"/);
    });

    it("wraps the summary, the options, and the extra help at a narrow width", () => {
        const lines = helpLines("rm", 50, [{
            ...COMMANDS[2],
            summary: "remove files from the disk, freeing the space they used, and say which were removed",
            options: [{
                name: "--quiet", valueName: undefined,
                description: "say nothing at all, not even which files were removed, which is the usual output",
            }],
        }]);
        expect(lines.length).to.be.greaterThan(10);
        for (const line of lines) {
            expect(line.length).to.be.at.most(50);
        }
        expect(lines).to.include("  --quiet  say nothing at all, not even which");
        expect(lines).to.include("           files were removed, which is the usual");
        expect(lines).to.include("A wildcard never matches a system file; to remove");
        expect(lines).to.include("one, give its name.");
    });

    it("makes every real command's help fit a narrow terminal", () => {
        const specs = DISK_COMMANDS.map(c => c.spec);
        for (const spec of specs) {
            for (const line of helpLines(spec.name, 50, specs)) {
                // Long words can't be broken, and the terms of a list can leave less than 50 for a description.
                const words = line.trim().split(/\s+/);
                const longestWord = Math.max(... words.map(word => word.length));
                expect(line.length, `${spec.name}: ${line}`).to.be.at.most(Math.max(50, longestWord + 20));
            }
        }
    });

    it("lists the DOSes in the help for create and format", () => {
        const specs = DISK_COMMANDS.map(c => c.spec);
        for (const command of ["create", "format"]) {
            const lines = helpLines(command, 80, specs);
            expect(lines).to.include("  trsdos-2.3  TRSDOS 2.3, Model I");
            expect(lines).to.include("  lsdos-6.3   LS-DOS 6.3, Model 4");
        }
    });

    it("wraps the list of DOSes at a narrow width", () => {
        const specs = DISK_COMMANDS.map(c => c.spec);
        const lines = helpLines("create", 50, specs);
        expect(lines).to.include("  ldos-5.3    LDOS 5.3, Model I (--model 1) or");
        expect(lines).to.include("              Model III (the default)");
    });
});

describe("help colors", () => {
    it("colors names and titles when color is on", () => {
        withColorLevel(1, () => {
            const text = helpLines("rm").join("\n");
            // Bold for the title, and cyan for the command's name.
            expect(text).to.include(chalk.bold("Options:"));
            expect(text).to.include(chalk.cyan("rm"));
            expect(text).to.include(chalk.cyan("--quiet"));
            expect(text).to.include(chalk.underline("<NAME...>"));
            expect(text).to.include("Also called: " + chalk.cyan("del"));
            expect(helpLines(undefined).join("\n")).to.include("  " + chalk.cyan("dir") + "   list the files");
        });
    });

    it("uses no escape codes when color is off", () => {
        withColorLevel(0, () => {
            expect(helpLines("rm").join("\n")).to.not.include("\x1b");
            expect(helpLines(undefined).join("\n")).to.not.include("\x1b");
        });
    });
});

describe("help dos", () => {
    it("lists every rule set with its DOS and aliases", () => {
        expect(helpLines("dos")).to.eql([
            "--dos NAME says which DOS's rules to write a TRSDOS-family disk by, for a disk",
            "that doesn't say which DOS wrote it or to override what it says.",
            "",
            "The names are:",
            "  trsdos-2    TRSDOS 2.x",
            "  trsdos-1.3  TRSDOS 1.3",
            "  ldos-5      LDOS 5",
            "  trsdos-6    TRSDOS 6 and LS-DOS 6 (also ldos-6, ls-dos-6)",
            "  dosplus     DOSPLUS 3",
            "  trsdos-2.7  TRSDOS 2.7 and 2.8 (also trsdos-2.8)",
            "  newdos-80   NEWDOS/80 (also newdos80, newdos/80)",
            "  multidos    MultiDOS 1.x and 2.00",
        ]);
    });

    it("wraps at a narrow width", () => {
        const lines = helpLines("dos", 50);
        expect(lines).to.include("  trsdos-6    TRSDOS 6 and LS-DOS 6 (also ldos-6,");
        expect(lines).to.include("              ls-dos-6)");
        for (const line of lines) {
            expect(line.length).to.be.at.most(50);
        }
    });

    it("gives way to a command named dos", () => {
        const commands = [...COMMANDS, {
            name: "dos", aliases: [], args: "", summary: "do the DOS thing", options: [],
        }];
        expect(helpLines("dos", 80, commands)).to.eql(["Usage: dos", "", "do the DOS thing"]);
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
            "Unknown DOS \"bogus\" for --dos. The choices are trsdos-2, trsdos-1.3, ldos-5, trsdos-6, dosplus, trsdos-2.7, newdos-80, multidos");
    });
});
