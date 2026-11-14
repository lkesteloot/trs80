import {BasicDialect, Density, TrsdosFormatDos} from "trs80-base";
import {
    addCommandLine, attribCommandLine, bootCommandLine, checkCommandLine, createCommandLine, createHardDiskCommandLine,
    dirCommandLine, extractCommandLine, formatCommandLine, formatFloppyCommandLine, formatHardDiskCommandLine,
    freeCommandLine, infoCommandLine, killCommandLine, labelCommandLine, mapCommandLine, partitionAddCommandLine,
    partitionCommandLine, partitionDeleteCommandLine, protectCommandLine, quoteCommandWord, renameCommandLine,
    repairCommandLine, revertCommandLine, trimCommandLine,
} from "trs80-disk";
import {describe, expect, it} from "vitest";
import {commandLineText, DISK_COMMANDS, DISK_GLOBAL_OPTIONS} from "./DiskCommands.js";
import {parseDiskCommandLine, splitCommandLine} from "./DiskCommandParser.js";

/**
 * Check that a line that a builder made parses to exactly one command with the expected name, arguments and options,
 * and that the tool's own text for that command is the same line.
 *
 * @param line the line from a builder.
 * @param name the canonical command name.
 * @param args the expected arguments.
 * @param options the expected options as words, in order, as {@link DiskOptionValues.toWords} gives them.
 */
function check(line: string, name: string, args: string[], options: string[]): void {
    const parsed = parseDiskCommandLine(splitCommandLine(line), DISK_GLOBAL_OPTIONS,
        DISK_COMMANDS.map(command => command.spec));
    expect(parsed.globalOptions.toWords()).to.eql([]);
    expect(parsed.commands).to.have.length(1);
    const command = parsed.commands[0];
    expect(command.spec.name).to.equal(name);
    expect(command.name).to.equal(name);
    expect(command.args).to.eql(args);
    expect(command.options.toWords()).to.eql(options);
    expect(commandLineText(command)).to.equal(line);
}

const NO_ADD = {ascii: false, binary: false, text: false, system: false, invisible: false, overwrite: false};
const NO_FORMAT = {
    dos: undefined, cylinders: undefined, sides: undefined, density: undefined, model: undefined, name: undefined,
    date: undefined,
};

describe("quoteCommandWord", () => {
    it("leaves plain words alone", () => {
        expect(quoteCommandWord("HELLO/BAS:1")).to.equal("HELLO/BAS:1");
        expect(quoteCommandWord("a#b")).to.equal("a#b");
        expect(quoteCommandWord("--force")).to.equal("--force");
    });

    it("quotes the words that need it", () => {
        expect(quoteCommandWord("")).to.equal("\"\"");
        expect(quoteCommandWord("a b")).to.equal("\"a b\"");
        expect(quoteCommandWord("#x")).to.equal("\"#x\"");
        expect(quoteCommandWord("it's")).to.equal("\"it's\"");
        expect(quoteCommandWord("say \"hi\"")).to.equal("\"say \\\"hi\\\"\"");
        expect(quoteCommandWord("a\\b")).to.equal("\"a\\\\b\"");
    });

    it("splits back into the same words", () => {
        const words = ["", "a b", "#x", "it's", "say \"hi\"", "a\\b", "tab\there", "'", "\"", "\\", "a#b", "x\\\"y z"];
        expect(splitCommandLine(formatCommandLine(words))).to.eql(words);
    });
});

describe("DiskCommandLine builders", () => {
    it("dir", () => {
        check(dirCommandLine(), "dir", [], []);
        check(dirCommandLine(["*/BAS", "HELLO"], true), "dir", ["*/BAS", "HELLO"], ["--system"]);
    });

    it("extract", () => {
        check(extractCommandLine(["*"]), "extract", ["*"], []);
        check(extractCommandLine(["HELLO/BAS"], {outDir: "my files", lowercase: true, markDamaged: true}),
            "extract", ["HELLO/BAS"], ["--out-dir", "my files", "--lowercase", "--mark-damaged"]);
        check(extractCommandLine(["HELLO/BAS"], {as: "out/it's \"x\".bas"}),
            "extract", ["HELLO/BAS"], ["--as", "out/it's \"x\".bas"]);
    });

    it("kill and rename", () => {
        check(killCommandLine(["A/BAS", "B/*"]), "kill", ["A/BAS", "B/*"], []);
        check(renameCommandLine("A/BAS", "B/BAS"), "rename", ["A/BAS", "B/BAS"], []);
    });

    it("add", () => {
        check(addCommandLine(["hello.bas"], {...NO_ADD}), "add", ["hello.bas"], []);
        check(addCommandLine(["my file.bas"], {...NO_ADD, as: "HELLO/BAS", ascii: true, basic: BasicDialect.MODEL_4,
                invisible: true, date: new Date(1983, 4, 1), overwrite: true}),
            "add", ["my file.bas"],
            ["--as", "HELLO/BAS", "--ascii", "--basic", "4", "--invisible", "--date", "1983-05-01", "--overwrite"]);
        check(addCommandLine(["a.bin", "b.bin"], {...NO_ADD, binary: true, system: true, basic: BasicDialect.MODEL_III}),
            "add", ["a.bin", "b.bin"], ["--binary", "--basic", "3", "--system"]);
        check(addCommandLine(["notes.txt"], {...NO_ADD, text: true}), "add", ["notes.txt"], ["--text"]);
    });

    it("add with awkward host names", () => {
        check(addCommandLine(["my file.bas", "it's.bas", "say \"hi\".bas", "#1.bas", "back\\slash.bas", "a#b.bas"],
                {...NO_ADD}),
            "add", ["my file.bas", "it's.bas", "say \"hi\".bas", "#1.bas", "back\\slash.bas", "a#b.bas"], []);
        check(addCommandLine(["x.bas"], {...NO_ADD, as: "#NAME"}), "add", ["x.bas"], ["--as", "#NAME"]);
    });

    it("attrib", () => {
        check(attribCommandLine(["*"], {}), "attrib", ["*"], []);
        check(attribCommandLine(["A/BAS"], {invisible: true, system: false, protect: "READ"}),
            "attrib", ["A/BAS"], ["--invisible", "--no-system", "--protect", "READ"]);
        check(attribCommandLine(["A/BAS"], {invisible: false, system: true, updatePassword: "", accessPassword: "SECRET"}),
            "attrib", ["A/BAS"], ["--visible", "--system", "--password", "", "--access-password", "SECRET"]);
        check(attribCommandLine(["A/BAS", "B/*"], {date: new Date(1981, 11, 25)}),
            "attrib", ["A/BAS", "B/*"], ["--date", "1981-12-25"]);
        check(attribCommandLine(["A/BAS"], {date: null}), "attrib", ["A/BAS"], ["--no-date"]);
    });

    it("label", () => {
        check(labelCommandLine({}), "label", [], []);
        check(labelCommandLine({name: "MYDISK", date: new Date(1982, 0, 2), masterPassword: "PW"}),
            "label", [], ["--name", "MYDISK", "--date", "1982-01-02", "--password", "PW"]);
        check(labelCommandLine({autoCommand: "BASIC RUN\"MENU\""}), "label", [], ["--auto", "BASIC RUN\"MENU\""]);
        check(labelCommandLine({autoCommand: ""}), "label", [], ["--no-auto"]);
        check(labelCommandLine({masterPassword: ""}), "label", [], ["--password", ""]);
    });

    it("protect", () => {
        check(protectCommandLine(), "protect", [], []);
        check(protectCommandLine(true), "protect", ["on"], []);
        check(protectCommandLine(false), "protect", ["off"], []);
    });

    it("boot", () => {
        check(bootCommandLine(undefined, false), "boot", [], []);
        check(bootCommandLine(4, true), "boot", [], ["--model", "4", "--write-protected"]);
    });

    it("check and repair", () => {
        check(checkCommandLine(), "check", [], []);
        check(repairCommandLine({freeUnclaimed: false, fixProgramSizes: false, markMissingUsed: false}),
            "repair", [], []);
        check(repairCommandLine({freeUnclaimed: true, fixProgramSizes: true, markMissingUsed: true}),
            "repair", [], ["--free-unclaimed", "--fix-program-sizes", "--mark-missing-used"]);
    });

    it("trim", () => {
        check(trimCommandLine({cylinders: undefined, dropSide: false, force: false}), "trim", [], []);
        check(trimCommandLine({cylinders: 40, dropSide: true, force: true}),
            "trim", [], ["--cylinders", "40", "--side", "0", "--force"]);
    });

    it("create a floppy", () => {
        check(createCommandLine({format: {...NO_FORMAT, dos: TrsdosFormatDos.LDOS_5_3}, system: false, minimal: false,
            force: false}), "create", ["ldos-5.3"], []);
        check(createCommandLine({format: {...NO_FORMAT, dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 80, sides: 2,
                density: Density.DOUBLE, model: 4, name: "DATA", date: new Date(1990, 5, 7)},
            system: false, minimal: false, force: true}),
            "create", ["lsdos-6.3"], ["--cylinders", "80", "--sides", "2", "--density", "double", "--model", "4",
                "--name", "DATA", "--date", "1990-06-07", "--force"]);
        check(createCommandLine({format: {...NO_FORMAT, dos: TrsdosFormatDos.TRSDOS_2_3, density: Density.SINGLE},
            system: true, minimal: true, force: false}),
            "create", ["trsdos-2.3"], ["--density", "single", "--system", "--minimal"]);
        check(createCommandLine({format: {...NO_FORMAT, dos: TrsdosFormatDos.TRSDOS_1_3}, system: true, minimal: false,
            force: false}), "create", ["trsdos-1.3"], ["--system"]);
    });

    it("create a hard disk", () => {
        check(createHardDiskCommandLine({dos: undefined, heads: undefined, cylinders: undefined, partitions: undefined,
            model: undefined, name: undefined, date: undefined, force: false}), "create", [], []);
        check(createHardDiskCommandLine({dos: TrsdosFormatDos.LDOS_5_3, heads: 4, cylinders: 600, partitions: 3,
            model: 3, name: "HARDA", date: undefined, force: true}),
            "create", ["ldos-5.3"], ["--cylinders", "600", "--model", "3", "--name", "HARDA", "--force",
                "--heads", "4", "--partitions", "3"]);
    });

    it("format a floppy", () => {
        check(formatFloppyCommandLine({format: {...NO_FORMAT, dos: TrsdosFormatDos.TRSDOS_6_2}, force: false}),
            "format", ["trsdos-6.2"], []);
        check(formatFloppyCommandLine({format: {...NO_FORMAT, dos: TrsdosFormatDos.LDOS_5_3, sides: 1, name: "A B"},
            force: true}), "format", ["ldos-5.3"], ["--sides", "1", "--name", "A B", "--force"]);
    });

    it("format a hard disk partition", () => {
        check(formatHardDiskCommandLine({dos: TrsdosFormatDos.LSDOS_6_3, model: undefined, name: undefined,
            date: undefined, force: false}), "format", ["lsdos-6.3"], []);
        check(formatHardDiskCommandLine({dos: TrsdosFormatDos.LDOS_5_3, model: 1, name: "GAMES",
            date: new Date(1985, 8, 9), force: true}),
            "format", ["ldos-5.3"], ["--model", "1", "--name", "GAMES", "--date", "1985-09-09", "--force"]);
    });

    it("partition", () => {
        check(partitionCommandLine(), "partition", [], []);
        check(partitionCommandLine(2), "partition", ["2"], []);
        check(partitionCommandLine("my disk"), "partition", ["my disk"], []);
        check(partitionAddCommandLine({dos: TrsdosFormatDos.LDOS_5_3,
            placement: {cylinders: undefined, heads: undefined, startCylinder: undefined, startHead: undefined},
            granulesPerCylinder: undefined, name: undefined, date: undefined, model: undefined, force: false}),
            "partition", ["ldos-5.3"], ["--add"]);
        check(partitionAddCommandLine({dos: TrsdosFormatDos.LSDOS_6_3,
            placement: {cylinders: 100, heads: 2, startCylinder: 10, startHead: 1},
            granulesPerCylinder: 4, name: "BIG", date: new Date(1988, 1, 3), model: 4, force: true}),
            "partition", ["lsdos-6.3"], ["--add", "--cylinders", "100", "--heads", "2", "--start-cylinder", "10",
                "--start-head", "1", "--name", "BIG", "--date", "1988-02-03", "--model", "4", "--granules", "4",
                "--force"]);
        check(partitionDeleteCommandLine(undefined, false), "partition", [], ["--delete"]);
        check(partitionDeleteCommandLine(3, true), "partition", ["3"], ["--delete", "--force"]);
    });

    it("free, info, map and revert", () => {
        check(freeCommandLine(), "free", [], []);
        check(infoCommandLine(), "info", [], []);
        check(mapCommandLine(), "map", [], []);
        check(mapCommandLine(["HELLO/BAS", "my file"]), "map", ["HELLO/BAS", "my file"], []);
        check(revertCommandLine(), "revert", [], []);
    });
});
