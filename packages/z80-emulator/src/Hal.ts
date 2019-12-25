
export interface Hal {
    tStateCount: number;
    readMemory(address: number): number;
    writeMemory(address: number, value: number): void;
    contendMemory(address: number): void;
    readPort(address: number): number;
    writePort(address: number, value: number): void;
    contendPort(address: number): void;
}
