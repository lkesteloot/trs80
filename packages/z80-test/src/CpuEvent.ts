import {CpuEventType} from "./CpuEventType";

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

    constructor(time: number, eventType: CpuEventType, address: number, value: number | undefined) {
        this.time = time;
        this.eventType = eventType;
        this.address = address;
        this.value = value;
    }
}
