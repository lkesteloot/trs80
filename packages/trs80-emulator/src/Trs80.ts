import {hi, lo, toHex} from "z80-base";
import {Hal, Z80} from "z80-emulator";
import {CassettePlayer} from "./CassettePlayer";
import {Keyboard} from "./Keyboard";
import {model1Level1Rom} from "./Model1Level1Rom";
import {model1Level2Rom} from "./Model1Level2Rom";
import {model3Rom} from "./Model3Rom";
import {Trs80Screen} from "./Trs80Screen";
import {SCREEN_BEGIN, SCREEN_END} from "./Utils";
import {BasicLevel, CGChip, Config, ModelType} from "./Config";
import {
    BasicProgram,
    Cassette,
    CmdLoadBlockChunk,
    CmdProgram,
    CmdTransferAddressChunk,
    ElementType,
    SystemProgram,
    Trs80File
} from "trs80-base";
import {toHexWord} from "z80-base";

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

const ROM_SIZE = 14*1024;
const RAM_START = 16*1024;

// CPU clock speeds.
const M1_CLOCK_HZ = 1_774_080;
const M3_CLOCK_HZ = 2_027_520;
const M4_CLOCK_HZ = 4_055_040;

const INITIAL_CLICKS_PER_TICK = 2000;

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
    return address >= SCREEN_BEGIN && address < SCREEN_END;
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

/**
 * An event scheduled for the future.
 */
class ScheduledEvent {
    public readonly handle: number;
    public readonly tStateCount: number;
    public readonly callback: () => void;

    constructor(handle: number, tStateCount: number, callback: () => void) {
        this.handle = handle;
        this.tStateCount = Math.round(tStateCount);
        this.callback = callback;
    }
}

/**
 * HAL for the TRS-80 Model III.
 */
export class Trs80 implements Hal {
    private config: Config;
    private timerHz = M3_TIMER_HZ;
    public clockHz = M3_CLOCK_HZ;
    public tStateCount = 0;
    private readonly screen: Trs80Screen;
    private cassette: CassettePlayer;
    private memory = new Uint8Array(0);
    private keyboard = new Keyboard();
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
    private z80 = new Z80(this);
    private clocksPerTick = INITIAL_CLICKS_PER_TICK;
    private startTime = Date.now();
    private tickHandle: number | undefined;
    private started = false;

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

    // The list is sorted by tStateCount.
    private scheduledEventCounter = 1;
    private scheduledEvents: ScheduledEvent[] = [];

    constructor(screen: Trs80Screen, cassette: CassettePlayer) {
        this.screen = screen;
        this.cassette = cassette;
        this.config = Config.makeDefault();
        this.updateFromConfig();
        this.loadRom();
        this.tStateCount = 0;
        this.keyboard.configureKeyboard();
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
        this.config = config;

        this.screen.setConfig(this.config);

        if (needsReboot) {
            this.updateFromConfig();
            this.reset();
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
        }
    }

    /**
     * Load the config-specific ROM into memory.
     */
    private loadRom(): void {
        let rom: string;
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
        }

        const raw = window.atob(rom);
        for (let i = 0; i < raw.length; i++) {
            this.memory[i] = raw.charCodeAt(i);
        }
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
     * Start the CPU and intercept browser keys.
     */
    public start(): void {
        if (!this.started) {
            this.keyboard.interceptKeys = true;
            this.scheduleNextTick();
            this.started = true;
        }
    }

    /**
     * Stop the CPU and no longer intercept browser keys.
     *
     * @return whether it was started.
     */
    public stop(): boolean {
        if (this.started) {
            this.keyboard.interceptKeys = false;
            this.cancelTickTimeout();
            this.started = false;
            return true;
        } else {
            return false;
        }
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
        this.z80.step();

        // Handle non-maskable interrupts.
        if ((this.nmiLatch & this.nmiMask) !== 0 && !this.nmiSeen) {
            this.z80.nonMaskableInterrupt();
            this.nmiSeen = true;

            // Simulate the reset button being released. TODO
            // this.resetButtonInterrupt(false);
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
        while (this.scheduledEvents.length > 0 && this.tStateCount >= this.scheduledEvents[0].tStateCount) {
            const scheduledEvent = this.scheduledEvents.shift() as ScheduledEvent;
            scheduledEvent.callback();
        }
    }

    public contendMemory(address: number): void {
        // Ignore.
    }

    public contendPort(address: number): void {
        // Ignore.
    }

    public readMemory(address: number): number {
        if (address < ROM_SIZE || address >= RAM_START || isScreenAddress(address)) {
            return address < this.memory.length ? this.memory[address] : 0xFF;
        } else if (address === 0x37E8) {
            // Printer. 0x30 = Printer selected, ready, with paper, not busy.
            return 0x30;
        } else if (Keyboard.isInRange(address)) {
            // Keyboard.
            return this.keyboard.readKeyboard(address, this.tStateCount);
        } else {
            // Unmapped memory.
            console.log("Reading from unmapped memory at 0x" + toHex(address, 4));
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
                // No diskette.
                value = 0xFF;
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
                console.log("Reading from unknown port 0x" + toHex(lo(address), 2));
                return 0;
        }
        // console.log("Reading 0x" + toHex(value, 2) + " from port 0x" + toHex(lo(address), 2));
        return value;
    }

    public writePort(address: number, value: number): void {
        const port = address & 0xFF;
        switch (port) {
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
                // Disk command.
                // TODO
                // this.writeDiskCommand(value)
                break;

            case 0xF4:
            case 0xF5:
            case 0xF6:
            case 0xF7:
                // Disk select.
                // TODO
                // this.writeDiskSelect(value)
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
                console.log("Writing 0x" + toHex(value, 2) + " to unknown port 0x" + toHex(port, 2));
                return;
        }
        // console.log("Wrote 0x" + toHex(value, 2) + " to port 0x" + toHex(port, 2));
    }

    public writeMemory(address: number, value: number): void {
        if (address < ROM_SIZE) {
            console.log("Warning: Writing to ROM location 0x" + toHex(address, 4));
        } else {
            if (address >= SCREEN_BEGIN && address < SCREEN_END) {
                if (this.config.cgChip === CGChip.ORIGINAL) {
                    // No bit 6 in video memory, need to compute it.
                    value = computeVideoBit6(value);
                }

                this.screen.writeChar(address, value);
            } else if (address < RAM_START) {
                console.log("Writing to unmapped memory at 0x" + toHex(address, 4));
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
     * Get an opaque string that represents the state of the screen. Flashes the screen.
     */
    public getScreenshot(): string {
        const buf: number[] = [];

        // First byte is screen mode, where 0 means normal (64 columns) and 1 means wide (32 columns).
        buf.push(this.screen.isExpandedCharacters() ? 1 : 0);

        // Run-length encode bytes with (value,count) pairs, with a max count of 255. Bytes
        // in the range 33 to 127 inclusive have an implicit count of 1.
        for (let address = SCREEN_BEGIN; address < SCREEN_END; address++) {
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

        // Start visual flash effect.
        Trs80.flashNode(this.screen.getNode());

        // Base-64 encode and prefix with version number.
        return "0:" + btoa(s);
    }

    /**
     * Flash the node as if a photo were taken.
     */
    private static flashNode(node: HTMLElement): void {
        // Position a semi-transparent white div over the screen, and reduce its transparency over time.
        const oldNodePosition = node.style.position;
        node.style.position = "relative";

        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.right = "0";
        overlay.style.bottom = "0";
        overlay.style.backgroundColor = "#ffffff";

        // Fade out.
        let opacity = 1;
        const updateOpacity = () => {
            overlay.style.opacity = opacity.toString();
            opacity -= 0.1;
            if (opacity >= 0) {
                window.requestAnimationFrame(updateOpacity);
            } else {
                node.removeChild(overlay);
                node.style.position = oldNodePosition;
            }
        };
        updateOpacity();
        node.appendChild(overlay);
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
        for (let i = 0; i < this.clocksPerTick && this.started; i++) {
            this.step();
        }
        // We might have stopped in the step() routine (e.g., with scheduled event).
        if (this.started) {
            this.scheduleNextTick();
        }
    }

    /**
     * Figure out how many CPU cycles we should optimally run and how long
     * to wait until scheduling it, then schedule it to be run later.
     */
    private scheduleNextTick(): void {
        let delay: number;
        if (this.cassetteMotorOn || this.keyboard.keyQueue.length > 4) {
            // Go fast if we're accessing the cassette or pasting.
            this.clocksPerTick = 100_000;
            delay = 0;
        } else {
            // Delay to match original clock speed.
            const now = Date.now();
            const actualElapsed = now - this.startTime;
            const expectedElapsed = this.tStateCount * 1000 / this.clockHz;
            let behind = expectedElapsed - actualElapsed;
            if (behind < -100 || behind > 100) {
                // We're too far behind or ahead. Catch up artificially.
                this.startTime = now - expectedElapsed;
                behind = 0;
            }
            delay = Math.round(Math.max(0, behind));
            if (delay === 0) {
                // Delay too short, do more each tick.
                this.clocksPerTick = Math.min(this.clocksPerTick + 100, 10000);
            } else if (delay > 1) {
                // Delay too long, do less each tick.
                this.clocksPerTick = Math.max(this.clocksPerTick - 100, 100);
            }
        }
        // console.log(this.clocksPerTick, delay);

        this.cancelTickTimeout();
        this.tickHandle = window.setTimeout(() => {
            this.tickHandle = undefined;
            this.tick();
        }, delay);
    }

    /**
     * Schedule an event to happen tStateCount clocks in the future. The callback will be called
     * at the end of an instruction step.
     *
     * @return a handle that can be passed to cancelScheduledEvent().
     */
    public setScheduledEvent(tStateCount: number, callback: () => void): number {
        let handle = this.scheduledEventCounter++;

        this.scheduledEvents.push(new ScheduledEvent(handle, this.tStateCount + tStateCount, callback));
        this.scheduledEvents.sort((a, b) => {
            if (a.tStateCount < b.tStateCount) {
                return -1;
            } else if (a.tStateCount > b.tStateCount) {
                return 1;
            } else {
                return 0;
            }
        });

        return handle;
    }

    /**
     * Cancel an event scheduled by setScheduledEvent().
     */
    public cancelScheduledEvent(handle: number): void {
        for (let i = 0; i < this.scheduledEvents.length; i++) {
            if (this.scheduledEvents[i].handle === handle) {
                this.scheduledEvents.splice(i, 1);
                break;
            }
        }
    }

    /**
     * Stop the tick timeout, if it's running.
     */
    private cancelTickTimeout(): void {
        if (this.tickHandle !== undefined) {
            window.clearTimeout(this.tickHandle);
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
                this.cassette.onMotorStart();
            } else {
                this.cassette.onMotorStop();
            }
        }
    }

    // Read some of the cassette to see if we should be triggering a rise/fall interrupt.
    private updateCassette() {
        if (this.cassetteMotorOn && this.setCassetteState(CassetteState.READ) >= 0) {
            // See how many samples we should have read by now.
            const samplesToRead = Math.round((this.tStateCount - this.cassetteMotorOnClock) *
                this.cassette.samplesPerSecond / this.clockHz);

            // Catch up.
            while (this.cassetteSamplesRead < samplesToRead) {
                const sample = this.cassette.readSample();
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
        for (let address = SCREEN_BEGIN; address < SCREEN_END; address++) {
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
        const address = SCREEN_BEGIN + row*64 + col;

        // This works on Model III, not sure if it works on Model I or in wide mode.
        this.writeMemory(0x4020, lo(address));
        this.writeMemory(0x4021, hi(address));
    }

    /**
     * Run a TRS-80 program. The exact behavior depends on the type of program.
     */
    public runTrs80File(trs80File: Trs80File): void {
        if (trs80File instanceof CmdProgram) {
            this.runCmdProgram(trs80File);
        } else if (trs80File instanceof Cassette) {
            if (trs80File.files.length === 1) {
                this.runTrs80File(trs80File.files[0].file);
            } else {
                // TODO.
            }
        } else if (trs80File instanceof SystemProgram) {
            this.runSystemProgram(trs80File);
        } else if (trs80File instanceof BasicProgram) {
            this.runBasicProgram(trs80File);
        } else {
            // TODO.
        }
    }

    /**
     * Load a CMD program into memory and run it.
     */
    public runCmdProgram(cmdProgram: CmdProgram): void {
        this.reset();
        this.setScheduledEvent(this.clockHz*0.1, () => {
            this.cls();

            for (const chunk of cmdProgram.chunks) {
                if (chunk instanceof CmdLoadBlockChunk) {
                    this.writeMemoryBlock(chunk.address, chunk.loadData);
                } else if (chunk instanceof CmdTransferAddressChunk) {
                    this.jumpTo(chunk.address);

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
        this.setScheduledEvent(this.clockHz*0.1, () => {
            this.cls();

            for (const chunk of systemProgram.chunks) {
                this.writeMemoryBlock(chunk.loadAddress, chunk.data);
            }

            this.jumpTo(systemProgram.entryPointAddress);
        });
    }

    /**
     * Load a Basic program into memory and run it.
     */
    public runBasicProgram(basicProgram: BasicProgram): void {
        this.reset();

        // Wait for Cass?
        this.setScheduledEvent(this.clockHz*0.1, () => {
            this.keyboard.simulateKeyboardText("\n0\n");

            // Wait for Ready prompt.
            this.setScheduledEvent(this.clockHz*0.2, () => {
                // Find address to load to.
                let addr = this.readMemory(0x40A4) + (this.readMemory(0x40A5) << 8);
                if (addr < 0x4200 || addr >= 0x4500) {
                    console.error("Basic load address (0x" + toHexWord(addr) + ") is uninitialized");
                    return;
                }

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

                this.keyboard.simulateKeyboardText("RUN\n");
            });
        });
    }
}
