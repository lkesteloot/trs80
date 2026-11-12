import {Command, Option} from "commander";
import {describe, expect, it} from "vitest";
import {makeHelpJson} from "./helpJson.js";
import {ToolError} from "./utils.js";

/**
 * A small program shaped like the tool's: a program option with choices, a command with arguments and
 * options, the disk command, and the help command.
 */
function makeProgram(): Command {
    const program = new Command("trs80-tool");
    program.addOption(new Option("--color <color>", "color output").choices(["off", "auto"]).default("auto"));
    program.command("extract <infile> [names...]")
        .description("extract files", {infile: "the image"})
        .option("-o, --out-dir <dir>", "where to put them")
        .option("--json", "print JSON")
        .addOption(new Option("--report", "hidden").hideHelp());
    program.command("disk [image] [words...]").description("work on a disk").helpOption(false);
    program.helpCommand(false);
    program.command("help [command]").description("display help for command").helpOption(false);
    return program;
}

describe("makeHelpJson", () => {
    it("describes the commands, their arguments and their visible options", () => {
        const json = makeHelpJson(makeProgram(), undefined);
        expect(json.version).to.match(/^\d+\.\d+\.\d+/);
        expect(json.options.find(o => o.name === "--color")).to.eql({
            name: "--color",
            description: "color output",
            value: {name: "color", required: true, variadic: false, choices: ["off", "auto"], default: "auto"},
        });
        expect(json.commands.map(c => c.name)).to.eql(["extract", "disk", "help"]);

        const extract = json.commands[0];
        expect(extract.arguments).to.eql([
            {name: "infile", required: true, variadic: false, description: "the image"},
            {name: "names", required: false, variadic: true},
        ]);
        expect(extract.options.map(o => o.name)).to.eql(["--out-dir", "--json", "--help"]);
        expect(extract.options[0]).to.include({shortName: "-o"});
        expect(extract.options[1].value).to.equal(undefined);

        // The help command's --json isn't a Commander option, so it's added.
        expect(json.commands[2].options.map(o => o.name)).to.eql(["--json"]);
    });

    it("describes the disk commands from their specs", () => {
        const disk = makeHelpJson(makeProgram(), undefined).disk!;
        expect(disk.options.find(o => o.name === "--output")).to.include({shortName: "-o"});
        expect(disk.options.find(o => o.name === "--dos")!.value).to.eql({name: "NAME", required: true, variadic: false});
        const dir = disk.commands.find(c => c.name === "dir")!;
        expect(dir.aliases).to.eql(["ls"]);
        expect(dir.arguments).to.eql([{name: "PATTERN", required: false, variadic: true}]);
        const add = disk.commands.find(c => c.name === "add")!;
        expect(add.options.map(o => o.name)).to.include.members(["--binary", "--text"]);
    });

    it("gives the DOSes, system disks, image formats and exit codes", () => {
        const json = makeHelpJson(makeProgram(), undefined);
        expect(json.writableDoses.map(d => d.name)).to.include("ldos-5");
        expect(json.formatDoses.map(d => d.name)).to.include("lsdos-6.3");
        expect(json.systemDisks.find(d => d.name === "ldos-5.3.1-model3")).to.include({dos: "ldos-5.3", model: 3});
        expect(json.imageFormats.read).to.include.members(["DMK", "JV1", "JV3", "HFE", "IMD", "SCP", "HDV"]);
        expect(json.imageFormats.diskCreate).to.eql(["DMK", "HDV"]);
        expect(json.exitCodes.map(e => e.code)).to.eql([0, 1, 3, 4, 5, 6, 7, 130]);
    });

    it("narrows to one command, with the disk commands only for disk", () => {
        const extract = makeHelpJson(makeProgram(), "extract");
        expect(extract.commands.map(c => c.name)).to.eql(["extract"]);
        expect(extract.disk).to.equal(undefined);
        const disk = makeHelpJson(makeProgram(), "disk");
        expect(disk.commands.map(c => c.name)).to.eql(["disk"]);
        expect(disk.disk).to.not.equal(undefined);
        expect(() => makeHelpJson(makeProgram(), "nosuch")).to.throw(ToolError, "no command");
    });
});
