/**
 * Shows the imaging artifacts that trs80-base's findImagingArtifacts() finds (sectors that the imager lost
 * or cut short, and CRCs that a converter made up), as text and as JSON, for the "sectors" and "disk check"
 * commands.
 */

import {type ImagingArtifact, ImagingArtifactKind, imagingArtifactKindToString} from "trs80-base";
import {assertNever} from "z80-base";
import {type SectorPositionJson, sectorPositionToJson} from "./json.js";

/**
 * The kind of imaging artifact, in JSON. See ImagingArtifactKind in trs80-base for what each means.
 */
export type ImagingArtifactKindJson =
    /** The read of the track began after its first sector had gone by, so that sector isn't in the image. */
    "readBeganLate" |
    /** The read stopped after one revolution, cutting off the end of the track's last sector. */
    "readOneRevolution" |
    /** The stored CRC is a converter's marker for a sector it couldn't read, so no CRC test applies. */
    "converterCrcMarker";

/**
 * One kind of imaging artifact on a floppy, in JSON.
 */
export interface ImagingArtifactJson {
    /** What the artifact is. */
    kind: ImagingArtifactKindJson;
    /** A complete sentence or two for a person. */
    message: string;
    /** The tracks involved, by cylinder and then side. */
    tracks: {cylinder: number, side: number}[];
    /** The physical positions of the bad or missing sectors that the artifact explains, in order. */
    sectors: SectorPositionJson[];
}

/**
 * Convert a kind of artifact to JSON.
 */
export function imagingArtifactKindToJson(kind: ImagingArtifactKind): ImagingArtifactKindJson {
    switch (kind) {
        case ImagingArtifactKind.READ_BEGAN_LATE:
            return "readBeganLate";
        case ImagingArtifactKind.READ_ONE_REVOLUTION:
            return "readOneRevolution";
        case ImagingArtifactKind.CONVERTER_CRC_MARKER:
            return "converterCrcMarker";
        default:
            assertNever(kind);
    }
}

/**
 * Convert an artifact to JSON.
 */
export function imagingArtifactToJson(artifact: ImagingArtifact): ImagingArtifactJson {
    return {
        kind: imagingArtifactKindToJson(artifact.kind),
        message: artifact.message,
        tracks: artifact.tracks.map(track => ({cylinder: track.cylinderNumber, side: track.side})),
        sectors: artifact.sectors.map(sectorPositionToJson),
    };
}

/**
 * The lines of text that report the artifacts, one per kind, each starting with the kind's name.
 */
export function imagingArtifactsToLines(artifacts: readonly ImagingArtifact[]): string[] {
    return artifacts.map(artifact => {
        const name = imagingArtifactKindToString(artifact.kind);
        return name.charAt(0).toUpperCase() + name.slice(1) + ": " + artifact.message;
    });
}
