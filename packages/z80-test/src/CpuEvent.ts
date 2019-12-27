import {CpuEventType, cpuEventTypeToString} from "./CpuEventType";
import {toHex} from "z80-base";

/**
 * Records a CPU event, such as reading from memory at a particular time. These
 * are used to verify that the CPU is doing the right thing at the right time.
 */
export class CpuEvent {
    /**
     * T-state count of event from start of test.
     */
    public time: number;

    /**
     * Type of event.
     */
    public eventType: CpuEventType;

    /**
     * Memory or port address of event.
     */
    public address: number;

    /**
     * Data read or written, or undefined for contend.
     */
    public value: number | undefined;

    constructor(time: number, eventType: CpuEventType, address: number, value?: number) {
        this.time = time;
        this.eventType = eventType;
        this.address = address;
        this.value = value;
    }

    /**
     * Generate a Fuse-compatible string.
     */
    public toString(): string {
        let s: string = this.time.toString(10);
        while (s.length < 5) {
            s = " " + s;
        }
        s += " " + cpuEventTypeToString(this.eventType) + " " + toHex(this.address, 4);
        if (this.value !== undefined) {
            s += " " + toHex(this.value, 2);
        }
        return s;
    }
}
