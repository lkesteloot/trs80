import {describe, expect, it} from "vitest";
import {Cpm} from "./Cpm.js";
import {
    CpmCreateError, CpmSystemKind, defaultCpmSystemKind, findCpmDataLayout, findMontezumaTrackLayout,
    hasMontezumaBiosSystem, makeCpmDisk,
} from "./CpmCreate.js";
import {makeMontezumaTestDisk} from "./CpmTestDisk.js";
import {
    CPM_VERIFIED_LAYOUTS, type CpmVerifiedLayout, findBlankCpmCandidates, findCpmVerifiedLayout,
    findCpmVerifiedLayoutById,
} from "./CpmWriteGate.js";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {type FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {decodeFloppyFileSystem} from "./FloppyFileSystem.js";

// A banner that names BIOS 2.32, so that a disk that has it isn't ambiguous.
const BANNER = "Model 4 64K System CP/M 2.2 v2.32";

// The presets that can't be told from others without a banner: the skew-4 ones, and the two-sided one with 4
// reserved tracks. See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
const AMBIGUOUS_IDS = ["mm-1.26-system", "mm-1.26-ds-system", "mm-1.42-ds-system"];

/**
 * The preset with an id, which must exist.
 */
function preset(id: string): CpmVerifiedLayout {
    const layout = findCpmVerifiedLayoutById(id);
    if (layout === undefined) {
        throw new Error("No preset " + id);
    }
    return layout;
}

/**
 * A boot sector like the one that FORMAT leaves: not a directory, and saying that there's no CP/M.
 *
 * @param sectorSize the sector size.
 */
function makeBootSector(sectorSize: number): Uint8Array {
    const sector = new Uint8Array(sectorSize).fill(0xE5);
    sector[0] = 0x3E;
    sector.set(Array.from("There is NO CP/M on this disk!", ch => ch.charCodeAt(0)), 36);
    return sector;
}

/**
 * The ids of the presets that a disk's blank readings have, in order.
 */
function blankIds(disk: FloppyDisk): string[] {
    return findBlankCpmCandidates(disk, disk.getGeometry(), true).map(cpm => findCpmVerifiedLayout(cpm)?.id ?? "?");
}

/**
 * A system disk of a preset, as SYSGEN would leave it (a BIOS 2.32 banner), with a mark in a sector of each reserved track.
 *
 * @param id the preset.
 * @returns the disk, and the marks: where each is, and its value.
 */
function makeSystemSource(id: string): {disk: DmkFloppyDisk, marks: {position: SectorPosition, value: number}[]} {
    const layout = preset(id);
    const disk = makeMontezumaTestDisk(layout, [], {banner: BANNER});
    const marks: {position: SectorPosition, value: number}[] = [];
    for (let track = 0; track < layout.reservedTracks; track++) {
        const position = SectorPosition.make(Math.floor(track/layout.sides), track % layout.sides, 3);
        const sector = disk.readSector(position)!;
        sector.data.fill(0x40 + track, 10, 20);
        disk.writeSector(position, sector);
        marks.push({position, value: 0x40 + track});
    }
    return {disk, marks};
}

/**
 * The mark in a sector of a disk: the byte that the source disk's marks have, read from where the copy should be.
 */
function readMark(disk: FloppyDisk, position: SectorPosition): number {
    return disk.readSector(position)!.data[15];
}

describe("makeCpmDisk", () => {
    for (const layout of CPM_VERIFIED_LAYOUTS) {
        describe(layout.id, () => {
            const bootSector = makeBootSector(layout.sectorSize);
            // The 18 x 256 system presets get a system disk's tracks, which have a banner, as they do by default.
            const hasBiosSystem = hasMontezumaBiosSystem(layout);
            const options = hasBiosSystem ? {systemTracksFrom: makeSystemSource(layout.id).disk} :
                layout.reservedTracks > 0 ? {noSystemBootSector: bootSector} : {};
            const disk = makeCpmDisk(layout, options);

            it("has the layout's shape", () => {
                const geometry = disk.getGeometry();
                expect(geometry.cylinderCount).to.equal(layout.cylinders);
                expect(geometry.sideCount).to.equal(layout.sides);
                expect(geometry.modalDataSectorSize).to.equal(layout.sectorSize);
                expect(geometry.modalDataSectorSpan).to.equal(layout.sectorsPerTrack);
                expect(geometry.sectorInfos.length).to.equal(layout.cylinders*layout.sides*layout.sectorsPerTrack);
            });

            it("is blank except for the boot sector", () => {
                const bootPosition = SectorPosition.make(0, 0, 1);
                for (const info of disk.getGeometry().sectorInfos) {
                    const sector = disk.readSector(info.sectorPosition)!;
                    const isBoot = layout.reservedTracks > 0 && info.sectorPosition.equals(bootPosition);
                    const isSystemTrack = hasBiosSystem && info.sectorPosition.trackPosition.cylinderNumber*layout.sides +
                        info.sectorPosition.trackPosition.side < layout.reservedTracks;
                    if (isSystemTrack) {
                        // Copied from the system disk, so not the filler.
                        continue;
                    }
                    const expected = isBoot ? bootSector : new Uint8Array(layout.sectorSize).fill(0xE5);
                    expect(Array.from(sector.data)).to.eql(Array.from(expected));
                }
            });

            it("is recognized as blank, as this layout or only where it can't be told apart", () => {
                const ids = blankIds(disk);
                expect(ids).to.include(layout.id);
                if (!AMBIGUOUS_IDS.includes(layout.id)) {
                    expect(ids).to.eql([layout.id]);
                }

                const fileSystem = decodeFloppyFileSystem(disk);
                expect(fileSystem).toBeInstanceOf(Cpm);
                const found = findCpmVerifiedLayout(fileSystem as Cpm);
                // The first reading in table order wins where the readings tie.
                expect(found?.id).to.equal(ids[0]);
            });
        });
    }

    it("can't tell an 18 x 256 system format with only the boot sector from the skew-4 presets", () => {
        expect(blankIds(makeCpmDisk(preset("mm-system"), {noSystemBootSector: makeBootSector(256)})))
            .to.eql(["mm-system", "mm-1.26-system"]);
        expect(blankIds(makeCpmDisk(preset("mm-ds-system"), {noSystemBootSector: makeBootSector(256)})))
            .to.eql(["mm-ds-system", "mm-1.26-ds-system", "mm-1.42-ds-system"]);
    });

    it("has no recognizable disk for a system format without a boot sector", () => {
        const layout = preset("mm-system");
        const disk = makeCpmDisk(layout);
        expect(blankIds(disk)).to.eql([]);
    });

    describe("track layout", () => {
        /**
         * The IDAM offsets of a track of a DMK image, as the track's pointer table says (from the track's start).
         */
        function idamOffsets(disk: DmkFloppyDisk, cylinder: number, side: number): number[] {
            const binary = disk.binary;
            const trackLength = binary[2] | (binary[3] << 8);
            const sideCount = (binary[4] & 0x10) !== 0 ? 1 : 2;
            const start = 16 + (cylinder*sideCount + side)*trackLength;
            const offsets: number[] = [];
            for (let i = 0; i < 64; i++) {
                const pointer = binary[start + 2*i] | (binary[start + 2*i + 1] << 8);
                if (pointer === 0) {
                    break;
                }
                // Double density is flagged in the top bit.
                expect(pointer & 0x8000).to.equal(0x8000);
                offsets.push((pointer & 0x3FFF) - 128);
            }
            return offsets;
        }

        it("puts an ID field every 342 bytes on 18 x 256 tracks and every 598 on 10 x 512 tracks", () => {
            const small = makeCpmDisk(preset("mm-ds-system"), {noSystemBootSector: makeBootSector(256)});
            const large = makeCpmDisk(preset("mm-ds-data"));
            for (const [disk, count, step] of [[small, 18, 342], [large, 10, 598]] as const) {
                for (const [cylinder, side] of [[0, 0], [0, 1], [6, 0], [6, 1], [39, 1]]) {
                    const offsets = idamOffsets(disk, cylinder, side);
                    expect(offsets.length).to.equal(count);
                    // The first is after the 32-byte lead gap, 12 zeros, and three A1 bytes.
                    expect(offsets[0]).to.equal(47);
                    for (let i = 1; i < offsets.length; i++) {
                        expect(offsets[i] - offsets[i - 1]).to.equal(step);
                    }
                }
            }
        });

        it("numbers the sectors from 1 in order, with the side in the ID of side 1", () => {
            const disk = makeCpmDisk(preset("mm-ds-system"), {noSystemBootSector: makeBootSector(256)});
            const geometry = disk.getGeometry();
            for (const side of [0, 1]) {
                const order = geometry.sectorInfos
                    .filter(info => info.sectorPosition.trackPosition.cylinderNumber === 6 &&
                        info.sectorPosition.trackPosition.side === side)
                    .map(info => info.sectorPosition.sectorNumber);
                expect(order).to.eql(Array.from({length: 18}, (_, i) => i + 1));
            }
        });

        it("has a one-sided image for a one-sided layout", () => {
            const disk = makeCpmDisk(preset("mm-80-data"));
            expect(disk.binary[4] & 0x10).to.equal(0x10);
            expect(disk.binary[1]).to.equal(80);
            const twoSided = makeCpmDisk(preset("mm-80-ds-data"));
            expect(twoSided.binary[4] & 0x10).to.equal(0);
        });

        it("has a track layout for each sector shape", () => {
            for (const layout of CPM_VERIFIED_LAYOUTS) {
                const trackLayout = findMontezumaTrackLayout(layout);
                expect(trackLayout.sectorCount).to.equal(layout.sectorsPerTrack);
                expect(trackLayout.sectorSize).to.equal(layout.sectorSize);
            }
        });
    });

    describe("system tracks", () => {
        it("copies the reserved tracks, banner included", () => {
            const {disk: source} = makeSystemSource("mm-80-system");
            const made = makeCpmDisk(preset("mm-80-system"), {systemTracksFrom: source});
            const fileSystem = decodeFloppyFileSystem(made);
            expect((fileSystem as Cpm).nameAndVersion).to.equal("Montezuma Micro CP/M BIOS 2.32");
            expect(findCpmVerifiedLayout(fileSystem as Cpm)?.id).to.equal("mm-80-system");
        });

        it("copies each reserved track to the same place on a disk of the same layout", () => {
            for (const id of ["mm-system", "mm-ds-system"]) {
                const {disk: source, marks} = makeSystemSource(id);
                const made = makeCpmDisk(preset(id), {systemTracksFrom: source});
                for (const mark of marks) {
                    expect(readMark(made, mark.position)).to.equal(mark.value);
                }
                const fileSystem = decodeFloppyFileSystem(made) as Cpm;
                expect(findCpmVerifiedLayout(fileSystem)?.id).to.equal(id);
            }
            // The second track is on cylinder 1 on one side and on cylinder 0 side 1 on two.
            expect(makeSystemSource("mm-system").marks[1].position.key()).to.equal(SectorPosition.make(1, 0, 3).key());
            expect(makeSystemSource("mm-ds-system").marks[1].position.key()).to.equal(SectorPosition.make(0, 1, 3).key());
        });

        it("copies all four reserved tracks of the 1.42 layout", () => {
            // A banner of version 1.42 is what makes a disk read as having 4 reserved tracks.
            const source = makeMontezumaTestDisk(preset("mm-1.42-ds-system"), [], {banner: "Model 4 60K System CP/M 2.2 v1.42"});
            const marks: {position: SectorPosition, value: number}[] = [];
            for (let track = 0; track < 4; track++) {
                const position = SectorPosition.make(track >> 1, track & 1, 3);
                const sector = source.readSector(position)!;
                sector.data.fill(0x40 + track, 10, 20);
                source.writeSector(position, sector);
                marks.push({position, value: 0x40 + track});
            }
            const made = makeCpmDisk(preset("mm-1.42-ds-system"), {systemTracksFrom: source});
            for (const mark of marks) {
                expect(readMark(made, mark.position)).to.equal(mark.value);
            }
        });

        it("uses the layout the caller gives instead of decoding the source", () => {
            // A source that decodes as nothing, such as a system disk with no banner and a boot sector of 0xE5.
            const source = makeMontezumaTestDisk(preset("mm-system"), [], {noBootSector: true});
            expect(() => makeCpmDisk(preset("mm-system"), {systemTracksFrom: source})).to.throw(CpmCreateError);
            const made = makeCpmDisk(preset("mm-system"),
                {systemTracksFrom: source, systemTracksFromLayout: preset("mm-system")});
            expect(made.getGeometry().sideCount).to.equal(1);
            // The given layout is still checked against the new disk's.
            expect(() => makeCpmDisk(preset("mm-ds-system"),
                {systemTracksFrom: source, systemTracksFromLayout: preset("mm-system")}))
                .to.throw(CpmCreateError, /configured for mm-system's drives/);
        });

        it("refuses a source that reads as another preset, because its system is configured for that one's drives", () => {
            const {disk: oneSided} = makeSystemSource("mm-system");
            for (const id of ["mm-ds-system", "mm-80-system", "mm-ext-system", "mm-1.42-ds-system"]) {
                expect(() => makeCpmDisk(preset(id), {systemTracksFrom: oneSided}))
                    .to.throw(CpmCreateError, new RegExp(`reads as mm-system, and its system is configured for ` +
                        `mm-system's drives, so it doesn't fit ${id}`));
            }
            // The same skew, sector shape, and reserved tracks aren't enough.
            const {disk: twoSided} = makeSystemSource("mm-80-ds-system");
            expect(() => makeCpmDisk(preset("mm-ds-system"), {systemTracksFrom: twoSided}))
                .to.throw(CpmCreateError, /configured for mm-80-ds-system's drives/);
        });

        it("refuses a source that isn't a system disk", () => {
            const notSystem = makeCpmDisk(preset("mm-data"));
            // A data disk is CP/M, but of another preset.
            expect(() => makeCpmDisk(preset("mm-system"), {systemTracksFrom: notSystem}))
                .to.throw(CpmCreateError, /reads as mm-data/);
        });

        it("refuses more than one of a source, system tracks, and a boot sector, and a boot sector of the wrong size", () => {
            const {disk: source} = makeSystemSource("mm-system");
            const systemTracks = new Uint8Array(2*18*256);
            expect(() => makeCpmDisk(preset("mm-system"), {systemTracksFrom: source, noSystemBootSector: makeBootSector(256)}))
                .to.throw(CpmCreateError, /only one/);
            expect(() => makeCpmDisk(preset("mm-system"), {systemTracksFrom: source, systemTracks}))
                .to.throw(CpmCreateError, /only one/);
            expect(() => makeCpmDisk(preset("mm-system"), {systemTracks, noSystemBootSector: makeBootSector(256)}))
                .to.throw(CpmCreateError, /only one/);
            expect(() => makeCpmDisk(preset("mm-system"), {noSystemBootSector: makeBootSector(512)}))
                .to.throw(CpmCreateError, /512 bytes/);
        });

        it("places system tracks given as bytes in logical order, on one side or two", () => {
            // Every sector's bytes are its index in logical order, so that each can be recognized.
            const systemTracks = new Uint8Array(2*18*256);
            for (let sector = 0; sector < 36; sector++) {
                systemTracks.fill(sector + 1, sector*256, (sector + 1)*256);
            }
            for (const id of ["mm-system", "mm-ds-system", "mm-80-system", "mm-80-ds-system"]) {
                const layout = preset(id);
                const made = makeCpmDisk(layout, {systemTracks});
                for (let track = 0; track < 2; track++) {
                    for (let i = 0; i < 18; i++) {
                        const position = SectorPosition.make(Math.floor(track/layout.sides), track % layout.sides, i + 1);
                        const data = made.readSector(position)!.data;
                        expect(Array.from(data)).to.eql(new Array(256).fill(track*18 + i + 1));
                    }
                }
                // Nothing else was touched.
                expect(made.readSector(SectorPosition.make(2, 0, 1))!.data[0]).to.equal(0xE5);
            }
        });

        it("refuses system tracks of the wrong length", () => {
            expect(() => makeCpmDisk(preset("mm-system"), {systemTracks: new Uint8Array(9215)}))
                .to.throw(CpmCreateError, /9215 bytes, and mm-system's are 9216/);
            expect(() => makeCpmDisk(preset("mm-ext-system"), {systemTracks: new Uint8Array(9216)}))
                .to.throw(CpmCreateError, /9216 bytes, and mm-ext-system's are 10240/);
        });

        it("ignores system options for a data layout", () => {
            const {disk: source} = makeSystemSource("mm-system");
            const made = makeCpmDisk(preset("mm-data"), {systemTracksFrom: source});
            expect(Array.from(made.readSector(SectorPosition.make(0, 0, 1))!.data)).to.eql(new Array(512).fill(0xE5));
        });
    });
});

describe("default system tracks", () => {
    it("gives the BIOS 2.x system to exactly the four 18 x 256 presets", () => {
        const ids = CPM_VERIFIED_LAYOUTS.filter(hasMontezumaBiosSystem).map(layout => layout.id);
        expect(ids).to.eql(["mm-system", "mm-ds-system", "mm-80-system", "mm-80-ds-system"]);
    });

    it("gives FORMAT's boot sector to the other system presets and nothing to the data ones", () => {
        for (const layout of CPM_VERIFIED_LAYOUTS) {
            const kind = defaultCpmSystemKind(layout);
            if (layout.reservedTracks === 0) {
                expect(kind).to.equal(CpmSystemKind.NONE);
            } else if (hasMontezumaBiosSystem(layout)) {
                expect(kind).to.equal(CpmSystemKind.BIOS_SYSTEM);
            } else {
                expect(kind).to.equal(CpmSystemKind.NO_SYSTEM_BOOT_SECTOR);
            }
        }
    });

    it("finds the data preset for sides and cylinders", () => {
        expect(findCpmDataLayout(1, 40)?.id).to.equal("mm-data");
        expect(findCpmDataLayout(2, 40)?.id).to.equal("mm-ds-data");
        expect(findCpmDataLayout(1, 80)?.id).to.equal("mm-80-data");
        expect(findCpmDataLayout(2, 80)?.id).to.equal("mm-80-ds-data");
        expect(findCpmDataLayout(1, 35)).to.equal(undefined);
    });
});
