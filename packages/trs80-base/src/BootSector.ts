import {AbstractTrs80File} from "./Trs80File.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {BYTES_PER_SECTOR} from "./FloppyDisk.js";

// Where to load the boot sector.
const BOOT_SECTOR_ORG = 0x4200;

// Where the code actually starts. In practice they probably just jump to the ORG address,
// and the first three bytes are inert. This is more helpful for disassembly.
const BOOT_SECTOR_ENTRY_POINT = 0x4203;

/**
 * The first sector of a floppy (and sometimes the whole granule).
 */
export class BootSector extends AbstractTrs80File {
    public readonly className = "BootSector";
    public readonly org = BOOT_SECTOR_ORG;
    public readonly entryPointAddress = BOOT_SECTOR_ENTRY_POINT;

    constructor(binary: Uint8Array, annotations: ProgramAnnotation[]) {
        super(binary, undefined, annotations);
    }

    public getDescription(): string {
        return "Boot sector";
    }
}

/**
 * Since there's little to detect here, this should only be called with files that have
 * a .SYS extension.
 */
export function decodeBootSector(binary: Uint8Array): BootSector | undefined {
    if (binary.length < BYTES_PER_SECTOR || binary[0] !== 0x00 || binary[1] !== 0xFE) {
        return undefined;
    }

    const directoryTrack = binary[2];
    const annotations = [
        new ProgramAnnotation("Magic number", 0, 2),
        new ProgramAnnotation("Directory track (" + directoryTrack + ")", 2, 3),
        new ProgramAnnotation("Boot code", 3, Math.min(binary.length, BYTES_PER_SECTOR)),
    ];

    return new BootSector(binary, annotations);
}
