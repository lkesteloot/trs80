
/**
 * The various TRS-80 models we support.
 */
export enum ModelType {
    MODEL1_LEVEL1,
    MODEL1_LEVEL2,
    MODEL3,
}

/**
 * The various amounts of RAM we support.
 */
export enum RamSize {
    RAM_4_KB,
    RAM_16_KB,
    RAM_32_KB,
    RAM_48_KB,
}

/**
 * A specific configuration of model and RAM.
 */
export class Config {
    public readonly modelType: ModelType;
    public readonly ramSize: RamSize;

    constructor(modelType: ModelType, ramSize: RamSize) {
        this.modelType = modelType;
        this.ramSize = ramSize;
    }

    public withModelType(modelType: ModelType): Config {
        return new Config(modelType, this.ramSize);
    }

    public withRamSize(ramSize: RamSize): Config {
        return new Config(this.modelType, ramSize);
    }

    /**
     * Whether this particular config is valid.
     */
    public isValid(): boolean {
        // All currently okay.
        return true;
    }

    /**
     * Return the RAM size in bytes.
     */
    public getRamSize(): number {
        let kb: number;

        switch (this.ramSize) {
            case RamSize.RAM_4_KB:
                kb = 4;
                break;
            case RamSize.RAM_16_KB:
                kb = 16;
                break;
            case RamSize.RAM_32_KB:
                kb = 32;
                break;
            case RamSize.RAM_48_KB:
            default:
                kb = 48;
                break;
        }

        return kb*1024;
    }
}
