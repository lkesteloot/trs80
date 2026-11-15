import {describe, expect, it} from "vitest";
import {cpmFilenameFromHost, cpmFilenameToString, parseCpmFilename} from "./CpmFilename.js";

describe("parseCpmFilename", () => {
    it("reads names with and without an extension, in any case", () => {
        expect(parseCpmFilename("hello.txt")).to.eql({name: "HELLO", extension: "TXT"});
        expect(parseCpmFilename("README")).to.eql({name: "README", extension: ""});
        expect(parseCpmFilename("a.")).to.eql({name: "A", extension: ""});
        expect(parseCpmFilename("12345678.123")).to.eql({name: "12345678", extension: "123"});
        expect(parseCpmFilename("a-b_c$.&1")).to.eql({name: "A-B_C$", extension: "&1"});
    });

    it("says what's wrong with a bad name", () => {
        expect(parseCpmFilename("")).to.contain("no name");
        expect(parseCpmFilename(".txt")).to.contain("no name");
        expect(parseCpmFilename("toolongname.txt")).to.contain("name is longer than 8");
        expect(parseCpmFilename("a.long")).to.contain("extension is longer than 3");
        expect(parseCpmFilename("a.b.c")).to.contain("more than one");
        expect(parseCpmFilename("a b.txt")).to.contain("doesn't allow");
        expect(parseCpmFilename("caf\u00E9.txt")).to.contain("non-ASCII");
        for (const bad of ["a<b", "a,b", "a;b", "a=b", "a?b", "a*b", "a[b", "a]b", "a\u007Fb", "a\u0001b", "café"]) {
            expect(typeof parseCpmFilename(bad), bad).to.equal("string");
        }
        expect(parseCpmFilename("1:a.txt")).to.contain("drive or user");
    });

    it("gives names back as text", () => {
        expect(cpmFilenameToString({name: "HELLO", extension: "TXT"})).to.equal("HELLO.TXT");
        expect(cpmFilenameToString({name: "README", extension: ""})).to.equal("README");
    });
});

describe("cpmFilenameFromHost", () => {
    it("keeps every character that CP/M allows, and notes when it changes a name", () => {
        expect(cpmFilenameFromHost("hello.txt")).to.eql({filename: {name: "HELLO", extension: "TXT"}, changed: false});
        expect(cpmFilenameFromHost("1-up v2!.t_t")).to.eql({filename: {name: "1-UPV2!", extension: "T_T"}, changed: true});
        expect(cpmFilenameFromHost("a-very-long-name.text")).to.eql(
            {filename: {name: "A-VERY-L", extension: "TEX"}, changed: true});
        expect(cpmFilenameFromHost("archive.tar.gz")).to.eql({filename: {name: "ARCHIVET", extension: "GZ"}, changed: true});
        expect(cpmFilenameFromHost(".profile")).to.eql({filename: {name: "PROFILE", extension: ""}, changed: true});
    });

    it("gives a message when nothing is left of the name", () => {
        expect(typeof cpmFilenameFromHost("[]<>.txt")).to.equal("string");
        expect(typeof cpmFilenameFromHost("   ")).to.equal("string");
    });
});
