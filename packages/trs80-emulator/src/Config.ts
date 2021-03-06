
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
 * Background color.
 */
export enum Background {
    BLACK,
    AUTHENTIC,
}

/**
 * Whether to display scan lines.
 */
export enum ScanLines {
    OFF,
    ON,
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
    public readonly background: Background;
    public readonly scanLines: ScanLines;

    constructor(modelType: ModelType, basicLevel: BasicLevel, cgChip: CGChip, ramSize: RamSize,
                phosphor: Phosphor, background: Background, scanLines: ScanLines) {

        this.modelType = modelType;
        this.basicLevel = basicLevel;
        this.cgChip = cgChip;
        this.ramSize = ramSize;
        this.phosphor = phosphor;
        this.background = background;
        this.scanLines = scanLines;
    }

    public withModelType(modelType: ModelType): Config {
        return new Config(modelType, this.basicLevel, this.cgChip, this.ramSize, this.phosphor, this.background, this.scanLines);
    }

    public withBasicLevel(basicLevel: BasicLevel): Config {
        return new Config(this.modelType, basicLevel, this.cgChip, this.ramSize, this.phosphor, this.background, this.scanLines);
    }

    public withCGChip(cgChip: CGChip): Config {
        return new Config(this.modelType, this.basicLevel, cgChip, this.ramSize, this.phosphor, this.background, this.scanLines);
    }

    public withRamSize(ramSize: RamSize): Config {
        return new Config(this.modelType, this.basicLevel, this.cgChip, ramSize, this.phosphor, this.background, this.scanLines);
    }

    public withPhosphor(phosphor: Phosphor): Config {
        return new Config(this.modelType, this.basicLevel, this.cgChip, this.ramSize, phosphor, this.background, this.scanLines);
    }

    public withBackground(background: Background): Config {
        return new Config(this.modelType, this.basicLevel, this.cgChip, this.ramSize, this.phosphor, background, this.scanLines);
    }

    public withScanLines(scanLines: ScanLines): Config {
        return new Config(this.modelType, this.basicLevel, this.cgChip, this.ramSize, this.phosphor, this.background, scanLines);
    }

    /**
     * Make a default configuration.
     */
    public static makeDefault(): Config {
        return new Config(ModelType.MODEL3, BasicLevel.LEVEL2, CGChip.LOWER_CASE, RamSize.RAM_48_KB,
            Phosphor.WHITE, Background.AUTHENTIC, ScanLines.OFF);
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
     * Whether this new config needs to be rebooted, if the emulator currently is running the old config.
     */
    public needsReboot(oldConfig: Config): boolean {
        // Maybe here we could not reboot if only the CG chip changed. The software is able to detect the
        // difference (since bit 6 is synthetic in one case).
        return this.modelType !== oldConfig.modelType ||
            this.basicLevel !== oldConfig.basicLevel ||
            this.cgChip !== oldConfig.cgChip ||
            this.ramSize !== oldConfig.ramSize;
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
