import {describe, expect, it} from "vitest";
import {getFileRows} from "../core/FileRows.js";
import {makeSampleDisk} from "../core/Samples.js";
import {attributeText, attributeTitle, diskItems, isMarkable, type Item, ItemKind, makeUpItem, nextSort, SortColumn, sortItems, wildcardTest, yourFilesItems} from "./Items.js";

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

describe("sortItems", () => {
    /** Make a host file item for sorting. */
    function file(name: string, size: number, time: number | undefined): Item {
        return {kind: ItemKind.HOST_FILE, key: "f:" + name, name, size, date: time === undefined ? undefined : new Date(time),
            file: undefined as unknown as File, handle: undefined};
    }

    /** Make a folder item for sorting. */
    function folder(name: string): Item {
        return {kind: ItemKind.FOLDER, key: "d:" + name, name, handle: undefined as unknown as FileSystemDirectoryHandle};
    }

    const items = [makeUpItem(".."), file("beta", 5, 2), folder("Zed"), file("Alpha", 20, undefined), folder("apple"), file("gamma", 1, 1)];
    const names = (sorted: Item[]) => sorted.map(item => item.key);

    it("keeps the up row first and the folders before the files, ignoring case in names", () => {
        expect(names(sortItems(items, {column: SortColumn.NAME, descending: false})))
            .to.eql(["..", "d:apple", "d:Zed", "f:Alpha", "f:beta", "f:gamma"]);
        expect(names(sortItems(items, {column: SortColumn.NAME, descending: true})))
            .to.eql(["..", "d:Zed", "d:apple", "f:gamma", "f:beta", "f:Alpha"]);
    });

    it("sorts sizes numerically", () => {
        expect(names(sortItems(items, {column: SortColumn.SIZE, descending: false})).slice(3)).to.eql(["f:gamma", "f:beta", "f:Alpha"]);
        expect(names(sortItems(items, {column: SortColumn.SIZE, descending: true})).slice(3)).to.eql(["f:Alpha", "f:beta", "f:gamma"]);
    });

    it("puts missing dates last in either direction", () => {
        expect(names(sortItems(items, {column: SortColumn.DATE, descending: false})).slice(3)).to.eql(["f:gamma", "f:beta", "f:Alpha"]);
        expect(names(sortItems(items, {column: SortColumn.DATE, descending: true})).slice(3)).to.eql(["f:beta", "f:gamma", "f:Alpha"]);
    });

    it("sorts disk files by size", async () => {
        const sample = await makeSampleDisk(new Date(2026, 10, 12));
        const disk = diskItems(getFileRows(sample.session, false));
        const sorted = sortItems(disk, {column: SortColumn.SIZE, descending: true});
        expect(sorted[0].kind).to.equal(ItemKind.UP);
        const sizes = sorted.slice(1).map(item => item.kind === ItemKind.DISK_FILE ? item.row.size : -1);
        expect(sizes).to.eql([...sizes].sort((a, b) => b - a));
        expect(sortItems(disk, {column: SortColumn.NAME, descending: false}).length).to.equal(disk.length);
    });
});

describe("nextSort", () => {
    it("sorts ascending first, toggles on the same column, and starts ascending on another", () => {
        const first = nextSort(undefined, SortColumn.SIZE);
        expect(first).to.eql({column: SortColumn.SIZE, descending: false});
        const second = nextSort(first, SortColumn.SIZE);
        expect(second).to.eql({column: SortColumn.SIZE, descending: true});
        expect(nextSort(second, SortColumn.NAME)).to.eql({column: SortColumn.NAME, descending: false});
    });
});
