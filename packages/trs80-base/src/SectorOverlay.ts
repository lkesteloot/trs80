import type {DiskVolume, VolumeGeometry, WritableDiskVolume} from "./DiskVolume.js";
import {SectorData, SectorPosition} from "./FloppyDisk.js";

/**
 * A DiskVolume that sees the sectors of another, with changes laid over them until they're committed.
 * Reads see the changes; the underlying disk doesn't until {@link commit}. This lets a multi-step
 * change be made atomically in memory: if it fails partway, {@link discard} leaves the disk
 * untouched, and the changed disk can be decoded again before anything is committed.
 *
 * A write replaces only a sector's data. The sector keeps its data address mark (which matters:
 * TRSDOS 2.3-family directory sectors are marked deleted), its density, and its size. Sectors are
 * never created. A hard disk partition's sectors have only data, so there's nothing else to keep.
 *
 * This wraps any {@link WritableDiskVolume}: a floppy or a hard disk partition.
 */
export class SectorOverlay implements DiskVolume {
    /**
     * The disk underneath, which isn't changed until {@link commit}.
     */
    public readonly base: WritableDiskVolume;

    /**
     * The changed sectors, by position key. Each has the base sector's mark and density, and the
     * new data.
     */
    private readonly changes = new Map<string, SectorData>();

    /**
     * @param base the floppy or partition to lay changes over.
     */
    constructor(base: WritableDiskVolume) {
        this.base = base;
    }

    /**
     * The base's geometry. Writes never change the layout.
     */
    public getGeometry(): VolumeGeometry {
        return this.base.getGeometry();
    }

    /**
     * Read a sector: a copy of the changed one if it has been written, otherwise the base's.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        const changed = this.changes.get(sectorPosition.key());
        if (changed === undefined) {
            return this.base.readSector(sectorPosition);
        }

        return cloneSectorData(changed);
    }

    /**
     * Whether the sector exists, which is up to the base: a write can't create a sector.
     */
    public hasSectorData(sectorPosition: SectorPosition): boolean {
        return this.base.hasSectorData(sectorPosition);
    }

    /**
     * The boot track as Latin-1 text, like FloppyDisk's, but reading through the overlay so that
     * uncommitted changes show. It isn't cached.
     */
    public getBootTrackText(): string {
        let text = "";
        const bootTrack = this.getGeometry().bootTrack;
        const sectorPositions = bootTrack === undefined ? [] : bootTrack.sectorPositions();
        for (const sectorPosition of sectorPositions) {
            const data = this.readSector(sectorPosition)?.data;
            if (data !== undefined) {
                for (const b of data) {
                    text += String.fromCharCode(b);
                }
            }
        }

        return text;
    }

    /**
     * Replace a sector's data in the overlay. The sector keeps everything else it had on the base
     * (data address mark, density, size), and reads back with no CRC error.
     *
     * @throws if the base is write-protected, the sector isn't on the disk, or the data isn't the
     * sector's size. The messages are suitable for showing to a user.
     */
    public writeSector(sectorPosition: SectorPosition, data: Uint8Array): void {
        const description = describeSectorPosition(sectorPosition);
        if (this.base.isWriteProtected()) {
            throw new Error(`Can't write ${description}: the disk is write-protected`);
        }

        // Use the existing change as the template if there is one, since it has the base's mark.
        const existing = this.readSector(sectorPosition);
        if (existing === undefined || !this.base.hasSectorData(sectorPosition)) {
            throw new Error(`Can't write ${description}: no such sector on the disk`);
        }
        if (data.length !== existing.data.length) {
            throw new Error(`Can't write ${description}: the data is ${data.length} bytes ` +
                `but the sector holds ${existing.data.length}`);
        }

        const changed = cloneSectorData(existing);
        changed.data = new Uint8Array(data);
        // Writing gives the sector good data, with a CRC that matches.
        changed.crcError = false;
        changed.crc = undefined;
        this.changes.set(sectorPosition.key(), changed);
    }

    /**
     * Whether any sector has been written since the last commit or discard.
     */
    public hasChanges(): boolean {
        return this.changes.size > 0;
    }

    /**
     * The positions of the changed sectors, in disk order (cylinder, side, sector).
     */
    public getChangedPositions(): SectorPosition[] {
        return [... this.changes.values()]
            .map(sectorData => sectorData.sectorPosition)
            .sort((a, b) =>
                a.cylinderNumber - b.cylinderNumber ||
                a.side - b.side ||
                a.sectorNumber - b.sectorNumber);
    }

    /**
     * Write every changed sector to the base, in disk order, with the mark and density it had
     * there, and then forget the changes. If the base's writeSector() throws, the error propagates
     * and the changes stay.
     *
     * @throws if the base has become write-protected, before writing anything.
     */
    public commit(): void {
        if (this.hasChanges() && this.base.isWriteProtected()) {
            throw new Error("Can't write to the disk: it is write-protected");
        }

        for (const sectorPosition of this.getChangedPositions()) {
            const changed = this.changes.get(sectorPosition.key());
            if (changed !== undefined) {
                this.base.writeSector(sectorPosition, cloneSectorData(changed));
            }
        }
        this.changes.clear();
    }

    /**
     * Forget every change, leaving the overlay seeing the base as it is.
     */
    public discard(): void {
        this.changes.clear();
    }
}

/**
 * Copy a sector, including its data, so that the copy can be changed independently.
 */
function cloneSectorData(sectorData: SectorData): SectorData {
    const copy = new SectorData(new Uint8Array(sectorData.data), sectorData.sectorPosition, sectorData.density);
    copy.sectorSize = sectorData.sectorSize;
    copy.deleted = sectorData.deleted;
    copy.dataAddressMark = sectorData.dataAddressMark;
    copy.crcError = sectorData.crcError;
    copy.crc = sectorData.crc;
    copy.hasDataField = sectorData.hasDataField;
    return copy;
}

/**
 * Describe a position for an error message, like "cylinder 17, side 0, sector 3".
 */
function describeSectorPosition(sectorPosition: SectorPosition): string {
    return `cylinder ${sectorPosition.cylinderNumber}, side ${sectorPosition.side}, ` +
        `sector ${sectorPosition.sectorNumber}`;
}
