import {
    convertFloppy, FLOPPY_IMAGE_FORMATS, FloppyImageFormat, floppyImageFormatOf, floppyImageFormatToString,
} from "trs80-base";
import {getWriteProtect} from "trs80-disk";
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
 * What converting the disk to a format would be like.
 */
interface ConversionCheck {
    /** Why the disk can't be saved in the format, or undefined if it can. */
    error: string | undefined;
    /** What the format can't hold of the disk, or undefined if it holds all of it. */
    warning: string | undefined;
}

/**
 * Try converting the disk to a format, to see whether it works and what it loses.
 *
 * @param disk the disk, which must be a floppy.
 * @param format the format.
 */
function checkConversion(disk: OpenDisk, format: FloppyImageFormat): ConversionCheck {
    const floppy = disk.session.floppy;
    if (floppyImageFormatOf(floppy) === format) {
        return {error: undefined, warning: undefined};
    }

    const converted = convertFloppy(floppy, format);
    if (typeof converted === "string") {
        return {error: converted + ".", warning: undefined};
    }

    const warnings: string[] = [];
    const sectorsBefore = floppy.getGeometry().sectorInfos.length;
    const sectorsAfter = converted.getGeometry().sectorInfos.length;
    if (sectorsAfter < sectorsBefore) {
        warnings.push(format === FloppyImageFormat.JV1 ?
            "JV1 holds only single-density, single-sided tracks, so " + (sectorsBefore - sectorsAfter) + " of the " +
            sectorsBefore + " sectors are left out." :
            (sectorsBefore - sectorsAfter) + " of the " + sectorsBefore + " sectors can't be held, and are left out.");
    }
    if (format === FloppyImageFormat.JV1 && getWriteProtect(disk.session) === true) {
        warnings.push("JV1 has no write-protect flag, so the copy won't be write-protected.");
    }
    return {error: undefined, warning: warnings.length === 0 ? undefined : warnings.join(" ")};
}

/**
 * Show the "Save as" sheet: one radio-style card for each format that we can write, and a Save button. Choosing
 * a card shows any problem with that format right away, and disables Save if the disk can't be saved in it.
 *
 * @param disk the disk, which must be a floppy.
 * @param onChoose called with the format that the user picks, after the sheet closes.
 */
export function openSaveAsSheet(disk: OpenDisk, onChoose: (format: FloppyImageFormat) => void): void {
    const current = floppyImageFormatOf(disk.session.floppy);
    let chosen: FloppyImageFormat = current ?? FloppyImageFormat.DMK;
    const cards = el("div", "dosgrid");
    cards.setAttribute("role", "radiogroup");
    const cardOf = new Map<FloppyImageFormat, HTMLElement>();
    const saveButton = makeButton("Save", () => {
        sheet.close();
        onChoose(chosen);
    }, "primary");
    const sheet: Sheet = new Sheet({
        title: "Save " + disk.name + " as…",
        subtitle: "Converting keeps every sector it can. Some formats can't hold everything.",
        content: cards,
        buttons: [makeButton("Cancel", () => sheet.close()), saveButton],
    });

    /**
     * Mark the chosen card, and show its problems in the status line and on the Save button.
     */
    const choose = (format: FloppyImageFormat): void => {
        chosen = format;
        for (const [other, card] of cardOf) {
            card.classList.toggle("on", other === format);
            card.setAttribute("aria-checked", String(other === format));
        }
        const check = checkConversion(disk, format);
        saveButton.disabled = check.error !== undefined;
        sheet.setStatus(check.error ?? check.warning ?? "", check.error !== undefined);
    };

    for (const format of FLOPPY_IMAGE_FORMATS) {
        const card = el("button", "doscard",
            el("b", "", floppyImageFormatToString(format)), el("span", "", formatBlurb(format)));
        card.type = "button";
        card.setAttribute("role", "radio");
        card.addEventListener("click", () => choose(format));
        cardOf.set(format, card);
        cards.append(card);
    }
    choose(chosen);
    sheet.open();
}
