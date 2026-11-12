import {describe, expect, it} from "vitest";
import {
    DosFamily, dosNameToString, DosVersion, isNewdos80Line, isTrsdos6Line, isUnknownDosName, makeDosName, UNKNOWN_DOS_NAME,
} from "./DosName.js";

describe("DosVersion", () => {
    it("reads the major version from the text", () => {
        expect(new DosVersion("5.1.4").major()).to.equal(5);
        expect(new DosVersion("2.x").major()).to.equal(2);
        expect(new DosVersion("2.7DD").major()).to.equal(2);
        expect(new DosVersion("10.2").major()).to.equal(10);
        expect(new DosVersion("A.00").major()).to.be.undefined;
    });

    it("matches only the exact text", () => {
        expect(new DosVersion("2.3B").is("2.3B")).to.equal(true);
        expect(new DosVersion("2.3B").is("2.3")).to.equal(false);
        expect(new DosVersion("1.71").is("1.7.1")).to.equal(false);
    });
});

describe("dosNameToString", () => {
    it("shows one release after the family", () => {
        expect(dosNameToString(makeDosName(DosFamily.LDOS, "5.1.4"))).to.equal("LDOS 5.1.4");
        expect(dosNameToString(makeDosName(DosFamily.DOSPLUS_II, "A.00"))).to.equal("DOSPLUS II A.00");
        expect(dosNameToString(makeDosName(DosFamily.Z_DOS, "1.00S"))).to.equal("Z'DOS 1.00S");
    });

    it("shows the family alone when there's no version", () => {
        expect(dosNameToString(UNKNOWN_DOS_NAME)).to.equal("Unknown DOS");
        expect(dosNameToString(makeDosName(DosFamily.DOSPLUS_IV))).to.equal("DOSPLUS IV");
        expect(dosNameToString(makeDosName(DosFamily.BFLOADER))).to.equal("Big Five BFLOADER");
    });

    it("lists the releases a disk could be from", () => {
        expect(dosNameToString(makeDosName(DosFamily.TRSDOS, "2.2", "2.3"))).to.equal("TRSDOS 2.2 or 2.3");
        expect(dosNameToString(makeDosName(DosFamily.MULTIDOS, "1.7", "1.7.1", "1.71")))
            .to.equal("MultiDOS 1.7, 1.7.1 or 1.71");
    });

    it("writes NEWDOS/80's releases with a v, and Super Utility+'s as a data disk", () => {
        expect(dosNameToString(makeDosName(DosFamily.NEWDOS_80, "2.0"))).to.equal("NEWDOS/80 v2.0");
        expect(dosNameToString(makeDosName(DosFamily.NEWDOS_80, "2.0", "2.5", "2.74")))
            .to.equal("NEWDOS/80 v2.0, v2.5 or v2.74");
        expect(dosNameToString(makeDosName(DosFamily.SUPER_UTILITY_PLUS, "3.1"))).to.equal("Super Utility+ 3.1 data disk");
    });

    it("adds another candidate family after the first", () => {
        const name = {...makeDosName(DosFamily.MULTIDOS, "5.11"), or: makeDosName(DosFamily.ESOTERIC, "2.12")};
        expect(dosNameToString(name)).to.equal("MultiDOS 5.11 or Esoteric 2.12");
    });
});

describe("isUnknownDosName", () => {
    it("counts a name unknown only if every candidate is", () => {
        expect(isUnknownDosName(UNKNOWN_DOS_NAME)).to.equal(true);
        expect(isUnknownDosName({...UNKNOWN_DOS_NAME, or: makeDosName(DosFamily.SUPER_UTILITY_PLUS, "2.2")})).to.equal(true);
        expect(isUnknownDosName({...UNKNOWN_DOS_NAME, or: makeDosName(DosFamily.LDOS, "5.3")})).to.equal(false);
        expect(isUnknownDosName(makeDosName(DosFamily.MULTIDOS))).to.equal(false);
    });
});

describe("isTrsdos6Line", () => {
    it("takes TRSDOS 6 and LS-DOS 6, and needs every candidate to be one", () => {
        expect(isTrsdos6Line(makeDosName(DosFamily.TRSDOS, "6.2"))).to.equal(true);
        expect(isTrsdos6Line(makeDosName(DosFamily.TRSDOS, "6.1.1", "6.1.2"))).to.equal(true);
        expect(isTrsdos6Line(makeDosName(DosFamily.LS_DOS, "6.3.1"))).to.equal(true);
        expect(isTrsdos6Line(makeDosName(DosFamily.TRSDOS, "2.3"))).to.equal(false);
        expect(isTrsdos6Line(makeDosName(DosFamily.DOSPLUS_IV, "1.0"))).to.equal(false);
        expect(isTrsdos6Line({...makeDosName(DosFamily.TRSDOS, "6.2"), or: makeDosName(DosFamily.LDOS, "5.3")}))
            .to.equal(false);
    });
});

describe("isNewdos80Line", () => {
    it("takes NEWDOS/80 and the DOSes built from it, for any candidate", () => {
        expect(isNewdos80Line(makeDosName(DosFamily.NEWDOS_80, "2.0", "2.5"))).to.equal(true);
        expect(isNewdos80Line(makeDosName(DosFamily.NEWDOS_90))).to.equal(true);
        expect(isNewdos80Line(makeDosName(DosFamily.G_DOS))).to.equal(true);
        expect(isNewdos80Line(makeDosName(DosFamily.NEWDOS, "2.1"))).to.equal(false);
        expect(isNewdos80Line(UNKNOWN_DOS_NAME)).to.equal(false);
        expect(isNewdos80Line({...makeDosName(DosFamily.MULTIDOS), or: makeDosName(DosFamily.NEWDOS_80, "2.0")}))
            .to.equal(true);
    });
});
