import {describe, expect, it} from "vitest";
import {TrsdosDirEntry, TrsdosVersion} from "./Trsdos.js";

/**
 * Make a directory entry with the given date fields, and placeholders for everything else.
 */
function makeDirEntry(day: number, month: number, year: number | undefined,
                      hour: number | undefined = undefined, minute: number | undefined = undefined): TrsdosDirEntry {

    return new TrsdosDirEntry(TrsdosVersion.V2_3, 0, day, month, year, hour, minute,
        0, 0, "FILE    BAS", undefined, undefined, 0, undefined, undefined, []);
}

describe("TrsdosDirEntry.getDate", () => {
    it("returns a full date", () => {
        expect(makeDirEntry(15, 6, 1983).getDate()).to.eql(new Date(1983, 5, 15));
    });

    it("includes the time when the entry has one", () => {
        expect(makeDirEntry(15, 6, 1983, 13, 45).getDate()).to.eql(new Date(1983, 5, 15, 13, 45));
    });

    it("treats a year-only date as January 1", () => {
        expect(makeDirEntry(0, 0, 1980).getDate()).to.eql(new Date(1980, 0, 1));
    });

    it("treats a missing day as the first of the month", () => {
        expect(makeDirEntry(0, 11, 1980).getDate()).to.eql(new Date(1980, 10, 1));
    });

    it("returns undefined when there's no year", () => {
        expect(makeDirEntry(0, 0, undefined).getDate()).to.be.undefined;
    });
});
