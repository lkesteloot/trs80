import type {OpenDisk} from "../core/OpenDisk.js";
import {countOf, el, makeButton} from "../core/Dom.js";
import {Sheet} from "./Sheet.js";

/**
 * Show the sheet that picks the disk to copy files to. Each other open disk is a card, and a disk that can't be
 * written is disabled with the reason.
 *
 * @param fileCount how many files are being copied.
 * @param targets the other open disks.
 * @param onChoose called with the disk that the user picks, after the sheet closes.
 */
export function openCopySheet(fileCount: number, targets: OpenDisk[], onChoose: (target: OpenDisk) => void): void {
    const cards = el("div", "dosgrid");
    const sheet: Sheet = new Sheet({
        title: "Copy " + countOf(fileCount, "file") + " to…",
        subtitle: "Each file is read from this disk and added to the other one. You'll see what will happen before " +
            "anything is written.",
        content: cards,
        buttons: [makeButton("Cancel", () => sheet.close())],
    });

    for (const target of targets) {
        const reason = target.session.getReadOnlyReason();
        const card = el("button", "doscard", el("b", "", target.name),
            el("span", "", reason === undefined ? target.session.fileSystem?.nameAndVersion ?? "" : "read-only"));
        card.type = "button";
        card.disabled = reason !== undefined;
        card.title = reason ?? "";
        card.addEventListener("click", () => {
            sheet.close();
            onChoose(target);
        });
        cards.append(card);
    }
    sheet.open();
}
