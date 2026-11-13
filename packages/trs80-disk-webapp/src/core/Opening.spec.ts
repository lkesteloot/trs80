import JSZip from "jszip";
import {gunzipBytes, gzipBytes} from "trs80-base";
import {describe, expect, it} from "vitest";
import {DiskStore} from "./DiskStore.js";
import {OpenDisk, SaveKind, saveKindToString} from "./OpenDisk.js";
import {openFiles} from "./Opening.js";
import {saveDisk} from "./Saving.js";
import {makeBlankDisk, makeDiskWithFiles, textFile} from "./TestHelpers.js";

/**
 * The bytes of a new disk's image.
 */
async function makeImageBytes(): Promise<Uint8Array> {
    const disk = await makeDiskWithFiles();
    return new Uint8Array(disk.session.image.binary);
}

/**
 * A file handle that remembers what's written through it, for testing saves.
 */
class FakeHandle {
    public readonly name: string;
    public written: Uint8Array | undefined;

    /**
     * @param name the file's name.
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * A writable stream that keeps the last thing written to it.
     */
    public async createWritable(): Promise<{write: (bytes: Uint8Array) => Promise<void>, close: () => Promise<void>}> {
        return {
            write: async (bytes: Uint8Array) => {
                this.written = bytes;
            },
            close: async () => {},
        };
    }
}

describe("newDisk", () => {
    it("makes an unsaved disk with a handle-less download save", async () => {
        const disk = await makeBlankDisk();
        expect(disk.name).to.equal("untitled.dmk");
        expect(disk.session.hasChanges()).to.equal(true);
        expect(disk.saveKind).to.equal(SaveKind.DOWNLOAD);
        expect(saveKindToString(disk.saveKind)).to.equal("download");
        expect(disk.session.fileSystem?.nameAndVersion).to.contain("LDOS");
    });

    it("gives each disk its own ID", async () => {
        const a = await makeBlankDisk();
        const b = await makeBlankDisk();
        expect(a.id).to.not.equal(b.id);
    });
});

describe("openFiles", () => {
    it("opens a disk image", async () => {
        const bytes = await makeImageBytes();
        const result = await openFiles([{file: new File([bytes as BlobPart], "mine.dmk")}]);
        expect(result.unopened).to.eql([]);
        expect(result.disks.length).to.equal(1);
        expect(result.disks[0].name).to.equal("mine.dmk");
        expect(result.disks[0].session.hasChanges()).to.equal(false);
        expect(result.disks[0].session.fileSystem?.getDirEntries(false).length).to.equal(2);
    });

    it("opens each image in a ZIP, and reports what isn't a disk", async () => {
        const bytes = await makeImageBytes();
        const zip = new JSZip();
        zip.file("one.dmk", bytes);
        zip.file("folder/two.dmk", bytes);
        zip.file("readme.txt", "Not a disk image.\n");
        const zipBytes = await zip.generateAsync({type: "uint8array"});

        const result = await openFiles([{file: new File([zipBytes as BlobPart], "set.zip")}]);
        expect(result.disks.map(disk => disk.name)).to.eql(["one.dmk", "two.dmk"]);
        expect(result.disks.every(disk => disk.saveKind === SaveKind.DOWNLOAD)).to.equal(true);
        expect(result.unopened.map(file => file.name)).to.eql(["readme.txt"]);
        expect(result.unopened[0].message).to.contain("readme.txt");
    });

    it("opens a .gz file under its own name, and saves it gzipped through its handle", async () => {
        const bytes = await makeImageBytes();
        const gzipped = gzipBytes(bytes);
        const handle = new FakeHandle("mine.dmk.gz");

        const result = await openFiles([{
            file: new File([gzipped as BlobPart], "mine.dmk.gz"),
            handle: handle as unknown as FileSystemFileHandle,
        }]);
        expect(result.unopened).to.eql([]);
        expect(result.disks.map(disk => disk.name)).to.eql(["mine.dmk.gz"]);
        expect(result.disks[0].saveKind).to.equal(SaveKind.WRITE_BACK);
        expect(result.disks[0].session.image.binary.length).to.equal(bytes.length);

        await saveDisk(result.disks[0]);
        expect(handle.written).to.not.equal(undefined);
        expect(Array.from(gunzipBytes(handle.written!))).to.eql(Array.from(bytes));
    });

    it("opens a .gz file inside a ZIP", async () => {
        const bytes = await makeImageBytes();
        const zip = new JSZip();
        zip.file("one.dmk.gz", gzipBytes(bytes));
        const zipBytes = await zip.generateAsync({type: "uint8array"});

        const result = await openFiles([{file: new File([zipBytes as BlobPart], "set.zip")}]);
        expect(result.unopened).to.eql([]);
        expect(result.disks.map(disk => disk.name)).to.eql(["one.dmk.gz"]);
    });

    it("reports a .gz file that isn't gzip data", async () => {
        const bytes = await makeImageBytes();
        const result = await openFiles([{file: new File([bytes as BlobPart], "bad.dmk.gz")}]);
        expect(result.disks).to.eql([]);
        expect(result.unopened.length).to.equal(1);
        expect(result.unopened[0].message).to.contain("gzip");
    });

    it("returns a file that isn't a disk, with its contents", async () => {
        const result = await openFiles([{file: textFile("notes.txt", "Just some notes.\n")}]);
        expect(result.disks).to.eql([]);
        expect(result.unopened.length).to.equal(1);
        expect(result.unopened[0].name).to.equal("notes.txt");
        expect(result.unopened[0].message).to.be.a("string").and.not.equal("");
        expect(await result.unopened[0].file.text()).to.equal("Just some notes.\n");
    });
});

describe("OpenDisk and DiskStore", () => {
    it("passes on the session's changes", async () => {
        const disk = await makeBlankDisk();
        let count = 0;
        disk.onChange(() => count++);
        disk.session.markSaved();
        expect(count).to.equal(1);
        disk.setFile("other.dmk", undefined);
        expect(count).to.equal(2);
        expect(disk.name).to.equal("other.dmk");
    });

    it("tells the store's listeners about added, removed and changed disks", async () => {
        const store = new DiskStore();
        const events: string[] = [];
        store.onAdded(disk => events.push("added " + disk.name));
        store.onRemoved(disk => events.push("removed " + disk.name));
        store.onChanged(disk => events.push("changed " + disk.name));

        const disk: OpenDisk = await makeBlankDisk();
        store.add(disk);
        store.add(disk);
        expect(store.list()).to.eql([disk]);
        disk.session.markSaved();
        expect(store.remove(disk.id)).to.equal(true);
        expect(store.remove(disk)).to.equal(false);
        // Once removed, a disk no longer reaches the store.
        disk.session.markSaved();

        expect(events).to.eql(["added untitled.dmk", "changed untitled.dmk", "removed untitled.dmk"]);
        expect(store.list()).to.eql([]);
    });
});
