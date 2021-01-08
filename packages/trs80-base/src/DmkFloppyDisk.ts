import {toHexWord} from "z80-base";
import {CRC_16_CCITT} from "./Crc16";
import {FloppyDisk, SectorData, Side} from "./FloppyDisk";
import {ProgramAnnotation} from "./ProgramAnnotation";

const FILE_HEADER_SIZE = 16;
const TRACK_HEADER_SIZE = 128;

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
    public readonly doubleDensity: boolean;
    /**
     * Offset into the track, including the header.
     */
    public readonly offset: number;

    constructor(track: DmkTrack, doubleDensity: boolean, offset: number) {
        this.track = track;
        this.doubleDensity = doubleDensity;
        this.offset = offset;
    }

    /**
     * Get the cylinder for this sector. This is 0-based.
     */
    public getCylinder(): number {
        return this.getByte(1);
    }

    /**
     * Get the side for this sector, 0 for front and 1 for back.
     */
    public getSide(): number {
        return this.getByte(2);
    }

    /**
     * Get the sector number for this sector. This is 1-based.
     */
    public getSectorNumber(): number {
        return this.getByte(3);
    }

    /**
     * Get the sector length in bytes.
     */
    public getLength(): number {
        return 128*(1 << this.getByte(4));
    }

    /**
     * Get the CRC for the IDAM.
     */
    public getIdamCrc(): number {
        // Bit endian.
        return (this.getByte(5) << 8) + this.getByte(6);
    }

    /**
     * Compute the CRC for the IDAM.
     */
    public computeIdemCrc(): number {
        let crc = 0xFFFF;

        for (let i = -3; i < 5; i++) {
            crc = CRC_16_CCITT.update(crc, this.getByte(i));
        }

        return crc;
    }

    /**
     * Get the CRC for the data bytes.
     */
    public getDataCrc(): number {
        // Bit endian.
        const index = this.getSectorIndex() + this.getLength();
        return (this.getByte(index) << 8) + this.getByte(index + 1);
    }

    /**
     * Compute the CRC for the data bytes.
     */
    public computeDataCrc(): number {
        let crc = 0xFFFF;

        const index = this.getSectorIndex();
        const begin = index - 4;
        const end = index + this.getLength();
        for (let i = begin; i < end; i++) {
            crc = CRC_16_CCITT.update(crc, this.getByte(i));
        }

        return crc;
    }

    /**
     * Get the index into the sector binary for the first data byte.
     */
    public getSectorIndex(): number {
        return 45;
    }

    /**
     * Get a byte from the sector data.
     *
     * @param index index into the sector, relative to the 0xFE byte. Can be negative.
     */
    private getByte(index: number): number {
        return this.track.floppyDisk.binary[this.track.offset + this.offset + index];
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
    /**
     * Offset of the track (start of its header) in the binary.
     */
    public readonly offset: number;
    /**
     * Sectors in this track.
     */
    public readonly sectors: DmkSector[] = [];

    constructor(floppyDisk: DmkFloppyDisk, offset: number) {
        this.floppyDisk = floppyDisk;
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
    public readonly writeProtected: boolean;
    public readonly trackCount: number;
    public readonly trackLength: number;
    public readonly flags: number;
    public readonly tracks: DmkTrack[] = [];

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                supportsDoubleDensity: boolean, writeProtected: boolean, trackCount: number,
                trackLength: number, flags: number) {

        super(binary, error, annotations, supportsDoubleDensity);
        this.writeProtected = writeProtected;
        this.trackCount = trackCount;
        this.trackLength = trackLength;
        this.flags = flags;
    }

    public getDescription(): string {
        return "Floppy disk (DMK)";
    }

    public readSector(track: number, sector: number | undefined, side: Side | undefined): SectorData | undefined {
        return undefined;
    }
}

/**
 * Decode a DMK floppy disk file.
 */
export function decodeDmkFloppyDisk(binary: Uint8Array): DmkFloppyDisk | undefined {
    const error: string | undefined = undefined;
    const annotations: ProgramAnnotation[] = [];

    if (binary.length < FILE_HEADER_SIZE) {
        return undefined;
    }

    // Decode the header. Comments marked [DMK] are from David Keil's original documentation.

    // [DMK] If this byte is set to FFH the disk is `write protected', 00H allows writing.
    const writeProtected = binary[0] === 0xFF;
    if (binary[0] !== 0x00 && binary[0] !== 0xFF) {
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
    if (trackCount > 160) {
        // Not sure what a reasonable maximum is. I've only see 80.
        return undefined;
    }
    annotations.push(new ProgramAnnotation(trackCount + " tracks", 1, 2));

    // [DMK] This is the track length for the virtual disk. By default the value is 1900H, 80H bytes
    // more than the actual track length, this gives a track length of 6272 bytes. A real double
    // density track length is approx. 6250 bytes. This is the default value when a virtual disk is created.
    // Values for other disk and format types are 0CC0H for single density 5.25" floppies,
    // 14E0H for single density 8" floppies and 2940H for double density 8" floppies. The max value is 2940H.
    // For normal formatting of disks the values of 1900H and 2940H for 5.25" and 8" are used.
    // The emulator will write two bytes and read every second byte when  in single density to maintain
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
    const trackLength = binary[2] + (binary[3] << 8);
    if (trackLength > 0x2940) {
        return undefined;
    }
    annotations.push(new ProgramAnnotation(trackLength + " bytes per track", 2, 4));

    // Sanity check.
    const expectedLength = FILE_HEADER_SIZE + trackCount*trackLength;
    if (binary.length !== expectedLength) {
        console.error(`DMK file wrong size (${binary.length} != ${expectedLength})`);
        return undefined;
    }

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
    const flagParts = [];
    if ((flags & 0x10) !== 0) {
        flagParts.push("SS");
    }
    if ((flags & 0x40) !== 0) {
        flagParts.push("SD");
    }
    if ((flags & 0x80) !== 0) {
        flagParts.push("ignore density");
    }
    annotations.push(new ProgramAnnotation("Flags: [" + flagParts.join(",") + "]", 4, 5));

    // Should we check that these are zero?
    annotations.push(new ProgramAnnotation("Reserved", 5, 12));

    // [DMK] Must be zero if virtual disk is in emulator's native format.
    //
    // [DMK] Must be 12345678h if virtual disk is a REAL disk specification file used to access
    // REAL TRS-80 floppies in compatible PC drives.
    if (binary[12] + binary[13] + binary[14] + binary[15] !== 0x00) {
        return undefined;
    }
    annotations.push(new ProgramAnnotation("Virtual disk", 12, 16));

    const floppyDisk = new DmkFloppyDisk(binary, error, annotations, true,
        writeProtected, trackCount, trackLength, flags);

    // Read the tracks.
    let binaryOffset = FILE_HEADER_SIZE;
    for (let trackNumber = 0; trackNumber < trackCount; trackNumber++) {
        const trackOffset = binaryOffset;
        const track = new DmkTrack(floppyDisk, trackOffset);

        // Read the track header. The term "IDAM" in the comment below refers to the "ID access mark",
        // where "ID" is referring to the sector ID, the few byte just before the sector data.

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
        //   must also be zero filled..
        // * Any IDAMs overwritten during a sector write command should have their entry removed from the
        //   header and all other pointer entries shifted to fill in.
        // * The IDAM pointers are created during the track write command (format). A completed track write
        //   MUST remove all previous IDAM pointers. A partial track write (aborted with the forced interrupt
        //   command) MUST have it's previous pointers that were not overwritten added to the new IDAM pointers.
        // * The pointer bytes are stored in reverse order (LSB/MSB).
        //
        // [DMK] Each IDAM pointer has two flags. Bit 15 is set if the sector is double density. Bit 14 is
        // currently undefined. These bits must be masked to get the actual sector offset. For example,
        // an offset to an IDAM at byte 90h would be 0090h if single density and 8090h if double density.

        for (let i = 0; i < TRACK_HEADER_SIZE; i += 2) {
            const sectorOffset = binary[binaryOffset + i] + (binary[binaryOffset + i + 1] << 8);
            if (sectorOffset !== 0) {
                track.sectors.push(new DmkSector(track, (sectorOffset & 0x8000) !== 0, sectorOffset & 0x7FFF));
            }
        }
        annotations.push(new ProgramAnnotation(`Track ${trackNumber} header`,
            binaryOffset, binaryOffset + TRACK_HEADER_SIZE));

        for (const sector of track.sectors) {
            let i = trackOffset + sector.offset;

            annotations.push(new ProgramAnnotation("Sector ID access mark",
                i, i + 1));
            i++;

            annotations.push(new ProgramAnnotation("Cylinder " + sector.getCylinder(),
                i, i + 1));
            i++;

            annotations.push(new ProgramAnnotation("Side " + sector.getSide(),
                i, i + 1));
            i++;

            annotations.push(new ProgramAnnotation("Sector " + sector.getSectorNumber(),
                i, i + 1));
            i++;

            const sectorLength = sector.getLength();
            annotations.push(new ProgramAnnotation("Length " + sectorLength, i, i + 1));
            i++;

            const actualIdamCrc = sector.computeIdemCrc();
            const expectedIdamCrc = sector.getIdamCrc();
            let idamCrcLabel = "IDAM CRC";
            if (actualIdamCrc === expectedIdamCrc) {
                idamCrcLabel += " (valid)";
            } else {
                idamCrcLabel += ` (got 0x${toHexWord(actualIdamCrc)}, expected 0x${toHexWord(expectedIdamCrc)})`;
            }
            annotations.push(new ProgramAnnotation(idamCrcLabel, i, i + 2));
            i += 2;

            i = trackOffset + sector.offset + sector.getSectorIndex();
            annotations.push(new ProgramAnnotation("Sector data", i, i + sectorLength));
            i += sectorLength;

            const actualDataCrc = sector.computeDataCrc();
            const expectedDataCrc = sector.getDataCrc();
            let dataCrcLabel = "Data CRC";
            if (actualDataCrc === expectedDataCrc) {
                dataCrcLabel += " (valid)";
            } else {
                dataCrcLabel += ` (got 0x${toHexWord(actualDataCrc)}, expected 0x${toHexWord(expectedDataCrc)})`;
            }
            annotations.push(new ProgramAnnotation(dataCrcLabel, i, i + 2));
            i += 2;
        }

        floppyDisk.tracks.push(track);
        binaryOffset += trackLength;
    }

    return floppyDisk;
}
