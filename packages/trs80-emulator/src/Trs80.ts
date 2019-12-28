import {model3Rom} from "./Model3Rom";
import {Hal, Z80} from "z80-emulator";
import {lo, toHex} from "z80-base";
import {Keyboard} from "./Keyboard";

// IRQs
const CASSETTE_RISE_IRQ_MASK = 0x01;
const CASSETTE_FALL_IRQ_MASK = 0x02;
const TIMER_IRQ_MASK = 0x04;
const IO_BUS_IRQ_MASK = 0x08;
const UART_SED_IRQ_MASK = 0x10;
const UART_RECEIVE_IRQ_MASK = 0x20;
const UART_ERROR_IRQ_MASK = 0x40;
const CASSETTE_IRQ_MASKS = CASSETTE_RISE_IRQ_MASK | CASSETTE_FALL_IRQ_MASK;

// NMIs
const RESET_NMI_MASK = 0x20;
const DISK_MOTOR_OFF_NMI_MASK = 0x40;
const DISK_INTRQ_NMI_MASK = 0x80;

// Timer.
const TIMER_HZ = 30;

/**
 * HAL for the TRS-80 Model III.
 */
export class Trs80 implements Hal {
    private readonly ROM_SIZE = 14*1024;
    private readonly RAM_START = 16*1024;
    // https://en.wikipedia.org/wiki/TRS-80#Model_III
    public static readonly CLOCK_HZ = 2_030_000;
    private static readonly TIMER_CYCLES = Trs80.CLOCK_HZ / TIMER_HZ;
    private memory = new Uint8Array(64*1024);
    private keyboard = new Keyboard();
    public tStateCount = 0;
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

    constructor() {
        this.memory.fill(0);
        const raw = window.atob(model3Rom);
        for (let i = 0; i < raw.length; i++) {
            this.memory[i] = raw.charCodeAt(i);
        }
        this.tStateCount = 0;
        this.keyboard.configureKeyboard();
    }

    public reset(): void {
        this.setIrqMask(0);
        this.setNmiMask(0);
        this.keyboard.clearKeyboard();
        this.setTimerInterrupt(false);
        this.z80.reset();
    }

    // Set the mask for IRQ (regular) interrupts.
    public setIrqMask(irqMask: number): void {
        this.irqMask = irqMask;
    }

    // Set the mask for non-maskable interrupts. (Yes.)
    public setNmiMask(nmiMask: number): void {
        // Reset is always allowed:
        this.nmiMask = nmiMask | RESET_NMI_MASK;
        this.updateNmiSeen();
    }

    // Reset whether we've seen this NMI interrupt if the mask and latch no longer overlap.
    private updateNmiSeen(): void {
        if ((this.nmiLatch & this.nmiMask) === 0) {
            this.nmiSeen = false;
        }
    }

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
        if (this.tStateCount > this.previousTimerClock + Trs80.TIMER_CYCLES) {
            this.handleTimer();
            this.previousTimerClock = this.tStateCount;
        }
    }

    public contendMemory(address: number): void {
        // Ignore.
    }

    public contendPort(address: number): void {
        // Ignore.
    }

    public readMemory(address: number): number {
        if (address < this.ROM_SIZE || address >= this.RAM_START || Trs80.isScreenAddress(address)) {
            return this.memory[address];
        } else if (address === 0x37E8) {
            // Printer. 0x30 = Printer selected, ready, with paper, not busy.
            return 0x30;
        } else if (Keyboard.isInRange(address)) {
            // Keyboard.
            return this.keyboard.readKeyboard(address, this.tStateCount);
        } else {
            // Unmapped memory.
            console.log("Reading from unmapped memory at 0x" + toHex(address, 4));
            return 0xFF;
        }
    }

    public readPort(address: number): number {
        const port = address & 0xFF;
        let value: number;
        switch (port) {
            case 0xE0:
                // IRQ latch read.
                value = ~this.irqLatch & 0xFF;
                break;

            case 0xE4:
                // NMI latch read.
                value = ~this.nmiLatch & 0xFF;
                break;

            case 0xEC:
            case 0xED:
            case 0xEE:
            case 0xEF:
                // Acknowledge timer.
                this.setTimerInterrupt(false);
                value = 0xFF;
                break;

            case 0xF0:
                // No diskette.
                value = 0xFF;
                break;

            case 0xFF:
                // Cassette and various flags.
                value = (this.modeImage & 0x7E) | 0x00; // this.getCassetteByte()
                break;

            default:
                console.log("Reading from unknown port 0x" + toHex(lo(address), 2));
                return 0;
        }
        console.log("Reading 0x" + toHex(value, 2) + " from port 0x" + toHex(lo(address), 2));
        return value;
    }

    public writePort(address: number, value: number): void {
        const port = address & 0xFF;
        switch (port) {
            case 0xE0:
                // Set interrupt mask.
                this.setIrqMask(value)
                break;

            case 0xE4:
            case 0xE5:
            case 0xE6:
            case 0xE7:
                // Set NMI state.
                this.setNmiMask(value)
                break;

            case 0xEC:
            case 0xED:
            case 0xEE:
            case 0xEF:
                // Various controls.
                // TODO
                this.modeImage = value;
                // this.setCassetteMotor(value&0x02 != 0)
                // this.setExpandedCharacters(value&0x04 != 0)
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

            default:
                console.log("Writing 0x" + toHex(value, 2) + " to unknown port 0x" + toHex(port, 2));
                return;
        }
        console.log("Wrote 0x" + toHex(value, 2) + " to port 0x" + toHex(port, 2));
    }

    public writeMemory(address: number, value: number): void {
        if (address < this.ROM_SIZE) {
            console.log("Warning: Writing to ROM location 0x" + toHex(address, 4))
        } else {
            if (address >= 15360 && address < 16384) {
                const c = document.getElementById("c" + address) as HTMLSpanElement;
                // https://www.kreativekorp.com/software/fonts/trs80.shtml
                c.innerText = String.fromCharCode(0xE000 + value);
            } else if (address < this.RAM_START) {
                console.log("Writing to unmapped memory at 0x" + toHex(address, 4));
            }
            this.memory[address] = value;
        }
    }

    private static isScreenAddress(address: number): boolean {
        return address >= 15 * 1024 && address < 16 * 1024;
    }

    // Set or reset the timer interrupt.
    private setTimerInterrupt(state: boolean): void {
        if (state) {
            this.irqLatch |= TIMER_IRQ_MASK;
        } else {
            this.irqLatch &= ~TIMER_IRQ_MASK;
        }
    }

    // What to do when the hardware timer goes off.
    private handleTimer(): void {
        this.setTimerInterrupt(true);
    }
}
