import {describe, expect, it} from "vitest";
import {getFileRows, FileKind} from "../core/FileRows.js";
import {makeSampleDisk, SAMPLE_DISK_NAME, SAMPLE_PROGRAMS} from "./Samples.js";

describe("makeSampleDisk", () => {
    it("makes an LDOS disk with the three programs, each in the history", async () => {
        const disk = await makeSampleDisk(new Date(2026, 10, 12));
        expect(disk.name).to.equal(SAMPLE_DISK_NAME);
        expect(disk.session.fileSystem?.nameAndVersion).to.contain("LDOS");

        const rows = getFileRows(disk.session, false);
        expect(rows.map(row => row.fullName)).to.eql(["HELLO/BAS", "TIMES/BAS", "GUESS/BAS"]);
        expect(rows.every(row => row.kind === FileKind.BASIC)).to.equal(true);
        expect(SAMPLE_PROGRAMS.length).to.equal(3);

        const history = disk.session.getHistory();
        expect(history.entries.length).to.equal(1);
        expect(history.entries[0]).to.contain("add");
    });
});
