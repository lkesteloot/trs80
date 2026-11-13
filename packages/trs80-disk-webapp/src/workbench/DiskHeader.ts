import {DiskError, getWriteProtect, readDiskInfo} from "trs80-disk";
import {SaveKind, type OpenDisk} from "../core/OpenDisk.js";
import {getDiskFacts, getSpaceUse} from "../core/DiskFacts.js";
import {countOf, el, formatKilobytes, formatNumber, makeButton, makeSwitch} from "../core/Dom.js";
import {ownerKey} from "./Highlight.js";

/**
 * What the disk header asks of the page.
 */
export interface DiskHeaderHost {
    /** Save the disk, by writing back or downloading. */
    save(disk: OpenDisk): void;
    /** Show the "Save as" sheet. */
    saveAs(disk: OpenDisk): void;
    /** Set or clear the image's write-protect flag. */
    setWriteProtect(disk: OpenDisk, writeProtected: boolean): void;
}

/**
 * The disk header: the disk's name, its chips, the write-protect switch, Save and Save as, the space bar, and
 * the read-only banner.
 */
export class DiskHeader {
    private readonly header: HTMLElement;
    private readonly banner: HTMLElement;
    private readonly host: DiskHeaderHost;

    /**
     * @param header the element for the header.
     * @param banner the element for the banner under it.
     * @param host the page.
     */
    constructor(header: HTMLElement, banner: HTMLElement, host: DiskHeaderHost) {
        this.header = header;
        this.banner = banner;
        this.host = host;
    }

    /**
     * Draw the header for a disk.
     *
     * @param disk the disk.
     * @param fileCount how many user files it has, for the space label.
     */
    public render(disk: OpenDisk, fileCount: number): void {
        const session = disk.session;
        const facts = getDiskFacts(session);
        const readOnlyReason = session.getReadOnlyReason();

        let diskName = disk.name;
        try {
            const info = readDiskInfo(session);
            if (info.name !== "") {
                diskName = info.name;
            }
        } catch (e) {
            if (!(e instanceof DiskError)) {
                throw e;
            }
        }

        const chips = el("div", "chips", el("span", "chip", facts.dos), el("span", "chip", facts.format));
        if (facts.shape !== undefined) {
            chips.append(el("span", "chip", facts.shape));
        }
        if (facts.density !== undefined) {
            chips.append(el("span", "chip", facts.density));
        }
        if (readOnlyReason !== undefined) {
            chips.append(el("span", "chip ro", "read-only"));
        }

        const left = el("div", "", el("h1", "diskname", diskName, el("small", "", disk.name)), chips);
        const right = el("div", "headactions", this.makeWriteProtect(disk), this.makeSaveAs(disk), this.makeSave(disk));
        this.header.replaceChildren(left, right, this.makeSpace(disk, fileCount));

        this.banner.replaceChildren();
        if (readOnlyReason !== undefined) {
            this.banner.append(el("div", "banner", el("b", "", "Read-only. "), readOnlyReason +
                " You can still browse, view and extract everything."));
        }
    }

    /**
     * Make the write-protect switch.
     */
    private makeWriteProtect(disk: OpenDisk): HTMLElement {
        const flag = getWriteProtect(disk.session);
        const unsupported = typeof flag === "string" ? flag : undefined;
        const {element, input} = makeSwitch("Write-protected", flag === true, checked => {
            this.host.setWriteProtect(disk, checked);
        }, unsupported ?? "The image's write-protect flag, which emulators honor (protect on or off)");
        input.disabled = unsupported !== undefined;
        return element;
    }

    /**
     * Make the "Save as" button.
     */
    private makeSaveAs(disk: OpenDisk): HTMLElement {
        const button = makeButton("Save as…", () => this.host.saveAs(disk));
        if (disk.session.isHardDisk()) {
            button.disabled = true;
            button.title = "A hard disk image can only be saved as it is.";
        }
        return button;
    }

    /**
     * Make the Save button, whose label says what it will do.
     */
    private makeSave(disk: OpenDisk): HTMLElement {
        const download = disk.saveKind === SaveKind.DOWNLOAD;
        const button = makeButton(download ? "Download" : "Save", () => this.host.save(disk), "primary");
        const hasChanges = disk.session.hasChanges();
        button.disabled = !hasChanges;
        if (!hasChanges) {
            button.title = "There are no unsaved changes.";
        } else if (download) {
            button.title = "This browser can't write back to the file, so this downloads the disk image.";
        } else {
            button.title = "Write the changes back to " + disk.name + ".";
        }
        return button;
    }

    /**
     * Make the space bar and its label, or nothing if the disk's space isn't known.
     *
     * @param disk the disk.
     * @param fileCount how many user files it has.
     */
    private makeSpace(disk: OpenDisk, fileCount: number): HTMLElement {
        const space = getSpaceUse(disk.session);
        const container = el("div", "space");
        if (space === undefined) {
            return container;
        }

        const bar = el("div", "spacebar");
        const total = space.totalGranules;
        const addSegment = (granules: number, color: string, title: string, fileName?: string): void => {
            if (granules <= 0) {
                return;
            }
            const segment = el("span");
            segment.style.width = (100*granules/total) + "%";
            segment.style.background = color;
            segment.title = title;
            if (fileName !== undefined) {
                // Lights up when the file is hovered in the list or the map.
                segment.dataset.o = ownerKey(fileName);
            }
            bar.append(segment);
        };
        addSegment(space.otherGranules, "var(--sys)", "Boot, directory and other: " + countOf(space.otherGranules, "granule"));
        for (const file of space.files) {
            addSegment(file.granules, file.color, file.name + ": " + countOf(file.granules, "granule"), file.name);
        }

        const totalBytes = total * space.granuleBytes;
        container.append(bar, el("div", "spacelabel",
            el("span", "", formatKilobytes(space.freeBytes) + " free of " + formatKilobytes(totalBytes) + " ",
                el("span", "kind", "(" + countOf(space.freeGranules, "granule") + " of " +
                    formatNumber(space.granuleBytes) + " bytes each free)")),
            el("span", "kind", countOf(fileCount, "file"))));
        return container;
    }
}
