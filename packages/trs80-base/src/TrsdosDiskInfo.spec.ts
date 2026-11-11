import {describe, expect, it} from "vitest";
import {parseTrsdosGatDate} from "./TrsdosDiskInfo.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";

describe("parseTrsdosGatDate", () => {
    it("reads a date in the twentieth century", () => {
        expect(parseTrsdosGatDate("01/25/83", TrsdosRuleSet.TRSDOS_2)).to.eql({year: 1983, month: 1, day: 25});
    });

    it("reads the years before the DOS's first as the twenty-first century", () => {
        expect(parseTrsdosGatDate("11/11/05", TrsdosRuleSet.LDOS_5)).to.eql({year: 2005, month: 11, day: 11});
        // Past what LDOS's DATE command takes, as on a disk we created today.
        expect(parseTrsdosGatDate("11/11/26", TrsdosRuleSet.LDOS_5)).to.eql({year: 2026, month: 11, day: 11});
        // TRSDOS 2.3 starts in 1978, LDOS in 1980.
        expect(parseTrsdosGatDate("01/01/79", TrsdosRuleSet.TRSDOS_2)).to.eql({year: 1979, month: 1, day: 1});
        expect(parseTrsdosGatDate("01/01/79", TrsdosRuleSet.LDOS_5)).to.eql({year: 2079, month: 1, day: 1});
    });

    it("starts at 1978 when the rule set is unknown", () => {
        expect(parseTrsdosGatDate("06/30/78", undefined)).to.eql({year: 1978, month: 6, day: 30});
        expect(parseTrsdosGatDate("06/30/77", undefined)).to.eql({year: 2077, month: 6, day: 30});
    });

    it("rejects a month or day that doesn't exist", () => {
        expect(parseTrsdosGatDate("00/00/00", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("13/01/83", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("00/01/83", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("01/32/83", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("01/00/83", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("02/29/83", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("02/29/84", undefined)).to.eql({year: 1984, month: 2, day: 29});
    });

    it("rejects text that isn't a date", () => {
        expect(parseTrsdosGatDate("", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("none", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("1/2/83", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("01-25-83", undefined)).to.equal(undefined);
        expect(parseTrsdosGatDate("01/25/1983", undefined)).to.equal(undefined);
    });
});
