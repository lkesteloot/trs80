import fs from "fs";
import os from "os";
import path from "path";
import {
    Density, SectorData, SectorPosition, type TrsdosCheckResult, TrsdosWriteAccess, type TrsdosWriteBlocker,
    TrsdosWriteBlockerKind, type TrsdosWriteGate,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {decideWrite, DiskSession, DiskWritePurpose} from "./DiskSession.js";

const BYTES_PER_SECTOR = 256;
const SECTORS_PER_CYLINDER = 10;
const CYLINDER_COUNT = 35;

describe("DiskSession saving", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-session-"));
        imagePathname = path.join(dir, "blank.jv1");
        fs.writeFileSync(imagePathname, new Uint8Array(CYLINDER_COUNT*SECTORS_PER_CYLINDER*BYTES_PER_SECTOR));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Fill a sector of the session's floppy with a value.
     */
    function writeSector(session: DiskSession, cylinder: number, sector: number, value: number): void {
        const position = SectorPosition.make(cylinder, 0, sector);
        const sectorData = new SectorData(new Uint8Array(BYTES_PER_SECTOR).fill(value), position, Density.SINGLE);
        session.floppy.writeSector(position, sectorData);
    }

    /**
     * The byte at the start of the given sector of a JV1 image on the host.
     */
    function firstByteOfSector(pathname: string, cylinder: number, sector: number): number {
        return fs.readFileSync(pathname)[(cylinder*SECTORS_PER_CYLINDER + sector)*BYTES_PER_SECTOR];
    }

    it("tracks changes and saves them in place, once", () => {
        const session = DiskSession.open(imagePathname);
        expect(session.hasChanges()).to.equal(false);
        expect(session.save()).to.equal(undefined);

        writeSector(session, 3, 4, 0x5A);
        expect(session.hasChanges()).to.equal(true);
        // Nothing is written until we save.
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0);

        expect(session.save()).to.equal(imagePathname);
        expect(session.hasChanges()).to.equal(false);
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0x5A);
        expect(fs.readdirSync(dir)).to.eql(["blank.jv1"]);

        // A second save has nothing to do.
        expect(session.save()).to.equal(undefined);
    });

    it("saves later changes after an earlier save", () => {
        const session = DiskSession.open(imagePathname);
        writeSector(session, 3, 4, 0x11);
        session.save();
        writeSector(session, 5, 6, 0x22);
        expect(session.hasChanges()).to.equal(true);
        session.save();
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0x11);
        expect(firstByteOfSector(imagePathname, 5, 6)).to.equal(0x22);
    });

    it("writes the --output file and leaves the image alone", () => {
        const outputPathname = path.join(dir, "out.jv1");
        const session = DiskSession.open(imagePathname, { outputPathname });
        writeSector(session, 3, 4, 0x5A);

        expect(session.save()).to.equal(outputPathname);
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0);
        expect(firstByteOfSector(outputPathname, 3, 4)).to.equal(0x5A);

        // Later saves in the session go to the output file too.
        writeSector(session, 5, 6, 0x22);
        expect(session.save()).to.equal(outputPathname);
        expect(firstByteOfSector(outputPathname, 5, 6)).to.equal(0x22);
        expect(firstByteOfSector(imagePathname, 5, 6)).to.equal(0);
    });

    it("writes nothing with --dry-run, even with --output", () => {
        const outputPathname = path.join(dir, "out.jv1");
        const session = DiskSession.open(imagePathname, { outputPathname, dryRun: true });
        writeSector(session, 3, 4, 0x5A);

        expect(session.hasChanges()).to.equal(true);
        expect(session.save()).to.equal(undefined);
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0);
        expect(fs.existsSync(outputPathname)).to.equal(false);
        expect(fs.readdirSync(dir)).to.eql(["blank.jv1"]);
    });

    it("saves nothing after abort()", () => {
        const untouched = DiskSession.open(imagePathname);
        expect(untouched.abort()).to.equal(undefined);

        const session = DiskSession.open(imagePathname);
        writeSector(session, 3, 4, 0x5A);
        expect(session.abort()).to.equal(imagePathname);
        expect(session.hasChanges()).to.equal(false);
        expect(session.save()).to.equal(undefined);
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0);
    });

    it("reports a failure to save as a ToolError and keeps the changes", () => {
        const outputPathname = path.join(dir, "missing", "out.jv1");
        const session = DiskSession.open(imagePathname, { outputPathname });
        writeSector(session, 3, 4, 0x5A);

        expect(() => session.save()).to.throw(ToolError, "Can't save \"" + outputPathname + "\"");
        expect(session.hasChanges()).to.equal(true);
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0);
    });

    /**
     * Run a function and return the lines that it printed with console.log().
     */
    function printedLines(f: () => void): string[] {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            f();
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    it("says what it did when asked to save and report", () => {
        const session = DiskSession.open(imagePathname);
        expect(printedLines(() => session.saveAndReport(false))).to.eql([]);
        expect(printedLines(() => session.saveAndReport(true))).to.eql(["No changes to save."]);
        writeSector(session, 3, 4, 0x5A);
        expect(printedLines(() => session.saveAndReport(true))).to.eql(["Saved " + imagePathname + "."]);
        expect(printedLines(() => session.saveAndReport(false))).to.eql([]);
    });

    it("says what --dry-run would have done, once", () => {
        const session = DiskSession.open(imagePathname, { dryRun: true });
        writeSector(session, 3, 4, 0x5A);
        expect(printedLines(() => session.saveAndReport(false))).to.eql([
            "Not saved (--dry-run): " + imagePathname + " would have changed."]);
        expect(printedLines(() => session.saveAndReport(false))).to.eql([]);
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0);
    });

    it("says nothing at the end after abort()", () => {
        const session = DiskSession.open(imagePathname);
        writeSector(session, 3, 4, 0x5A);
        session.abort();
        expect(printedLines(() => session.saveAndReport(true))).to.eql([]);
        expect(firstByteOfSector(imagePathname, 3, 4)).to.equal(0);
    });
});

/**
 * A gate with the given access and blockers, for testing decideWrite(), which doesn't look at the rest.
 */
function makeGate(access: TrsdosWriteAccess, blockers: TrsdosWriteBlocker[]): TrsdosWriteGate {
    return { access, blockers, check: {} as TrsdosCheckResult, ruleSet: undefined };
}

/**
 * A blocker of the given kind, with a message made from its forceability.
 */
function makeBlocker(kind: TrsdosWriteBlockerKind, message: string, forceable: boolean): TrsdosWriteBlocker {
    return { kind, message, forceable };
}

describe("decideWrite", () => {
    const damage = makeBlocker(TrsdosWriteBlockerKind.DAMAGE, "It is damaged.", true);
    const doubt = makeBlocker(TrsdosWriteBlockerKind.LAYOUT_DOUBT, "The layout is doubtful.", true);
    const unknownDos = makeBlocker(TrsdosWriteBlockerKind.UNKNOWN_DOS, "Name the DOS with --dos.", false);

    it("refuses a file system that isn't TRSDOS-family", () => {
        expect(decideWrite(undefined, "CP/M 2.2", DiskWritePurpose.CHANGE, false)).to.eql({
            allowed: false, error: "Writing CP/M 2.2 disks isn't supported.",
        });
        // Forcing can't help.
        expect(decideWrite(undefined, "CP/M 2.2", DiskWritePurpose.REPAIR, true).allowed).to.equal(false);
    });

    it("allows a writable disk without a warning", () => {
        const gate = makeGate(TrsdosWriteAccess.WRITABLE, []);
        for (const force of [false, true]) {
            expect(decideWrite(gate, "LDOS 5.1.4", DiskWritePurpose.CHANGE, force)).to.eql({
                allowed: true, warning: undefined,
            });
        }
    });

    it("allows only a repair on a damaged disk", () => {
        const gate = makeGate(TrsdosWriteAccess.REPAIR_ONLY, [damage]);
        expect(decideWrite(gate, "LDOS 5.1.4", DiskWritePurpose.REPAIR, false)).to.eql({
            allowed: true, warning: undefined,
        });
        expect(decideWrite(gate, "LDOS 5.1.4", DiskWritePurpose.CHANGE, false)).to.eql({
            allowed: false, error: "Can't write to this disk: It is damaged. Use --force to write anyway.",
        });
    });

    it("lets --force write despite forceable blockers, with a warning", () => {
        const gate = makeGate(TrsdosWriteAccess.READ_ONLY, [doubt, damage]);
        expect(decideWrite(gate, "LDOS 5.1.4", DiskWritePurpose.CHANGE, true)).to.eql({
            allowed: true, warning: "Writing anyway (--force): The layout is doubtful. It is damaged.",
        });
        expect(decideWrite(gate, "LDOS 5.1.4", DiskWritePurpose.CHANGE, false)).to.eql({
            allowed: false,
            error: "Can't write to this disk: The layout is doubtful. It is damaged. Use --force to write anyway.",
        });
    });

    it("lets --force write a damaged disk for an ordinary change", () => {
        const gate = makeGate(TrsdosWriteAccess.REPAIR_ONLY, [damage]);
        expect(decideWrite(gate, "LDOS 5.1.4", DiskWritePurpose.CHANGE, true)).to.eql({
            allowed: true, warning: "Writing anyway (--force): It is damaged.",
        });
    });

    it("never forces past a blocker that isn't forceable, and doesn't mention --force", () => {
        const gate = makeGate(TrsdosWriteAccess.READ_ONLY, [unknownDos, doubt]);
        for (const force of [false, true]) {
            const decision = decideWrite(gate, "TRSDOS 2.3", DiskWritePurpose.CHANGE, force);
            expect(decision).to.eql({
                allowed: false, error: "Can't write to this disk: Name the DOS with --dos. The layout is doubtful.",
            });
        }
    });

    it("doesn't let a repair past a read-only disk", () => {
        const gate = makeGate(TrsdosWriteAccess.READ_ONLY, [doubt]);
        expect(decideWrite(gate, "LDOS 5.1.4", DiskWritePurpose.REPAIR, false).allowed).to.equal(false);
    });
});
