
/**
 * Type of CPU event.
 */
export enum CpuEventType {
    MEMORY_READ,
    MEMORY_WRITE,
    MEMORY_CONTEND,
    PORT_READ,
    PORT_WRITE,
    PORT_CONTEND,
}

/**
 * Parse a CPU event from a Fuse string.
 */
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

/**
 * Convert a CPU event to a Fuse-compatible string.
 */
export function cpuEventTypeToString(cpuEventType: CpuEventType): string {
    switch (cpuEventType) {
        case CpuEventType.MEMORY_READ:
            return "MR";
        case CpuEventType.MEMORY_WRITE:
            return "MW";
        case CpuEventType.MEMORY_CONTEND:
            return "MC";
        case CpuEventType.PORT_READ:
            return "PR";
        case CpuEventType.PORT_WRITE:
            return "PW";
        case CpuEventType.PORT_CONTEND:
            return "PC";
    }

    return "??";
}
