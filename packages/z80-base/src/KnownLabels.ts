
/**
 * A location in the ROM or baked into the processor, for use by assemblers, disassemblers, and debuggers.
 */
export interface KnownLabel {
    name: string,
    address: number,
}

/**
 * Important addresses to the CPU.
 */
export const Z80_KNOWN_LABELS: KnownLabel[] = [
    { name: "rst00", address: 0x0000 },
    { name: "rst08", address: 0x0008 },
    { name: "rst10", address: 0x0010 },
    { name: "rst18", address: 0x0018 },
    { name: "rst20", address: 0x0020 },
    { name: "rst28", address: 0x0028 },
    { name: "rst30", address: 0x0030 },
    { name: "rst38", address: 0x0038 },
];


