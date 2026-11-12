import fs from "fs";
import os from "os";
import path from "path";
import {makeTrsdos23TestDisk, type TestFile} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {setColorLevel} from "./colors.js";
import {handleRequest, LineQueue} from "./mcp.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 2, granuleOffset: 0, granuleCount: 3}], size: 3000};

/**
 * The part of a tools/call reply that the tests look at.
 */
interface CallResult {
    /** The text of the one content item. */
    text: string;
    /** Whether the result says the tool failed. */
    isError: boolean;
}

describe("mcp disk image tools", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        setColorLevel("off");
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-mcp-"));
        imagePathname = path.join(dir, "test.dsk");
        fs.writeFileSync(imagePathname, makeTrsdos23TestDisk([HELLO], {cylinderCount: 18}).binary);
        process.exitCode = undefined;
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        process.exitCode = undefined;
    });

    /**
     * Call a tool through the request handler, and return its result's text and error flag.
     */
    async function call(name: string, args: object): Promise<CallResult> {
        const response = await handleRequest({jsonrpc: "2.0", id: 7, method: "tools/call",
            params: {name, arguments: args}}) as any;
        expect(response.id).to.equal(7);
        expect(response.result.content.length).to.equal(1);
        return {text: response.result.content[0].text, isError: response.result.isError === true};
    }

    it("lists the new tools, with hints about which ones write", async () => {
        const response = await handleRequest({jsonrpc: "2.0", id: 1, method: "tools/list"}) as any;
        const tools = new Map<string, any>(response.result.tools.map((tool: any) => [tool.name, tool]));
        for (const name of ["dir", "info", "sectors", "disk"]) {
            expect(tools.get(name).annotations.readOnlyHint).to.equal(true);
        }
        expect(tools.get("disk_write").annotations.readOnlyHint).to.equal(false);
        // The emulator tools are still there, without hints.
        expect(tools.get("boot").annotations).to.equal(undefined);
    });

    it("returns dir --json's document", async () => {
        const result = await call("dir", {images: [imagePathname]});
        expect(result.isError).to.equal(false);
        const json = JSON.parse(result.text);
        expect(json.infiles.length).to.equal(1);
        expect(json.infiles[0].infile).to.equal(imagePathname);
        expect(json.infiles[0].files.map((file: any) => file.name)).to.eql(["HELLO.BAS"]);
        // Nothing leaks into the server's exit status.
        expect(process.exitCode).to.equal(undefined);
    });

    it("returns info --json's document", async () => {
        const json = JSON.parse((await call("info", {images: [imagePathname], verbose: true})).text);
        expect(json.infiles[0].sha256).to.be.a("string");
        expect(json.infiles[0].floppy.geometry).not.to.equal(undefined);
    });

    it("returns sectors --json's document", async () => {
        const json = JSON.parse((await call("sectors", {images: [imagePathname]})).text);
        expect(json.infiles[0].sectors.length).to.equal(18*10);
    });

    it("marks a document with an error as a failure, and keeps the document", async () => {
        const missing = path.join(dir, "missing.dsk");
        const result = await call("dir", {images: [imagePathname, missing]});
        expect(result.isError).to.equal(true);
        const json = JSON.parse(result.text);
        expect(json.infiles[0].error).to.equal(undefined);
        expect(json.infiles[1].errorCode).to.equal(3);
        expect(process.exitCode).to.equal(undefined);
    });

    it("rejects arguments of the wrong type", async () => {
        const result = await call("dir", {images: imagePathname});
        expect(result.isError).to.equal(true);
        expect(result.text).to.contain("images must be a non-empty array of strings");
    });

    it("runs disk commands without changing the image", async () => {
        const before = fs.readFileSync(imagePathname);
        const result = await call("disk", {image: imagePathname, words: ["kill", "HELLO/BAS", ":", "dir"]});
        expect(result.isError).to.equal(false);
        const json = JSON.parse(result.text);
        expect(json.commands.map((command: any) => command.name)).to.eql(["kill", "dir"]);
        expect(json.commands[1].result.files).to.eql([]);
        expect(json.saved).to.equal(null);
        expect(json.wouldHaveChanged).to.equal(true);
        expect(fs.readFileSync(imagePathname).equals(before)).to.equal(true);
    });

    it("refuses extract in the read-only disk tool, before anything runs", async () => {
        const result = await call("disk", {image: imagePathname,
            words: ["kill", "HELLO/BAS", ":", "extract", "*", "--out-dir", dir]});
        expect(result.isError).to.equal(true);
        expect(result.text).to.contain("\"extract\" writes host files");
        expect(fs.readdirSync(dir)).to.eql(["test.dsk"]);
    });

    it("refuses a disk run with no commands, which would read standard input", async () => {
        const result = await call("disk", {image: imagePathname, words: ["--json"]});
        expect(result.isError).to.equal(true);
        expect(result.text).to.contain("at least one command");
    });

    it("reports a failing disk command in the document", async () => {
        const result = await call("disk", {image: imagePathname, words: ["kill", "NOPE/BAS"]});
        expect(result.isError).to.equal(true);
        const json = JSON.parse(result.text);
        expect(json.commands[0].errorCode).to.equal(3);
    });

    it("saves the changes with disk_write", async () => {
        const result = await call("disk_write", {image: imagePathname, words: ["kill", "HELLO/BAS"]});
        expect(result.isError).to.equal(false);
        expect(JSON.parse(result.text).saved).to.equal(imagePathname);
        const json = JSON.parse((await call("dir", {images: [imagePathname]})).text);
        expect(json.infiles[0].files).to.eql([]);
    });

    it("extracts host files with disk_write", async () => {
        const outDir = path.join(dir, "out");
        const result = await call("disk_write", {image: imagePathname,
            words: ["extract", "*", "--out-dir", outDir]});
        expect(result.isError).to.equal(false);
        expect(fs.readdirSync(outDir).length).to.equal(1);
    });
});

describe("mcp request queue", () => {
    /**
     * Push the lines through a queue, and return the replies it sent once they've all been handled.
     */
    async function replies(...lines: string[]): Promise<any[]> {
        const sent: any[] = [];
        const queue = new LineQueue(message => sent.push(message));
        for (const line of lines) {
            queue.push(line);
        }
        await queue.idle();
        return sent;
    }

    it("answers a request that isn't an object, and the requests after it", async () => {
        const sent = await replies("null", "5", "[]", "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"ping\"}");
        expect(sent.map(message => message.error?.code)).to.eql([-32600, -32600, -32600, undefined]);
        expect(sent[3]).to.eql({jsonrpc: "2.0", id: 9, result: {}});
    });

    it("answers a line that isn't JSON, and the requests after it", async () => {
        const sent = await replies("{oops", "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"ping\"}");
        expect(sent[0].error.code).to.equal(-32700);
        expect(sent[1].id).to.equal(2);
    });

    it("keeps going after a line whose handling fails unexpectedly", async () => {
        // The first two writes fail: the reply, and then the error reply that handleLine sends instead,
        // so that handleLine itself rejects.
        const sent: any[] = [];
        let failuresLeft = 2;
        const queue = new LineQueue(message => {
            if (failuresLeft > 0) {
                failuresLeft--;
                throw new Error("write failed");
            }
            sent.push(message);
        });
        queue.push("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        queue.push("{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"ping\"}");
        await queue.idle();
        expect(sent.map(message => message.id)).to.eql([2]);
    });

    it("replies in the order of the requests", async () => {
        const sent = await replies(
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"dir\",\"arguments\":{\"images\":[\"missing.dsk\"]}}}",
            "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"ping\"}",
            "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}",
            "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"ping\"}");
        expect(sent.map(message => message.id)).to.eql([1, 2, 3]);
    });
});
