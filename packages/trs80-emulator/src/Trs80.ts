import {model3Rom} from "./Model3Rom";
import {Hal} from "z80-emulator";
import {lo, toHex} from "z80-base";
import {Keyboard} from "./Keyboard";

/**
 * HAL for the TRS-80 Model III.
 */
export class Trs80 implements Hal {
    private readonly ROM_SIZE = 14*1024;
    private readonly RAM_START = 16*1024;
    // https://en.wikipedia.org/wiki/TRS-80#Model_III
    public static readonly CLOCK_HZ = 2_030_000;
    private memory = new Uint8Array(64*1024);
    private keyboard = new Keyboard();
    public tStateCount = 0;
    private modeImage = 0x80;

    constructor() {
        this.memory.fill(0);
        const raw = window.atob(model3Rom);
        for (let i = 0; i < raw.length; i++) {
            this.memory[i] = raw.charCodeAt(i);
        }
        this.tStateCount = 0;
        this.keyboard.configureKeyboard();
    }

    public contendMemory(address: number): void {
        // Ignore.
    }

    public contendPort(address: number): void {
        // Ignore.
    }

    public readMemory(address: number): number {
        if (address < this.ROM_SIZE || address >= this.RAM_START || Trs80.isScreenAddress(address)) {
            if (address === 16412) {
                // TODO remove.
                console.log("Reading from cursor blink: " + this.memory[address]);
            }
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
            case 0xF0:
                // No diskette.
                value = 0xFF;
                break;

            case 0xFF:
                // Cassette and various flags.
                value = (this.modeImage & 0x7E) | 0x00; // vm.getCassetteByte()
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
                // TODO
                // vm.setIrqMask(value)
                break;

            case 0xE4:
            case 0xE5:
            case 0xE6:
            case 0xE7:
                // Set NMI state.
                // TODO
                // vm.setNmiMask(value)
                break;

            case 0xEC:
            case 0xED:
            case 0xEE:
            case 0xEF:
                // Various controls.
                // TODO
                this.modeImage = value;
                // vm.setCassetteMotor(value&0x02 != 0)
                // vm.setExpandedCharacters(value&0x04 != 0)
                break;

            case 0xF0:
                // Disk command.
                // TODO
                // vm.writeDiskCommand(value)
                break;

            case 0xF4:
            case 0xF5:
            case 0xF6:
            case 0xF7:
                // Disk select.
                // TODO
                // vm.writeDiskSelect(value)
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
}
