
export enum CpuEventType {
    MEMORY_READ,
    MEMORY_WRITE,
    MEMORY_CONTEND,
    PORT_READ,
    PORT_WRITE,
    PORT_CONTEND,
}

export function parseCpuEventType(s: string): CpuEventType {
    switch (s) {
        case "MR": return CpuEventType.MEMORY_READ;
        case "MW": return CpuEventType.MEMORY_WRITE;
        case "MC": return CpuEventType.MEMORY_CONTEND;
        case "PR": return CpuEventType.PORT_READ;
        case "PW": return CpuEventType.PORT_WRITE;
        case "PC": return CpuEventType.PORT_CONTEND;
        default: throw new Error("Unknown CPU event type " + s);
    }
}
