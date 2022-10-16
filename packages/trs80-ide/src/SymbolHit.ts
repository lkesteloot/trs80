import { SymbolInfo } from "z80-asm";

// Result of looking up what symbol we're on.
export class SymbolHit {
    public readonly symbol: SymbolInfo;
    public readonly isDefinition: boolean;
    public readonly appearanceNumber: number;

    constructor(symbol: SymbolInfo, isDefinition: boolean, appearanceNumber: number) {
        this.symbol = symbol;
        this.isDefinition = isDefinition;
        this.appearanceNumber = appearanceNumber;
    }
}
