import * as path from "path";
import {
    compareFloppies, compareFloppyFileSystems, convertFloppy, type FloppyComparison, floppyDifferenceKindIsLoss,
    floppyDifferenceKindToString, type FloppyDisk, type FloppyImageFormat, floppyImageFormatToString, TrackPosition,
} from "trs80-base";
import {colors} from "./colors.js";
import {pluralizeWithCount, ToolError, writeOutputFile} from "./utils.js";

/**
 * The most examples of each kind of difference to show.
 */
const MAX_EXAMPLES = 3;

/**
 * The most file differences to show.
 */
const MAX_FILE_DIFFERENCES = 10;

/**
 * Describe a position for a message, such as "cylinder 3 side 0" or "cylinder 3 side 0 sector 5".
 */
function positionText(trackPosition: TrackPosition, sectorNumber: number | undefined): string {
    const text = `cylinder ${trackPosition.cylinderNumber} side ${trackPosition.side}`;
    return sectorNumber === undefined ? text : `${text} sector ${sectorNumber}`;
}

/**
 * Print what a conversion would lose or change, grouped by kind with a few examples of each. Losses are
 * printed as warnings and the other differences as muted notes.
 *
 * @param comparison the comparison of the source with the converted disk.
 * @param formatName the name of the new format, such as "JV3".
 */
function printDifferences(comparison: FloppyComparison, formatName: string): void {
    const groups = comparison.groupByKind();
    const lossGroups = groups.filter(group => floppyDifferenceKindIsLoss(group.kind));
    if (lossGroups.length > 0) {
        console.log(colors.warning(`${formatName} can't hold everything on this disk:`));
        for (const group of lossGroups) {
            console.log(colors.warning(`  ${group.differences.length.toLocaleString()} ` +
                floppyDifferenceKindToString(group.kind)));
            for (const difference of group.differences.slice(0, MAX_EXAMPLES)) {
                console.log(colors.muted(`    ${positionText(difference.trackPosition, difference.sectorNumber)}: ` +
                    difference.detail));
            }
            const more = group.differences.length - MAX_EXAMPLES;
            if (more > 0) {
                console.log(colors.muted(`    and ${more.toLocaleString()} more`));
            }
        }
    }

    for (const group of groups) {
        if (!floppyDifferenceKindIsLoss(group.kind)) {
            console.log(colors.muted(`Note: ${group.differences.length.toLocaleString()} ` +
                floppyDifferenceKindToString(group.kind)));
        }
    }
}

/**
 * Convert a floppy image to another image format and write it. First converts, then reads the new image
 * back and compares every sector, and the files if the disk has a file system we recognize. If anything
 * differs it prints what, and writes the new image only with force.
 *
 * @param floppy the decoded input floppy.
 * @param inFilename the name of the input file.
 * @param outFilename the name of the output file.
 * @param outFormat the format the output file's extension names.
 * @param force whether to write the new image even if it differs from the original.
 * @throws ToolError if the format can't hold the disk at all, or it differs and force is false.
 */
export function convertFloppyFile(floppy: FloppyDisk, inFilename: string, outFilename: string,
                                  outFormat: FloppyImageFormat, force: boolean): void {

    if (path.resolve(inFilename) === path.resolve(outFilename)) {
        throw new ToolError("The input and output are the same file, \"" + inFilename + "\"");
    }

    const formatName = floppyImageFormatToString(outFormat);
    const result = convertFloppy(floppy, outFormat);
    if (typeof result === "string") {
        throw new ToolError("Can't convert \"" + inFilename + "\" to " + formatName + ": " + result);
    }

    const comparison = compareFloppies(floppy, result);
    const fileComparison = compareFloppyFileSystems(floppy, result);
    const fileDifferences = fileComparison?.differences ?? [];
    printDifferences(comparison, formatName);
    if (fileDifferences.length > 0) {
        console.log(colors.warning("The files on the new disk differ:"));
        for (const difference of fileDifferences.slice(0, MAX_FILE_DIFFERENCES)) {
            console.log(colors.warning("  " + difference));
        }
        const more = fileDifferences.length - MAX_FILE_DIFFERENCES;
        if (more > 0) {
            console.log(colors.muted(`  and ${more.toLocaleString()} more`));
        }
    }

    const lossy = comparison.hasLoss() || fileDifferences.length > 0;
    if (lossy && !force) {
        throw new ToolError("Nothing was written to \"" + outFilename + "\". Use --force to write it anyway.");
    }

    writeOutputFile(outFilename, result.binary);

    const geometry = result.getGeometry();
    const description = `${formatName} floppy, ${pluralizeWithCount(geometry.cylinderCount, "cylinder")}, ` +
        `${pluralizeWithCount(geometry.sideCount, "side")}, ${pluralizeWithCount(comparison.resultSectorCount, "sector")}`;
    const outcome = !lossy ? "nothing lost" : "written anyway, with the differences above";
    console.log(`Wrote ${outFilename}: ${description}; ${outcome}.`);
}
