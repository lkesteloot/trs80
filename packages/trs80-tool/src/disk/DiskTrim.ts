import {assertNever} from "z80-base";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {parseCountOption} from "./DiskCommandParser.js";
import {trimDoneToJson, trimNothingToJson} from "./DiskJson.js";
import {TrimNothingReason, trimDisk} from "trs80-disk";

/**
 * The "trim" command: drop an image's unused tracks.
 */
export const TRIM_COMMAND: DiskCommand = {
    spec: {
        name: "trim",
        aliases: [],
        args: "",
        summary: "drop the cylinders (or side 1) that the disk doesn't use from the image",
        options: [
            {
                name: "--cylinders",
                valueName: "N",
                description: "keep cylinders 0 to N-1 (default: drop only cylinders at the end that the DOS's " +
                    "records put past the disk's end and that are re-reads or unformatted)",
            },
            {
                name: "--side",
                valueName: "0",
                description: "drop side 1, keeping only side 0 (refused if the file system uses both)",
            },
            {
                name: "--force",
                valueName: undefined,
                description: "drop tracks that hold data we can't prove is unused, or trim a write-protected image " +
                    "(never tracks with signs of copy protection)",
            },
        ],
    },

    endsSession: false,
    floppyOnly: true,

    /**
     * Rebuild the image without the tracks that nothing needs, and replace the session's disk with it, so that
     * the change is saved like any other (and --dry-run and -o apply). With no options, drops only the cylinders at
     * the end that the DOS's records put past the disk's end and that are re-reads or unformatted, and says why it
     * kept the others. With --cylinders N or --side 0, drops what was asked for, but refuses if a file (or, on
     * TRSDOS, the file system's own space) is there, or, where we can't tell, if the tracks hold data that isn't
     * filler (unless --force). It never drops tracks with signs of copy protection. The result must decode as the
     * same file system with the same files, or nothing changes. Works on DMK, JV1 and JV3 images.
     */
    run(session, command, globalOptions, out) {
        const options = command.options;
        const cylinders = parseCountOption(options, "--cylinders");
        const sideText = options.getString("--side");
        if (sideText !== undefined && sideText !== "0") {
            throw new ToolError("Invalid --side \"" + sideText + "\": only 0 is supported, which drops side 1");
        }
        const dropSide = sideText !== undefined;
        const force = options.has("--force") || globalOptions.has("--force");

        const result = trimDisk(session, {cylinders, dropSide, force});
        if (!result.trimmed) {
            switch (result.reason) {
                case TrimNothingReason.ONE_SIDE:
                    out.line("Nothing to trim: the image has only one side.");
                    break;
                case TrimNothingReason.CYLINDERS:
                    out.line("Nothing to trim: the image has only " + pluralizeWithCount(result.cylinderCount, "cylinder") + ".");
                    break;
                case TrimNothingReason.UNUSED:
                    out.line("Nothing to trim: the image has no cylinders past the disk's " +
                        pluralizeWithCount(result.diskCylinderCount ?? 0, "cylinder") +
                        " (from " + result.diskSizeSource + ").");
                    break;
                case TrimNothingReason.KEPT:
                    out.line("Nothing to trim: no cylinder past the disk's " +
                        pluralizeWithCount(result.diskCylinderCount ?? 0, "cylinder") + " (from " + result.diskSizeSource +
                        ") is provably outside the disk.");
                    break;
                case TrimNothingReason.SIZE_UNPROVEN:
                    out.line("Nothing to trim: the DOS's records don't prove where the disk ends (" + result.unproven + ").");
                    break;
                default:
                    assertNever(result.reason);
            }
            for (const message of result.kept) {
                out.line(message);
            }
            out.result(trimNothingToJson(result));
            return;
        }

        for (const message of result.removed) {
            out.line(message);
        }
        for (const message of result.kept) {
            out.line(message);
        }
        out.line("The image is now " + pluralizeWithCount(result.newSize, "byte") + ", from " +
            result.oldSize.toLocaleString() + "; nothing is saved until quit.");
        out.result(trimDoneToJson(result));
    },
};
