
/**
 * The TRS-80 models we support.
 */
export enum ModelType {
    MODEL1,
    MODEL3,
    MODEL4,
}

/**
 * Convert a model name to an enum, or undefined if invalid.
 */
export function modelTypeFromString(modelName: string): ModelType | undefined {
    switch (modelName.toUpperCase()) {
        case "1":
        case "I":
            return ModelType.MODEL1;

        case "3":
        case "III":
            return ModelType.MODEL3;

        case "4":
            return ModelType.MODEL4;

        default:
            return undefined;
    }
}

/**
 * The levels of Basic.
 */
export enum BasicLevel {
    LEVEL1,
    LEVEL2,
}

/**
 * Convert a Basic level string to an enum.
 */
export function basicLevelFromString(basicLevelName: string): BasicLevel | undefined {
    switch (basicLevelName) {
        case "1":
            return BasicLevel.LEVEL1;

        case "2":
            return BasicLevel.LEVEL2;

        default:
            return undefined;
    }
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
 * Model of printer attached to the machine.
 */
export enum PrinterModel {
    // Dot-matrix line printer.
    EPSON_MX_80,
    // Plotter.
    FP_215,
}

/**
 * Return the ROM size in bytes. This is not affected by any custom ROM, only by
 * the model and level numbers.
 */
function computeRomSize(modelType: ModelType, basicLevel: BasicLevel): number {
    let kb: number;

    switch (modelType) {
        case ModelType.MODEL1:
            switch (basicLevel) {
                case BasicLevel.LEVEL1:
                    kb = 4;
                    break;

                case BasicLevel.LEVEL2:
                default:
                    kb = 12;
                    break;
            }
            break;

        case ModelType.MODEL3:
        case ModelType.MODEL4:
        default:
            kb = 14;
            break;
    }

    return kb*1024;
}

/**
 * A specific configuration of model, RAM, ROM, display, and peripherals.
 */
export class Config {
    public readonly modelType: ModelType;
    public readonly basicLevel: BasicLevel;
    public readonly cgChip: CGChip;
    public readonly ramSize: RamSize;
    public readonly phosphor: Phosphor;
    public readonly background: Background;
    public readonly scanLines: ScanLines;
    public readonly customRom: string | undefined;
    public readonly romSize: number;
    public readonly printerModel: PrinterModel;

    constructor(modelType: ModelType, basicLevel: BasicLevel, cgChip: CGChip, ramSize: RamSize,
                phosphor: Phosphor, background: Background, scanLines: ScanLines,
                customRom: string | undefined, printerModel: PrinterModel) {

        this.modelType = modelType;
        this.basicLevel = basicLevel;
        this.cgChip = cgChip;
        this.ramSize = ramSize;
        this.phosphor = phosphor;
        this.background = background;
        this.scanLines = scanLines;
        this.customRom = customRom;
        this.printerModel = printerModel;

        // Compute this once, it's used a lot.
        this.romSize = computeRomSize(modelType, basicLevel);
    }

    /**
     * Create a builder based on this object's values.
     */
    public edit(): ConfigBuilder {
        return new ConfigBuilder(this);
    }

    /**
     * Make a default configuration.
     */
    public static makeDefault(): Config {
        return new Config(ModelType.MODEL3,
            BasicLevel.LEVEL2,
            CGChip.LOWER_CASE,
            RamSize.RAM_48_KB,
            Phosphor.WHITE,
            Background.AUTHENTIC,
            ScanLines.OFF,
            undefined,
            PrinterModel.EPSON_MX_80);
    }

    /**
     * Whether this particular config is valid.
     */
    public isValid(): boolean {
        // Only Model I had Level 1. (Well, there was a Model III with Level 1 but we don't support it.)
        if (this.modelType !== ModelType.MODEL1 && this.basicLevel === BasicLevel.LEVEL1) {
            return false;
        }

        // Model III/4 only had lower case.
        if (this.modelType !== ModelType.MODEL1 && this.cgChip === CGChip.ORIGINAL) {
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

/**
 * Mutable class to build a Config object.
 */
export class ConfigBuilder {
    public modelType: ModelType;
    public basicLevel: BasicLevel;
    public cgChip: CGChip;
    public ramSize: RamSize;
    public phosphor: Phosphor;
    public background: Background;
    public scanLines: ScanLines;
    public customRom: string | undefined;
    public printerModel: PrinterModel;

    constructor(config: Config) {
        this.modelType = config.modelType;
        this.basicLevel = config.basicLevel;
        this.cgChip = config.cgChip;
        this.ramSize = config.ramSize;
        this.phosphor = config.phosphor;
        this.background = config.background;
        this.scanLines = config.scanLines;
        this.customRom = config.customRom;
        this.printerModel = config.printerModel;
    }

    /**
     * Make an immutable Config object using this object's values.
     */
    public build(): Config {
        return new Config(
            this.modelType,
            this.basicLevel,
            this.cgChip,
            this.ramSize,
            this.phosphor,
            this.background,
            this.scanLines,
            this.customRom,
            this.printerModel);
    }

    public withModelType(modelType: ModelType): this {
        this.modelType = modelType;
        return this;
    }

    public withBasicLevel(basicLevel: BasicLevel): this {
        this.basicLevel = basicLevel;
        return this;
    }

    public withCGChip(cgChip: CGChip): this {
        this.cgChip = cgChip;
        return this;
    }

    public withRamSize(ramSize: RamSize): this {
        this.ramSize = ramSize;
        return this;
    }

    public withPhosphor(phosphor: Phosphor): this {
        this.phosphor = phosphor;
        return this;
    }

    public withBackground(background: Background): this {
        this.background = background;
        return this;
    }

    public withScanLines(scanLines: ScanLines): this {
        this.scanLines = scanLines;
        return this;
    }

    public withCustomRom(customRom: string | undefined): this {
        this.customRom = customRom;
        return this;
    }

    public withPrinterModel(printerModel: PrinterModel): this {
        this.printerModel = printerModel;
        return this;
    }
}
