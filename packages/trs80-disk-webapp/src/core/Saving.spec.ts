import {Cpm, CPM_VERIFIED_LAYOUTS, FloppyImageFormat, makeMontezumaTestDisk} from "trs80-base";
import {DiskError, DiskSession, DiskWritePurpose} from "trs80-disk";
import {describe, expect, it} from "vitest";
import {OpenDisk} from "./OpenDisk.js";
import {saveDisk, saveDiskAs} from "./Saving.js";

/**
 * A file handle that remembers what's written through it.
 */
class FakeHandle {
    public readonly name = "cpm.dmk";
    public written: Uint8Array | undefined;

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

/**
 * Open a Montezuma disk with four files as an open disk with a fake handle.
 *
 * @param noBootSector whether to leave out the boot sector, which makes an emptied disk not recognized as blank.
 */
function openCpmDisk(noBootSector = false): {disk: OpenDisk, handle: FakeHandle} {
    const layout = CPM_VERIFIED_LAYOUTS.find(layout => layout.name === "Standard system")!;
    const files = ["A", "B", "C", "D"].map((name, i) => ({
        name: name + ".BIN", contents: Uint8Array.from({length: 1000*(i + 1)}, (_, j) => (j*7 + i) & 0xFF),
    }));
    const image = makeMontezumaTestDisk(layout, files, {banner: "Model 4 64K System CP/M 2.2 v2.32", noBootSector});
    const session = DiskSession.fromBinary("cpm.dmk", new Uint8Array(image.binary));
    const handle = new FakeHandle();
    return {disk: new OpenDisk(session, "cpm.dmk", handle as unknown as FileSystemFileHandle), handle};
}

describe("saving a CP/M disk", () => {
    it("saves a disk with no files that is recognized as blank, which opens again with none", async () => {
        const {disk, handle} = openCpmDisk();
        disk.session.changeCpm(DiskWritePurpose.CHANGE, writer => writer.getFiles().forEach(file => writer.deleteFile(file)));
        expect(disk.session.fileSystem?.getDirEntries(true)).to.eql([]);

        await saveDisk(disk);
        expect(handle.written).not.to.equal(undefined);
        expect(disk.session.hasChanges()).to.equal(false);
        const reopened = DiskSession.fromBinary("cpm.dmk", handle.written!);
        expect(reopened.fileSystem).to.be.instanceOf(Cpm);
        expect(reopened.fileSystem?.getDirEntries(true)).to.eql([]);
    });

    it("refuses to save a disk with no files that wouldn't be recognized, and saves once there is one", async () => {
        // Without a boot sector, track 0's first sector looks like a directory, so a system format isn't recognized.
        const {disk, handle} = openCpmDisk(true);
        disk.session.changeCpm(DiskWritePurpose.CHANGE, writer => writer.getFiles().forEach(file => writer.deleteFile(file)));
        expect(disk.session.fileSystem?.getDirEntries(true)).to.eql([]);

        await expect(saveDisk(disk)).rejects.toThrow(DiskError);
        await expect(saveDisk(disk)).rejects.toThrow("this empty disk wouldn't be recognized as mm-system");
        await expect(saveDiskAs(disk, FloppyImageFormat.DMK)).rejects.toThrow("this empty disk wouldn't be recognized");
        expect(handle.written).to.equal(undefined);
        expect(disk.session.hasChanges()).to.equal(true);

        disk.session.changeCpm(DiskWritePurpose.CHANGE,
            writer => writer.addFile({name: "NEW", extension: "TXT"}, new Uint8Array(10)));
        await saveDisk(disk);
        expect(handle.written).not.to.equal(undefined);
        expect(disk.session.hasChanges()).to.equal(false);
        // What was saved opens again as CP/M with the one file.
        const reopened = DiskSession.fromBinary("cpm.dmk", handle.written!);
        expect(reopened.fileSystem?.getDirEntries(true).map(file => file.getFilename("."))).to.eql(["NEW.TXT"]);
    });
});
