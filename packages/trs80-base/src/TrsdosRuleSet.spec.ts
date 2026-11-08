import {describe, expect, it} from "vitest";
import {decodeTrsdos, TrsdosVersion} from "./Trsdos.js";
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

/**
 * Names of DOSes on the 2.3 layout, and the rule set each follows (undefined for none).
 */
const LAYOUT_2_3_NAMES: [string, TrsdosRuleSet | undefined][] = [
    ["TRSDOS 2.0", TrsdosRuleSet.TRSDOS_2],
    ["TRSDOS 2.1", TrsdosRuleSet.TRSDOS_2],
    ["TRSDOS 2.1C", TrsdosRuleSet.TRSDOS_2],
    ["TRSDOS 2.2", TrsdosRuleSet.TRSDOS_2],
    ["TRSDOS 2.3", TrsdosRuleSet.TRSDOS_2],
    ["TRSDOS 2.x", TrsdosRuleSet.TRSDOS_2],
    ["TRSDOS 2.3B", undefined],
    ["TRSDOS 3.0", undefined],
    ["LDOS 5.0.0", TrsdosRuleSet.LDOS_5],
    ["LDOS 5.1.4", TrsdosRuleSet.LDOS_5],
    ["LDOS 5.3.1", TrsdosRuleSet.LDOS_5],
    ["LDOS 5.1", TrsdosRuleSet.LDOS_5],
    ["LDOS 5.3", TrsdosRuleSet.LDOS_5],
    ["LS-DOS 6.2.0", TrsdosRuleSet.TRSDOS_6],
    ["LS-DOS 6.3", TrsdosRuleSet.TRSDOS_6],
    ["LS-DOS 6.3.0", TrsdosRuleSet.TRSDOS_6],
    ["LS-DOS 6.3.1", TrsdosRuleSet.TRSDOS_6],
    ["TRSDOS 6.0.0", TrsdosRuleSet.TRSDOS_6],
    ["TRSDOS 6.0", TrsdosRuleSet.TRSDOS_6],
    ["TRSDOS 6.2.1", TrsdosRuleSet.TRSDOS_6],
    ["TRSDOS 6.2", TrsdosRuleSet.TRSDOS_6],
    ["DOSPLUS 3.1", TrsdosRuleSet.DOSPLUS],
    ["DOSPLUS 3.2.1", TrsdosRuleSet.DOSPLUS],
    ["DOSPLUS 3.4a", TrsdosRuleSet.DOSPLUS],
    ["DOSPLUS 3.5", TrsdosRuleSet.DOSPLUS],
    ["DOSPLUS 4.0", undefined],
    ["DOSPLUS II A.00", undefined],
    ["DOSPLUS IV 1.0", undefined],
    ["DOSPLUS IV", undefined],
    ["DOSPLUS", undefined],
    ["NEWDOS/80 v2.0", undefined],
    ["NEWDOS 2.1", undefined],
    ["MultiDOS 1.6", undefined],
    ["VTOS 4.0", undefined],
    ["Super Utility+ 3.1 data disk", undefined],
    ["Unknown DOS", undefined],
];

/**
 * Names of DOSes on the TRSDOS 1.3 layout, and the rule set each follows.
 */
const LAYOUT_1_3_NAMES: [string, TrsdosRuleSet | undefined][] = [
    ["TRSDOS 1.1", TrsdosRuleSet.TRSDOS_1_3],
    ["TRSDOS 1.3", TrsdosRuleSet.TRSDOS_1_3],
    ["TRSDOS 1.3.2", TrsdosRuleSet.TRSDOS_1_3],
    ["TRSDOS 1.3I", TrsdosRuleSet.TRSDOS_1_3],
    ["TRSDOS 1.4", TrsdosRuleSet.TRSDOS_1_3],
    ["TRSDOS 1.5", TrsdosRuleSet.TRSDOS_1_3],
    ["TRSDOS 1.x", TrsdosRuleSet.TRSDOS_1_3],
    ["SuperDOS 1.3", undefined],
    ["DOS500 1.3", undefined],
    ["RAPIDOS 1.3", undefined],
    ["Unknown DOS", undefined],
];

describe("ruleSetForDosName", () => {
    it("maps the names on the 2.3 layout", () => {
        for (const [name, expected] of LAYOUT_2_3_NAMES) {
            expect(ruleSetForDosName(name, TrsdosVersion.V2_3), name).to.equal(expected);
        }
    });

    it("maps the names on the 1.3 layout", () => {
        for (const [name, expected] of LAYOUT_1_3_NAMES) {
            expect(ruleSetForDosName(name, TrsdosVersion.V1_3), name).to.equal(expected);
        }
    });

    it("maps nothing on the 2.7 layout", () => {
        for (const name of ["TRSDOS 2.7DD", "TRSDOS 2.7SD", "TRSDOS 2.8.0", "TRSDOS 2.7"]) {
            expect(ruleSetForDosName(name, TrsdosVersion.V2_7), name).to.be.undefined;
        }
    });

    it("rejects a name whose layout doesn't fit its rule set", () => {
        expect(ruleSetForDosName("LDOS 5.1.4", TrsdosVersion.V1_3)).to.be.undefined;
        expect(ruleSetForDosName("TRSDOS 2.3", TrsdosVersion.V1_3)).to.be.undefined;
        expect(ruleSetForDosName("TRSDOS 1.3", TrsdosVersion.V2_3)).to.be.undefined;
        expect(ruleSetForDosName("TRSDOS 6.2.0", TrsdosVersion.V2_7)).to.be.undefined;
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
        Object.defineProperty(trsdos, "nameAndVersion", {value: "Unknown DOS"});
        expect(identifyTrsdosRuleSet(trsdos)).to.eql({ruleSet: undefined, recognized: false});
    });

    it("doesn't recognize a disk named only by the utility that formatted it", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]))!;
        Object.defineProperty(trsdos, "nameAndVersion", {value: "Super Utility+ 3.1 data disk"});
        expect(identifyTrsdosRuleSet(trsdos)).to.eql({ruleSet: undefined, recognized: false});
    });

    it("recognizes a DOS that we have no rules for", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]))!;
        Object.defineProperty(trsdos, "nameAndVersion", {value: "TRSDOS 2.3B"});
        expect(identifyTrsdosRuleSet(trsdos)).to.eql({ruleSet: undefined, recognized: true});
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

    it("accepts the aliases for TRSDOS 6", () => {
        expect(parseTrsdosRuleSet("ldos-6")).to.equal(TrsdosRuleSet.TRSDOS_6);
        expect(parseTrsdosRuleSet("LS-DOS-6")).to.equal(TrsdosRuleSet.TRSDOS_6);
    });

    it("rejects other names", () => {
        expect(parseTrsdosRuleSet("")).to.be.undefined;
        expect(parseTrsdosRuleSet("newdos-80")).to.be.undefined;
        expect(parseTrsdosRuleSet("trsdos")).to.be.undefined;
    });
});

describe("trsdosRuleSetLayout", () => {
    it("gives TRSDOS 1.3 its own layout and the rest the 2.3 layout", () => {
        for (const ruleSet of TRSDOS_RULE_SETS) {
            const expected = ruleSet === TrsdosRuleSet.TRSDOS_1_3 ? TrsdosVersion.V1_3 : TrsdosVersion.V2_3;
            expect(trsdosRuleSetLayout(ruleSet)).to.equal(expected);
        }
    });
});
