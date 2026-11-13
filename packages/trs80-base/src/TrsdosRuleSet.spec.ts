import {describe, expect, it} from "vitest";
import {decodeTrsdos, type Trsdos, TrsdosVersion} from "./Trsdos.js";
import {
    identifyTrsdosRuleSet,
    parseTrsdosRuleSet,
    ruleSetForDosName,
    TRSDOS_RULE_SETS,
    TrsdosRuleSet,
    trsdosRuleSetCliName,
    trsdosRuleSetLayout,
    trsdosRuleSetToString,
} from "./TrsdosRuleSet.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";
import {DosFamily, type DosName, dosNameToString, makeDosName, UNKNOWN_DOS_NAME} from "./DosName.js";

/**
 * A TRSDOS release's name, for short.
 */
function trsdos(version: string): DosName {
    return makeDosName(DosFamily.TRSDOS, version);
}

/**
 * Give a decoded disk another DOS name, to test what's decided from the name.
 */
function withDosName(trsdos: Trsdos, dosName: DosName): Trsdos {
    Object.defineProperty(trsdos, "dosName", {value: dosName});
    return trsdos;
}

/**
 * Names of DOSes on the 2.3 layout, and the rule set each follows (undefined for none).
 */
const LAYOUT_2_3_NAMES: [DosName, TrsdosRuleSet | undefined][] = [
    [makeDosName(DosFamily.TRSDOS, "2.0"), TrsdosRuleSet.TRSDOS_2],
    [makeDosName(DosFamily.TRSDOS, "2.1"), TrsdosRuleSet.TRSDOS_2],
    [makeDosName(DosFamily.TRSDOS, "2.1C"), TrsdosRuleSet.TRSDOS_2],
    [makeDosName(DosFamily.TRSDOS, "2.2"), TrsdosRuleSet.TRSDOS_2],
    [makeDosName(DosFamily.TRSDOS, "2.3"), TrsdosRuleSet.TRSDOS_2],
    [makeDosName(DosFamily.TRSDOS, "2.x"), TrsdosRuleSet.TRSDOS_2],
    [makeDosName(DosFamily.TRSDOS, "2.2", "2.3"), TrsdosRuleSet.TRSDOS_2],
    [makeDosName(DosFamily.TRSDOS, "2.3B"), undefined],
    [makeDosName(DosFamily.TRSDOS, "3.0"), undefined],
    [makeDosName(DosFamily.LDOS, "5.0.0"), TrsdosRuleSet.LDOS_5],
    [makeDosName(DosFamily.LDOS, "5.1.4"), TrsdosRuleSet.LDOS_5],
    [makeDosName(DosFamily.LDOS, "5.3.1"), TrsdosRuleSet.LDOS_5],
    [makeDosName(DosFamily.LDOS, "5.1"), TrsdosRuleSet.LDOS_5],
    [makeDosName(DosFamily.LDOS, "5.3"), TrsdosRuleSet.LDOS_5],
    [makeDosName(DosFamily.LDOS, "5.1.0", "5.1.1"), TrsdosRuleSet.LDOS_5],
    [makeDosName(DosFamily.LS_DOS, "6.2.0"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.LS_DOS, "6.3"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.LS_DOS, "6.3.0"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.LS_DOS, "6.3.1"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.TRSDOS, "6.0.0"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.TRSDOS, "6.0"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.TRSDOS, "6.2.1"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.TRSDOS, "6.2"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.TRSDOS, "6.1.1", "6.1.2"), TrsdosRuleSet.TRSDOS_6],
    [makeDosName(DosFamily.DOSPLUS, "3.1"), TrsdosRuleSet.DOSPLUS],
    [makeDosName(DosFamily.DOSPLUS, "3.2.1"), TrsdosRuleSet.DOSPLUS],
    [makeDosName(DosFamily.DOSPLUS, "3.4a"), TrsdosRuleSet.DOSPLUS],
    [makeDosName(DosFamily.DOSPLUS, "3.5"), TrsdosRuleSet.DOSPLUS],
    [makeDosName(DosFamily.DOSPLUS, "3.3"), TrsdosRuleSet.DOSPLUS],
    [{...makeDosName(DosFamily.DOSPLUS, "3.2.1", "3.3", "3.4"), fromPasswordsOnly: true}, undefined],
    [{...makeDosName(DosFamily.DOSPLUS, "3.1", "3.2"), fromPasswordsOnly: true}, undefined],
    [makeDosName(DosFamily.DOSPLUS, "4.0"), undefined],
    [makeDosName(DosFamily.DOSPLUS_II, "A.00"), undefined],
    [makeDosName(DosFamily.DOSPLUS_IV, "1.0"), undefined],
    [makeDosName(DosFamily.DOSPLUS_IV), undefined],
    [makeDosName(DosFamily.DOSPLUS), undefined],
    [makeDosName(DosFamily.NEWDOS_80, "2.0"), TrsdosRuleSet.NEWDOS_80],
    [makeDosName(DosFamily.NEWDOS_80, "2.0", "2.5", "2.74"), TrsdosRuleSet.NEWDOS_80],
    [makeDosName(DosFamily.NEWDOS_80, "2.X"), TrsdosRuleSet.NEWDOS_80],
    // 1.0 has rules, which the write gate allows in one layout only; there was no 1.1.
    [makeDosName(DosFamily.NEWDOS_80, "1.0"), TrsdosRuleSet.NEWDOS_80],
    [makeDosName(DosFamily.NEWDOS_80, "1.1"), undefined],
    [makeDosName(DosFamily.NEWDOS_80, "3.0"), undefined],
    [makeDosName(DosFamily.BFLOADER), undefined],
    [makeDosName(DosFamily.NEWDOS, "2.1"), undefined],
    [makeDosName(DosFamily.MULTIDOS, "1.6"), TrsdosRuleSet.MULTIDOS],
    [makeDosName(DosFamily.MULTIDOS, "1.0"), TrsdosRuleSet.MULTIDOS],
    [makeDosName(DosFamily.MULTIDOS, "1.6aP"), TrsdosRuleSet.MULTIDOS],
    [makeDosName(DosFamily.MULTIDOS, "1.7", "1.7.1", "1.71"), TrsdosRuleSet.MULTIDOS],
    [makeDosName(DosFamily.MULTIDOS, "2.00"), TrsdosRuleSet.MULTIDOS],
    [makeDosName(DosFamily.MULTIDOS, "2.10"), undefined],
    [makeDosName(DosFamily.MULTIDOS, "4.01"), undefined],
    [makeDosName(DosFamily.MULTIDOS), undefined],
    [makeDosName(DosFamily.MULTIDOS_II), undefined],
    [makeDosName(DosFamily.VTOS, "4.0"), undefined],
    [makeDosName(DosFamily.SUPER_UTILITY_PLUS, "3.1"), undefined],
    [makeDosName(DosFamily.UNKNOWN), undefined],
];

/**
 * Names of DOSes on the TRSDOS 1.3 layout, and the rule set each follows.
 */
const LAYOUT_1_3_NAMES: [DosName, TrsdosRuleSet | undefined][] = [
    [makeDosName(DosFamily.TRSDOS, "1.1"), TrsdosRuleSet.TRSDOS_1_3],
    [makeDosName(DosFamily.TRSDOS, "1.3"), TrsdosRuleSet.TRSDOS_1_3],
    [makeDosName(DosFamily.TRSDOS, "1.3.2"), TrsdosRuleSet.TRSDOS_1_3],
    [makeDosName(DosFamily.TRSDOS, "1.3I"), TrsdosRuleSet.TRSDOS_1_3],
    [makeDosName(DosFamily.TRSDOS, "1.4"), TrsdosRuleSet.TRSDOS_1_3],
    [makeDosName(DosFamily.TRSDOS, "1.5"), TrsdosRuleSet.TRSDOS_1_3],
    [makeDosName(DosFamily.TRSDOS, "1.x"), TrsdosRuleSet.TRSDOS_1_3],
    [makeDosName(DosFamily.SUPERDOS, "1.3"), undefined],
    [makeDosName(DosFamily.DOS500, "1.3"), undefined],
    [makeDosName(DosFamily.RAPIDOS, "1.3"), undefined],
    [makeDosName(DosFamily.UNKNOWN), undefined],
];

describe("ruleSetForDosName", () => {
    it("maps the names on the 2.3 layout", () => {
        for (const [name, expected] of LAYOUT_2_3_NAMES) {
            expect(ruleSetForDosName(name, TrsdosVersion.V2_3), dosNameToString(name)).to.equal(expected);
        }
    });

    it("maps the names on the 1.3 layout", () => {
        for (const [name, expected] of LAYOUT_1_3_NAMES) {
            expect(ruleSetForDosName(name, TrsdosVersion.V1_3), dosNameToString(name)).to.equal(expected);
        }
    });

    it("maps TRSDOS 2.7 and 2.8 on the 2.7 layout, and nothing else", () => {
        for (const version of ["2.7DD", "2.7SD", "2.8.0", "2.8", "2.7"]) {
            expect(ruleSetForDosName(trsdos(version), TrsdosVersion.V2_7), version).to.equal(TrsdosRuleSet.TRSDOS_2_7);
        }
        for (const name of [trsdos("2.77D"), trsdos("2.3"), trsdos("2.x"), makeDosName(DosFamily.LDOS, "5.3")]) {
            expect(ruleSetForDosName(name, TrsdosVersion.V2_7), dosNameToString(name)).to.be.undefined;
        }
    });

    it("maps NEWDOS/80 version 2 on the 2.3 layout only", () => {
        const v2 = makeDosName(DosFamily.NEWDOS_80, "2.X");
        expect(ruleSetForDosName(v2, TrsdosVersion.V2_3)).to.equal(TrsdosRuleSet.NEWDOS_80);
        expect(ruleSetForDosName(v2, TrsdosVersion.V1_3)).to.be.undefined;
    });

    it("rejects a name whose layout doesn't fit its rule set", () => {
        expect(ruleSetForDosName(makeDosName(DosFamily.LDOS, "5.1.4"), TrsdosVersion.V1_3)).to.be.undefined;
        expect(ruleSetForDosName(trsdos("2.3"), TrsdosVersion.V1_3)).to.be.undefined;
        expect(ruleSetForDosName(trsdos("1.3"), TrsdosVersion.V2_3)).to.be.undefined;
        expect(ruleSetForDosName(trsdos("6.2.0"), TrsdosVersion.V2_7)).to.be.undefined;
        expect(ruleSetForDosName(trsdos("2.8.0"), TrsdosVersion.V2_3)).to.be.undefined;
        expect(ruleSetForDosName(trsdos("2.7DD"), TrsdosVersion.V1_3)).to.be.undefined;
    });

    it("needs every release in a list to have the same rule set", () => {
        expect(ruleSetForDosName(makeDosName(DosFamily.TRSDOS, "2.3", "2.3B"), TrsdosVersion.V2_3)).to.be.undefined;
        expect(ruleSetForDosName(makeDosName(DosFamily.TRSDOS, "2.3", "6.2"), TrsdosVersion.V2_3)).to.be.undefined;
    });

    it("goes by the passwords flag, not by how many releases there are", () => {
        const dosplus = makeDosName(DosFamily.DOSPLUS, "3.2.1", "3.3", "3.4");
        expect(ruleSetForDosName(dosplus, TrsdosVersion.V2_3)).to.equal(TrsdosRuleSet.DOSPLUS);
        expect(ruleSetForDosName({...dosplus, fromPasswordsOnly: true}, TrsdosVersion.V2_3)).to.be.undefined;
        const single = {...makeDosName(DosFamily.DOSPLUS, "3.3"), fromPasswordsOnly: true};
        expect(ruleSetForDosName(single, TrsdosVersion.V2_3)).to.be.undefined;
    });

    it("gives a name with another candidate family a rule set only if both have the same one", () => {
        // Two families with different rule sets: neither one's rules are safe.
        const ldosOrTrsdos = {...makeDosName(DosFamily.LDOS, "5.3.1"), or: trsdos("2.3")};
        expect(ruleSetForDosName(ldosOrTrsdos, TrsdosVersion.V2_3)).to.be.undefined;
        // One with rules and one without.
        const ldosOrMultiDos = {...makeDosName(DosFamily.LDOS, "5.3.1"), or: makeDosName(DosFamily.MULTIDOS, "5.11")};
        expect(ruleSetForDosName(ldosOrMultiDos, TrsdosVersion.V2_3)).to.be.undefined;
        const multiDosOrLdos = {...makeDosName(DosFamily.MULTIDOS, "5.11"), or: makeDosName(DosFamily.LDOS, "5.3.1")};
        expect(ruleSetForDosName(multiDosOrLdos, TrsdosVersion.V2_3)).to.be.undefined;
        // Two names for the same rules.
        const trsdosOrLsdos = {...trsdos("6.2"), or: makeDosName(DosFamily.LS_DOS, "6.3.1")};
        expect(ruleSetForDosName(trsdosOrLsdos, TrsdosVersion.V2_3)).to.equal(TrsdosRuleSet.TRSDOS_6);
        // As the decoder names these, where neither family has rules.
        const multiDosOrEsoteric = {...makeDosName(DosFamily.MULTIDOS, "5.11"), or: makeDosName(DosFamily.ESOTERIC, "2.12")};
        expect(ruleSetForDosName(multiDosOrEsoteric, TrsdosVersion.V2_3)).to.be.undefined;
    });
});

describe("identifyTrsdosRuleSet", () => {
    it("recognizes a TRSDOS 2.x data disk", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]))!;
        expect(trsdos.nameAndVersion).to.equal("TRSDOS 2.x");
        expect(identifyTrsdosRuleSet(trsdos)).to.eql({ruleSet: TrsdosRuleSet.TRSDOS_2, recognized: true});
    });

    it("doesn't recognize a disk of an unknown DOS", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]))!;
        expect(identifyTrsdosRuleSet(withDosName(trsdos, UNKNOWN_DOS_NAME))).to.eql({ruleSet: undefined, recognized: false});
    });

    it("doesn't recognize a disk named only by the utility that formatted it", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]))!;
        expect(identifyTrsdosRuleSet(withDosName(trsdos, makeDosName(DosFamily.SUPER_UTILITY_PLUS, "3.1")))).to.eql({ruleSet: undefined, recognized: false});
    });

    it("recognizes a DOS that we have no rules for", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]))!;
        expect(identifyTrsdosRuleSet(withDosName(trsdos, makeDosName(DosFamily.TRSDOS, "2.3B")))).to.eql({ruleSet: undefined, recognized: true});
    });
});

describe("rule set names", () => {
    it("lists every rule set once, in enum order", () => {
        const values = Object.values(TrsdosRuleSet).filter(value => typeof value === "number");
        expect([...TRSDOS_RULE_SETS]).to.eql(values);
    });

    it("round-trips the CLI names, in any case", () => {
        for (const ruleSet of TRSDOS_RULE_SETS) {
            const cliName = trsdosRuleSetCliName(ruleSet);
            expect(parseTrsdosRuleSet(cliName)).to.equal(ruleSet);
            expect(parseTrsdosRuleSet(cliName.toUpperCase())).to.equal(ruleSet);
        }
    });

    it("has different CLI names and display names", () => {
        expect(new Set(TRSDOS_RULE_SETS.map(trsdosRuleSetCliName)).size).to.equal(TRSDOS_RULE_SETS.length);
        expect(new Set(TRSDOS_RULE_SETS.map(trsdosRuleSetToString)).size).to.equal(TRSDOS_RULE_SETS.length);
        expect(trsdosRuleSetToString(TrsdosRuleSet.TRSDOS_2)).to.equal("TRSDOS 2.x");
        expect(trsdosRuleSetCliName(TrsdosRuleSet.TRSDOS_1_3)).to.equal("trsdos-1.3");
    });

    it("accepts the aliases for TRSDOS 6 and TRSDOS 2.8", () => {
        expect(parseTrsdosRuleSet("ldos-6")).to.equal(TrsdosRuleSet.TRSDOS_6);
        expect(parseTrsdosRuleSet("LS-DOS-6")).to.equal(TrsdosRuleSet.TRSDOS_6);
        expect(parseTrsdosRuleSet("trsdos-2.7")).to.equal(TrsdosRuleSet.TRSDOS_2_7);
        expect(parseTrsdosRuleSet("TRSDOS-2.8")).to.equal(TrsdosRuleSet.TRSDOS_2_7);
    });

    it("accepts the NEWDOS/80 names", () => {
        expect(parseTrsdosRuleSet("newdos-80")).to.equal(TrsdosRuleSet.NEWDOS_80);
        expect(parseTrsdosRuleSet("NEWDOS/80")).to.equal(TrsdosRuleSet.NEWDOS_80);
        expect(parseTrsdosRuleSet("newdos80")).to.equal(TrsdosRuleSet.NEWDOS_80);
    });

    it("rejects other names", () => {
        expect(parseTrsdosRuleSet("")).to.be.undefined;
        expect(parseTrsdosRuleSet("trsdos")).to.be.undefined;
    });
});

describe("trsdosRuleSetLayout", () => {
    it("gives TRSDOS 1.3 and 2.7 their own layouts and the rest the 2.3 layout", () => {
        for (const ruleSet of TRSDOS_RULE_SETS) {
            const expected = ruleSet === TrsdosRuleSet.TRSDOS_1_3 ? TrsdosVersion.V1_3 :
                ruleSet === TrsdosRuleSet.TRSDOS_2_7 ? TrsdosVersion.V2_7 : TrsdosVersion.V2_3;
            expect(trsdosRuleSetLayout(ruleSet)).to.equal(expected);
        }
    });
});
