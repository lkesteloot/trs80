
/**
 * The TRS-80 models we support.
 */
export enum ModelType {
    MODEL1,
    MODEL3,
}

/**
 * The levels of Basic.
 */
export enum BasicLevel {
    LEVEL1,
    LEVEL2,
}

/**
 * The character generator chip we support.
 */
export enum CGChip {
    ORIGINAL,
    LOWER_CASE,
}

/**
 * The amounts of RAM we support.
 */
export enum RamSize {
    RAM_4_KB,
    RAM_16_KB,
    RAM_32_KB,
    RAM_48_KB,
}

/**
 * Phosphor color.
 */
export enum Phosphor {
    WHITE,
    GREEN,
    AMBER,
}

/**
 * A specific configuration of model and RAM.
 */
export class Config {
    public readonly modelType: ModelType;
    public readonly basicLevel: BasicLevel;
    public readonly cgChip: CGChip;
    public readonly ramSize: RamSize;
    public readonly phosphor: Phosphor;

    constructor(modelType: ModelType, basicLevel: BasicLevel, cgChip: CGChip, ramSize: RamSize, phosphor: Phosphor) {
        this.modelType = modelType;
        this.basicLevel = basicLevel;
        this.cgChip = cgChip;
        this.ramSize = ramSize;
        this.phosphor = phosphor;
    }

    public withModelType(modelType: ModelType): Config {
        return new Config(modelType, this.basicLevel, this.cgChip, this.ramSize, this.phosphor);
    }

    public withBasicLevel(basicLevel: BasicLevel): Config {
        return new Config(this.modelType, basicLevel, this.cgChip, this.ramSize, this.phosphor);
    }

    public withCGChip(cgChip: CGChip): Config {
        return new Config(this.modelType, this.basicLevel, cgChip, this.ramSize, this.phosphor);
    }

    public withRamSize(ramSize: RamSize): Config {
        return new Config(this.modelType, this.basicLevel, this.cgChip, ramSize, this.phosphor);
    }

    public withPhosphor(phosphor: Phosphor): Config {
        return new Config(this.modelType, this.basicLevel, this.cgChip, this.ramSize, phosphor);
    }

    /**
     * Make a default configuration.
     */
    public static makeDefault(): Config {
        return new Config(ModelType.MODEL3, BasicLevel.LEVEL2, CGChip.LOWER_CASE, RamSize.RAM_48_KB, Phosphor.WHITE);
    }

    /**
     * Whether this particular config is valid.
     */
    public isValid(): boolean {
        // Model III only had Level 2. (I've read that it actually shipped with Level 1, but
        // we don't have that ROM.)
        if (this.modelType === ModelType.MODEL3 && this.basicLevel === BasicLevel.LEVEL1) {
            return false;
        }

        // Model III only had lower case.
        if (this.modelType === ModelType.MODEL3 && this.cgChip === CGChip.ORIGINAL) {
            return false;
        }

        // Rest are okay.
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
