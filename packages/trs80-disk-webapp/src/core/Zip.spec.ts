import JSZip from "jszip";
import {describe, expect, it} from "vitest";
import {crc32, makeZip} from "./Zip.js";

describe("crc32", () => {
    it("matches the standard check value", () => {
        expect(crc32(new TextEncoder().encode("123456789"))).to.equal(0xCBF43926);
        expect(crc32(new Uint8Array(0))).to.equal(0);
    });
});

describe("makeZip", () => {
    it("makes a ZIP that another reader opens, with names, folders, bytes, and dates", async () => {
        const hello = new TextEncoder().encode("10 PRINT \"HI\"\r");
        const binary = Uint8Array.from({length: 300}, (_, i) => i & 0xFF);
        const date = new Date(1983, 4, 17, 13, 45, 30);
        const zip = await JSZip.loadAsync(makeZip([
            {path: "hello.bas", bytes: hello, date},
            {path: "usr/bin/prog", bytes: binary, date: undefined},
            {path: "empty.txt", bytes: new Uint8Array(0), date: undefined},
        ]));

        expect(Object.keys(zip.files).filter(name => !zip.files[name].dir).sort())
            .to.eql(["empty.txt", "hello.bas", "usr/bin/prog"]);
        expect(await zip.file("hello.bas")!.async("uint8array")).to.eql(hello);
        expect(await zip.file("usr/bin/prog")!.async("uint8array")).to.eql(binary);
        expect((await zip.file("empty.txt")!.async("uint8array")).length).to.equal(0);
        // ZIP times are local, as unzip tools read them, but JSZip reads them as UTC.
        const read = zip.file("hello.bas")!.date;
        expect([read.getUTCFullYear(), read.getUTCMonth(), read.getUTCDate(), read.getUTCHours(),
            read.getUTCMinutes(), read.getUTCSeconds()]).to.eql([1983, 4, 17, 13, 45, 30]);
    });

    it("makes an empty ZIP", async () => {
        const zip = await JSZip.loadAsync(makeZip([]));
        expect(Object.keys(zip.files)).to.eql([]);
    });
});
