import {CpuEventType, cpuEventTypeToString} from "./CpuEventType";
import {toHex} from "./Utils";

export class CpuEvent {
    /**
     * T-state count of event from start of test.
     */
    public time: number;

    /**
     *
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

    toString(): string {
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
