import { SymbolInfo } from "z80-asm";

// Result of looking up what symbol we're on.
export class SymbolHit {
    public readonly symbol: SymbolInfo;
    public readonly isDefinition: boolean;
    public readonly referenceNumber: number;

    constructor(symbol: SymbolInfo, isDefinition: boolean, reference: number) {
        this.symbol = symbol;
        this.isDefinition = isDefinition;
        this.referenceNumber = reference;
    }
}
