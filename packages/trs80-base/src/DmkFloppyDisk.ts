/**
 * Handles DMK floppy disk images.
 *
 * https://retrocomputing.stackexchange.com/questions/15282/understanding-the-dmk-disk-image-file-format-used-by-trs-80-emulators
 * http://www.classiccmp.org/cpmarchives/trs80/mirrors/trs-80.com/early/www.trs-80.com/trs80-dm.htm
 * http://www.classiccmp.org/cpmarchives/trs80/mirrors/www.discover-net.net/~dmkeil/trs80/trstech.htm
 */

import {hi, lo, toHexByte, toHexWord, word} from "z80-base";
import {CRC_16_CCITT} from "./Crc16.js";
import {
    CrcInfo,
    Density,
    FloppyDisk,
    FloppyDiskGeometry,
    FloppyWrite,
    numberToSide,
    SectorCrc,
    SectorData,
    SectorInfo,
    SectorPosition,
    Side,
    SIDE_COUNT_TO_SIDES,
} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {TRS80_FLOPPY_LOGGER} from "trs80-logger";

const FILE_HEADER_SIZE = 16;
const TRACK_HEADER_SIZE = 128;
const MAX_TRACKS = 160;
const MAX_TRACK_LENGTH = 0x2940;

/**
 * Info about a sector offset from a track header.
 */
interface SectorOffset {
    // Offset from track header.
    offset: number;

    // Sector density.
    density: Density;
}

/**
 * Get the sector offset and density info from a track header.
 *
 * @param binary the whole floppy.
 * @param trackHeader index into binary of track header.
 * @param sectorIndex index of sector (0-based).
 */
function getSectorInfo(binary: Uint8Array, trackHeader: number, sectorIndex: number): SectorOffset | undefined {
    const index = trackHeader + sectorIndex*2;
    const sectorOffset = word(binary[index + 1], binary[index]);
    if (sectorOffset === 0) {
        return undefined;
    }

    const doubleDensity = (sectorOffset & 0x8000) !== 0;
    return {
        // Bits 15 and 14 must be masked:
        offset: sectorOffset & 0x3FFF,
        density: doubleDensity ? Density.DOUBLE : Density.SINGLE,
    };
}

/**
 * Represents a single sector on a DMK floppy.
 */
class DmkSector {
    /**
     * Track this sector is in.
     */
    public readonly track: DmkTrack;
    /**
     * Whether this sector is stored in double-density format.
     */
    public readonly density: Density;
    /**
     * Use a byte stride of 1 even in single density mode.
     */
    public readonly alwaysUseStride1: boolean;
    /**
     * Offset of IDAM (0xFE byte) into the track, including the track header.
     */
    public readonly offset: number;
    /**
     * Index into the sector of the start of the user data, or undefined if there's no DAM.
     */
    public readonly dataIndex: number | undefined;
    /**
     * How the sector identifies itself in its IDAM.
     */
    public readonly logicalSectorPosition: SectorPosition;
    /**
     * Where the sector is physically on the disk.
     */
    public readonly physicalSectorPosition: SectorPosition;

    constructor(track: DmkTrack, density: Density, alwaysUseStride1: boolean, offset: number) {
        this.track = track;
        this.density = density;
        this.alwaysUseStride1 = alwaysUseStride1;
        this.offset = offset;
        this.dataIndex = this.findDataIndex();
        this.logicalSectorPosition = new SectorPosition(this.getCylinderNumber(), this.getSide(), this.getSectorNumber());
        this.physicalSectorPosition = new SectorPosition(this.track.cylinderNumber, this.track.side, this.getSectorNumber());
    }

    /**
     * Get the cylinder number for this sector. This is 0-based.
     */
    public getCylinderNumber(): number {
        return this.getByte(1);
    }

    /**
     * Get the side for this sector.
     */
    public getSide(): Side {
        // Just make invalid values 0.
        return numberToSide(this.getByte(2)) ?? Side.FRONT;
    }

    /**
     * Get the sector number for this sector.
     */
    public getSectorNumber(): number {
        return this.getByte(3);
    }

    /**
     * Get the sector size in bytes. Does not include the byte stride.
     */
    public getSectorSize(): number {
        const shift = this.getByte(4);

        // Accept 128, 256, 512, and 1024.
        if (shift <= 3) {
            return 128 << shift;
        } else {
            // Fallback on something reasonable.
            return 256;
        }
    }

    /**
     * The number of repeated bytes. If 1, then every byte on the original disk appears once in this
     * sector. If 2, then every byte in the original disk appears twice in a row.
     */
    public getByteStride(): number {
        return this.density === Density.DOUBLE || this.alwaysUseStride1 ? 1 : 2;
    }

    /**
     * Whether the sector has data. Some sectors are missing a DAM.
     */
    public hasData(): boolean {
        return this.dataIndex !== undefined;
    }

    /**
     * Get the data bytes of this sector, if available.
     */
    public getData(): Uint8Array | undefined {
        if (this.dataIndex === undefined) {
            return undefined;
        }

        const byteStride = this.getByteStride();
        const length = this.getSectorSize();

        // Begin and end in actual bytes.
        const begin = this.track.offset + this.offset + this.dataIndex*byteStride;
        const end = begin + length*byteStride;

        let bytes: Uint8Array;
        if (byteStride === 1) {
            // This is a view into the original array.
            bytes = this.track.floppyDisk.binary.subarray(begin, end);
        } else {
            // Pick out the bytes.
            bytes = new Uint8Array(length);
            for (let i = 0; i < length; i++) {
                bytes[i] = this.track.floppyDisk.binary[begin + i * byteStride];
            }
        }

        return bytes;
    }

    /**
     * Get the CRC for the IDAM.
     */
    public getIdamCrc(): number {
        // Big endian.
        return word(this.getByte(5), this.getByte(6));
    }

    /**
     * Compute the CRC for the IDAM.
     */
    public computeIdamCrc(): number {
        let crc = 0xFFFF;

        // For double density, include the three 0xA1 bytes preceding the IDAM.
        const begin = this.density === Density.DOUBLE ? -3 : 0;

        for (let i = begin; i < 5; i++) {
            crc = CRC_16_CCITT.update(crc, this.getByte(i));
        }

        return crc;
    }

    /**
     * Get the CRC for the data bytes, or undefined if the sector has no data.
     */
    public getDataCrc(): number | undefined {
        if (this.dataIndex === undefined) {
            return undefined;
        }

        // Big endian.
        const index = this.dataIndex + this.getSectorSize();
        return word(this.getByte(index), this.getByte(index + 1));
    }

    /**
     * Compute the CRC for the data bytes, or undefined if the sector has no data.
     */
    public computeDataCrc(): number | undefined {
        if (this.dataIndex === undefined) {
            return undefined;
        }

        let crc = 0xFFFF;

        const index = this.dataIndex;
        // For double density, include the preceding three 0xA1 bytes.
        const begin = this.density === Density.DOUBLE ? index - 4 : index - 1;
        const end = index + this.getSectorSize();
        for (let i = begin; i < end; i++) {
            crc = CRC_16_CCITT.update(crc, this.getByte(i));
        }

        return crc;
    }

    /**
     * Get the Data Access Mark, or undefined if we never found it.
     */
    public getDam(): number | undefined {
        if (this.dataIndex === undefined) {
            return undefined;
        }

        const dam = this.getByte(this.dataIndex - 1);
        if (dam < 0xF8 || dam > 0xFB) {
            // This is a pretty serious error, since the way that we determine dataIndex
            // is by looking for a byte in this range.
            TRS80_FLOPPY_LOGGER.warn(`Invalid DAM (0x${toHexByte(dam)})`);
        }

        return dam;
    }

    /**
     * Whether the sector data should be considered invalid. In TRSDOS this is used to mark
     * directory sectors.
     */
    public isDeleted(): boolean {
        const dam = this.getDam();

        // Normally, 0xFB, but 0xF8 if sector is considered deleted.
        return dam === undefined ? false : (dam & 0x01) === 0;
    }

    /**
     * Return the equivalent SectorInfo object using IDAM cylinder and side information.
     */
    public toLogicalSectorInfo(): SectorInfo {
        const sectorInfo = new SectorInfo(this.logicalSectorPosition, this.density, this.getSectorSize());
        this.fillOutSectorInfo(sectorInfo);
        return sectorInfo;
    }

    /**
     * Return the equivalent SectorInfo object using physical cylinder and side information.
     */
    public toPhysicalSectorInfo(): SectorInfo {
        const sectorInfo = new SectorInfo(this.physicalSectorPosition, this.density, this.getSectorSize());
        this.fillOutSectorInfo(sectorInfo);
        return sectorInfo;
    }

    /**
     * Return the equivalent SectorData object using IDAM cylinder and side information, or undefined if it has no data.
     */
    public toSectorData(): SectorData | undefined {
        // Pull out the actual data.
        const data = this.getData();
        if (data === undefined) {
            return undefined;
        }

        const sectorData = new SectorData(data, this.logicalSectorPosition, this.density);
        this.fillOutSectorInfo(sectorData);
        return sectorData;
    }

    /**
     * Complete the SectorInfo object with what we know about the sector.
     */
    private fillOutSectorInfo(sectorInfo: SectorInfo): void {
        sectorInfo.crc = new SectorCrc(
            new CrcInfo(this.getIdamCrc(), this.computeIdamCrc()),
            new CrcInfo(this.getDataCrc() ?? 0, this.computeDataCrc() ?? 0));
        sectorInfo.crcError = !sectorInfo.crc.valid();
        sectorInfo.deleted = this.isDeleted();
    }

    /**
     * Get a byte from the sector data.
     *
     * @param index index into the sector, relative to the IDAM 0xFE byte. Can be negative.
     */
    private getByte(index: number): number {
        return this.track.floppyDisk.binary[this.track.offset + this.offset + index*this.getByteStride()];
    }

    /**
     * Look for the byte that indicates the start of data (0xF8 to 0xFB). Various
     * floppy disk documentation specify an exact number here, but I've seen a variety
     * of values, so just search. Returns undefined if it can't be found.
     */
    private findDataIndex(): number | undefined {
        for (let i = 7; i < 55; i++) {
            const byte = this.getByte(i);
            if (byte >= 0xF8 && byte <= 0xFB) {
                // Maybe also check that the previous three bytes are 0xA1, except they're not on
                // some single-density sectors I've seen.
                return i + 1;
            }
        }

        // Don't log this, it's noisy for copy-protected disks, gets displayed before anything else
        // (which is confusing/misleading), and the data is available later anyway.
        // TRS80_FLOPPY_LOGGER.warn(`DMK: Can't find byte at start of DAM (track ${this.track.trackNumber}, sector ${this.getSectorNumber()}, offset 0x${toHexWord(this.offset)})`);

        return undefined;
    }
}

/**
 * Represents a single track on a DMK floppy.
 */
class DmkTrack {
    /**
     * Disk the track is in.
     */
    public readonly floppyDisk: DmkFloppyDisk;
    public readonly cylinderNumber: number;
    public readonly side: Side;
    /**
     * Offset of the track (start of its header) in the binary.
     */
    public readonly offset: number;
    /**
     * Sectors in this track.
     */
    public readonly sectors: DmkSector[] = [];

    constructor(floppyDisk: DmkFloppyDisk, cylinderNumber: number, side: Side, offset: number) {
        this.floppyDisk = floppyDisk;
        this.cylinderNumber = cylinderNumber;
        this.side = side;
        this.offset = offset;
    }
}

/**
 * Handles the DMK floppy disk file format, developed by David M. Keil.
 *
 * http://www.classiccmp.org/cpmarchives/trs80/mirrors/trs-80.com/early/www.trs-80.com/trs80-dm.htm
 * http://www.classiccmp.org/cpmarchives/trs80/mirrors/www.discover-net.net/~dmkeil/trs80/trstech.htm
 */
export class DmkFloppyDisk extends FloppyDisk {
    public readonly className = "DmkFloppyDisk";
    public readonly writeProtected: boolean;
    public readonly trackCount: number;
    public readonly trackLength: number;
    public readonly flags: number;
    public readonly tracks: DmkTrack[] = [];
    private geometry: FloppyDiskGeometry | undefined = undefined;
    // Map from physical sector string to its sector.
    private readonly sectorMap = new Map<string,DmkSector>();

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                supportsDoubleDensity: boolean, writeProtected: boolean, trackCount: number,
                trackLength: number, flags: number) {

        super(binary, error, annotations, supportsDoubleDensity);
        this.writeProtected = writeProtected;
        this.trackCount = trackCount;
        this.trackLength = trackLength;
        this.flags = flags;
    }

    /**
     * Call this after having finished updating the track array.
     */
    public computeSectorMap(): void {
        this.sectorMap.clear();

        for (const track of this.tracks) {
            for (const sector of track.sectors) {
                this.sectorMap.set(sector.physicalSectorPosition.toString(), sector);
            }
        }
    }

    public getDescription(): string {
        return "Floppy disk (DMK)";
    }

    public getGeometry(): FloppyDiskGeometry {
        if (this.geometry === undefined) {
            if (this.tracks.length === 0) {
                throw new Error("Can't compute geometry without any tracks");
            }

            const cylinderCount = Math.max(-1, ... this.tracks.map(track => track.cylinderNumber)) + 1;
            const sideCount = Math.max(-1, ... this.tracks.map(track => track.side)) + 1;

            const sectorInfos = this.tracks.flatMap(track =>
                track.sectors.map(sector => sector.toPhysicalSectorInfo()));

            this.geometry = new FloppyDiskGeometry(cylinderCount, sideCount, sectorInfos);
        }

        return this.geometry;
    }

    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        TRS80_FLOPPY_LOGGER.trace(`DMK: Reading sector ${sectorPosition.toString()}`);

        // Note that the sector's side might not match the track side. This happens on
        // MultiDOS floppies when it stores a different file system on each side.
        // The back side will have sectors with Side = 0. This method should treat the
        // "sectorPosition.side" parameter like the physical side, not the side the sector thinks it's on.
        const sector = this.sectorMap.get(sectorPosition.toString());
        if (sector === undefined) {
            // Don't log this, it's noisy for copy-protected disks, gets displayed before anything else
            // (which is confusing/misleading), and the data is available later anyway.
            // TRS80_FLOPPY_LOGGER.warn(`DMK: Sector ${sectorPosition.toString()} is missing`);

            return undefined;
        }

        const sectorData = sector.toSectorData();
        if (sectorData === undefined) {
            TRS80_FLOPPY_LOGGER.warn(`DMK: Sector ${sectorPosition.toString()} has no data`);
            return undefined;
        }

        return sectorData;
    }

    public writeSector(sectorPosition: SectorPosition, data: SectorData): void {
        TRS80_FLOPPY_LOGGER.trace(`DMK: Writing sector ${sectorPosition.toString()}`);

        const sector = this.sectorMap.get(sectorPosition.toString());
        if (sector === undefined) {
            TRS80_FLOPPY_LOGGER.warn(`DMK: Sector ${sectorPosition.toString()} is missing`);
        } else {
            // See if we found the DAM.
            if (sector.dataIndex === undefined) {
                // Not sure what to do here, we can't write it and there's no way to
                // register an error.
                TRS80_FLOPPY_LOGGER.warn(`DMK: No space for data on ${sectorPosition.toString()}`);
                return;
            }

            const byteStride = sector.getByteStride();
            const length = sector.getSectorSize();

            // Lay out the bytes, including the CRC (two bytes).
            const bytes = new Uint8Array((length + 2)*byteStride);

            // Compute the new CRC.
            let crc = 0xFFFF;

            // For double density, include the preceding three 0xA1 bytes.
            if (sector.density === Density.DOUBLE) {
                crc = CRC_16_CCITT.update(crc, 0xA1);
                crc = CRC_16_CCITT.update(crc, 0xA1);
                crc = CRC_16_CCITT.update(crc, 0xA1);
            }

            // Include DAM (will always be valid).
            crc = CRC_16_CCITT.update(crc, sector.getDam() ?? 0);

            // Write "byte" the correct number of stride times at
            // virtual (stride-less) index "index" of the "bytes" array.
            const writeData = (index: number, byte: number): void => {
                for (let i = 0; i < byteStride; i++) {
                    bytes[index*byteStride + i] = byte;
                }
            };

            // Write the data bytes.
            for (let i = 0; i < length; i++) {
                const byte = data.data[i];
                writeData(i, byte);
                crc = CRC_16_CCITT.update(crc, byte);
            }

            // Write CRC big endian.
            writeData(length, hi(crc));
            writeData(length + 1, lo(crc));

            const begin = sector.track.offset + sector.offset + sector.dataIndex*byteStride;
            this.write(new FloppyWrite(bytes, begin));
        }
    }

    public isWriteProtected(): boolean {
        // Our file's state or the mounted state.
        return this.writeProtected || this.mountedWriteProtected;
    }
}

/**
 * Decode a DMK floppy disk file.
 */
export function decodeDmkFloppyDisk(binary: Uint8Array): DmkFloppyDisk | undefined {
    const error: string | undefined = undefined;
    const annotations: ProgramAnnotation[] = [];

    if (binary.length < FILE_HEADER_SIZE) {
        TRS80_FLOPPY_LOGGER.trace("DMK: File too short (" + binary.length + " < " + FILE_HEADER_SIZE + ")");
        return undefined;
    }

    // Decode the header. Comments marked [DMK] are from David Keil's original documentation.

    // [DMK] If this byte is set to FFH the disk is `write protected', 00H allows writing.
    const writeProtected = binary[0] === 0xFF;
    if (binary[0] !== 0x00 && binary[0] !== 0xFF) {
        TRS80_FLOPPY_LOGGER.trace("DMK: First byte not 0x00 or 0xFF (0x" + toHexByte(binary[0]) + ")");
        return undefined;
    }
    annotations.push(new ProgramAnnotation(writeProtected ? "Write protected" : "Writable",
        0, 1));

    // [DMK] Number of tracks on virtual disk. Since tracks start at 0 this value will be one greater
    // than the highest track written to the disk. So a disk with 40 tracks will have a value
    // of 40 (28H) in this field after formatting while the highest track written would be 39.
    // This field is updated after a track is formatted if the track formatted is greater than
    // or equal to the current number of tracks. Re-formatting a disk with fewer tracks will
    // NOT reduce the number of tracks on the virtual disk. Once a virtual disk has allocated
    // space for a track it will NEVER release it. Formatting a virtual disk with 80 tracks
    // then re-formatting it with 40 tracks would waste space just like formatting only 40
    // tracks on an 80 track drive. The emulator and TRS-80 operating system don't care.
    // To re-format a virtual disk with fewer tracks use the /I option at start-up to
    // delete and re-create the virtual disk first, then re-format to save space.
    //
    // [DMK] Note: This field should NEVER be modified. Changing this number will cause TRS-80
    // operating system disk errors. (Like reading an 80 track disk in a 40 track drive)
    const trackCount = binary[1];
    if (trackCount > MAX_TRACKS) {
        // Not sure what a reasonable maximum is. I've only seen 80.
        TRS80_FLOPPY_LOGGER.trace("DMK: Too many tracks (" + trackCount + " > " + MAX_TRACKS + ")");
        return undefined;
    }
    annotations.push(new ProgramAnnotation(trackCount + " tracks", 1, 2));

    // [DMK] This is the track length for the virtual disk. By default the value is 1900H, 80H bytes
    // more than the actual track length, this gives a track length of 6272 bytes. A real double
    // density track length is approx. 6250 bytes. This is the default value when a virtual disk is created.
    // Values for other disk and format types are 0CC0H for single density 5.25" floppies,
    // 14E0H for single density 8" floppies and 2940H for double density 8" floppies. The max value is 2940H.
    // For normal formatting of disks the values of 1900H and 2940H for 5.25" and 8" are used.
    // The emulator will write two bytes and read every second byte when in single density to maintain
    // proper sector spacing, allowing mixed density disks. Setting the track length must be done before
    // a virtual disk is formatted or the disk will have to be re-formatted and since the space for the
    // disk has already been allocated no space will be saved.
    //
    // [DMK] WARNING: Bytes are entered in reverse order (ex. 2940H would be entered, byte 2=40, byte 3=29).
    //
    // [DMK] Note: No modification of the track length is necessary, doing so only saves space and is not
    // necessary to normal operation. The values for all normal 5.25" and 8" disks are set when the
    // virtual disk is created. DON'T modify the track length unless you understand these instructions completely.
    // Nothing in the PC world can be messed up by improper modification but any other virtual disk mounted
    // in the emulator with an improperly modified disk could have their data scrambled.
    const trackLength = word(binary[3], binary[2]);
    if (trackLength > MAX_TRACK_LENGTH) {
        TRS80_FLOPPY_LOGGER.trace("DMK: Track length too long (" + trackLength + " > " + MAX_TRACK_LENGTH + ")");
        return undefined;
    }
    annotations.push(new ProgramAnnotation(trackLength + " bytes per track", 2, 4));

    // [DMK] Virtual disk option flags.
    //
    // [DMK] Bit 4 of this byte, if set, means this is a single sided ONLY disk. This bit is set if the
    // user selects single sided during disk creation and should not require modification. This flag is
    // used only to save PC hard disk space and is never required.
    //
    // [DMK] Bit 6 of this byte, if set, means this disk is to be single density size and the emulator
    // will access one byte instead of two when doing I/O in single density. Double density can still
    // be written to a single density disk but with half the track length only 10 256 byte sectors can be
    // written in either density. Mixed density is also possible but sector timing may be off so protected
    // disks may not work, a maximum of 10 256 byte sectors of mixed density can be written to a
    // single density disk. A program like "Spook House" which has a mixed density track 0 with 1 SD sector
    // and 1 DD sector and the rest of the disk consisting of 10 SD sectors/track will work with this flag set
    // and save half the PC hard disk space. The protected disk "Super Utility + 3.0" however has 6 SD and 6 DD
    // sectors/track for a total of 12 256 byte sectors/track. This disk cannot be single density.
    // This bit is set if the user selects single density during disk creation and should
    // not require modification. This flag is used only to save PC hard disk space and is never required.
    //
    // [DMK] Bit 7 of this byte, if set, means density is to be ignored when accessing this disk. The disk MUST
    // be formatted in double density but the emulator will then read and write the sectors in either density.
    // The emulator will access one byte instead of two when doing I/O in single density.
    // This flag was an early way to support mixed density disks it is no longer needed for this purpose.
    // It is now used for compatibility with old virtual disks created without the double byte now used when in
    // single density. This bit can be set manually in a hex editor to access old virtual disks written
    // in single density.
    const flags = binary[4];
    const flagParts: string[] = [];
    const singleSided = (flags & 0x10) !== 0;
    if (singleSided) {
        flagParts.push("SS");
    }
    const singleDensity = (flags & 0x40) !== 0;
    if (singleDensity) {
        flagParts.push("SD");
    }
    const ignoreDensity = (flags & 0x80) !== 0;
    if (ignoreDensity) {
        flagParts.push("ignore density");
    }
    // Either bit means that bytes are never doubled.
    const alwaysUseStride1 = singleDensity || ignoreDensity;
    annotations.push(new ProgramAnnotation("Flags: [" + flagParts.join(",") + "]", 4, 5));

    // Sanity check.
    const sideCount = singleSided ? 1 : 2;
    const expectedLength = FILE_HEADER_SIZE + sideCount*trackCount*trackLength;
    if (binary.length < expectedLength) {
        TRS80_FLOPPY_LOGGER.trace(`DMK: File too short (${binary.length} < ${expectedLength} == ${FILE_HEADER_SIZE} + ${sideCount}*${trackCount}*${trackLength})`);
        return undefined;
    }

    // Check that these are zero.
    for (let i = 5; i < 12; i++) {
        if (binary[i] !== 0x00) {
            TRS80_FLOPPY_LOGGER.trace("DMK: Reserved byte " + i + " is not zero (0x" + toHexByte(binary[i]) + ")");
            return undefined;
        }
    }
    annotations.push(new ProgramAnnotation("Reserved", 5, 12));

    // [DMK] Must be zero if virtual disk is in emulator's native format.
    //
    // [DMK] Must be 12345678h if virtual disk is a REAL disk specification file used to access
    // REAL TRS-80 floppies in compatible PC drives.
    if (binary[12] + binary[13] + binary[14] + binary[15] !== 0x00) {
        TRS80_FLOPPY_LOGGER.trace("DMK: Bytes 12 through 15 are not zero");
        return undefined;
    }
    annotations.push(new ProgramAnnotation("Virtual disk", 12, 16));

    const floppyDisk = new DmkFloppyDisk(binary, error, annotations, true,
        writeProtected, trackCount, trackLength, flags);

    // Read the tracks.
    let binaryOffset = FILE_HEADER_SIZE;
    const sides = SIDE_COUNT_TO_SIDES[sideCount];
    for (let trackNumber = 0; trackNumber < trackCount; trackNumber++) {
        for (const side of sides) {
            const trackOffset = binaryOffset;
            const track = new DmkTrack(floppyDisk, trackNumber, side, trackOffset);

            // Read the track header. The term "IDAM" in the comment below refers to the "ID access mark",
            // where "ID" is referring to the sector ID, the few bytes just before the sector data.

            // [DMK] Each side of each track has a 128 (80H) byte header which contains an offset pointer
            // to each IDAM in the track. This allows a maximum of 64 sector IDAMs/track. This is more than
            // twice what an 8 inch disk would require and 3.5 times that of a normal TRS-80 5 inch DD disk.
            // This should more than enough for any protected disk also.
            //
            // [DMK] These IDAM pointers MUST adhere to the following rules:
            //
            // * Each pointer is a 2 byte offset to the FEh byte of the IDAM. In double byte single density
            //   the pointer is to the first FEh.
            // * The offset includes the 128 byte header. For example, an IDAM 10h bytes into the track would
            //   have a pointer of 90h, 10h+80h=90h.
            // * The IDAM offsets MUST be in ascending order with no unused or bad pointers.
            // * If all the entries are not used the header is terminated with a 0000h entry. Unused entries
            //   must also be zero filled.
            // * Any IDAMs overwritten during a sector write command should have their entry removed from the
            //   header and all other pointer entries shifted to fill in.
            // * The IDAM pointers are created during the track write command (format). A completed track write
            //   MUST remove all previous IDAM pointers. A partial track write (aborted with the forced interrupt
            //   command) MUST have its previous pointers that were not overwritten added to the new IDAM pointers.
            // * The pointer bytes are stored in reverse order (LSB/MSB).
            //
            // [DMK] Each IDAM pointer has two flags. Bit 15 is set if the sector is double density. Bit 14 is
            // currently undefined. These bits must be masked to get the actual sector offset. For example,
            // an offset to an IDAM at byte 90h would be 0090h if single density and 8090h if double density.

            for (let sectorIndex = 0; sectorIndex < TRACK_HEADER_SIZE/2; sectorIndex++) {
                const sectorInfo = getSectorInfo(binary, trackOffset, sectorIndex);
                if (sectorInfo !== undefined) {
                    track.sectors.push(new DmkSector(track, sectorInfo.density, alwaysUseStride1, sectorInfo.offset));
                }
            }
            annotations.push(new ProgramAnnotation(`Track ${trackNumber} header`,
                binaryOffset, binaryOffset + TRACK_HEADER_SIZE));

            for (const sector of track.sectors) {
                let i = trackOffset + sector.offset;
                const byteStride = sector.getByteStride();

                annotations.push(new ProgramAnnotation("Sector ID access mark (" +
                    (sector.density === Density.DOUBLE ? "double" : "single") + " density)",
                    i, i + byteStride));
                i += byteStride;

                annotations.push(new ProgramAnnotation("Cylinder " + sector.getCylinderNumber(),
                    i, i + byteStride));
                i += byteStride;

                annotations.push(new ProgramAnnotation("Side " + sector.getSide(),
                    i, i + byteStride));
                i += byteStride;

                annotations.push(new ProgramAnnotation("Sector " + sector.getSectorNumber(),
                    i, i + byteStride));
                i += byteStride;

                const sectorLength = sector.getSectorSize();
                annotations.push(new ProgramAnnotation("Length " + sectorLength, i, i + byteStride));
                i += byteStride;

                const actualIdamCrc = sector.getIdamCrc();
                const expectedIdamCrc = sector.computeIdamCrc();
                let idamCrcLabel = "IDAM CRC";
                if (actualIdamCrc === expectedIdamCrc) {
                    idamCrcLabel += " (valid)";
                } else {
                    idamCrcLabel += ` (got 0x${toHexWord(actualIdamCrc)}, expected 0x${toHexWord(expectedIdamCrc)})`;
                }
                annotations.push(new ProgramAnnotation(idamCrcLabel, i, i + 2*byteStride));
                i += 2*byteStride;

                if (sector.dataIndex !== undefined) {
                    // Skip the padding between the ID and the data.
                    i = trackOffset + sector.offset + (sector.dataIndex - 1) * byteStride;

                    annotations.push(new ProgramAnnotation("Data access mark" + (sector.isDeleted() ? " (deleted)" : ""),
                        i, i + byteStride));
                    i += byteStride;

                    annotations.push(new ProgramAnnotation("Sector data", i, i + sectorLength * byteStride));
                    i += sectorLength * byteStride;

                    const actualDataCrc = sector.getDataCrc();
                    const expectedDataCrc = sector.computeDataCrc();
                    if (actualDataCrc !== undefined && expectedDataCrc !== undefined) {
                        let dataCrcLabel = "Data CRC";
                        if (actualDataCrc === expectedDataCrc) {
                            dataCrcLabel += " (valid)";
                        } else {
                            dataCrcLabel += ` (got 0x${toHexWord(actualDataCrc)}, expected 0x${toHexWord(expectedDataCrc)})`;
                        }
                        annotations.push(new ProgramAnnotation(dataCrcLabel, i, i + 2 * byteStride));
                        i += 2 * byteStride;
                    }
                }
            }

            floppyDisk.tracks.push(track);
            binaryOffset += trackLength;
        }
    }

    floppyDisk.computeSectorMap();

    return floppyDisk;
}
