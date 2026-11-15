/**
 * Makes blank Montezuma Micro CP/M 2.2 disks, as Montezuma's FORMAT does: every track formatted as
 * "Track layouts by DOS" in FLOPPY_FORMATS.md says, every sector 0xE5 (so the directory is blank), and
 * on a system format the reserved tracks either holding the boot sector that FORMAT leaves or copied from
 * a system disk, as SYSGEN does. See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
 *
 * Nothing here is TRSDOS: there's no GAT, no granules, and no disk name or date, so this stays apart from
 * TrsdosFormat.ts.
 */

import {assertNever} from "z80-base";
import {Cpm} from "./Cpm.js";
import {CPM_VERIFIED_LAYOUTS, type CpmVerifiedLayout, findCpmVerifiedLayout} from "./CpmWriteGate.js";
import {makeBlankFloppy} from "./DmkBuilder.js";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import type {FloppyDisk} from "./FloppyDisk.js";
import {SectorPosition} from "./FloppyDisk.js";
import {decodeFloppyFileSystem} from "./FloppyFileSystem.js";
import {MONTEZUMA_256_TRACK_LAYOUT, MONTEZUMA_512_TRACK_LAYOUT, type TrackLayout} from "./TrackLayout.js";

/**
 * The first sector number on every track of a Montezuma disk.
 */
const FIRST_SECTOR_NUMBER = 1;

/**
 * Raised when a CP/M disk can't be made as asked, such as when the system disk to copy doesn't match the
 * layout. The message is for the user.
 */
export class CpmCreateError extends Error {
    /**
     * @param message what went wrong, as complete sentences or a clause for the user.
     */
    constructor(message: string) {
        super(message);
        this.name = "CpmCreateError";
    }
}

/**
 * What makeCpmDisk() puts in the reserved tracks of a layout that has them. For a layout with none these are
 * ignored.
 */
export interface CpmDiskOptions {
    /**
     * A disk whose reserved (system) tracks are copied to the new disk (see {@link makeCpmDisk}). It must decode as
     * the same preset as the new disk, since the system tracks hold the drives' configuration (sides, tracks, and
     * formats), which the BIOS uses in place of the disk's own. Takes the place of {@link noSystemBootSector} and
     * {@link systemTracks}.
     */
    systemTracksFrom?: FloppyDisk | undefined;

    /**
     * The bytes of the reserved tracks, in logical order: reserved track 0's sectors in order from sector 1, then
     * reserved track 1's. That's exactly reservedTracks × sectorsPerTrack × sectorSize bytes. Takes the place of
     * {@link systemTracksFrom} and {@link noSystemBootSector}.
     */
    systemTracks?: Uint8Array | undefined;

    /**
     * The layout of {@link systemTracksFrom}, when the caller knows it (such as a session's disk, whose layout the
     * user settled). Without it the source is decoded to find one, which fails if the source reads as another layout
     * or none.
     */
    systemTracksFromLayout?: CpmVerifiedLayout | undefined;

    /**
     * The boot sector that FORMAT leaves in track 0's first sector of a system format that hasn't been SYSGENed,
     * the one that says there's no CP/M on the disk. It must be as long as the layout's sectors. Part of how a blank
     * disk is recognized as Montezuma's (see {@link findBlankCpmCandidates}). Without it, and without
     * systemTracksFrom or systemTracks, the reserved tracks are 0xE5, which a blank-disk reading doesn't recognize.
     */
    noSystemBootSector?: Uint8Array | undefined;
}

/**
 * The track layout of a verified layout's tracks: FORMAT's own, in the sector size.
 *
 * @throws CpmCreateError if there's none for this sector shape (a table that drifted from this code).
 */
export function findMontezumaTrackLayout(layout: CpmVerifiedLayout): TrackLayout {
    const candidates = [MONTEZUMA_256_TRACK_LAYOUT, MONTEZUMA_512_TRACK_LAYOUT];
    const trackLayout = candidates.find(candidate =>
        candidate.sectorCount === layout.sectorsPerTrack && candidate.sectorSize === layout.sectorSize);
    if (trackLayout === undefined) {
        throw new CpmCreateError(`There is no track layout for ${layout.sectorsPerTrack} sectors of ` +
            `${layout.sectorSize} bytes`);
    }
    return trackLayout;
}

/**
 * Where reserved track t is, counting the sides of a layout that uses them as BIOS tracks: on one side, cylinder t
 * side 0, and on two, cylinder t >> 1 and side t & 1. (So with two sides the second system track is on cylinder
 * 0 side 1.) See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
 *
 * @param track the reserved track's index, from 0.
 * @param sides the sides that the file system uses, 1 or 2.
 * @param sectorNumber the sector's number.
 */
function reservedSectorPosition(track: number, sides: number, sectorNumber: number): SectorPosition {
    return SectorPosition.make(Math.floor(track/sides), track % sides, sectorNumber);
}

/**
 * Write a sector of the new disk.
 *
 * @param floppy the new disk, which is changed.
 * @param position where.
 * @param data the sector's bytes, as long as the sector.
 */
function writeReservedSector(floppy: DmkFloppyDisk, position: SectorPosition, data: Uint8Array): void {
    const sector = floppy.readSector(position);
    if (sector === undefined) {
        throw new Error("The new disk has no sector " + position.key());
    }
    sector.data.set(data);
    floppy.writeSector(position, sector);
}

/**
 * Put system tracks given in logical order on a new disk.
 *
 * @param floppy the new disk, which is changed.
 * @param layout the new disk's layout.
 * @param systemTracks reservedTracks × sectorsPerTrack × sectorSize bytes, which the caller has checked.
 */
function placeSystemTracks(floppy: DmkFloppyDisk, layout: CpmVerifiedLayout, systemTracks: Uint8Array): void {
    let offset = 0;
    for (let track = 0; track < layout.reservedTracks; track++) {
        for (let i = 0; i < layout.sectorsPerTrack; i++) {
            const position = reservedSectorPosition(track, layout.sides, FIRST_SECTOR_NUMBER + i);
            writeReservedSector(floppy, position, systemTracks.subarray(offset, offset + layout.sectorSize));
            offset += layout.sectorSize;
        }
    }
}

/**
 * Copy the reserved tracks of a system disk to a new disk. The source has to be the same preset, since its system
 * tracks hold the configuration of its drives, so the tracks are in the same places.
 *
 * @param floppy the new disk, which is changed.
 * @param layout the new disk's layout.
 * @param source the system disk.
 * @param knownLayout the source's layout, or undefined to find it by decoding the source.
 * @throws CpmCreateError if the source isn't a CP/M disk of the same preset, or lacks a sector to copy.
 */
function copySystemTracks(floppy: DmkFloppyDisk, layout: CpmVerifiedLayout, source: FloppyDisk,
                          knownLayout: CpmVerifiedLayout | undefined): void {

    let sourceLayout = knownLayout;
    if (sourceLayout === undefined) {
        const sourceFileSystem = decodeFloppyFileSystem(source);
        if (!(sourceFileSystem instanceof Cpm)) {
            throw new CpmCreateError("The system disk to copy isn't a CP/M disk that we recognize.");
        }
        sourceLayout = findCpmVerifiedLayout(sourceFileSystem);
        if (sourceLayout === undefined) {
            throw new CpmCreateError("The system disk to copy reads as CP/M, but with a layout (" +
                sourceFileSystem.summary() + ") that isn't one of the Montezuma presets, so its system tracks can't " +
                "be placed.");
        }
    }
    if (sourceLayout.id !== layout.id) {
        throw new CpmCreateError(`The system disk to copy reads as ${sourceLayout.id}, and its system is ` +
            `configured for ${sourceLayout.id}'s drives, so it doesn't fit ${layout.id}.`);
    }

    for (let track = 0; track < layout.reservedTracks; track++) {
        for (let i = 0; i < layout.sectorsPerTrack; i++) {
            const sectorNumber = FIRST_SECTOR_NUMBER + i;
            const position = reservedSectorPosition(track, layout.sides, sectorNumber);
            const sourceSector = source.readSector(position);
            if (sourceSector === undefined || sourceSector.data.length !== layout.sectorSize) {
                throw new CpmCreateError(`The system disk to copy has no sector ${position.key()} to copy.`);
            }
            writeReservedSector(floppy, position, sourceSector.data);
        }
    }
}

/**
 * Make a blank Montezuma Micro CP/M disk in a verified layout: a DMK image with the layout's cylinders and sides,
 * every track formatted as Montezuma's FORMAT does (see {@link MONTEZUMA_256_TRACK_LAYOUT}), and every sector
 * 0xE5, which is a blank directory. A layout with sides of 1 has a one-sided image, as FORMAT's images have.
 *
 * A layout with reserved tracks is a system format. With options.systemTracksFrom the reserved tracks are
 * copied from that disk (of the same preset), as SYSGEN leaves them, and with options.systemTracks they're those
 * bytes. Otherwise they're as FORMAT leaves them: options.noSystemBootSector
 * in track 0's first sector and 0xE5 in the rest.
 *
 * @param layout the layout to make.
 * @param options what goes in the reserved tracks.
 * @returns the disk, writable and not write-protected.
 * @throws CpmCreateError if the options don't fit the layout, such as a system disk of another shape.
 */
export function makeCpmDisk(layout: CpmVerifiedLayout, options: CpmDiskOptions = {}): DmkFloppyDisk {
    const systemTracksFrom = options.systemTracksFrom;
    const systemTracks = options.systemTracks;
    const bootSector = options.noSystemBootSector;
    const sourceCount = [systemTracksFrom, systemTracks, bootSector].filter(source => source !== undefined).length;
    if (sourceCount > 1) {
        throw new CpmCreateError("Give system tracks to copy, system tracks' bytes, or a boot sector, only one.");
    }
    const systemTracksLength = layout.reservedTracks*layout.sectorsPerTrack*layout.sectorSize;
    if (systemTracks !== undefined && systemTracks.length !== systemTracksLength) {
        throw new CpmCreateError(`The system tracks are ${systemTracks.length} bytes, and ${layout.id}'s are ` +
            `${systemTracksLength}.`);
    }
    if (bootSector !== undefined && bootSector.length !== layout.sectorSize) {
        throw new CpmCreateError(`The boot sector is ${bootSector.length} bytes, and ${layout.id}'s sectors are ` +
            `${layout.sectorSize}.`);
    }

    const floppy = makeBlankFloppy(findMontezumaTrackLayout(layout), layout.cylinders, layout.sides);
    if (floppy === undefined) {
        throw new CpmCreateError(`The track layout of ${layout.id} doesn't fit on a track.`);
    }

    if (layout.reservedTracks > 0) {
        if (systemTracksFrom !== undefined) {
            copySystemTracks(floppy, layout, systemTracksFrom, options.systemTracksFromLayout);
        } else if (systemTracks !== undefined) {
            placeSystemTracks(floppy, layout, systemTracks);
        } else if (bootSector !== undefined) {
            writeReservedSector(floppy, SectorPosition.make(0, 0, FIRST_SECTOR_NUMBER), bootSector);
        }
    }

    return floppy;
}

/**
 * Whether a preset gets the system tracks of the Montezuma 2.32 system disk by default: the four
 * 18 × 256 presets of BIOS 2.x (mm-system, mm-ds-system, mm-80-system, and mm-80-ds-system), whose
 * reserved tracks have that shape. The extended (10 × 512) and 1.x presets have no system of that shape.
 */
export function hasMontezumaBiosSystem(layout: CpmVerifiedLayout): boolean {
    return layout.skew === 2 && layout.sectorSize === 256 && layout.sectorsPerTrack === 18 &&
        layout.reservedTracks === 2;
}

/**
 * Which kind of reserved tracks a preset gets when the user doesn't give a system disk to copy.
 */
export enum CpmSystemKind {
    /** None: a data format has no reserved tracks. */
    NONE,

    /** The BIOS 2.x system disk's two system tracks (see {@link hasMontezumaBiosSystem}). */
    BIOS_SYSTEM,

    /** FORMAT's own no-system boot sector, which is all that a preset with no BIOS 2.x system tracks gets. */
    NO_SYSTEM_BOOT_SECTOR,
}

/**
 * A short lowercase name for a kind of reserved tracks, such as "no-system-boot-sector".
 */
export function cpmSystemKindToString(kind: CpmSystemKind): string {
    switch (kind) {
        case CpmSystemKind.NONE:
            return "none";
        case CpmSystemKind.BIOS_SYSTEM:
            return "bios-system";
        case CpmSystemKind.NO_SYSTEM_BOOT_SECTOR:
            return "no-system-boot-sector";
        default:
            assertNever(kind);
    }
}

/**
 * What a preset's reserved tracks get by default: see {@link CpmSystemKind}.
 */
export function defaultCpmSystemKind(layout: CpmVerifiedLayout): CpmSystemKind {
    if (layout.reservedTracks === 0) {
        return CpmSystemKind.NONE;
    }
    return hasMontezumaBiosSystem(layout) ? CpmSystemKind.BIOS_SYSTEM : CpmSystemKind.NO_SYSTEM_BOOT_SECTOR;
}

/**
 * The data preset that has the given sides and cylinders (mm-data, mm-ds-data, mm-80-data, or mm-80-ds-data), for
 * "create cpm" when the user names no preset.
 *
 * @param sides 1 or 2.
 * @param cylinders 40 or 80.
 * @returns the preset, or undefined if there's none with that shape.
 */
export function findCpmDataLayout(sides: number, cylinders: number): CpmVerifiedLayout | undefined {
    return CPM_VERIFIED_LAYOUTS.find(layout =>
        layout.reservedTracks === 0 && layout.sides === sides && layout.cylinders === cylinders);
}
