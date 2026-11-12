import fs from "fs";
import os from "os";
import path from "path";
import {formatTrsdosDataDisk, SectorPosition, setDmkConverterCrcMarker, TrsdosFormatDos} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {disk} from "./disk/disk.js";
import {sectorsJsonInfiles} from "./sectors.js";

describe("imaging artifacts in sectors and check", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-artifacts-"));
        imagePathname = path.join(dir, "test.dmk");
        const floppy = formatTrsdosDataDisk({dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 40, sides: 1});
        if (typeof floppy === "string") {
            throw new Error(floppy);
        }
        // A converter's CRC marker on a sector that no file uses.
        fs.writeFileSync(imagePathname, setDmkConverterCrcMarker(floppy, SectorPosition.make(5, 0, 2)).binary);
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Run the "disk" command on the image with these words after the image, and return what it printed.
     */
    async function runDisk(...words: string[]): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await disk([imagePathname, ...words]);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    it("labels the bad sector in sectors --json --bad", () => {
        const [infile] = sectorsJsonInfiles([imagePathname], false, true, false);
        expect(infile.sectors.map(sector => [sector.cylinder, sector.sector, sector.imagingArtifact]))
            .to.eql([[5, 2, "converterCrcMarker"]]);
        expect(infile.imagingArtifacts!.map(artifact => artifact.kind)).to.eql(["converterCrcMarker"]);
        expect(infile.imagingArtifacts![0].sectors).to.eql([{cylinder: 5, side: 0, sector: 2}]);
    });

    it("lists the artifact in check without changing whether the disk is writable", async () => {
        const lines = await runDisk("check");
        expect(lines[0]).to.equal("No problems found.");
        expect(lines).to.include("Imaging artifacts, which the imager or a converter left in the image:");
        expect(lines.some(line => line.startsWith("  Converter's CRC marker: The stored CRC of sector 2 of cylinder 5")))
            .to.equal(true);
        expect(lines.at(-1)).to.equal("Safe to write.");
    });
});
