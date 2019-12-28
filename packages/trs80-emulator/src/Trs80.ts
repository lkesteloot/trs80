import {model3Rom} from "./Model3Rom";
import {Hal} from "z80-emulator";
import {toHex, lo} from "z80-base";

/**
 * HAL for the TRS-80 Model III.
 */
export class Trs80 implements Hal {
    private readonly ROM_SIZE = 14*1024;
    private memory = new Uint8Array(64*1024);
    public tStateCount = 0;

    constructor() {
        this.memory.fill(0);
        const raw = window.atob(model3Rom);
        for (let i = 0; i < raw.length; i++) {
            this.memory[i] = raw.charCodeAt(i);
        }
        this.tStateCount = 0;
    }

    contendMemory(address: number): void {
        // Ignore.
    }

    contendPort(address: number): void {
        // Ignore.
    }

    readMemory(address: number): number {
        return this.memory[address];
    }

    public readPort(address: number): number {
        const port = address & 0xFF;
        let value: number;
        switch (port) {
            case 0xF0:
                // No diskette.
                value = 0xFF;
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
        console.log("Writing 0x" + toHex(value, 2) + " to port 0x" + toHex(port, 2));
    }

    public writeMemory(address: number, value: number): void {
        if (address < this.ROM_SIZE) {
            console.log("Warning: Writing to ROM location 0x" + toHex(address, 4))
        } else {
            if (address >= 15360 && address < 16384 && value != 32) {
                document.write("Writing \"" + String.fromCharCode(value) + "\" to " + address + "<br>");
            }
            this.memory[address] = value;
        }
    }
}
