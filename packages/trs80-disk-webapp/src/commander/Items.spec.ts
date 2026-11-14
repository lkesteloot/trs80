import {describe, expect, it} from "vitest";
import {getFileRows} from "../core/FileRows.js";
import {makeSampleDisk} from "../workbench/Samples.js";
import {attributeText, attributeTitle, diskItems, isMarkable, ItemKind, makeUpItem, wildcardTest, yourFilesItems} from "./Items.js";

describe("wildcardTest", () => {
    it("matches * and ? ignoring case, and treats / as the dot", () => {
        const matches = wildcardTest("*.bas");
        expect(matches("HELLO.BAS")).to.equal(true);
        expect(matches("hello.bas")).to.equal(true);
        expect(matches("HELLO.TXT")).to.equal(false);
        expect(wildcardTest("h?llo/bas")("HELLO.BAS")).to.equal(true);
        expect(wildcardTest("h?llo/bas")("HELLO.BAS.OLD")).to.equal(false);
    });

    it("matches a name that any of several patterns matches", () => {
        const matches = wildcardTest("*.bas *.txt");
        expect(matches("A.TXT")).to.equal(true);
        expect(matches("A.CMD")).to.equal(false);
    });

    it("doesn't treat other characters of a pattern as regular-expression syntax", () => {
        expect(wildcardTest("a+b")("a+b")).to.equal(true);
        expect(wildcardTest("a+b")("aab")).to.equal(false);
        expect(wildcardTest("(x)")("(x)")).to.equal(true);
    });
});

describe("items", () => {
    it("lists a disk's files after the row that goes back out", async () => {
        const disk = await makeSampleDisk(new Date(2026, 10, 12));
        const items = diskItems(getFileRows(disk.session, false));
        expect(items[0].kind).to.equal(ItemKind.UP);
        expect(items.slice(1).map(item => item.kind === ItemKind.DISK_FILE ? item.row.fullName : "")).to.eql(
            ["HELLO/BAS", "TIMES/BAS", "GUESS/BAS"]);
        expect(items.map(item => isMarkable(item))).to.eql([false, true, true, true]);
        expect(items.map(item => item.key).length).to.equal(new Set(items.map(item => item.key)).size);
    });

    it("shows a file with full access as nothing", async () => {
        const disk = await makeSampleDisk(new Date(2026, 10, 12));
        const rows = getFileRows(disk.session, false);
        expect(attributeText(rows[0])).to.equal("");
        expect(attributeTitle(rows[0])).to.equal("");
    });

    it("spells attributes as short words, with a tooltip that spells them out", async () => {
        const disk = await makeSampleDisk(new Date(2026, 10, 12));
        const row = getFileRows(disk.session, false)[0];
        const attributes = row.attributes;
        expect(attributes).not.to.equal(undefined);
        const changed = {...row, attributes: {...attributes!, system: true, invisible: true, hasPasswords: true}};
        expect(attributeText(changed)).to.equal("sys hid pw");
        expect(attributeTitle(changed)).to.equal("System file, hidden, password-protected");
    });

    it("sorts Your files by name ignoring case", () => {
        const files = new Map<string, File>([["b.txt", new File([""], "b.txt")], ["A.txt", new File(["x"], "A.txt")]]);
        const items = yourFilesItems(files);
        expect(items.map(item => item.kind === ItemKind.HOST_FILE ? item.name : "")).to.eql(["A.txt", "b.txt"]);
        expect(makeUpItem("..").key).to.equal("..");
    });
});
