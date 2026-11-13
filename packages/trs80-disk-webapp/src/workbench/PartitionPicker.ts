import {partitionDisplayName} from "trs80-disk";
import {type OpenDisk} from "../core/OpenDisk.js";
import {countOf, el} from "./Dom.js";

/**
 * What the partition picker asks of the page.
 */
export interface PartitionPickerHost {
    /**
     * Choose the partition that the views work on.
     *
     * @param disk the hard disk.
     * @param number the partition's number, from 1.
     */
    choose(disk: OpenDisk, number: number): void;
}

/**
 * The strip of partitions that a hard disk image shows before its view tabs: each partition's number, name, DOS,
 * file count, and whether it can be written. Clicking one chooses it, which is the CLI's "partition N".
 */
export class PartitionPicker {
    private readonly container: HTMLElement;
    private readonly host: PartitionPickerHost;

    /**
     * @param container the element to fill.
     * @param host the page.
     */
    constructor(container: HTMLElement, host: PartitionPickerHost) {
        this.container = container;
        this.host = host;
    }

    /**
     * Draw the picker for a disk, or empty it for a floppy.
     *
     * @param disk the disk.
     */
    public render(disk: OpenDisk): void {
        const session = disk.session;
        if (!session.isHardDisk()) {
            this.container.replaceChildren();
            return;
        }

        const partitions = session.getPartitions();
        if (partitions.length === 0) {
            this.container.replaceChildren(el("div", "card comingsoon", el("h4", "", "Hard disk image"),
                "No LDOS, LS-DOS, DOSPLUS or NEWDOS/80 partitions were found."));
            return;
        }

        const selected = session.selectedPartitionNumber;
        const cards = partitions.map((partition, index) => {
            const number = index + 1;
            const readOnlyReason = session.partitionReadOnlyReason(partition);
            const writable = el("span", "pill" + (readOnlyReason === undefined ? "" : " bad"),
                readOnlyReason === undefined ? "writable" : "read-only");
            if (readOnlyReason !== undefined) {
                writable.title = readOnlyReason;
            }
            const name = partitionDisplayName(partition, number);
            const card = el("button", "doscard partition" + (number === selected ? " on" : ""),
                el("b", "", number + "  " + name),
                el("span", "", partition.trsdos.nameAndVersion + " · " +
                    countOf(partition.trsdos.getDirEntries(false).length, "file")),
                el("span", "", partition.partition.describeLocation(), " ", writable));
            card.type = "button";
            card.title = "Work on partition " + number;
            card.addEventListener("click", () => this.host.choose(disk, number));
            return card;
        });

        const heading = selected === undefined ?
            "This image has " + countOf(partitions.length, "partition") + ". Choose the one to work on." :
            "Partition";
        this.container.replaceChildren(el("h4", "partitionhead", heading), el("div", "dosgrid partitions", ...cards));
    }
}
