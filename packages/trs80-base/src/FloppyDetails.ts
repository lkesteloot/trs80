import {withCommas} from "teamten-ts-utils";
import {densityToString, FloppyDisk, TrackGeometry} from "./FloppyDisk.js";
import type {FloppyFileSystem} from "./FloppyFileSystem.js";
import {pdriveSettingsToString, Trsdos} from "./Trsdos.js";
import {Cpm} from "./Cpm.js";
import {MicroDos} from "./MicroDos.js";
import {UcsdPascal} from "./UcsdPascal.js";
import {ModelIITrsdos, modelIITrsdosLayoutToString} from "./ModelIITrsdos.js";
import {TrsdosII} from "./TrsdosII.js";
import {XenixTar} from "./XenixTar.js";

/**
 * One fact about a floppy, such as its geometry or where its directory is, for showing to the user.
 */
export interface FloppyDetail {
    /** What the fact is, such as "Sectors per granule". */
    label: string;
    /** The fact itself, such as "5". */
    value: string;
}

/**
 * Return the count followed by the singular or plural noun, such as "1 side" or "40 cylinders".
 */
function pluralizeWithCount(count: number, singular: string): string {
    return withCommas(count) + " " + (count === 1 ? singular : singular + "s");
}

/**
 * Describe one track's sectors, such as "Sectors 0 to 9, single density, 256 bytes per sector".
 */
function trackGeometryToString(trackGeometry: TrackGeometry): string {
    return [`Sectors ${trackGeometry.firstSectorNumber} to ${trackGeometry.lastSectorNumber}`,
        `${densityToString(trackGeometry.modalDensity)} density`,
        `${trackGeometry.modalSectorSize} bytes per sector`].join(", ");
}

/**
 * Return the details of a floppy that a curious user might want to know beyond its file list: the
 * layout of its tracks, then whatever the file system records about itself and where it keeps things.
 * Empty facts, such as a blank disk name, are left out.
 *
 * @param floppy the floppy image.
 * @param fileSystem the floppy's file system, or undefined if none was recognized.
 */
export function getFloppyDetails(floppy: FloppyDisk, fileSystem: FloppyFileSystem | undefined): FloppyDetail[] {
    const details: FloppyDetail[] = [];
    const add = (label: string, value: string): void => {
        if (value !== "") {
            details.push({label, value});
        }
    };

    const geometry = floppy.getGeometry();
    const bootTrack = geometry.bootTrack;
    const otherTracksInfo = [`${geometry.modalDataSectorSpan} sectors`,
        `${densityToString(geometry.modalDataDensity)} density`,
        `${geometry.modalDataSectorSize} bytes per sector`].join(", ");
    add("Geometry", `${pluralizeWithCount(geometry.cylinderCount, "cylinder")}, ` +
        `${pluralizeWithCount(geometry.sideCount, "side")}`);
    if (bootTrack === undefined) {
        add("Boot track", "Unreadable");
        add("Most tracks", otherTracksInfo);
    } else if (geometry.homogeneous) {
        add("Every track", trackGeometryToString(bootTrack));
    } else {
        add("Boot track", trackGeometryToString(bootTrack));
        add("Most other tracks", otherTracksInfo);
    }

    if (fileSystem instanceof Trsdos) {
        const trsdos = fileSystem;
        const gatInfo = trsdos.getGatInfo();
        if (typeof gatInfo === "string") {
            add("Error", gatInfo);
        } else {
            add("Floppy name", gatInfo.name);
            add("Floppy date", gatInfo.date);
            add("Auto command", gatInfo.autoCommand);
            if (trsdos.allocationSides < geometry.sideCount) {
                add("Sides used", `${trsdos.allocationSides} of ${geometry.sideCount}`);
            }
            add(`Directory ${trsdos.lumpTerm}`, trsdos.dirLumpNumber.toString());
            add("Sectors per granule", trsdos.sectorsPerGranule.toString());
            add(`Granules per ${trsdos.lumpTerm}`, trsdos.granulesPerLump.toString());
        }
        const pdriveSettings = trsdos.getPdriveSettings();
        if (pdriveSettings !== undefined) {
            add("PDRIVE", pdriveSettingsToString(pdriveSettings));
        }
    } else if (fileSystem instanceof Cpm) {
        const cpm = fileSystem;
        if (cpm.allocationSides < geometry.sideCount) {
            add("Sides used", `${cpm.allocationSides} of ${geometry.sideCount}`);
        }
        if (cpm.cylinderCount !== geometry.cylinderCount) {
            add("Cylinders", `${cpm.cylinderCount} (the image has ${geometry.cylinderCount})`);
        }
        add("Reserved tracks", cpm.reservedTrackCount.toString());
        add("Sector skew", cpm.format.skew.toString());
        add("Block size", `${cpm.format.blockSize} bytes`);
        add("Blocks", withCommas(cpm.blockCount));
        add("Directory entries", cpm.format.dirEntryCount.toString());
    } else if (fileSystem instanceof MicroDos) {
        add("Directory", "Sectors 20-29");
    } else if (fileSystem instanceof UcsdPascal) {
        const ucsdPascal = fileSystem;
        add("Volume name", ucsdPascal.volumeName);
        add("First track", ucsdPascal.format.firstTrack.toString());
        add("Interleave", ucsdPascal.format.interleave.toString());
        add("Track skew", ucsdPascal.format.trackSkew.toString());
        add("Blocks", withCommas(ucsdPascal.blockCount));
    } else if (fileSystem instanceof ModelIITrsdos) {
        const modelIITrsdos = fileSystem;
        add("Floppy name", modelIITrsdos.diskName ?? "");
        add("Layout", modelIITrsdosLayoutToString(modelIITrsdos.layout));
        add("Directory cylinder", modelIITrsdos.dirCylinder.toString());
        if (modelIITrsdos.rejectedEntryCount > 0) {
            add("Unusable directory entries", modelIITrsdos.rejectedEntryCount.toString());
        }
    } else if (fileSystem instanceof TrsdosII) {
        const trsdosII = fileSystem;
        add("Floppy name", trsdosII.diskName);
        add("Version", trsdosII.nameAndVersion.replace(/^TRSDOS-II ?/, ""));
        add("Sides used", trsdosII.sideCount.toString());
        add("Granules", withCommas(trsdosII.granuleCount));
        add("Subdirectories", trsdosII.subdirectories.join(", "));
    } else if (fileSystem instanceof XenixTar) {
        const xenixTar = fileSystem;
        add("Files", xenixTar.files.length.toString());
        add("Archive members skipped", xenixTar.skippedMemberCount.toString());
    }

    return details;
}
