import {
    type CrcInfo, densityToString, type FloppyDisk, type FloppyFileSystem, describeSectorArtifact, findImagingArtifacts,
    findSectorArtifactKind, SectorPosition, type SectorData, type SectorInfo,
} from "trs80-base";
import type {DiskSession} from "trs80-disk";
import {toHexByte, toHexWord} from "z80-base";
import type {OpenDisk} from "../core/OpenDisk.js";
import {el, formatNumber, makeButton} from "../core/Dom.js";
import type {PickedSector} from "./ViewState.js";

/**
 * The names of the files that use a sector, in directory order. Two or more mean that the disk is cross-linked.
 *
 * @param session the disk's session.
 * @param position the sector's position.
 */
function filesAtSector(session: DiskSession, position: SectorPosition): string[] {
    const fileSystem: FloppyFileSystem | undefined = session.fileSystem;
    if (fileSystem === undefined) {
        return [];
    }

    const names: string[] = [];
    for (const dirEntry of fileSystem.getDirEntries(true)) {
        const used = fileSystem.getFileSectorPositions(dirEntry).some(candidate => candidate.equals(position));
        const name = dirEntry.getFilename("/");
        if (used && !names.includes(name)) {
            names.push(name);
        }
    }
    return names;
}

/**
 * What a data address mark means, as a phrase.
 *
 * @param mark the mark byte, 0xF8 to 0xFB.
 */
function describeDataAddressMark(mark: number): string {
    switch (mark) {
        case 0xFB:
            return "normal";
        case 0xF8:
            return "deleted data";
        case 0xF9:
        case 0xFA:
            return "single-density alternate mark";
        default:
            return "unusual";
    }
}

/**
 * How a CRC reads, as a phrase.
 *
 * @param crc the CRC as written and as computed, or undefined if the image format doesn't record it.
 * @param crcError whether the image says that there was a CRC error, which is all that some formats say.
 */
function describeCrc(crc: CrcInfo | undefined, crcError: boolean): string {
    if (crc === undefined) {
        return crcError ? "error (this image format doesn't keep the values)" : "good, or not recorded by this image format";
    }
    return crc.valid() ? "good (" + toHexWord(crc.written) + ")" :
        "error: written " + toHexWord(crc.written) + ", computed " + toHexWord(crc.computed);
}

/**
 * Make a hex dump of a sector's bytes, eight to a line, with the characters beside them.
 *
 * @param bytes the sector's bytes.
 */
function makeHexDump(bytes: Uint8Array): HTMLElement {
    const lines: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8) {
        const row = bytes.subarray(offset, offset + 8);
        const hex = Array.from(row, toHexByte).join(" ").padEnd(23, " ");
        const text = Array.from(row, byte => byte >= 0x20 && byte < 0x7F ? String.fromCharCode(byte) : ".").join("");
        lines.push(toHexWord(offset) + "  " + hex + "  " + text);
    }
    return el("pre", "preview sectorbytes", lines.join("\n"));
}

/**
 * Add a floppy sector's recording details to the inspector's list: density, size, address mark, CRCs and any
 * imaging artifact.
 *
 * @param add adds a line to the list.
 * @param floppy the floppy.
 * @param position the sector's position.
 * @param info what the image says about the sector, or undefined if it has none there.
 */
function addFloppySectorDetails(add: (term: string, value: string) => void, floppy: FloppyDisk,
                                position: SectorPosition, info: SectorInfo | undefined): void {
    if (info === undefined) {
        add("Sector", "The image has no sector here.");
        return;
    }

    add("Density", densityToString(info.density));
    add("Size", formatNumber(info.sectorSize) + " bytes");
    add("Address mark", toHexByte(info.getDataAddressMark()) + ", " + describeDataAddressMark(info.getDataAddressMark()));
    if (!info.hasData()) {
        add("Data field", "the ID is there, but no data follows it");
    }
    add("ID CRC", describeCrc(info.crc?.idCrc, false));
    add("Data CRC", describeCrc(info.crc?.dataCrc, info.crcError));

    const artifactKind = findSectorArtifactKind(findImagingArtifacts(floppy), position);
    if (artifactKind !== undefined) {
        add("Imaging", describeSectorArtifact(artifactKind));
    }
}

/**
 * Make the buttons that step through the sectors of the picked cell, which is a whole granule in a hard disk
 * partition's map, or undefined if the cell is one sector.
 *
 * @param picked the picked sector.
 * @param position its position.
 * @param onPick called with the sector to show instead.
 */
function makeSectorStepper(picked: PickedSector, position: SectorPosition,
                           onPick: (picked: PickedSector) => void): HTMLElement | undefined {

    const sectors = picked.cellSectors;
    const index = sectors.findIndex(candidate => candidate.equals(position));
    if (sectors.length <= 1 || index < 0) {
        return undefined;
    }

    const step = (delta: number): void => {
        const next = sectors[index + delta];
        onPick({...picked, cylinder: next.cylinderNumber, side: next.side, sector: next.sectorNumber});
    };
    const previous = makeButton("Previous", () => step(-1));
    previous.disabled = index === 0;
    const next = makeButton("Next", () => step(1));
    next.disabled = index === sectors.length - 1;
    return el("div", "sectorstep", previous,
        el("span", "hint", "Sector " + formatNumber(index + 1) + " of " + formatNumber(sectors.length) + " in this granule"),
        next);
}

/**
 * Fill the inspector with a sector that the user picked in the Map view: where it is and what uses it, how it's
 * marked and whether its CRCs are good, and its bytes. The sector is read from the disk as it is now, so that an
 * edit shows. On a hard disk the sector is the chosen partition's, and the map's cell was a whole granule, so
 * buttons step through the granule's sectors.
 *
 * @param container the inspector's element.
 * @param disk the disk.
 * @param picked the sector.
 * @param onPick called with another sector of the picked cell to show instead.
 */
export function renderSectorPanel(container: HTMLElement, disk: OpenDisk, picked: PickedSector,
                                  onPick: (picked: PickedSector) => void): void {

    const session = disk.session;
    const position = SectorPosition.make(picked.cylinder, picked.side, picked.sector);

    const list = el("dl", "kv");
    const add = (term: string, value: string, className = ""): void => {
        list.append(el("dt", "", term), el("dd", className, value));
    };

    const names = filesAtSector(session, position);
    add(names.length > 1 ? "Files" : "File", names.length === 0 ? "none uses this sector" : names.join(", "), "mono");

    let where: string;
    let sector: SectorData | undefined;
    if (session.isHardDisk()) {
        // The position is the partition's logical one, which runs across all its heads.
        const partition = session.getSelectedPartition().partition;
        where = "Cylinder " + picked.cylinder + ", sector " + picked.sector;
        sector = partition.readSector(position);
        const physical = partition.toPhysical(position);
        add("On the disk", physical === undefined ? "outside the partition" :
            "cylinder " + physical.cylinder + ", head " + physical.head + ", sector " + physical.sector);
        if (sector === undefined) {
            add("Sector", "The image has no sector here.");
        } else {
            add("Size", formatNumber(sector.data.length) + " bytes");
            add("CRCs", "not recorded: a hard disk image holds only the sectors' data");
        }
    } else {
        const floppy = session.floppy;
        where = "Cylinder " + picked.cylinder + ", side " + picked.side + ", sector " + picked.sector;
        sector = floppy.readSector(position);
        addFloppySectorDetails(add, floppy, position, sector ?? floppy.getGeometry().sectorMap.get(position.key()));
    }

    const children: Node[] = [el("h3", "", where), el("div", "sub", picked.note)];
    const stepper = makeSectorStepper(picked, position, onPick);
    if (stepper !== undefined) {
        children.push(stepper);
    }
    children.push(list);
    if (sector !== undefined) {
        children.push(makeHexDump(sector.data));
    }
    children.push(el("p", "hint", session.isHardDisk() ? "Click another granule to see it." : "Click another sector to see it."));
    container.replaceChildren(...children);
}
