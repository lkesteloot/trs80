import {CpuEventType} from "./CpuEventType";

export class CpuEvent {
    /**
     * T-state count of event from start of test.
     */
    time: number;

    /**
     *
     */
    eventType: CpuEventType;

    /**
     * Memory or port address of event.
     */
    address: number;

    /**
     * Data read or written, or undefined for contend.
     */
    value: number | undefined;

    constructor(time: number, eventType: CpuEventType, address: number, value: number | undefined) {
        this.time = time;
        this.eventType = eventType;
        this.address = address;
        this.value = value;
    }
}
