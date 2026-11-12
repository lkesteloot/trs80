/**
 * Shows the signs of copy protection that trs80-base's findProtectionSigns() finds, as text and as
 * JSON, for the "sectors --protection" and "disk check" commands.
 */

import {
    type ProtectionSign,
    ProtectionSignKind,
    protectionSignKindToString,
    ProtectionVerdict,
    protectionVerdictToString,
} from "trs80-base";
import {assertNever} from "z80-base";
import {type SectorPositionJson, sectorPositionToJson} from "./json.js";

/**
 * What a sign says about the disk, in JSON.
 */
export type ProtectionVerdictJson =
    /** Copy protected by a program's own scheme. */
    "protected" |
    /** Copy protected by a scheme that comes with the disk's DOS. */
    "dosProtected" |
    /** Protection schemes do this, but so do ordinary disks now and then. */
    "possible" |
    /** Looks like protection but isn't, such as a DOS's own FORMAT output. */
    "info";

/**
 * The kind of sign, in JSON. See ProtectionSignKind in trs80-base for what each means.
 */
export type ProtectionSignKindJson =
    "vtosMiniSectors" |
    "vtosFormatSector" |
    "tandyProtectionCode" |
    "tandyOverlays" |
    "tandyTrackEmpty" |
    "tandyTrackFormat" |
    "trsdosLimitedBackups" |
    "trsdosLimitedBackupsUnset" |
    "trackNumberedOutside" |
    "renumberedSectors" |
    "duplicateSectorNumbers" |
    "mixedDensityTrack" |
    "largeSizeCode" |
    "hiddenSectors" |
    "foreignCylinderIds" |
    "f9Marks" |
    "faMarks" |
    "directoryMismatch";

/**
 * One sign of copy protection, in JSON.
 */
export interface ProtectionSignJson {
    /** What the sign is. */
    kind: ProtectionSignKindJson;
    /** What it says about the disk. */
    verdict: ProtectionVerdictJson;
    /** The trs-80.com archive's numbers (such as "S-101") of the schemes this sign has been seen with. Possibly empty. */
    schemes: string[];
    /** The scheme that the sign identifies by itself, such as "VTOS 3.0's copy protection". Missing if it doesn't. */
    scheme?: string;
    /** A complete sentence for a person. */
    message: string;
    /** The tracks involved, by cylinder and then side. Possibly empty. */
    tracks: {cylinder: number, side: number}[];
    /** The physical positions of the sectors involved, in order. Possibly empty. */
    sectors: SectorPositionJson[];
}

/**
 * Convert a verdict to JSON.
 */
export function protectionVerdictToJson(verdict: ProtectionVerdict): ProtectionVerdictJson {
    switch (verdict) {
        case ProtectionVerdict.PROTECTED:
            return "protected";
        case ProtectionVerdict.DOS_PROTECTED:
            return "dosProtected";
        case ProtectionVerdict.POSSIBLE:
            return "possible";
        case ProtectionVerdict.INFO:
            return "info";
        default:
            assertNever(verdict);
    }
}

/**
 * Convert a kind of sign to JSON.
 */
export function protectionSignKindToJson(kind: ProtectionSignKind): ProtectionSignKindJson {
    switch (kind) {
        case ProtectionSignKind.VTOS_MINI_SECTORS:
            return "vtosMiniSectors";
        case ProtectionSignKind.VTOS_FORMAT_SECTOR:
            return "vtosFormatSector";
        case ProtectionSignKind.TANDY_PROTECTION_CODE:
            return "tandyProtectionCode";
        case ProtectionSignKind.TANDY_OVERLAYS:
            return "tandyOverlays";
        case ProtectionSignKind.TANDY_TRACK_EMPTY:
            return "tandyTrackEmpty";
        case ProtectionSignKind.TANDY_TRACK_FORMAT:
            return "tandyTrackFormat";
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS:
            return "trsdosLimitedBackups";
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS_UNSET:
            return "trsdosLimitedBackupsUnset";
        case ProtectionSignKind.TRACK_NUMBERED_OUTSIDE:
            return "trackNumberedOutside";
        case ProtectionSignKind.RENUMBERED_SECTORS:
            return "renumberedSectors";
        case ProtectionSignKind.DUPLICATE_SECTOR_NUMBERS:
            return "duplicateSectorNumbers";
        case ProtectionSignKind.MIXED_DENSITY_TRACK:
            return "mixedDensityTrack";
        case ProtectionSignKind.LARGE_SIZE_CODE:
            return "largeSizeCode";
        case ProtectionSignKind.HIDDEN_SECTORS:
            return "hiddenSectors";
        case ProtectionSignKind.FOREIGN_CYLINDER_IDS:
            return "foreignCylinderIds";
        case ProtectionSignKind.F9_MARKS:
            return "f9Marks";
        case ProtectionSignKind.FA_MARKS:
            return "faMarks";
        case ProtectionSignKind.DIRECTORY_MISMATCH:
            return "directoryMismatch";
        default:
            assertNever(kind);
    }
}

/**
 * Convert a sign to JSON.
 */
export function protectionSignToJson(sign: ProtectionSign): ProtectionSignJson {
    const json: ProtectionSignJson = {
        kind: protectionSignKindToJson(sign.kind),
        verdict: protectionVerdictToJson(sign.verdict),
        schemes: [...sign.schemes],
        message: sign.message,
        tracks: sign.tracks.map(track => ({cylinder: track.cylinderNumber, side: track.side})),
        sectors: sign.sectors.map(sectorPositionToJson),
    };
    if (sign.schemeName !== undefined) {
        json.scheme = sign.schemeName;
    }
    return json;
}

/**
 * The lines of text that report the signs: one per sign, with its verdict and the schemes it has been
 * seen with, or a single line saying that there are none.
 */
export function protectionSignsToLines(signs: readonly ProtectionSign[]): string[] {
    if (signs.length === 0) {
        return ["No signs of copy protection (which doesn't prove there's none)."];
    }
    return signs.map(sign => {
        const schemes = sign.schemes.length === 0 ? "" : " (seen with " + sign.schemes.join(", ") + ")";
        return capitalize(protectionVerdictToString(sign.verdict)) + ", " +
            protectionSignKindToString(sign.kind) + schemes + ": " + sign.message;
    });
}

/**
 * The text with its first letter in upper case.
 */
function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
