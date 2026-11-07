import {FloppyDisk} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {Trsdos, TrsdosVersion, type TrsdosDirEntry, type TrsdosExtent} from "./Trsdos.js";

/**
 * The most lumps a 2.3-family GAT can hold before it runs over the lockout table at 0x60. See
 * "The GAT holds one byte per lump" in the "NEWDOS/80 lumps" section of FLOPPY_FORMATS.md.
 */
const MAX_LUMPS_WITH_LOCKOUT_TABLE = 0x60;

/**
 * How one granule of a TRSDOS disk is used, according to the GAT, the lockout table, the
 * directory, and the files' extents. A healthy disk agrees with itself; the map exists to show
 * where it doesn't.
 */
export class TrsdosGranule {
    /**
     * The lump (the cylinder, where lumps are cylinders) that holds the granule.
     */
    public readonly lump: number;

    /**
     * The granule's index within its lump.
     */
    public readonly granule: number;

    /**
     * Whether the GAT's bit for this granule is set (used).
     */
    public readonly gatUsed: boolean;

    /**
     * Whether the lockout table marks this granule as unusable. Always false where the disk has no
     * lockout table we can trust; see {@link TrsdosGranuleMap.make}.
     */
    public readonly lockedOut: boolean;

    /**
     * Whether the granule is in the directory's range.
     */
    public readonly inDirectory: boolean;

    /**
     * The primary entries of the files whose extents include this granule, each at most once. System
     * files are included, and so are TRSDOS 1.3's synthesized SYS files.
     */
    public readonly owners: TrsdosDirEntry[] = [];

    constructor(lump: number, granule: number, gatUsed: boolean, lockedOut: boolean, inDirectory: boolean) {
        this.lump = lump;
        this.granule = granule;
        this.gatUsed = gatUsed;
        this.lockedOut = lockedOut;
        this.inDirectory = inDirectory;
    }

    /**
     * Whether the allocator could hand this granule out: nothing says it's in use, and it isn't locked out.
     */
    public isFree(): boolean {
        return !this.gatUsed && this.owners.length === 0 && !this.inDirectory && !this.lockedOut;
    }
}

/**
 * A file extent that points at least partly outside the disk's granules.
 */
export interface TrsdosExtentOutOfRange {
    /**
     * The primary entry of the file that has the extent.
     */
    dirEntry: TrsdosDirEntry;

    /**
     * The extent. Its granules that are on the disk still count in the map.
     */
    extent: TrsdosExtent;
}

/**
 * A read-only analysis of how every granule of a TRSDOS disk is used, combining the GAT, the lockout
 * table, the directory's range, and the extents of every file. It's the basis for reporting free
 * space, for checking a disk's consistency, and for deciding whether the disk is safe to write.
 */
export class TrsdosGranuleMap {
    public readonly trsdos: Trsdos;

    /**
     * Every granule on the disk, at index lump*granulesPerLump + granule, for lumps 0 to lumpCount - 1.
     */
    public readonly granules: TrsdosGranule[];

    /**
     * Extents that run past the last granule on the disk, one per extent.
     */
    public readonly outOfRange: TrsdosExtentOutOfRange[];

    private constructor(trsdos: Trsdos, granules: TrsdosGranule[], outOfRange: TrsdosExtentOutOfRange[]) {
        this.trsdos = trsdos;
        this.granules = granules;
        this.outOfRange = outOfRange;
    }

    /**
     * Analyze the disk.
     *
     * @param trsdos the file system.
     * @param files the primary entries to analyze, system files included, or undefined to read them
     * from the directory. Pass them when the caller has its own copy of the directory, so that the
     * entries in the map are the caller's objects.
     * @return the map, or a string saying why we can't make one (for example, the GAT can't be read).
     */
    public static make(trsdos: Trsdos, files?: TrsdosDirEntry[]): TrsdosGranuleMap | string {
        const gatInfo = trsdos.getGatInfo();
        if (typeof gatInfo === "string") {
            return gatInfo;
        }

        const granulesPerLump = trsdos.granulesPerLump;
        const lumpCount = trsdos.lumpCount;
        const granuleCount = lumpCount*granulesPerLump;

        // The lockout table at GAT 0x60 has one byte per lump that mirrors the GAT's bits, but only in
        // the 2.3 family, where it exists for mirror-image backups ("GAT bytes 0xCB-0xCD" and "Cylinders,
        // sides, and allocation" in FLOPPY_FORMATS.md). We use it only where it's safe to:
        //
        // - TRSDOS 1.3's table at the same place is a "track existence table" that FORMAT leaves zero,
        //   and other versions don't define it.
        // - Hard disk partitions have no lockout table at all: their GAT's bytes from 0x60 on are the
        //   allocation of later cylinders. A floppy being written, through a SectorOverlay, has the
        //   floppy's, but a partition being written through one doesn't.
        // - A disk with more than 96 lumps has the GAT running over the lockout table ("NEWDOS/80 lumps").
        // - Lumps that aren't cylinders have no cylinder-per-byte table to mirror them.
        const hasLockoutTable = trsdos.version === TrsdosVersion.V2_3 &&
            trsdos.lumpsAreCylinders &&
            lumpCount <= MAX_LUMPS_WITH_LOCKOUT_TABLE &&
            (trsdos.disk instanceof FloppyDisk ||
                (trsdos.disk instanceof SectorOverlay && trsdos.disk.base instanceof FloppyDisk));

        // The directory's range, as in Trsdos.getTrsdos13SystemFiles().
        const dirStart = trsdos.dirLumpNumber*granulesPerLump;
        const dirEnd = dirStart + trsdos.granulesPerDir;

        const granules: TrsdosGranule[] = [];
        for (let lump = 0; lump < lumpCount; lump++) {
            const gatByte = gatInfo.gat[lump] ?? 0;
            const lockOutByte = hasLockoutTable ? gatInfo.lockOut[lump] ?? 0 : 0;
            for (let granule = 0; granule < granulesPerLump; granule++) {
                // Bits at or above granulesPerLump are filler.
                const gatUsed = (gatByte & (1 << granule)) !== 0;
                const lockedOut = (lockOutByte & (1 << granule)) !== 0;
                const index = lump*granulesPerLump + granule;
                const inDirectory = index >= dirStart && index < dirEnd;
                granules.push(new TrsdosGranule(lump, granule, gatUsed, lockedOut, inDirectory));
            }
        }

        const outOfRange: TrsdosExtentOutOfRange[] = [];
        for (const dirEntry of files ?? trsdos.getDirEntries(true)) {
            for (const extent of trsdos.getFileExtents(dirEntry)) {
                // An extent's granules continue into the next lump when they run past the end of one
                // (as Trsdos.logicalToPhysical() does), so use the linear index.
                const start = extent.cylinderNumber*granulesPerLump + extent.granuleOffset;
                const end = start + extent.granuleCount;
                if (end > granuleCount) {
                    outOfRange.push({dirEntry, extent});
                }
                for (let i = start; i < Math.min(end, granuleCount); i++) {
                    const owners = granules[i].owners;
                    if (!owners.includes(dirEntry)) {
                        owners.push(dirEntry);
                    }
                }
            }
        }

        return new TrsdosGranuleMap(trsdos, granules, outOfRange);
    }

    /**
     * Get one granule, or undefined if it's not on the disk.
     */
    public get(lump: number, granule: number): TrsdosGranule | undefined {
        if (lump < 0 || lump >= this.trsdos.lumpCount || granule < 0 || granule >= this.trsdos.granulesPerLump) {
            return undefined;
        }
        return this.granules[lump*this.trsdos.granulesPerLump + granule];
    }

    /**
     * The number of granules that could be allocated.
     */
    public getFreeGranuleCount(): number {
        return this.granules.filter(granule => granule.isFree()).length;
    }

    /**
     * The number of bytes in the free granules.
     */
    public getFreeByteCount(): number {
        return this.getFreeGranuleCount()*this.trsdos.sectorsPerGranule*this.trsdos.geometry.modalDataSectorSize;
    }

    /**
     * The granules that more than one file claims.
     */
    public getSharedGranules(): TrsdosGranule[] {
        return this.granules.filter(granule => granule.owners.length > 1);
    }

    /**
     * The granules that a file claims but the GAT says are free, which the DOS would hand out again.
     */
    public getClaimedButFreeGranules(): TrsdosGranule[] {
        return this.granules.filter(granule => granule.owners.length > 0 && !granule.gatUsed);
    }

    /**
     * The granules that the GAT says are used but that no file claims and that aren't the directory.
     * Locked-out granules are included, since the GAT marks them used.
     */
    public getUsedButUnclaimedGranules(): TrsdosGranule[] {
        return this.granules.filter(granule => granule.gatUsed && granule.owners.length === 0 && !granule.inDirectory);
    }
}
