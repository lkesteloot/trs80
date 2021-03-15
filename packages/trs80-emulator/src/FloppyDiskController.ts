/**
 * Floppy disk controller for the TRS-80.
 *
 * References:
 *
 * https://hansotten.file-hunter.com/technical-info/wd1793/
 */

import {FloppyDisk, SectorData, Side} from "trs80-base";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {Machine} from "./Machine";
import {toHexByte} from "z80-base";
import {EventType} from "./EventScheduler";

// Enable debug logging.
const DEBUG_LOG = false;

// Whether this controller supports writing.
const SUPPORT_WRITING = false;

// Number of physical drives.
export const FLOPPY_DRIVE_COUNT = 4;

// Width of the index hole as a fraction of the circumference.
const HOLE_WIDTH = 0.01;

// Speed of disk.
const RPM = 300;

// How long the disk motor stays on after drive selected, in seconds.
const MOTOR_TIME_AFTER_SELECT = 2;

/**
 * Converts boolean for "back" to a Side.
 */
function booleanToSide(back: boolean): Side {
    return back ? Side.BACK : Side.FRONT;
}

// Type I status bits.
const STATUS_BUSY = 0x01;             // Whether a command is in progress.
const STATUS_INDEX = 0x02;            // The head is currently over the index hole.
const STATUS_TRACK_ZERO = 0x04;       // Head is on track 0.
const STATUS_CRC_ERROR = 0x08;        // CRC error.
const STATUS_SEEK_ERROR = 0x10;       // Seek error.
const STATUS_HEAD_ENGAGED = 0x20;     // Head engaged.
const STATUS_WRITE_PROTECTED = 0x40;  // Write-protected.
const STATUS_NOT_READY = 0x80;        // Disk not ready (motor not running).

// Type II and III status bits.
//    STATUS_BUSY = 0x01;
const STATUS_DRQ = 0x02;                // Data is ready to be read or written.
const STATUS_LOST_DATA = 0x04;          // CPU was too slow to read.
//    STATUS_CRC_ERROR = 0x08;
const STATUS_NOT_FOUND = 0x10;          // Track, sector, or side were not found.
const STATUS_DELETED = 0x20;            // On read: Sector was deleted (data is invalid, 0xF8 DAM).
const STATUS_FAULT = 0x20;              // On write: Indicates a write fault.
const STATUS_REC_TYPE = 0x60;
//    STATUS_WRITE_PROTECTED = 0x40;
//    STATUS_NOT_READY = 0x80;

// Select register bits for writeSelect().
const SELECT_DRIVE_0 = 0x01;
const SELECT_DRIVE_1 = 0x02;
const SELECT_DRIVE_2 = 0x04;
const SELECT_DRIVE_3 = 0x08;
const SELECT_SIDE = 0x10;  // 0 = front, 1 = back.
const SELECT_PRECOMP = 0x20;
const SELECT_WAIT = 0x40; // Controller should block OUT until operation is done.
const SELECT_MFM = 0x80; // Double density.
const SELECT_DRIVE_MASK = SELECT_DRIVE_0 | SELECT_DRIVE_1 | SELECT_DRIVE_2 | SELECT_DRIVE_3;

// Type of command (see below for specific commands in each type).
enum CommandType {
    TYPE_I,
    TYPE_II,
    TYPE_III,
    TYPE_IV,
}

// Commands and various sub-flags.
const COMMAND_MASK = 0xF0;

// Type I commands: cccchvrr, where
//     cccc = command number
//     h = head load
//     v = verify (i.e., read next address to check we're on the right track)
//     rr = step rate:  00=6ms, 01=12ms, 10=20ms, 11=40ms
const COMMAND_RESTORE = 0x00;
const COMMAND_SEEK = 0x10;
const COMMAND_STEP = 0x20; // Doesn't update track register.
const COMMAND_STEPU = 0x30; // Updates track register.
const COMMAND_STEP_IN = 0x40;
const COMMAND_STEP_INU = 0x50;
const COMMAND_STEP_OUT = 0x60;
const COMMAND_STEP_OUTU = 0x70;
const MASK_H = 0x08;
const MASK_V = 0x04;

// Type II commands: ccccbecd, where
//     cccc = command number
//     e = delay for head engage (10ms)
//     b = side expected
//     c = side compare (0=disable, 1=enable)
//     d = select data address mark (writes only, 0 for reads):
//         0=FB (normal), 1=F8 (deleted)
const COMMAND_READ = 0x80; // Single sector.
const COMMAND_READM = 0x90; // Multiple sectors.
const COMMAND_WRITE = 0xA0;
const COMMAND_WRITEM = 0xB0;
const MASK_B = 0x08; // Side (0 = front, 1 = back).
const MASK_E = 0x04;
const MASK_C = 0x02; // Whether side (MASK_B) is defined.
const MASK_D = 0x01; // Deleted: 0 = Data is valid, DAM is 0xFB; 1 = Data is invalid, DAM is 0xF8.

// Type III commands: ccccxxxs (?), where
//     cccc = command number
//     xxx = ?? (usually 010)
//     s = 1=READ_TRACK no synchronize; otherwise 0
const COMMAND_READ_ADDRESS = 0xC0;
const COMMAND_READ_TRACK = 0xE0;
const COMMAND_WRITE_TRACK = 0xF0;

// Type IV command: cccciiii, where
//     cccc = command number
//     iiii = bitmask of events to terminate and interrupt on (unused on TRS-80).
//            0000 for immediate terminate with no interrupt.
const COMMAND_FORCE_INTERRUPT = 0xD0;

/**
 * Given a command, returns its type.
 */
function getCommandType(command: number): CommandType {
    switch (command & COMMAND_MASK) {
        case COMMAND_RESTORE:
        case COMMAND_SEEK:
        case COMMAND_STEP:
        case COMMAND_STEPU:
        case COMMAND_STEP_IN:
        case COMMAND_STEP_INU:
        case COMMAND_STEP_OUT:
        case COMMAND_STEP_OUTU:
            return CommandType.TYPE_I;

        case COMMAND_READ:
        case COMMAND_READM:
        case COMMAND_WRITE:
        case COMMAND_WRITEM:
            return CommandType.TYPE_II;

        case COMMAND_READ_ADDRESS:
        case COMMAND_READ_TRACK:
        case COMMAND_WRITE_TRACK:
            return CommandType.TYPE_III;

        case COMMAND_FORCE_INTERRUPT:
            return CommandType.TYPE_IV;

        default:
            throw new Error("Unknown command 0x" + toHexByte(command));
    }
}

/**
 * Whether a command is for reading or writing.
 */
function isReadWriteCommand(command: number): boolean {
    switch (getCommandType(command)) {
        case CommandType.TYPE_II:
        case CommandType.TYPE_III:
            return true;

        default:
            return false;
    }
}

/**
 * State of a physical drive.
 */
class FloppyDrive {
    public physicalTrack = 0;
    public writeProtected = true;
    public floppyDisk: FloppyDisk | undefined = undefined;
}

/**
 * The disk controller. We only emulate the WD1791/93, not the Model I's WD1771.
 */
export class FloppyDiskController {
    private readonly machine: Machine;

    // Registers.
    private status = STATUS_TRACK_ZERO | STATUS_NOT_READY;
    private track = 0;
    private sector = 0;
    private data = 0;

    // Internal state.
    private currentCommand = COMMAND_RESTORE;
    private side = Side.FRONT;
    private doubleDensity = false;
    private currentDrive = 0;
    private motorOn = false;
    // ID index found in by last COMMAND_READ_ADDRESS.
    private lastReadAddress: number | undefined = undefined;

    // State for current command.
    public dataIndex = 0;
    private sectorData: SectorData | undefined = undefined;

    // Floppy drives.
    private readonly drives: FloppyDrive[] = [];

    // Timeout handle for turning off the motor.
    private motorOffTimeoutHandle: number | undefined = undefined;

    // Which drive is currently active, for lighting up an LED.
    public readonly onActiveDrive = new SimpleEventDispatcher<number | undefined>();

    // Event when a drive moves the head this many tracks.
    public readonly onTrackMove = new SimpleEventDispatcher<number>();

    // The number of debug readStatus() calls we've had to print. We use this to collapse
    // consecutive calls, otherwise Chrome's devtools melt down.
    private readStatusCounter = 1;
    private readStatusLast = 0;

    constructor(foo: Machine) {
        this.machine = foo;

        for (let i = 0; i < FLOPPY_DRIVE_COUNT; i++) {
            this.drives.push(new FloppyDrive());
        }
    }

    /**
     * Put a floppy in the specified drive (0 to 3).
     */
    public loadFloppyDisk(floppyDisk: FloppyDisk | undefined, driveNumber: number): void {
        if (driveNumber < 0 || driveNumber >= this.drives.length) {
            throw new Error("Invalid drive number " + driveNumber);
        }

        this.drives[driveNumber].floppyDisk = floppyDisk;
    }

    public readStatus(): number {
        let status;

        // If no disk was loaded into drive 0, just pretend that we don't
        // have a disk system. Otherwise we have to hold down Break while
        // booting (to get to cassette BASIC) and that's annoying.
        if (this.drives[0].floppyDisk === undefined) {
            status = 0xFF;
        } else {
            this.updateStatus();

            // Clear interrupt.
            this.machine.diskIntrqInterrupt(false);

            status = this.status;
        }

        if (DEBUG_LOG) {
            if (status !== this.readStatusLast) {
                this.readStatusLast = status;
                this.readStatusCounter = 1;
            }
            // See if it's a power of 2.
            if ((this.readStatusCounter & (this.readStatusCounter - 1)) === 0) {
                console.log("readStatus() = " + toHexByte(status) + " (x" + this.readStatusCounter + ")");
            }
            this.readStatusCounter += 1;
        }

        return status;
    }

    public readTrack(): number {
        if (DEBUG_LOG) {
            console.log("readTrack() = " + toHexByte(this.track));
            this.readStatusCounter = 1;
        }

        return this.track;
    }

    public readSector(): number {
        if (DEBUG_LOG) {
            console.log("readSector() = " + toHexByte(this.sector));
            this.readStatusCounter = 1;
        }

        return this.sector;
    }

    /**
     * Read a byte of data from the sector.
     */
    public readData(): number {
        const drive = this.drives[this.currentDrive];

        // The read command can do various things depending on the specific
        // current command, but we only support reading from the diskette.
        switch (this.currentCommand & COMMAND_MASK) {
            case COMMAND_READ:
                // Keep reading from the buffer.
                if (this.sectorData !== undefined && (this.status & STATUS_DRQ) !== 0 && drive.floppyDisk !== undefined) {
                    this.data = this.sectorData.data[this.dataIndex];
                    this.dataIndex++;
                    if (this.dataIndex >= this.sectorData.data.length) {
                        this.sectorData = undefined;
                        this.status &= ~STATUS_DRQ;
                        this.machine.diskDrqInterrupt(false);
                        this.machine.eventScheduler.cancelByEventTypeMask(EventType.DISK_LOST_DATA);
                        this.machine.eventScheduler.add(EventType.DISK_DONE, this.machine.tStateCount + 64,
                            () => this.done(0));
                    }
                }
                break;

            default:
                // Might be okay, not sure.
                throw new Error("Unhandled case in readData()");
        }

        if (DEBUG_LOG) {
            // console.log("readData() = " + toHexByte(this.data));
            this.readStatusCounter = 1;
        }

        return this.data;
    }

    /**
     * Set current command.
     */
    public writeCommand(cmd: number): void {
        if (DEBUG_LOG) {
            console.log("writeCommand(" + toHexByte(cmd) + ")");
        }

        const drive = this.drives[this.currentDrive];

        // Cancel "lost data" event.
        this.machine.eventScheduler.cancelByEventTypeMask(EventType.DISK_LOST_DATA);

        this.machine.diskIntrqInterrupt(false);
        this.sectorData = undefined;
        this.currentCommand = cmd;

        // Kick off anything that's based on the command.
        switch (cmd & COMMAND_MASK) {
            case COMMAND_RESTORE:
                this.lastReadAddress = undefined;
                drive.physicalTrack = 0;
                this.track = 0;
                this.status = STATUS_TRACK_ZERO | STATUS_BUSY;
                if ((cmd & MASK_V) != 0) {
                    this.verify();
                }
                this.machine.eventScheduler.add(EventType.DISK_DONE, this.machine.tStateCount + 2000,
                    () => this.done(0));
                break;

            case COMMAND_SEEK:
                this.lastReadAddress = undefined;
                const moveCount = this.data - this.track;
                if (moveCount !== 0) {
                    this.onTrackMove.dispatch(moveCount);
                }
                drive.physicalTrack += moveCount;
                this.track = this.data;
                if (drive.physicalTrack <= 0) {
                    // this.track too?
                    drive.physicalTrack = 0;
                    this.status = STATUS_TRACK_ZERO | STATUS_BUSY;
                } else {
                    this.status = STATUS_BUSY;
                }
                // Should this set lastDirection?
                if ((cmd & MASK_V) != 0) {
                    this.verify();
                }
                this.machine.eventScheduler.add(EventType.DISK_DONE, this.machine.tStateCount + 2000,
                    () => this.done(0));
                break;

            case COMMAND_READ:
                // Read the sector. The bytes will be read later.
                this.lastReadAddress = undefined;
                this.status = STATUS_BUSY;
                // Not sure how to use this. Ignored for now:
                const goalSide = (cmd & MASK_C) === 0 ? undefined : booleanToSide((cmd & MASK_B) !== 0);

                console.log(`Sector read: ${drive.physicalTrack}, ${this.sector}, ${this.side}`);
                const sectorData = drive.floppyDisk === undefined
                    ? undefined
                    : drive.floppyDisk.readSector(drive.physicalTrack, this.side, this.sector);

                if (sectorData === undefined) {
                    this.machine.eventScheduler.add(EventType.DISK_DONE, this.machine.tStateCount + 512,
                        () => this.done(0));
                    console.error(`Didn't find sector ${this.sector} on track ${drive.physicalTrack}`);
                } else {
                    let newStatus = 0;
                    if (sectorData.deleted) {
                        newStatus |= STATUS_DELETED;
                    }
                    if (sectorData.crcError) {
                        newStatus |= STATUS_CRC_ERROR;
                    }
                    this.sectorData = sectorData;
                    this.dataIndex = 0;
                    this.machine.eventScheduler.add(EventType.DISK_FIRST_DRQ, this.machine.tStateCount + 64,
                        () => this.firstDrq(newStatus));
                }
                break;

            case COMMAND_WRITE:
                console.log(`Sector write: ${drive.physicalTrack}, ${this.sector}, ${this.side}`);
                this.status = STATUS_WRITE_PROTECTED;
                break;

            case COMMAND_FORCE_INTERRUPT:
                // Stop whatever is going on and forget it.
                this.machine.eventScheduler.cancelByEventTypeMask(EventType.DISK_ALL);
                this.status = 0;
                this.updateStatus();
                if ((cmd & 0x07) !== 0) {
                    throw new Error("Conditional interrupt features not implemented");
                } else if ((cmd & 0x08) !== 0) {
                    // Immediate interrupt.
                    this.machine.diskIntrqInterrupt(true);
                } else {
                    this.machine.diskIntrqInterrupt(false);
                }
                break;

            default:
                throw new Error("Don't handle command 0x" + toHexByte(cmd));
        }
    }

    public writeTrack(track: number): void {
        if (DEBUG_LOG) {
            console.log("writeTrack(" + toHexByte(track) + ")");
        }

        this.track = track;
    }

    public writeSector(sector: number): void {
        if (DEBUG_LOG) {
            console.log("writeSector(" + toHexByte(sector) + ")");
        }

        this.sector = sector;
    }

    public writeData(data: number): void {
        if (DEBUG_LOG) {
            // console.log("writeData(" + toHexByte(data) + ")");
        }

        const command = this.currentCommand & COMMAND_MASK;
        if (command === COMMAND_WRITE || command === COMMAND_WRITE_TRACK) {
            throw new Error("Can't yet write data");
        }

        this.data = data;
    }

    /**
     * Select a drive.
     */
    public writeSelect(value: number): void {
        if (DEBUG_LOG) {
            console.log("writeSelect(" + toHexByte(value) + ")");
        }

        this.status &= ~STATUS_NOT_READY;
        this.side = booleanToSide((value & SELECT_SIDE) !== 0);
        this.doubleDensity = (value & SELECT_MFM) != 0;
        if ((value & SELECT_WAIT) != 0) {
            // If there was an event pending, simulate waiting until it was due.
            const event = this.machine.eventScheduler.getFirstEvent(EventType.DISK_ALL & ~EventType.DISK_LOST_DATA);
            if (event !== undefined) {
                // This puts the clock ahead immediately, but the main loop of the emulator
                // will then sleep to make the real-time correct.
                // TODO is this legit? Can we use another method?
                this.machine.tStateCount = event.tStateCount;
                this.machine.eventScheduler.dispatch(this.machine.tStateCount);
            }
        }

        // Which drive is being enabled?
        const previousDrive = this.currentDrive;
        switch (value & SELECT_DRIVE_MASK) {
            case 0:
                this.status |= STATUS_NOT_READY;
                break;

            case SELECT_DRIVE_0:
                this.currentDrive = 0;
                break;

            case SELECT_DRIVE_1:
                this.currentDrive = 1;
                break;

            case SELECT_DRIVE_2:
                this.currentDrive = 2;
                break;

            case SELECT_DRIVE_3:
                this.currentDrive = 3;
                break;

            default:
                throw new Error("Not drive specified in select: 0x" + toHexByte(value));
        }

        if (this.currentDrive !== previousDrive) {
            this.updateMotorOn();
        }

        // If a drive was selected, turn on its motor.
        if ((this.status & STATUS_NOT_READY) == 0) {
            this.setMotorOn(true);

            // Set timer to later turn off motor.
            if (this.motorOffTimeoutHandle !== undefined) {
                this.machine.eventScheduler.cancel(this.motorOffTimeoutHandle);
            }
            this.motorOffTimeoutHandle = this.machine.eventScheduler.add(undefined,
                this.machine.tStateCount + MOTOR_TIME_AFTER_SELECT*this.machine.clockHz, () => {
                this.motorOffTimeoutHandle = undefined;
                this.status |= STATUS_NOT_READY;
                this.setMotorOn(false);
            });
        }
    }

    /**
     * Verify that head is on the expected track. Set either STATUS_NOT_FOUND or
     * STATUS_SEEK_ERROR if a problem is found.
     */
    private verify(): void {
        const drive = this.drives[this.currentDrive];
        if (drive.floppyDisk === undefined) {
            this.status |= STATUS_NOT_FOUND;
        } else if (drive.physicalTrack !== this.track) {
            this.status |= STATUS_SEEK_ERROR;
        } else {
            // Make sure a sector exists on this track.
            const sectorData = drive.floppyDisk.readSector(this.track, Side.FRONT, undefined);
            if (sectorData === undefined) {
                this.status |= STATUS_NOT_FOUND;
            }
            if (this.doubleDensity && !drive.floppyDisk.supportsDoubleDensity) {
                this.status |= STATUS_NOT_FOUND;
            }
        }
    }

    /**
     * If we're doing a non-read/write command, update the status with the state
     * of the disk, track, and head position.
     */
    private updateStatus(): void {
        if (isReadWriteCommand(this.currentCommand)) {
            // Don't modify status.
            return;
        }

        const drive = this.drives[this.currentDrive];

        if (drive.floppyDisk === undefined) {
            this.status |= STATUS_INDEX;
        } else {
            // See if we're over the index hole.
            if (this.angle() < HOLE_WIDTH) {
                this.status |= STATUS_INDEX;
            } else {
                this.status &= ~STATUS_INDEX;
            }

            // See if the diskette is write protected.
            if (drive.writeProtected || !SUPPORT_WRITING) {
                this.status |= STATUS_WRITE_PROTECTED;
            } else {
                this.status &= ~STATUS_WRITE_PROTECTED;
            }
        }

        // See if we're on track 0, which for some reason has a special bit.
        if (drive.physicalTrack === 0) {
            this.status |= STATUS_TRACK_ZERO;
        } else {
            this.status &= ~STATUS_TRACK_ZERO;
        }

        // RDY and HLT inputs are wired together on TRS-80 I/III/4/4P.
        if ((this.status & STATUS_NOT_READY) !== 0) {
            this.status &= ~STATUS_HEAD_ENGAGED;
        } else {
            this.status |= STATUS_HEAD_ENGAGED;
        }
    }

    /**
     * Turn motor on or off.
     */
    private setMotorOn(motorOn: boolean): void {
        if (motorOn !== this.motorOn) {
            this.motorOn = motorOn;
            this.machine.diskMotorOffInterrupt(!motorOn);
            this.updateMotorOn();
        }
    }

    /**
     * Dispatch a change to the motor light.
     */
    private updateMotorOn(): void {
        this.onActiveDrive.dispatch(this.motorOn ? this.currentDrive : undefined);
    }

    // Return a value in [0,1) indicating how far we've rotated
    // from the leading edge of the index hole. For the first HOLE_WIDTH we're
    // on the hole itself.
    private angle(): number {
        // Use simulated time.
        const clocksPerRevolution = Math.round(this.machine.clockHz / (RPM/60));
        return (this.machine.tStateCount % clocksPerRevolution) / clocksPerRevolution;
    }

    /**
     * Event used for delayed command completion.  Clears BUSY,
     * sets any additional bits specified, and generates a command
     * completion interrupt.
     */
    private done(bits: number): void {
        this.status &= ~STATUS_BUSY;
        this.status |= bits;
        this.machine.diskIntrqInterrupt(true);
    }

    /**
     * Event to abort the last command with LOST_DATA if it is
     * still in progress.
     */
    private lostData(cmd: number): void {
        if (this.currentCommand === cmd) {
            this.status &= ~STATUS_BUSY;
            this.status |= STATUS_LOST_DATA;
            this.sectorData = undefined;
            this.machine.diskIntrqInterrupt(true);
        }
    }

    /**
     * Event used as a delayed command start. Sets DRQ, generates a DRQ interrupt,
     * sets any additional bits specified, and schedules a lostData() event.
     */
    private firstDrq(bits: number): void {
        this.status |= STATUS_DRQ | bits;
        this.machine.diskDrqInterrupt(true);

        // Evaluate this now, not when the callback is run.
        const currentCommand = this.currentCommand;

        // If we've not finished our work within half a second, trigger a lost data interrupt.
        this.machine.eventScheduler.add(EventType.DISK_LOST_DATA, this.machine.tStateCount + this.machine.clockHz/2,
            () => this.lostData(currentCommand));
    }
}
