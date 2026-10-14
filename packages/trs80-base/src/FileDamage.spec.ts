import {describe, expect, it} from "vitest";
import {FileDamage} from "./FileDamage.js";
import {SectorPosition} from "./FloppyDisk.js";

/**
 * Make a list of distinct sector positions.
 */
function makePositions(count: number): SectorPosition[] {
    return Array.from({length: count}, (_, i) => SectorPosition.make(1, 0, i));
}

describe("FileDamage", () => {
    it("is empty when nothing is wrong", () => {
        const damage = new FileDamage();
        expect(damage.isDamaged()).to.be.false;
        expect(damage.toString()).to.equal("");
    });

    it("uses the singular for one sector", () => {
        const damage = new FileDamage();
        damage.missingSectors.push(... makePositions(1));
        expect(damage.isDamaged()).to.be.true;
        expect(damage.toString()).to.equal("1 missing sector");

        const crcDamage = new FileDamage();
        crcDamage.crcErrorSectors.push(... makePositions(1));
        expect(crcDamage.isDamaged()).to.be.true;
        expect(crcDamage.toString()).to.equal("1 sector with a CRC error");
    });

    it("uses the plural for several sectors", () => {
        const damage = new FileDamage();
        damage.missingSectors.push(... makePositions(2));
        damage.crcErrorSectors.push(... makePositions(3));
        expect(damage.toString()).to.equal("2 missing sectors, 3 sectors with CRC errors");
    });

    it("lists directory errors last", () => {
        const damage = new FileDamage();
        damage.missingSectors.push(... makePositions(2));
        damage.crcErrorSectors.push(... makePositions(1));
        damage.directoryErrors.push("missing extended directory entry");
        expect(damage.toString())
            .to.equal("2 missing sectors, 1 sector with a CRC error, missing extended directory entry");

        const onlyDirectory = new FileDamage();
        onlyDirectory.directoryErrors.push("directory entries form a loop");
        expect(onlyDirectory.isDamaged()).to.be.true;
        expect(onlyDirectory.toString()).to.equal("directory entries form a loop");
    });
});
