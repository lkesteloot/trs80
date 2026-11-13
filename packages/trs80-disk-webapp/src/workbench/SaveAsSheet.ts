import {
    FLOPPY_IMAGE_FORMATS, FloppyImageFormat, floppyImageFormatOf, floppyImageFormatToString,
} from "trs80-base";
import {assertNever} from "z80-base";
import type {OpenDisk} from "../core/OpenDisk.js";
import {el, makeButton} from "../core/Dom.js";
import {Sheet} from "./Sheet.js";

/**
 * A phrase about what a format is good for, for its card.
 */
function formatBlurb(format: FloppyImageFormat): string {
    switch (format) {
        case FloppyImageFormat.DMK:
            return "Every byte of every track. Best for preservation.";
        case FloppyImageFormat.JV1:
            return "Simplest. Single density, one side only.";
        case FloppyImageFormat.JV3:
            return "Sectors with their density. Most emulators read it.";
        case FloppyImageFormat.HFE:
            return "For the HxC and Gotek floppy emulators.";
        case FloppyImageFormat.IMD:
            return "ImageDisk, for real drives on a PC.";
        default:
            assertNever(format);
    }
}

/**
 * Show the "Save as" sheet: one card for each format that we can write.
 *
 * @param disk the disk, which must be a floppy.
 * @param onChoose called with the format that the user picks, after the sheet closes.
 */
export function openSaveAsSheet(disk: OpenDisk, onChoose: (format: FloppyImageFormat) => void): void {
    const current = floppyImageFormatOf(disk.session.floppy);
    const cards = el("div", "dosgrid");
    const sheet: Sheet = new Sheet({
        title: "Save " + disk.name + " as…",
        subtitle: "Converting keeps every sector. Some formats can't hold everything (JV1 has no write-protect flag " +
            "or mixed density), and the conversion says so if it can't.",
        content: cards,
        buttons: [makeButton("Cancel", () => sheet.close())],
    });

    for (const format of FLOPPY_IMAGE_FORMATS) {
        const card = el("button", "doscard" + (format === current ? " on" : ""),
            el("b", "", floppyImageFormatToString(format)), el("span", "", formatBlurb(format)));
        card.type = "button";
        card.addEventListener("click", () => {
            sheet.close();
            onChoose(format);
        });
        cards.append(card);
    }
    sheet.open();
}
