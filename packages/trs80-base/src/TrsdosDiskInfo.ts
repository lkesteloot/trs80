import {assertNever} from "z80-base";
import {BYTES_PER_SECTOR, SectorPosition} from "./FloppyDisk.js";
import {decodeAutoCommand, type Trsdos, type TrsdosVersion} from "./Trsdos.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";

/**
 * The offset in the GAT of the master password hash, little endian.
 */
export const GAT_PASSWORD_OFFSET = 0xCE;

/**
 * The offset in the GAT of the disk's name, which is eight characters padded with spaces.
 */
export const GAT_NAME_OFFSET = 0xD0;

/**
 * The offset in the GAT of the disk's date, which is eight characters in the form MM/DD/YY.
 */
export const GAT_DATE_OFFSET = 0xD8;

/**
 * The length of the disk's name and of its date.
 */
export const GAT_TEXT_LENGTH = 8;

/**
 * The offset in the GAT of the AUTO command on the DOSes before TRSDOS 6. It runs to the end of the sector.
 */
export const GAT_AUTO_OFFSET = 0xE0;

/**
 * The offset in the GAT where TRSDOS 6.2 and LS-DOS 6.3 put the media block, which ends the field
 * that holds the AUTO command on earlier DOSes. See "What the TRSDOS 6 manuals add" in FLOPPY_FORMATS.md.
 */
export const GAT_MEDIA_BLOCK_OFFSET = 0xF5;

/**
 * The offset in the system information sector of the AUTO command on TRSDOS 6 and LS-DOS 6. It has
 * room for 80 bytes. See "What the TRSDOS 6 manuals add" in FLOPPY_FORMATS.md.
 */
export const SYSINFO_AUTO_OFFSET = 0x20;

/**
 * The size of the AUTO command area in the system information sector.
 */
export const SYSINFO_AUTO_LENGTH = 0x50;

/**
 * The sector number, in the 2.3 family's numbering, of the system information sector on cylinder 0, side 0.
 */
const SYSINFO_SECTOR_NUMBER = 2;

/**
 * The offset in the system information sector of the disk type byte: 0xFF for a system disk and
 * 0x00 for a data disk.
 */
const SYSINFO_DISK_TYPE_OFFSET = 0xC0;

/**
 * The first year, and the last year of a plain two-digit date, that the DOS that has the given rules
 * can enter. Only the DOSes with time stamps (LDOS 5.3 and LS-DOS 6.3) have years past 1999. See "The
 * GAT's name, date and AUTO command" in FLOPPY_FORMATS.md.
 *
 * @param ruleSet the DOS's rules.
 * @param hasTimeStamps whether the disk is an LDOS 5.3 or LS-DOS 6.3 disk.
 * @return the first and last year, inclusive.
 */
export function trsdosGatDateYearRange(ruleSet: TrsdosRuleSet, hasTimeStamps: boolean): {first: number, last: number} {
    const last = hasTimeStamps ? 2011 : 1999;
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
            return {first: 1978, last};
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.TRSDOS_6:
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.TRSDOS_2_7:
        case TrsdosRuleSet.NEWDOS_80:
        case TrsdosRuleSet.MULTIDOS:
            return {first: 1980, last};
        default:
            assertNever(ruleSet);
    }
}

/**
 * Format a date as the GAT holds it, "MM/DD/YY" with two digits for the year.
 *
 * @param date the date, in local time. The caller has checked the year.
 */
export function formatTrsdosGatDate(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const year = (date.getFullYear() % 100).toString().padStart(2, "0");
    return `${month}/${day}/${year}`;
}

/**
 * Parse a date as the GAT holds it, "MM/DD/YY", into a full date. The two-digit year doesn't give the
 * century, so it's read as one of the hundred years from the first that the DOS can enter (see
 * trsdosGatDateYearRange()): on LDOS, 80-99 are 1980-1999 and 00-79 are 2000-2079. That goes past the
 * last year the DOS's DATE command takes, since a date written by another program (such as ours, which
 * puts today's date on a new disk) can be later.
 *
 * @param text the date text as stored.
 * @param ruleSet the DOS's rules, or undefined if unknown, in which case the years start at 1978, the first
 * that any DOS takes.
 * @return the date, or undefined if the text isn't a date that exists (such as "00/00/00", which the DOSes
 * store when no date was set, or "02/31/83").
 */
export function parseTrsdosGatDate(text: string, ruleSet: TrsdosRuleSet | undefined):
    {year: number, month: number, day: number} | undefined {

    const match = /^(\d\d)\/(\d\d)\/(\d\d)$/.exec(text);
    if (match === null) {
        return undefined;
    }
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    const shortYear = parseInt(match[3], 10);

    const firstYear = ruleSet === undefined ? 1978 : trsdosGatDateYearRange(ruleSet, false).first;
    const year = firstYear + (shortYear - firstYear % 100 + 100) % 100;
    // Day 0 of the next month is the last day of this one.
    const daysInMonth = new Date(year, month, 0).getDate();
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
        return undefined;
    }
    return {year, month, day};
}

/**
 * Whether a DOS keeps the AUTO command in the system information sector (cylinder 0, sector 2) instead
 * of the GAT. TRSDOS 6 and LS-DOS 6 moved it there; the earlier DOSes keep it in the GAT.
 */
export function trsdosKeepsAutoInSystemInformation(ruleSet: TrsdosRuleSet | undefined): boolean {
    if (ruleSet === undefined) {
        return false;
    }
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_6:
            return true;
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.TRSDOS_2_7:
        case TrsdosRuleSet.NEWDOS_80:
        case TrsdosRuleSet.MULTIDOS:
            return false;
        default:
            assertNever(ruleSet);
    }
}

/**
 * The position of the system information sector of a disk on the 2.3 layout.
 */
export function trsdosSystemInformationPosition(): SectorPosition {
    return SectorPosition.make(0, 0, SYSINFO_SECTOR_NUMBER);
}

/**
 * Whether a sector looks like a real system information sector, as TRSDOS 6 and LS-DOS 6 write it:
 * the DOS version (0x60 to 0x6F) in the first byte, and a disk type of 0x00 or 0xFF. A sector of
 * format filler, or one that belongs to some other DOS, doesn't pass.
 */
export function isTrsdosSystemInformationSector(bytes: Uint8Array): boolean {
    if (bytes.length < BYTES_PER_SECTOR) {
        return false;
    }
    const diskType = bytes[SYSINFO_DISK_TYPE_OFFSET];
    return bytes[0] >= 0x60 && bytes[0] <= 0x6F && (diskType === 0x00 || diskType === 0xFF);
}

/**
 * Whether the end of a GAT holds a media block (the 0x03 byte and the three-letter tag that
 * TRSDOS 6.2 and LS-DOS 6.3 write at 0xF5), so that the AUTO command field can't use those bytes.
 */
export function gatHasMediaBlock(gat: Uint8Array): boolean {
    return gat[GAT_MEDIA_BLOCK_OFFSET] === 0x03 &&
        [1, 2, 3].every(i => /[A-Za-z0-9]/.test(String.fromCharCode(gat[GAT_MEDIA_BLOCK_OFFSET + i])));
}

/**
 * The name, date, master password and AUTO command of a disk, as the DOS keeps them.
 */
export interface TrsdosDiskInfo {
    /**
     * The disk's name with the padding trimmed.
     */
    name: string;

    /**
     * The disk's date as stored, such as "01/25/83", or an empty string if the field is unused filler.
     */
    date: string;

    /**
     * The hash of the master password, by the hash of {@link version}'s layout.
     */
    passwordHash: number;

    /**
     * The disk's layout, which says how its passwords are hashed: TRSDOS 1.3 has its own hash.
     */
    version: TrsdosVersion;

    /**
     * The AUTO command, empty for none, or undefined if the disk should have one in the system
     * information sector but has no such sector.
     */
    autoCommand: string | undefined;
}

/**
 * Read a disk's name, date, master password and AUTO command. Which DOS wrote the disk decides where
 * the AUTO command is.
 *
 * @param trsdos the file system.
 * @param ruleSet the rules of the disk's DOS, or undefined if they aren't known, in which case the
 * AUTO command is read from the GAT.
 * @return the information, or a message if the GAT can't be read.
 */
export function readTrsdosDiskInfo(trsdos: Trsdos, ruleSet: TrsdosRuleSet | undefined): TrsdosDiskInfo | string {
    const gatInfo = trsdos.getGatInfo();
    if (typeof gatInfo === "string") {
        return gatInfo;
    }

    let autoCommand: string | undefined = gatInfo.autoCommand;
    if (trsdosKeepsAutoInSystemInformation(ruleSet)) {
        const sector = trsdos.disk.readSector(trsdosSystemInformationPosition());
        if (sector !== undefined && isTrsdosSystemInformationSector(sector.data)) {
            autoCommand = decodeAutoCommand(
                sector.data.subarray(SYSINFO_AUTO_OFFSET, SYSINFO_AUTO_OFFSET + SYSINFO_AUTO_LENGTH));
        } else {
            autoCommand = undefined;
        }
    }

    return {name: gatInfo.name, date: gatInfo.date, passwordHash: gatInfo.password, version: trsdos.version, autoCommand};
}
