import {hi, lo, toHex, toHexWord} from "z80-base";
import {Hal, Z80, Z80State} from "z80-emulator";
import {CassettePlayer} from "./CassettePlayer.js";
import {Keyboard} from "./Keyboard.js";
import {model1Level1Rom} from "./Model1Level1Rom.js";
import {model1Level2Rom} from "./Model1Level2Rom.js";
import {model3Rom} from "./Model3Rom.js";
import {model4Rom} from "./Model4Rom.js";
import {Trs80Screen} from "./Trs80Screen.js";
import {BasicLevel, CGChip, Config, ModelType} from "./Config.js";
import {
    BASIC_HEADER_BYTE,
    BasicProgram,
    CmdProgram,
    decodeBasicProgram,
    ElementType, isFloppy,
    SystemProgram,
    TRS80_SCREEN_BEGIN,
    TRS80_SCREEN_END,
    Trs80File,
    Level1Program
} from "trs80-base";
import {FloppyDisk} from "trs80-base";
import {FLOPPY_DRIVE_COUNT, FloppyDiskController} from "./FloppyDiskController.js";
import {Machine} from "./Machine.js";
import {EventScheduler} from "./EventScheduler.js";
import {SoundPlayer} from "./SoundPlayer.js";
import {SignalDispatcher,SimpleEventDispatcher} from "strongly-typed-events";

// IRQs
const M1_TIMER_IRQ_MASK = 0x80;
const M3_CASSETTE_RISE_IRQ_MASK = 0x01;
const M3_CASSETTE_FALL_IRQ_MASK = 0x02;
const M3_TIMER_IRQ_MASK = 0x04;
const M3_IO_BUS_IRQ_MASK = 0x08;
const M3_UART_SED_IRQ_MASK = 0x10;
const M3_UART_RECEIVE_IRQ_MASK = 0x20;
const M3_UART_ERROR_IRQ_MASK = 0x40;
const CASSETTE_IRQ_MASKS = M3_CASSETTE_RISE_IRQ_MASK | M3_CASSETTE_FALL_IRQ_MASK;

// NMIs
const RESET_NMI_MASK = 0x20;
const DISK_MOTOR_OFF_NMI_MASK = 0x40;
const DISK_INTRQ_NMI_MASK = 0x80;

// Timer.
const M1_TIMER_HZ = 40;
const M3_TIMER_HZ = 30;
const M4_TIMER_HZ = 60;

const RAM_START = 16*1024;

// CPU clock speeds.
const M1_CLOCK_HZ = 1_774_080;
const M3_CLOCK_HZ = 2_027_520;
const M4_CLOCK_HZ = 4_055_040;

const INITIAL_CLOCKS_PER_TICK = 2000;

// Whether the emulator is going or not.
export enum RunningState {
    // Not running at all.
    STOPPED,

    // Running normally.
    STARTED,

    // Single-stepping through code, or at breakpoint.
    PAUSED,
}

/**
 * Converts the two-bit cassette port to an audio value. These values are from "More TRS-80 Assembly
 * Language Programming", page 222, with the last value taken from "The B00K" volume 2 (page 5-2).
 */
const CASSETTE_BITS_TO_AUDIO_VALUE = [0, 1, -1, -1];

const CASSETTE_THRESHOLD = 5000/32768.0;

// State of the cassette hardware. We don't support writing.
enum CassetteState {
    CLOSE, READ, FAIL,
}

// Value of wave in audio: negative, neutral (around zero), or positive.
enum CassetteValue {
    NEGATIVE, NEUTRAL, POSITIVE,
}

/**
 * Whether the memory address maps to a screen location.
 */
function isScreenAddress(address: number): boolean {
    return address >= TRS80_SCREEN_BEGIN && address < TRS80_SCREEN_END;
}

/**
 * See the FONT.md file for an explanation of this, but basically bit 6 is the NOR of bits 5 and 7.
 */
function computeVideoBit6(value: number): number {
    const bit5 = (value >> 5) & 1;
    const bit7 = (value >> 7) & 1;
    const bit6 = (bit5 | bit7) ^ 1;

    return (value & 0xBF) | (bit6 << 6);
}

const WARN_ONCE_SET = new Set<string>();

/**
 * Send this warning message to the console once. This is to avoid a program repeatedly doing something
 * that results in a warning (such as reading from an unmapped memory address) and crashing the browser.
 */
function warnOnce(message: string): void {
    if (!WARN_ONCE_SET.has(message)) {
        WARN_ONCE_SET.add(message);
        console.warn(message + " (further warnings suppressed)");
    }
}

/**
 * setTimeout() returns a different type on the browser and in node, so auto-detect the type.
 */
type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * Complete state of the machine.
 */
export class Trs80State {
    public readonly config: Config;
    public readonly z80State: Z80State;
    public readonly memory: Uint8Array;
    // TODO so much more here.

    constructor(config: Config, z80State: Z80State, memory: Uint8Array) {
        this.config = config;
        this.z80State = z80State;
        this.memory = memory;
    }
}

// Work in both browser and node.
const myRequestAnimationFrame = typeof window == "object" ? window.requestAnimationFrame : setTimeout;
const myCancelAnimationFrame = typeof window == "object" ? window.cancelAnimationFrame : clearTimeout;
// Tried to do the right thing here, but can't seem to get compile-time safety.
type RequestAnimationFrameType = any;

/**
 * HAL for the TRS-80 Model III.
 */
export class Trs80 implements Hal, Machine {
    private config: Config;
    private timerHz = M3_TIMER_HZ;
    public clockHz = M3_CLOCK_HZ;
    public tStateCount = 0;
    private readonly screen: Trs80Screen;
    private readonly fdc = new FloppyDiskController(this);
    private readonly cassettePlayer: CassettePlayer;
    private memory = new Uint8Array(0);
    private readonly keyboard: Keyboard;
    private modeImage = 0x80;
    // Which IRQs should be handled.
    private irqMask = 0;
    // Which IRQs have been requested by the hardware.
    private irqLatch = 0;
    // Which NMIs should be handled.
    private nmiMask = 0;
    // Which NMIs have been requested by the hardware.
    private nmiLatch = 0;
    // Whether we've seen this NMI and handled it.
    private nmiSeen = false;
    private previousTimerClock = 0;
    public readonly z80 = new Z80(this);
    private clocksPerTick = INITIAL_CLOCKS_PER_TICK;
    // Time of last tick.
    private prevTime = 0;
    // Handle for requested animation frame.
    private tickHandle: RequestAnimationFrameType | undefined;
    public runningState: RunningState = RunningState.STOPPED;
    public readonly onRunningState = new SimpleEventDispatcher<RunningState>();
    // Internal state of the cassette controller.
    // Whether the motor is running.
    private cassetteMotorOn = false;
    // State machine.
    private cassetteState = CassetteState.CLOSE;
    // Internal register state.
    private cassetteValue = CassetteValue.NEUTRAL;
    private cassetteLastNonZeroValue = CassetteValue.NEUTRAL;
    private cassetteFlipFlop = false;
    // When we turned on the motor (started reading the file) and how many samples
    // we've read since then.
    private cassetteMotorOnClock = 0;
    private cassetteSamplesRead = 0;
    private cassetteRiseInterruptCount = 0;
    private cassetteFallInterruptCount = 0;
    private orchestraLeftValue = 0;
    public readonly soundPlayer: SoundPlayer;
    public readonly eventScheduler = new EventScheduler();
    public readonly onPreStep = new SignalDispatcher();
    public readonly onPostStep = new SignalDispatcher();
    // Must be exactly 65536 entries, values 0 or 1:
    private breakpoints: Uint8Array | undefined = undefined;
    // One-shot breakpoint, resets when hit:
    private oneShotBreakpoint: number | undefined = undefined;
    // So that we can "continue" past a breakpoint.
    private ignoreInitialInstructionBreakpoint = false;
    private speedMultiplier = 1;
    private printerBuffer = "";

    constructor(config: Config, screen: Trs80Screen, keyboard: Keyboard, cassette: CassettePlayer, soundPlayer: SoundPlayer) {
        this.screen = screen;
        this.keyboard = keyboard;
        this.cassettePlayer = cassette;
        this.soundPlayer = soundPlayer;
        this.config = config;
        this.screen.setConfig(this.config);
        this.updateFromConfig();
        this.loadRom();
        this.tStateCount = 0;
        this.fdc.onActiveDrive.subscribe(activeDrive => this.soundPlayer.setFloppyMotorOn(activeDrive !== undefined));
        this.fdc.onTrackMove.subscribe(moveCount => this.soundPlayer.trackMoved(moveCount));
    }

    /**
     * Get the current emulator's configuration.
     */
    public getConfig(): Config {
        return this.config;
    }

    /**
     * Sets a new configuration and reboots into it if necessary.
     */
    public setConfig(config: Config): void {
        const needsReboot = config.needsReboot(this.config);
        const hasNewRom = config.customRom !== this.config.customRom;
        this.config = config;

        this.screen.setConfig(this.config);

        if (needsReboot) {
            this.updateFromConfig();
            this.reset();
        } else if (hasNewRom) {
            this.loadRom();
        }
    }

    /**
     * Update our settings based on the config. Wipes memory.
     */
    private updateFromConfig(): void {
        this.memory = new Uint8Array(RAM_START + this.config.getRamSize());
        this.memory.fill(0);
        this.loadRom();

        switch (this.config.modelType) {
            case ModelType.MODEL1:
                this.timerHz = M1_TIMER_HZ;
                this.clockHz = M1_CLOCK_HZ;
                break;
            case ModelType.MODEL3:
            default:
                this.timerHz = M3_TIMER_HZ;
                this.clockHz = M3_CLOCK_HZ;
                break;
            case ModelType.MODEL4:
                this.timerHz = M4_TIMER_HZ; // TODO depends on mode.
                this.clockHz = M4_CLOCK_HZ;
                break;
        }
    }

    /**
     * Save the complete state of the machine, for use in {@link #restore()}.
     */
    public save(): Trs80State {
        return new Trs80State(
            this.config,  // Immutable, safe to pass in.
            this.z80.save(),
            new Uint8Array(this.memory));
    }

    /**
     * Restore the complete state of the machine, saved by {@link #save()}.
     */
    public restore(state: Trs80State): void {
        this.config = state.config;
        this.z80.restore(state.z80State);

        // Restore ROM.
        this.memory.set(state.memory.subarray(0, this.config.romSize));
        // Restore screen.
        for (let addr = TRS80_SCREEN_BEGIN; addr < TRS80_SCREEN_END; addr++) {
            this.writeMemory(addr, state.memory[addr]);
        }
        // Restore RAM.
        this.memory.set(state.memory.subarray(RAM_START), RAM_START);
    }

    /**
     * Load the config-specific ROM into memory.
     */
    private loadRom(): void {
        let rom: string;
        if (this.config.customRom !== undefined) {
            rom = this.config.customRom;
        } else {
            switch (this.config.modelType) {
                case ModelType.MODEL1:
                    switch (this.config.basicLevel) {
                        case BasicLevel.LEVEL1:
                            rom = model1Level1Rom;
                            break;

                        case BasicLevel.LEVEL2:
                        default:
                            rom = model1Level2Rom;
                            break;
                    }
                    break;

                case ModelType.MODEL3:
                default:
                    rom = model3Rom;
                    break;

                case ModelType.MODEL4:
                    rom = model4Rom;
                    break;
            }
        }

        // Sanity check.
        if (rom.length > this.config.romSize) {
            throw new Error("ROM is too large (" + rom.length + " > " + this.config.romSize + ")");
        }

        // Load into memory.
        this.memory.fill(0, 0, this.config.romSize);
        for (let i = 0; i < rom.length; i++) {
            this.memory[i] = rom.charCodeAt(i);
        }
    }

    /**
     * Get the max number of drives in this machine. This isn't the number of drives actually
     * hooked up, it's the max that this machine could handle.
     */
    public getMaxDrives(): number {
        return FLOPPY_DRIVE_COUNT;
    }

    /**
     * Event dispatcher for floppy drive activity, indicating which drive (0-based) has its motor on, if any.
     */
    get onMotorOn(): SimpleEventDispatcher<number | undefined> {
        return this.fdc.onActiveDrive;
    }

    /**
     * Reset the state of the Z80 and hardware.
     */
    public reset(): void {
        this.setIrqMask(0);
        this.setNmiMask(0);
        this.resetCassette();
        this.keyboard.clearKeyboard();
        this.setTimerInterrupt(false);
        this.z80.reset();
    }

    /**
     * Jump the Z80 emulator to the specified address.
     */
    public jumpTo(address: number): void {
        this.z80.regs.pc = address;
    }

    /**
     * Set the stack pointer to the specified address.
     */
    private setStackPointer(address: number): void {
        this.z80.regs.sp = address;
    }

    /**
     * Set how fast the CPU should go relative to real wall-clock speed. The default value is 1.
     */
    public setSpeedMultiplier(speedMultiplier: number) {
        this.speedMultiplier = speedMultiplier;
    }

    /**
     * Start the executable at the given address. This sets up some
     * state and jumps to the address.
     */
    private startExecutable(address: number): void {
        // Disable the cursor.
        this.writeMemory(0x4022, 0);

        // Disable interrupts.
        this.z80.regs.iff1 = 0;
        this.z80.regs.iff2 = 0;

        this.jumpTo(address);
    }

    /**
     * Start the CPU and intercept browser keys.
     *
     * @return the old running state.
     */
    public setRunningState(runningState: RunningState): RunningState {
        const oldRunningState = this.runningState;

        this.runningState = runningState;
        switch (runningState) {
            // These two are the same from our perspective, but clients care about the difference.
            case RunningState.STOPPED:
            case RunningState.PAUSED:
                if (oldRunningState === RunningState.STARTED) {
                    this.keyboard.emulatorStarted = false;
                    this.cancelTickTimeout();
                }
                break;

            case RunningState.STARTED:
                if (oldRunningState !== RunningState.STARTED) {
                    this.keyboard.emulatorStarted = true;
                    this.scheduleNextTick();
                }
                break;
        }

        if (runningState !== oldRunningState) {
            this.onRunningState.dispatch(runningState);
        }

        return oldRunningState;
    }

    /**
     * Set all breakpoints. The array must have 65536 entries, each 0 or 1.
     * Use undefined for no breakpoints.
     */
    public setBreakpoints(breakpoints: Uint8Array | undefined): void {
        this.breakpoints = breakpoints;
    }

    /**
     * Set a one-shot breakpoint, which is automatically reset to undefined when hit.
     */
    public setOneShotBreakpoint(oneShotBreakpoint: number | undefined): void {
        this.oneShotBreakpoint = oneShotBreakpoint;
    }

    /**
     * Whether to ignore any breakpoint on the first instruction executed, in "start" mode (not
     * single stepping). This is reset after the first instruction.
     */
    public setIgnoreInitialInstructionBreakpoint(ignoreInitialInstructionBreakpoint: boolean): void {
        this.ignoreInitialInstructionBreakpoint = ignoreInitialInstructionBreakpoint;
    }

    /**
     * Set the mask for IRQ (regular) interrupts.
     */
    public setIrqMask(irqMask: number): void {
        this.irqMask = irqMask;
    }

    /**
     * Set the mask for non-maskable interrupts. (Yes.)
     */
    public setNmiMask(nmiMask: number): void {
        // Reset is always allowed:
        this.nmiMask = nmiMask | RESET_NMI_MASK;
        this.updateNmiSeen();
    }

    private interruptLatchRead(): number {
        if (this.config.modelType === ModelType.MODEL1) {
            const irqLatch = this.irqLatch;
            this.setTimerInterrupt(false);
            // TODO irq = this.irqLatch !== 0;
            return irqLatch;
        } else {
            return ~this.irqLatch & 0xFF;
        }
    }

    /**
     * Take one Z80 step and update the state of the hardware.
     */
    public step(): void {
        this.onPreStep.dispatch();

        this.z80.step();

        // Handle non-maskable interrupts.
        if ((this.nmiLatch & this.nmiMask) !== 0 && !this.nmiSeen) {
            this.z80.nonMaskableInterrupt();
            this.nmiSeen = true;

            // Simulate the reset button being released.
            this.resetButtonInterrupt(false);
        }

        // Handle interrupts.
        if ((this.irqLatch & this.irqMask) !== 0) {
            this.z80.maskableInterrupt();
        }

        // Set off a timer interrupt.
        if (this.tStateCount > this.previousTimerClock + this.clockHz / this.timerHz) {
            this.handleTimer();
            this.previousTimerClock = this.tStateCount;
        }

        // Update cassette state.
        this.updateCassette();

        // Dispatch scheduled events.
        this.eventScheduler.dispatch(this.tStateCount);

        this.onPostStep.dispatch();
    }

    public contendMemory(address: number): void {
        // Ignore.
    }

    public contendPort(address: number): void {
        // Ignore.
    }

    public readMemory(address: number): number {
        if (address < this.config.romSize || address >= RAM_START || isScreenAddress(address)) {
            return address < this.memory.length ? this.memory[address] : 0xFF;
        } else if (address === 0x37E8) {
            // Printer. 0x30 = Printer selected, ready, with paper, not busy.
            return 0x30;
        } else if (Keyboard.isInRange(address)) {
            // Keyboard.
            return this.keyboard.readKeyboard(address, this.tStateCount);
        } else {
            // Unmapped memory.
            warnOnce("Reading from unmapped memory at 0x" + toHex(address, 4));
            return 0;
        }
    }

    public readPort(address: number): number {
        const port = address & 0xFF;
        let value = 0xFF; // Default value for missing ports.

        switch (port) {
            case 0x00:
                // Joystick.
                value = 0xFF;
                break;

            case 0xE0:
                if (this.config.modelType !== ModelType.MODEL1) {
                    // IRQ latch read.
                    value = this.interruptLatchRead();
                }
                break;

            case 0xE4:
                if (this.config.modelType !== ModelType.MODEL1) {
                    // NMI latch read.
                    value = ~this.nmiLatch & 0xFF;
                }
                break;

            case 0xE8:
            case 0xE9:
            case 0xEA:
            case 0xEB:
                // Serial port, ignore.
                break;

            case 0xEC:
            case 0xED:
            case 0xEE:
            case 0xEF:
                if (this.config.modelType !== ModelType.MODEL1) {
                    // Acknowledge timer.
                    this.setTimerInterrupt(false);
                    value = 0xFF;
                }
                break;

            case 0xF0:
                value = this.fdc.readStatus();
                break;

            case 0xF1:
                value = this.fdc.readTrack();
                break;

            case 0xF2:
                value = this.fdc.readSector();
                break;

            case 0xF3:
                value = this.fdc.readData();
                break;

            case 0xF8:
                // Printer status. Printer selected, ready, with paper, not busy.
                value = 0x30;
                break;

            case 0xFF:
                // Cassette and various flags.
                if (this.config.modelType === ModelType.MODEL1) {
                    value = 0x3F;
                    if (!this.screen.isExpandedCharacters()) {
                        value |= 0x40;
                    }
                } else {
                    value = this.modeImage & 0x7E;
                }
                value |= this.getCassetteByte();
                break;

            default:
                // Not sure what a good default value is, but other emulators use 0xFF.
                warnOnce("Reading from unknown port 0x" + toHex(lo(address), 2));
                value = 0xFF;
                break;
        }

        // console.log("Reading 0x" + toHex(value, 2) + " from port 0x" + toHex(lo(address), 2));
        return value;
    }

    public writePort(address: number, value: number): void {
        const port = address & 0xFF;
        switch (port) {
            case 0xB5: // ORCHESTRA-85
            case 0x75: // ORCHESTRA-90
            {
                // ORCHESTRA hardware. The values are -128 to 127, so flip the MSB to convert to 0 to 255.
                const leftValue = ((this.orchestraLeftValue ^ 0x80) - 128) / 128;
                const rightValue = ((value ^ 0x80) - 128) / 128;
                this.soundPlayer.setAudioValue(leftValue, rightValue, this.tStateCount, this.clockHz);
                break;
            }

            case 0xB9: // ORCHESTRA-85
            case 0x79: // ORCHESTRA-90
                // ORCHESTRA hardware.
                // Keep this for later right value.
                this.orchestraLeftValue = value;
                break;

            case 0xE0:
                if (this.config.modelType !== ModelType.MODEL1) {
                    // Set interrupt mask.
                    this.setIrqMask(value);
                }
                break;

            case 0xE4:
            case 0xE5:
            case 0xE6:
            case 0xE7:
                if (this.config.modelType !== ModelType.MODEL1) {
                    // Set NMI state.
                    this.setNmiMask(value);
                }
                break;

            case 0xE8:
            case 0xE9:
            case 0xEA:
            case 0xEB:
                // Serial port, ignore.
                break;

            case 0xEC:
            case 0xED:
            case 0xEE:
            case 0xEF:
                if (this.config.modelType !== ModelType.MODEL1) {
                    // Various controls.
                    this.modeImage = value;
                    this.setCassetteMotor((value & 0x02) !== 0);
                    this.screen.setExpandedCharacters((value & 0x04) !== 0);
                    this.screen.setAlternateCharacters((value & 0x08) === 0);
                }
                break;

            case 0xF0:
                this.fdc.writeCommand(value);
                break;

            case 0xF1:
                this.fdc.writeTrack(value);
                break;

            case 0xF2:
                this.fdc.writeSector(value);
                break;

            case 0xF3:
                this.fdc.writeData(value);
                break;

            case 0xF4:
            case 0xF5:
            case 0xF6:
            case 0xF7:
                this.fdc.writeSelect(value);
                break;

            case 0xF8:
            case 0xF9:
            case 0xFA:
            case 0xFB:
                // Printer write.
                if (value === 10) {
                    // Linefeed.
                    console.log("Printer: " + this.printerBuffer);
                    this.printerBuffer = "";
                } else if (value === 13) {
                    // Carriage return, ignore.
                } else {
                    this.printerBuffer += String.fromCodePoint(value);
                }
                // console.log("Writing \"" + String.fromCodePoint(value) + "\" (" + value + ") to printer");
                break;

            case 0xFC:
            case 0xFD:
            case 0xFE:
            case 0xFF:
                if (this.config.modelType === ModelType.MODEL1) {
                    this.setCassetteMotor((value & 0x04) !== 0);
                    this.screen.setExpandedCharacters((value & 0x08) !== 0);
                }
                if ((value & 0x20) !== 0) {
                    // Model III Micro Labs graphics card.
                    console.log("Sending 0x" + toHex(value, 2) + " to Micro Labs graphics card");
                } else {
                    // Do cassette emulation.
                    this.putCassetteByte(value & 0x03);
                }
                break;

            default:
                warnOnce("Writing 0x" + toHex(value, 2) + " to unknown port 0x" + toHex(port, 2));
                return;
        }
        // console.log("Wrote 0x" + toHex(value, 2) + " to port 0x" + toHex(port, 2));
    }

    /**
     * Write the given value to the screen. Does not update RAM. The address
     * must be in the screen range.
     */
    private writeToScreenMemory(address: number, value: number): void {
        if (this.config.cgChip === CGChip.ORIGINAL) {
            // No bit 6 in video memory, need to compute it.
            value = computeVideoBit6(value);
        }

        this.screen.writeChar(address, value);
    }

    public writeMemory(address: number, value: number): void {
        if (address < this.config.romSize) {
            warnOnce("Warning: Writing to ROM location 0x" + toHex(address, 4));
        } else {
            if (address >= TRS80_SCREEN_BEGIN && address < TRS80_SCREEN_END) {
                this.writeToScreenMemory(address, value);
            } else if (address < RAM_START) {
                warnOnce("Writing to unmapped memory at 0x" + toHex(address, 4));
            }
            this.memory[address] = value;
        }
    }

    /**
     * Write a block of data to memory.
     *
     * @return the address just past the block.
     */
    public writeMemoryBlock(address: number, values: Uint8Array, startIndex: number = 0, length?: number): number {
        length = length ?? values.length;

        for (let i = 0; i < length; i++) {
            this.writeMemory(address++, values[startIndex + i]);
        }

        return address;
    }

    /**
     * Get a copy of the current memory. Does not include correct values of
     * (non-screen) memory-mapped I/O, such as keyboard.
     */
    public getMemory(): Uint8Array {
        return new Uint8Array(this.memory);
    }

    /**
     * Copy the screen area from memory to the screen. This is useful if the screen was changed
     * by a third party while the emulator was stopped.
     */
    public restoreScreen(): void {
        for (let address = TRS80_SCREEN_BEGIN; address < TRS80_SCREEN_END; address++) {
            this.writeToScreenMemory(address, this.memory[address]);
        }
    }

    /**
     * Reset cassette edge interrupts.
     */
    public cassetteClearInterrupt(): void {
        this.irqLatch &= ~CASSETTE_IRQ_MASKS;
    }

    /**
     * Check whether the software has enabled these interrupts.
     */
    public cassetteInterruptsEnabled(): boolean {
        return (this.irqMask & CASSETTE_IRQ_MASKS) !== 0;
    }

    /**
     * Get an opaque string that represents the state of the screen.
     *
     * Might want to also call flashNode() in the trs80-emulator-web project.
     */
    public getScreenshot(): string {
        const buf: number[] = [];

        // First byte is screen mode, where 0 means normal (64 columns) and 1 means wide (32 columns).
        buf.push(this.screen.isExpandedCharacters() ? 1 : 0);

        // Run-length encode bytes with (value,count) pairs, with a max count of 255. Bytes
        // in the range 33 to 127 inclusive have an implicit count of 1.
        for (let address = TRS80_SCREEN_BEGIN; address < TRS80_SCREEN_END; address++) {
            const value = this.memory[address];
            if (value > 32 && value < 128) {
                // Bytes in this range don't store a count.
                buf.push(value);
            } else if (buf.length < 2 || buf[buf.length - 1] === 255 || buf[buf.length - 2] !== value) {
                // New entry.
                buf.push(value);
                buf.push(1);
            } else {
                // Increment existing count.
                buf[buf.length - 1] += 1;
            }
        }

        // Convert to a binary string.
        let s = buf.map(n => String.fromCharCode(n)).join("");

        // Base-64 encode and prefix with version number.
        return "0:" + btoa(s);
    }

    // Reset whether we've seen this NMI interrupt if the mask and latch no longer overlap.
    private updateNmiSeen(): void {
        if ((this.nmiLatch & this.nmiMask) === 0) {
            this.nmiSeen = false;
        }
    }

    /**
     * Run a certain number of CPU instructions and schedule another tick.
     */
    private tick(): void {
        const startTStateCount = this.tStateCount;
        while (this.tStateCount < startTStateCount + this.clocksPerTick && this.runningState === RunningState.STARTED) {
            // Check breakpoints.
            if (!this.ignoreInitialInstructionBreakpoint) {
                if (this.breakpoints !== undefined && this.breakpoints[this.z80.regs.pc] !== 0) {
                    this.setRunningState(RunningState.PAUSED);
                    break;
                }
                if (this.z80.regs.pc === this.oneShotBreakpoint) {
                    this.oneShotBreakpoint = undefined;
                    this.setRunningState(RunningState.PAUSED);
                    break;
                }
            }

            this.step();
            this.ignoreInitialInstructionBreakpoint = false;
        }
        // We might have stopped in the step() routine (e.g., with scheduled event).
        if (this.runningState === RunningState.STARTED) {
            this.scheduleNextTick();
        }
    }

    /**
     * Figure out how many CPU cycles we should optimally run,
     * then schedule it to be run later.
     */
    private scheduleNextTick(): void {
        if (this.cassetteMotorOn || (this.keyboard.keyQueue.length > 10 && this.speedMultiplier >= 1)) {
            // Go fast if we're accessing the cassette or pasting. Disable paste detection if
            // we're running slowly, the paste buffer can fill up.
            this.clocksPerTick = Math.round(this.clockHz / 10);
        } else {
            const now = Date.now();
            // Estimate how long since the last tick, but keep it reasonable.
            const elapsedMs = Math.max(Math.min(now - this.prevTime, 100), 1);
            // We spent this much time last time, so execute this many clocks this time.
            this.clocksPerTick = Math.round(this.clockHz * this.speedMultiplier * elapsedMs / 1000);
            this.prevTime = now;

            // console.log("clocksPerTick", this.clocksPerTick, "elapsed", elapsedMs);
        }

        this.cancelTickTimeout();
        this.tickHandle = myRequestAnimationFrame(() => {
            this.tickHandle = undefined;
            this.tick();
        });
    }

    /**
     * Stop the requested animation frame.
     */
    private cancelTickTimeout(): void {
        if (this.tickHandle !== undefined) {
            myCancelAnimationFrame(this.tickHandle);
            this.tickHandle = undefined;
        }
    }

    // Set or reset the timer interrupt.
    private setTimerInterrupt(state: boolean): void {
        if (this.config.modelType === ModelType.MODEL1) {
            if (state) {
                this.irqLatch |= M1_TIMER_IRQ_MASK;
            } else {
                this.irqLatch &= ~M1_TIMER_IRQ_MASK;
            }
        } else {
            if (state) {
                this.irqLatch |= M3_TIMER_IRQ_MASK;
            } else {
                this.irqLatch &= ~M3_TIMER_IRQ_MASK;
            }
        }
    }

    // What to do when the hardware timer goes off.
    private handleTimer(): void {
        this.setTimerInterrupt(true);
    }

    // Set the state of the reset button interrupt.
    private resetButtonInterrupt(state: boolean): void {
        if (state) {
            this.nmiLatch |= RESET_NMI_MASK;
        } else {
            this.nmiLatch &= ~RESET_NMI_MASK;
        }
        this.updateNmiSeen();
    }

    // Set the state of the disk motor off interrupt.
    public diskMotorOffInterrupt(state: boolean): void {
        if (state) {
            this.nmiLatch |= DISK_MOTOR_OFF_NMI_MASK;
        } else {
            this.nmiLatch &= ~DISK_MOTOR_OFF_NMI_MASK;
        }
        this.updateNmiSeen();
    }

    // Set the state of the disk interrupt.
    public diskIntrqInterrupt(state: boolean): void {
        if (state) {
            this.nmiLatch |= DISK_INTRQ_NMI_MASK;
        } else {
            this.nmiLatch &= ~DISK_INTRQ_NMI_MASK;
        }
        this.updateNmiSeen();
    }

    // Set the state of the disk interrupt.
    public diskDrqInterrupt(state: boolean): void {
        // No effect.
    }

    // Reset the controller to a known state.
    private resetCassette() {
        this.setCassetteState(CassetteState.CLOSE);
    }

    // Get a byte from the I/O port.
    private getCassetteByte(): number {
        // If the motor's running, and we're reading a byte, then get into read mode.
        if (this.cassetteMotorOn) {
            this.setCassetteState(CassetteState.READ);
        }

        // Clear any interrupt that may have triggered this read.
        this.cassetteClearInterrupt();

        // Cassette owns bits 0 and 7.
        let b = 0;
        if (this.cassetteFlipFlop) {
            b |= 0x80;
        }
        if (this.config.modelType !== ModelType.MODEL1 && this.cassetteLastNonZeroValue === CassetteValue.POSITIVE) {
            b |= 0x01;
        }
        return b;
    }

    // Write to the cassette port. We don't support writing tapes, but this is used
    // for 500-baud reading to trigger the next analysis of the tape.
    private putCassetteByte(b: number) {
        if (this.cassetteMotorOn) {
            if (this.cassetteState === CassetteState.READ) {
                this.updateCassette();
                this.cassetteFlipFlop = false;
            }
        } else {
            const audioValue = CASSETTE_BITS_TO_AUDIO_VALUE[b];
            this.soundPlayer.setAudioValue(audioValue, audioValue, this.tStateCount, this.clockHz);
        }
    }

    // Kick off the reading process when doing 1500-baud reads.
    private kickOffCassette() {
        if (this.cassetteMotorOn &&
                    this.cassetteState === CassetteState.CLOSE &&
                    this.cassetteInterruptsEnabled()) {

            // Kick off the process.
            this.cassetteRiseInterrupt();
            this.cassetteFallInterrupt();
        }
    }

    // Turn the motor on or off.
    private setCassetteMotor(cassetteMotorOn: boolean) {
        if (cassetteMotorOn !== this.cassetteMotorOn) {
            if (cassetteMotorOn) {
                this.cassetteFlipFlop = false;
                this.cassetteLastNonZeroValue = CassetteValue.NEUTRAL;

                // Waits a second before kicking off the cassette.
                // TODO this should be in CPU cycles, not browser cycles.
                if (this.config.modelType !== ModelType.MODEL1) {
                    setTimeout(() => this.kickOffCassette(), 1000);
                }
            } else {
                this.setCassetteState(CassetteState.CLOSE);
            }
            this.cassetteMotorOn = cassetteMotorOn;

            if (cassetteMotorOn) {
                this.cassettePlayer.onMotorStart();
            } else {
                this.cassettePlayer.onMotorStop();
            }
        }
    }

    // Read some of the cassette to see if we should be triggering a rise/fall interrupt.
    private updateCassette() {
        if (this.cassetteMotorOn && this.setCassetteState(CassetteState.READ) >= 0) {
            // See how many samples we should have read by now.
            const samplesToRead = Math.round((this.tStateCount - this.cassetteMotorOnClock) *
                this.cassettePlayer.samplesPerSecond / this.clockHz);

            // Catch up.
            while (this.cassetteSamplesRead < samplesToRead) {
                const sample = this.cassettePlayer.readSample();
                this.cassetteSamplesRead++;

                // Convert to state, where neutral is some noisy in-between state.
                let cassetteValue = CassetteValue.NEUTRAL;
                if (sample > CASSETTE_THRESHOLD) {
                    cassetteValue = CassetteValue.POSITIVE;
                } else if (sample < -CASSETTE_THRESHOLD) {
                    cassetteValue = CassetteValue.NEGATIVE;
                }

                // See if we've changed value.
                if (cassetteValue !== this.cassetteValue) {
                    if (cassetteValue === CassetteValue.POSITIVE) {
                        // Positive edge.
                        this.cassetteFlipFlop = true;
                        this.cassetteRiseInterrupt();
                    } else if (cassetteValue === CassetteValue.NEGATIVE) {
                        // Negative edge.
                        this.cassetteFlipFlop = true;
                        this.cassetteFallInterrupt();
                    }

                    this.cassetteValue = cassetteValue;
                    if (cassetteValue !== CassetteValue.NEUTRAL) {
                        this.cassetteLastNonZeroValue = cassetteValue;
                    }
                }
            }
        }
    }

    // Returns 0 if the state was changed, 1 if it wasn't, and -1 on error.
    private setCassetteState(newState: CassetteState): number {
        const oldCassetteState = this.cassetteState;

        // See if we're changing anything.
        if (oldCassetteState === newState) {
            return 1;
        }

        // Once in error, everything will fail until we close.
        if (oldCassetteState === CassetteState.FAIL && newState !== CassetteState.CLOSE) {
            return -1;
        }

        // Change things based on new state.
        switch (newState) {
            case CassetteState.READ:
                this.openCassetteFile();
                break;
        }

        // Update state.
        this.cassetteState = newState;

        return 0;
    }

    // Open file, get metadata, and get read to read the tape.
    private openCassetteFile(): void {
        // TODO open/rewind cassette?

        // Reset the clock.
        this.cassetteMotorOnClock = this.tStateCount;
        this.cassetteSamplesRead = 0;
    }

    // Saw a positive edge on cassette.
    private cassetteRiseInterrupt(): void {
        this.cassetteRiseInterruptCount++;
        this.irqLatch = (this.irqLatch & ~M3_CASSETTE_RISE_IRQ_MASK) |
            (this.irqMask & M3_CASSETTE_RISE_IRQ_MASK);
    }

    // Saw a negative edge on cassette.
    private cassetteFallInterrupt(): void {
        this.cassetteFallInterruptCount++;
        this.irqLatch = (this.irqLatch & ~M3_CASSETTE_FALL_IRQ_MASK) |
            (this.irqMask & M3_CASSETTE_FALL_IRQ_MASK);
    }

    /**
     * Clear screen and home cursor.
     */
    private cls(): void {
        for (let address = TRS80_SCREEN_BEGIN; address < TRS80_SCREEN_END; address++) {
            this.writeMemory(address, 32);
        }
        this.positionCursor(0, 0);
    }

    /**
     * Move the cursor (where the ROM's write routine will write to next) to the
     * given location.
     *
     * @param col 0-based text column.
     * @param row 0-based text row.
     */
    private positionCursor(col: number, row: number): void {
        const address = TRS80_SCREEN_BEGIN + row*64 + col;

        // This works on Model III, not sure if it works on Model I or in wide mode.
        this.writeMemory(0x4020, lo(address));
        this.writeMemory(0x4021, hi(address));
    }

    /**
     * Run a TRS-80 program. The exact behavior depends on the type of program.
     */
    public runTrs80File(trs80File: Trs80File): void {
        this.ejectAllFloppyDisks();

        if (isFloppy(trs80File)) {
            this.runFloppyDisk(trs80File);
        } else {
            switch (trs80File.className) {
                case "CmdProgram":
                    this.runCmdProgram(trs80File);
                    break;
                case "Cassette":
                    // Run the first file. Assume there's always at least one.
                    this.runTrs80File(trs80File.files[0].file);
                    break;
                case "SystemProgram":
                    this.runSystemProgram(trs80File);
                    break;
                case "BasicProgram":
                    this.runBasicProgram(trs80File);
                    break;
                case "Level1Program":
                    this.runLevel1Program(trs80File);
                    break;
                default:
                    console.error("Don't know how to run", trs80File);
                    break;
            }
        }
    }

    /**
     * Load a CMD program into memory and run it.
     */
    public runCmdProgram(cmdProgram: CmdProgram): void {
        this.reset();
        this.eventScheduler.add(undefined, this.tStateCount + this.clockHz*0.1, () => {
            this.cls();

            for (const chunk of cmdProgram.chunks) {
                if (chunk.className === "CmdLoadBlockChunk") {
                    this.writeMemoryBlock(chunk.address, chunk.loadData);
                } else if (chunk.className === "CmdTransferAddressChunk") {
                    this.startExecutable(chunk.address);

                    // Don't load any more after this. I assume on a real machine the jump
                    // happens immediately and CMD parsing ends.
                    break;
                }
            }
        });
    }

    /**
     * Load a system program into memory and run it.
     */
    public runSystemProgram(systemProgram: SystemProgram): void {
        this.reset();
        this.eventScheduler.add(undefined, this.tStateCount + this.clockHz*0.1, () => {
            this.cls();

            for (const chunk of systemProgram.chunks) {
                this.writeMemoryBlock(chunk.loadAddress, chunk.data);
            }

            // Do what the SYSTEM command does.
            this.setStackPointer(0x4288);

            // Handle programs that don't define an entry point address.
            let entryPointAddress = systemProgram.entryPointAddress;
            if (entryPointAddress === 0) {
                const guessAddress = systemProgram.guessEntryAddress();
                if (guessAddress !== undefined) {
                    entryPointAddress = guessAddress;
                }
            }
            this.startExecutable(entryPointAddress);
        });
    }

    public runLevel1Program(level1Program: Level1Program): void {
        this.reset();
        this.eventScheduler.add(undefined, this.tStateCount + this.clockHz*0.1, () => {
            this.cls();

            this.writeMemoryBlock(level1Program.startAddress, level1Program.getData());

            // Do what the SYSTEM command does.
            this.setStackPointer(0x4288);

            // Handle programs that don't define an entry point address.
            const entryPointAddress = level1Program.entryPointAddress ?? (level1Program.startAddress + 4);
            this.startExecutable(entryPointAddress);
        });
    }

    /**
     * Load a Basic program into memory and run it.
     */
    public runBasicProgram(basicProgram: BasicProgram): void {
        this.reset();

        // Wait for Cass?
        this.eventScheduler.add(undefined, this.tStateCount + this.clockHz*0.1, () => {
            this.keyboard.simulateKeyboardText("\n0\n");

            // Wait for Ready prompt.
            this.eventScheduler.add(undefined, this.tStateCount + this.clockHz*0.2, () => {
                this.loadBasicProgram(basicProgram);
                this.keyboard.simulateKeyboardText("RUN\n");
            });
        });
    }

    /**
     * Get the address of the first line of the Basic program, or a string explaining the error.
     */
    private getBasicAddress(): number | string {
        const addr = this.readMemory(0x40A4) + (this.readMemory(0x40A5) << 8);
        if (addr < 0x4200) {
            return `Basic load address is uninitialized (0x${toHexWord(addr)})`;
        }

        return addr;
    }

    /**
     * Load a Basic program into memory, replacing the one that's there. Does not run it.
     */
    public loadBasicProgram(basicProgram: BasicProgram): void {
        // Find address to load to.
        const addrOrError = this.getBasicAddress();
        if (typeof(addrOrError) === "string") {
            console.error(addrOrError);
            return;
        }
        let addr = addrOrError as number;

        // Terminate current line (if any) and set up the new one.
        let lineStart: number | undefined;
        const newLine = () => {
            if (lineStart !== undefined) {
                // End-of-line marker.
                this.writeMemory(addr++, 0);

                // Update previous line's next-line pointer.
                this.writeMemory(lineStart, lo(addr));
                this.writeMemory(lineStart + 1, hi(addr));
            }

            // Remember address of next-line pointer.
            lineStart = addr;

            // Next-line pointer.
            this.writeMemory(addr++, 0);
            this.writeMemory(addr++, 0);
        };

        // Write elements to memory.
        for (const e of basicProgram.elements) {
            if (e.offset !== undefined) {
                if (e.elementType === ElementType.LINE_NUMBER) {
                    newLine();
                }

                // Write element.
                addr = this.writeMemoryBlock(addr, basicProgram.binary, e.offset, e.length);
            }
        }

        newLine();

        // End of Basic program pointer.
        this.writeMemory(0x40F9, lo(addr));
        this.writeMemory(0x40FA, hi(addr));

        // Start of array variables pointer.
        this.writeMemory(0x40FB, lo(addr));
        this.writeMemory(0x40FC, hi(addr));

        // Start of free memory pointer.
        this.writeMemory(0x40FD, lo(addr));
        this.writeMemory(0x40FE, hi(addr));
    }

    /**
     * Remove floppy disks from all drives.
     */
    public ejectAllFloppyDisks(): void {
        for (let i = 0; i < FLOPPY_DRIVE_COUNT; i++) {
            this.loadFloppyDisk(undefined, i);
        }
    }

    /**
     * Load the floppy disk into the specified drive.
     * @param floppyDisk the floppy, or undefined to unmount.
     * @param driveNumber the drive number, 0-based.
     */
    public loadFloppyDisk(floppyDisk: FloppyDisk | undefined, driveNumber: number): void {
        this.fdc.loadFloppyDisk(floppyDisk, driveNumber);
    }

    /**
     * Load a floppy and reboot into it.
     */
    private runFloppyDisk(floppyDisk: FloppyDisk): void {
        // Mount floppy.
        this.loadFloppyDisk(floppyDisk, 0);

        // Reboot.
        this.reset();
    }

    /**
     * Pulls the Basic program currently in memory, or returns a string with an error.
     */
    public getBasicProgramFromMemory(): BasicProgram | string {
        const addrOrError = this.getBasicAddress();
        if (typeof(addrOrError) === "string") {
            return addrOrError;
        }
        let addr = addrOrError as number;

        // Walk through the program lines to find the end.
        const beginAddr = addr;
        while (true) {
            // Find end address.
            const nextLine = this.readMemory(addr) + (this.readMemory(addr + 1) << 8);
            if (nextLine === 0) {
                break;
            }
            if (nextLine < addr) {
                // Error, went backward.
                return `Next address 0x${toHexWord(nextLine)} is less than current address 0x${toHexWord(addr)}`;
            }
            addr = nextLine;
        }
        const endAddr = addr + 2;

        // Put together the binary of just the program.
        const binary = new Uint8Array(endAddr - beginAddr + 1);
        binary[0] = BASIC_HEADER_BYTE;
        binary.set(this.memory.subarray(beginAddr, endAddr), 1);

        // Decode the program.
        const basic = decodeBasicProgram(binary);
        if (basic === undefined) {
            return "Basic couldn't be decoded";
        }

        return basic;
    }
}
