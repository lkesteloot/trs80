import {describe, expect, it} from "vitest";
import {Density, SectorData, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import type {DiskVolume, VolumeGeometry} from "./DiskVolume.js";
import {type PdriveSettings, PdriveSource, pdriveSettingsSourceToString, pdriveSettingsToString, readPdriveTable} from "./Pdrive.js";

/**
 * A disk volume that holds only sector 2 of cylinders 0 and 1 (side 0), for reading a PDRIVE table.
 * Every other sector is unreadable.
 *
 * @param cylinder0 the start of cylinder 0's sector 2, padded to 256 bytes with zeros, or undefined
 * for an unreadable sector.
 * @param cylinder1 the same for cylinder 1.
 */
function makeVolume(cylinder0: number[] | undefined, cylinder1?: number[]): DiskVolume {
    const sectors = [cylinder0, cylinder1];
    return {
        getGeometry(): VolumeGeometry {
            throw new Error("not used");
        },
        readSector(sectorPosition: SectorPosition): SectorData | undefined {
            const bytes = sectors[sectorPosition.trackPosition.cylinderNumber];
            if (sectorPosition.trackPosition.side !== 0 || sectorPosition.sectorNumber !== 2 || bytes === undefined) {
                return undefined;
            }
            const data = new Uint8Array(256);
            data.set(bytes);
            return new SectorData(data, sectorPosition, Density.DOUBLE);
        },
        hasSectorData(sectorPosition: SectorPosition): boolean {
            return this.readSector(sectorPosition) !== undefined;
        },
        getBootTrackText(): string {
            return "";
        },
    };
}

/**
 * Read the table and show it as PDRIVE takes it, or undefined if there's none.
 */
function readLine(volume: DiskVolume): string | undefined {
    const settings = readPdriveTable(volume);
    return settings === undefined ? undefined : pdriveSettingsToString(settings);
}

// Slot 0 of Matthew Reed's 3nd test disk (NEWDOS/80 v2.0 for the Model III).
const MODEL_III_SLOT = [0x11, 0x48, 0x07, 0x28, 0x12, 0x02, 0xFE, 0x01, 0x11, 0x02, 0x00, 0x00, 0x03, 0x01, 0x00, 0x04];

// Slot 0 of the 1nd25dd test disk's table, on cylinder 1: a Percom doubler (TI=C) with the K flag.
const PERCOM_SLOT = [0x11, 0x48, 0x52, 0x28, 0x12, 0x02, 0x00, 0x03, 0x11, 0x02, 0x00, 0x00, 0x02, 0x04, 0x04, 0x04];

// Five bytes of 0xE5 filler, then more.
const BLANK = new Array(16).fill(0xE5);

describe("readPdriveTable", () => {
    it("reads every field of a table on cylinder 0", () => {
        const settings = readPdriveTable(makeVolume(MODEL_III_SLOT));
        expect(settings).to.eql({
            source: PdriveSource.TABLE,
            tableCylinder: 0,
            interfaceType: "A",
            sectorOneLowest: false,
            trackOneLowest: false,
            track0OtherDensity: false,
            driveType: "E",
            trackCount: 40,
            sectorsPerTrack: 18,
            stepRate: 3,
            granulesPerLump: 2,
            dirStartLump: 17,
            dirGranules: 2,
            lumpCount: 72,
        } satisfies PdriveSettings);
        expect(pdriveSettingsToString(settings!)).to.equal("TI=A,TD=E,TC=40,SPT=18,TSR=3,GPL=2,DDSL=17,DDGA=2");
        expect(pdriveSettingsSourceToString(settings!)).to.equal("from the drive table");
    });

    it("reads cylinder 1's table when cylinder 0's sector is blank, and sets K", () => {
        const settings = readPdriveTable(makeVolume(BLANK, PERCOM_SLOT));
        expect(settings?.tableCylinder).to.equal(1);
        expect(pdriveSettingsToString(settings!)).to.equal("TI=CK,TD=E,TC=40,SPT=18,TSR=2,GPL=2,DDSL=17,DDGA=2");
        expect(pdriveSettingsSourceToString(settings!)).to.equal("from the drive table on cylinder 1");

        // K comes from the fallback even when the table doesn't set it.
        const withoutK = [...PERCOM_SLOT];
        withoutK[14] = 0x00;
        expect(readLine(makeVolume(BLANK, withoutK))).to.equal("TI=CK,TD=E,TC=40,SPT=18,TSR=2,GPL=2,DDSL=17,DDGA=2");
    });

    it("shows a cylinder 1 table marked single density as TD=E", () => {
        const singleDensity = [...PERCOM_SLOT];
        singleDensity[15] = 0x00;
        expect(readLine(makeVolume(BLANK, singleDensity))).to.equal("TI=CK,TD=E,TC=40,SPT=18,TSR=2,GPL=2,DDSL=17,DDGA=2");

        // But not on cylinder 0.
        const cylinder0 = [...MODEL_III_SLOT];
        cylinder0[15] = 0x00;
        expect(readLine(makeVolume(cylinder0))).to.equal("TI=A,TD=A,TC=40,SPT=18,TSR=3,GPL=2,DDSL=17,DDGA=2");
    });

    it("decodes the interface letter and the I and J flags", () => {
        const slot = [...MODEL_III_SLOT];
        slot[13] = 0x10 | 0x80;   // E, plus a bit we don't know.
        slot[14] = 0x03;
        slot[15] = 0x07;
        expect(readLine(makeVolume(slot))).to.equal("TI=EIJ,TD=H,TC=40,SPT=18,TSR=3,GPL=2,DDSL=17,DDGA=2");

        // The lowest letter wins.
        slot[13] = 0x0C;
        slot[14] = 0x00;
        expect(readLine(makeVolume(slot))).to.equal("TI=C,TD=H,TC=40,SPT=18,TSR=3,GPL=2,DDSL=17,DDGA=2");

        // No letter at all.
        slot[13] = 0x00;
        expect(readPdriveTable(makeVolume(slot))?.interfaceType).to.equal(undefined);
        expect(readLine(makeVolume(slot))).to.equal("TI=?,TD=H,TC=40,SPT=18,TSR=3,GPL=2,DDSL=17,DDGA=2");
    });

    it("rejects sectors that aren't a table", () => {
        /**
         * Change one byte of the good slot, and read the result.
         */
        function readWith(index: number, value: number): PdriveSettings | undefined {
            const slot = [...MODEL_III_SLOT];
            slot[index] = value;
            return readPdriveTable(makeVolume(slot));
        }

        expect(readWith(8, 0x12)).to.equal(undefined);  // DDSL copies differ.
        expect(readWith(3, 0)).to.equal(undefined);     // TC.
        expect(readWith(3, 97)).to.equal(undefined);
        expect(readWith(4, 0)).to.equal(undefined);     // SPT.
        expect(readWith(4, 73)).to.equal(undefined);
        expect(readWith(5, 0)).to.equal(undefined);     // GPL.
        expect(readWith(5, 9)).to.equal(undefined);
        expect(readWith(3, 96)).to.not.equal(undefined);
        expect(readWith(4, 72)).to.not.equal(undefined);
        expect(readWith(5, 8)).to.not.equal(undefined);
    });

    it("rejects a hard disk's slot", () => {
        // Slot 0 of a floppy written on a system whose drive 0 was a hard disk.
        const hardDiskSlot = [0x3D, 0x7B, 0x1C, 0x05, 0x20, 0x08, 0x08, 0x00, 0x3D, 0x21, 0x20, 0x13, 0x06, 0x40, 0x99, 0x00];
        expect(readPdriveTable(makeVolume(hardDiskSlot))).to.equal(undefined);
    });

    it("finds nothing on unreadable or blank sectors", () => {
        expect(readPdriveTable(makeVolume(undefined))).to.equal(undefined);
        expect(readPdriveTable(makeVolume(BLANK))).to.equal(undefined);
        expect(readPdriveTable(makeVolume(BLANK, BLANK))).to.equal(undefined);
    });
});

describe("pdriveSettingsToString", () => {
    it("shows layout settings without TSR, and TI only for K", () => {
        const settings: PdriveSettings = {
            source: PdriveSource.LAYOUT,
            sectorOneLowest: false,
            trackOneLowest: false,
            track0OtherDensity: true,
            driveType: "E",
            trackCount: 43,
            sectorsPerTrack: 18,
            granulesPerLump: 2,
            dirStartLump: 17,
            dirGranules: 2,
        };
        expect(pdriveSettingsToString(settings)).to.equal("TI=?K,TD=E,TC=43,SPT=18,GPL=2,DDSL=17,DDGA=2");
        expect(pdriveSettingsSourceToString(settings)).to.equal("worked out from the layout");
        expect(pdriveSettingsToString({...settings, track0OtherDensity: false})).to.equal("TD=E,TC=43,SPT=18,GPL=2,DDSL=17,DDGA=2");
    });
});
