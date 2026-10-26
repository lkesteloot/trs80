import {describe, expect, it} from "vitest";
import {completeDiskLine, runDiskScript} from "./DiskShell.js";
import {ToolError} from "../utils.js";

const COMMANDS = ["dir", "get", "info", "free", "quit", "abort"];
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
        expect(completeDiskLine("get he", COMMANDS, FILES)).to.eql([["HELLO/BAS", "Hello2/CMD"], "he"]);
        expect(completeDiskLine("get good", COMMANDS, FILES)).to.eql([["GOODBYE/CMD"], "good"]);
        expect(completeDiskLine("get HELLO/BAS ", COMMANDS, FILES)).to.eql([FILES, ""]);
    });

    it("offers nothing when nothing matches or there are no files", () => {
        expect(completeDiskLine("zz", COMMANDS, FILES)).to.eql([[], "zz"]);
        expect(completeDiskLine("get h", COMMANDS, [])).to.eql([[], "h"]);
    });
});

describe("runDiskScript", () => {
    it("runs every line when nothing fails", () => {
        const ran: string[] = [];
        runDiskScript(["a", "", "b"], line => {
            ran.push(line);
            return false;
        });
        expect(ran).to.eql(["a", "", "b"]);
    });

    it("stops at the first error and numbers the line from 1", () => {
        const ran: string[] = [];
        expect(() => runDiskScript(["a", "bad", "c"], line => {
            ran.push(line);
            if (line === "bad") {
                throw new ToolError("Unknown command \"bad\"");
            }
            return false;
        })).toThrow("Line 2: Unknown command \"bad\"");
        expect(ran).to.eql(["a", "bad"]);
    });

    it("throws a ToolError", () => {
        let error: unknown = undefined;
        try {
            runDiskScript(["x"], () => { throw new ToolError("oops"); });
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
    });

    it("passes other errors through unchanged", () => {
        expect(() => runDiskScript(["x"], () => { throw new TypeError("bug"); })).toThrow("bug");
    });

    it("stops after a line that ends the session", () => {
        const ran: string[] = [];
        runDiskScript(["a", "quit", "c"], line => {
            ran.push(line);
            return line === "quit";
        });
        expect(ran).to.eql(["a", "quit"]);
    });
});
