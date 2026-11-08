import {describe, expect, it} from "vitest";
import {completeDiskLine, type HostDirectoryEntry, runDiskScript} from "./DiskShell.js";
import {type DiskCommandSpec, HostPathKind} from "./DiskCommandParser.js";
import {ToolError} from "../utils.js";

const COMMANDS = ["dir", "extract", "info", "free", "quit", "abort"];
const FILES = ["HELLO/BAS", "Hello2/CMD", "GOODBYE/CMD"];

describe("completeDiskLine", () => {
    it("completes a command name at the start of the line", () => {
        expect(completeDiskLine("fr", COMMANDS, FILES)).to.eql([["free"], "fr"]);
        expect(completeDiskLine("", COMMANDS, FILES)).to.eql([COMMANDS, ""]);
        expect(completeDiskLine("  Q", COMMANDS, FILES)).to.eql([["quit"], "Q"]);
    });

    it("completes a command name after a colon", () => {
        expect(completeDiskLine("dir : fr", COMMANDS, FILES)).to.eql([["free"], "fr"]);
        expect(completeDiskLine("dir :", COMMANDS, FILES)).to.eql([[], ":"]);
    });

    it("completes file names after the command, ignoring case, in the disk's spelling", () => {
        expect(completeDiskLine("extract he", COMMANDS, FILES)).to.eql([["HELLO/BAS", "Hello2/CMD"], "he"]);
        expect(completeDiskLine("extract good", COMMANDS, FILES)).to.eql([["GOODBYE/CMD"], "good"]);
        expect(completeDiskLine("extract HELLO/BAS ", COMMANDS, FILES)).to.eql([FILES, ""]);
    });

    it("offers nothing when nothing matches or there are no files", () => {
        expect(completeDiskLine("zz", COMMANDS, FILES)).to.eql([[], "zz"]);
        expect(completeDiskLine("extract h", COMMANDS, [])).to.eql([[], "h"]);
    });
});

// Commands like the real add and extract, for completing host paths and options.
const SPECS: DiskCommandSpec[] = [
    {name: "add", aliases: [], args: "<HOSTFILE...>", summary: "", hostPathArgs: HostPathKind.FILE, options: [
        {name: "--as", valueName: "NAME", description: ""},
        {name: "--ascii", valueName: undefined, description: ""},
    ]},
    {name: "extract", aliases: [], args: "<NAME...>", summary: "", options: [
        {name: "--out-dir", valueName: "DIR", description: "", hostPath: HostPathKind.DIRECTORY},
    ]},
];
const ADD_COMMANDS = [...COMMANDS, "add"];

/**
 * A pretend host file system: the current directory has hello.bas, Help.txt, .hidden and the directory
 * games, which has adv.cmd.
 */
function listFakeDirectory(dir: string): HostDirectoryEntry[] {
    switch (dir) {
        case ".":
            return [{name: "hello.bas", isDirectory: false}, {name: "Help.txt", isDirectory: false},
                {name: ".hidden", isDirectory: false}, {name: "games", isDirectory: true}];
        case "games/":
            return [{name: "adv.cmd", isDirectory: false}];
        default:
            return [];
    }
}

describe("completeDiskLine with host paths", () => {
    it("completes add's arguments to host files, case-sensitively, with directories ending in /", () => {
        expect(completeDiskLine("add ", ADD_COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["Help.txt", "games/", "hello.bas"], ""]);
        expect(completeDiskLine("add he", ADD_COMMANDS, FILES, SPECS, listFakeDirectory)).to.eql([["hello.bas"], "he"]);
        expect(completeDiskLine("add hello.bas g", ADD_COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["games/"], "g"]);
        expect(completeDiskLine("add games/", ADD_COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["games/adv.cmd"], "games/"]);
        expect(completeDiskLine("add .", ADD_COMMANDS, FILES, SPECS, listFakeDirectory)).to.eql([[".hidden"], "."]);
    });

    it("completes options, and an option's value only if it's a host path", () => {
        expect(completeDiskLine("add --a", ADD_COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["--as", "--ascii"], "--a"]);
        expect(completeDiskLine("add --as ", ADD_COMMANDS, FILES, SPECS, listFakeDirectory)).to.eql([[], ""]);
        expect(completeDiskLine("add --ascii h", ADD_COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["hello.bas"], "h"]);
        expect(completeDiskLine("extract --out-dir ", COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["games/"], ""]);
    });

    it("still completes disk files for other commands, and after a colon", () => {
        expect(completeDiskLine("extract he", COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["HELLO/BAS", "Hello2/CMD"], "he"]);
        expect(completeDiskLine("add hello.bas : extract go", ADD_COMMANDS, FILES, SPECS, listFakeDirectory))
            .to.eql([["GOODBYE/CMD"], "go"]);
    });
});

describe("runDiskScript", () => {
    it("runs every line when nothing fails", async () => {
        const ran: string[] = [];
        await runDiskScript(["a", "", "b"], line => {
            ran.push(line);
            return false;
        });
        expect(ran).to.eql(["a", "", "b"]);
    });

    it("stops at the first error and numbers the line from 1", async () => {
        const ran: string[] = [];
        await expect(runDiskScript(["a", "bad", "c"], line => {
            ran.push(line);
            if (line === "bad") {
                throw new ToolError("Unknown command \"bad\"");
            }
            return false;
        })).rejects.toThrow("Line 2: Unknown command \"bad\"");
        expect(ran).to.eql(["a", "bad"]);
    });

    it("throws a ToolError", async () => {
        let error: unknown = undefined;
        try {
            await runDiskScript(["x"], () => { throw new ToolError("oops"); });
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
    });

    it("passes other errors through unchanged", async () => {
        await expect(runDiskScript(["x"], () => { throw new TypeError("bug"); })).rejects.toThrow("bug");
    });

    it("stops after a line that ends the session", async () => {
        const ran: string[] = [];
        await runDiskScript(["a", "quit", "c"], line => {
            ran.push(line);
            return line === "quit";
        });
        expect(ran).to.eql(["a", "quit"]);
    });
});
