import {adjustColor, CSS_PREFIX, rgbToCss} from "./Utils.js";
import {BasicLevel, CGChip, Config, DisplayType, InkColor, ModelType, Phosphor, PrinterModel, RamSize} from "trs80-emulator";
import {Trs80} from "trs80-emulator";
import { inkColorToRgb } from "./WebPrinter.js";

const gCssPrefix = CSS_PREFIX + "-settings-panel";
const gScreenNodeCssClass = gCssPrefix + "-screen-node";
const gPanelCssClass = gCssPrefix + "-panel";
const gShownCssClass = gCssPrefix + "-shown";
const gAcceptButtonCssClass = gCssPrefix + "-accept";
const gRebootButtonCssClass = gCssPrefix + "-reboot";
const gOptionsClass = gCssPrefix + "-options";
const gButtonsClass = gCssPrefix + "-buttons";
const gColorButtonClass = gCssPrefix + "-color-button";
const gDarkColorButtonClass = gCssPrefix + "-dark-color-button";
const gAcceptButtonColor = "#449944";

const GLOBAL_CSS = `
.${gPanelCssClass} {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    opacity: 0;
    visibility: hidden;
    transition: opacity .20s ease-in-out, visibility .20s ease-in-out;
}

.${gPanelCssClass}.${gShownCssClass} {
    opacity: 1;
    visibility: visible;
}

.panels-disabled .${gPanelCssClass}.${gShownCssClass} {
    opacity: 0;
    visibility: hidden;
}

.${gPanelCssClass} > div {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 30px;
    
    background-color: rgba(40, 40, 40, 0.8);
    border-radius: 15px;
    color: #ccc;
    font-family: sans-serif;
    font-size: 10pt;
    line-height: normal;
    margin: 20px 0;
    padding: 10px 30px;
    min-width: 200px;
}

.${gPanelCssClass} h1 {
    text-transform: uppercase;
    text-align: center;
    letter-spacing: .5px;
    font-size: 10pt;
    margin: 0 0 10px 0;
}

.${gPanelCssClass} .${gOptionsClass} {
    display: flex;
    justify-content: center;
}

.${gPanelCssClass} input[type=radio] {
    display: none;
}

.${gPanelCssClass} input[type=radio] + label {
    display: block;
    flex-grow: 1;
    flex-basis: 0;
    text-align: center;
    padding: 4px 16px;
    margin-left: 10px;
    border-radius: 3px;
    background-color: #44443A;
    white-space: nowrap;
    user-select: none;
    cursor: pointer;
}

.${gPanelCssClass} input[type=radio] + label.${gColorButtonClass} {
    flex-grow: 0;
    flex-basis: auto;
    width: 24px;
    height: 24px;
    padding: 0;
    border: solid 2px #ccc;
    border-radius: 999px;
    color: transparent;
    transition: color .20s ease-in-out;
}

.${gPanelCssClass} input[type=radio]:checked + label.${gColorButtonClass}::after {
    content: "✓";
    font-size: 20px;
}

.${gPanelCssClass} input[type=radio]:checked + label.${gColorButtonClass} {
    color: black;
}

.${gPanelCssClass} input[type=radio]:checked + label.${gColorButtonClass}.${gDarkColorButtonClass} {
    color: #ccc;
}

.${gPanelCssClass} input[type=radio] + label:first-of-type {
    margin-left: 0;
}

.${gPanelCssClass} input[type=radio]:enabled + label:hover {
    background-color: #66665A;
}

.${gPanelCssClass} input[type=radio]:disabled + label {
    color: #666;
}

.${gPanelCssClass} input[type=radio]:enabled:checked + label {
    color: #444;
    background-color: #ccc;
}

.${gPanelCssClass} .${gButtonsClass} {
    display: flex;
    margin-top: 20px;
}

.${gPanelCssClass} a {
    display: block;
    flex-grow: 1;
    flex-basis: 0;
    text-align: center;
    padding: 4px 16px;
    border-radius: 3px;
    margin-left: 10px;
    color: #ccc;
    background-color: #44443A;
    cursor: default;
}

.${gPanelCssClass} a:first-of-type {
    margin-left: 0;
}

.${gPanelCssClass} a.${gAcceptButtonCssClass} {
    font-weight: bold;
    color: #eee;
    background-color: ${gAcceptButtonColor};
}

.${gPanelCssClass} a.${gAcceptButtonCssClass}:hover {
    background-color: #338833;
}

.${gPanelCssClass} a.${gRebootButtonCssClass} {
    background-color: #D25F43;
}

.${gPanelCssClass} a:hover {
    background-color: #66665A;
}

.${gPanelCssClass} a.${gRebootButtonCssClass}:hover {
    background-color: #BD563C;
}

.${gScreenNodeCssClass} {
    /* Force the screen node to relative positioning. Hope that doesn't screw anything up. */
    position: relative;
}
`;

/**
 * An option in the settings screen, like a specific model or RAM amount.
 */
interface Option {
    label: string;
    value: any;
}

/**
 * A block of options that are mutually exclusive, like all the models.
 */
interface OptionBlock<T> {
    title: string;
    /**
     * Whether the option should be checked, based on this config.
     */
    isChecked: (value: T, config: Config) => boolean;
    /**
     * Return a modified config, given that this option was selected by the user.
     */
    updateConfig: (value: T, config: Config) => Config;
    options: Option[];
}

/**
 * An option that's currently displayed to the user.
 */
class DisplayedOption<T> {
    public readonly input: HTMLInputElement;
    public readonly block: OptionBlock<T>;
    public readonly option: Option;

    constructor(input: HTMLInputElement, block: OptionBlock<T>, option: Option) {
        this.input = input;
        this.block = block;
        this.option = option;
    }
}

/**
 * Our full configuration options.
 */
const HARDWARE_OPTION_BLOCKS: OptionBlock<any>[] = [
    {
        title: "Model",
        isChecked: (modelType: ModelType, config: Config) => modelType === config.modelType,
        updateConfig: (modelType: ModelType, config: Config) => config.edit().withModelType(modelType).build(),
        options: [
            {
                label: "Model I",
                value: ModelType.MODEL1,
            },
            {
                label: "Model III",
                value: ModelType.MODEL3,
            },
            {
                label: "Model 4",
                value: ModelType.MODEL4,
            },
        ]
    },
    {
        title: "Basic",
        isChecked: (basicLevel: BasicLevel, config: Config) => basicLevel === config.basicLevel,
        updateConfig: (basicLevel: BasicLevel, config: Config) => config.edit().withBasicLevel(basicLevel).build(),
        options: [
            {
                label: "Level 1",
                value: BasicLevel.LEVEL1,
            },
            {
                label: "Level 2",
                value: BasicLevel.LEVEL2,
            },
        ]
    },
    {
        title: "Characters",
        isChecked: (cgChip: CGChip, config: Config) => cgChip === config.cgChip,
        updateConfig: (cgChip: CGChip, config: Config) => config.edit().withCGChip(cgChip).build(),
        options: [
            {
                label: "Original",
                value: CGChip.ORIGINAL,
            },
            {
                label: "Lower Case",
                value: CGChip.LOWER_CASE,
            },
        ]
    },
    {
        title: "RAM",
        isChecked: (ramSize: RamSize, config: Config) => ramSize === config.ramSize,
        updateConfig: (ramSize: RamSize, config: Config) => config.edit().withRamSize(ramSize).build(),
        options: [
            {
                label: "4 kB",
                value: RamSize.RAM_4_KB,
            },
            {
                label: "16 kB",
                value: RamSize.RAM_16_KB,
            },
            {
                label: "32 kB",
                value: RamSize.RAM_32_KB,
            },
            {
                label: "48 kB",
                value: RamSize.RAM_48_KB,
            },
        ]
    },
];
const VIEW_OPTION_BLOCKS: OptionBlock<any>[] = [
    {
        title: "Display",
        isChecked: (displayType: DisplayType, config: Config) => displayType === config.displayType,
        updateConfig: (displayType: DisplayType, config: Config) => config.edit().withDisplayType(displayType).build(),
        options: [
            {
                label: "Simple",
                value: DisplayType.SIMPLE,
            },
            {
                label: "Authentic",
                value: DisplayType.AUTHENTIC,
            },
        ]
    },
    {
        title: "Phosphor",
        isChecked: (phosphor: Phosphor, config: Config) => phosphor === config.phosphor,
        updateConfig: (phosphor: Phosphor, config: Config) => config.edit().withPhosphor(phosphor).build(),
        options: [
            {
                label: "White",
                value: Phosphor.WHITE,
            },
            {
                label: "Green",
                value: Phosphor.GREEN,
            },
            {
                label: "Amber",
                value: Phosphor.AMBER,
            },
        ]
    },
    {
        title: "Reflection",
        isChecked: (reflection: boolean, config: Config) => reflection === config.reflection,
        updateConfig: (reflection: boolean, config: Config) => config.edit().withReflection(reflection).build(),
        options: [
            {
                label: "Off",
                value: false,
            },
            {
                label: "Use Camera",
                value: true,
            },
        ]
    },
    {
        title: "Design Grid",
        isChecked: (grid: boolean, config: Config) => grid === config.grid,
        updateConfig: (grid: boolean, config: Config) => config.edit().withGrid(grid).build(),
        options: [
            {
                label: "Hide",
                value: false,
            },
            {
                label: "Show",
                value: true,
            },
        ]
    },
];
const PRINTER_OPTION_BLOCKS: OptionBlock<any>[] = [
    {
        title: "Printer Model",
        isChecked: (printerModel: PrinterModel, config: Config) => printerModel === config.printerModel,
        updateConfig: (printerModel: PrinterModel, config: Config) => config.edit().withPrinterModel(printerModel).build(),
        options: [
            {
                label: "Epson MX-80",
                value: PrinterModel.EPSON_MX_80,
            },
            {
                label: "FP-215",
                value: PrinterModel.FP_215,
            },
        ]
    },
    {
        title: "Ink Color",
        isChecked: (inkColor: InkColor, config: Config) => inkColor === config.inkColor,
        updateConfig: (inkColor: InkColor, config: Config) => config.edit().withInkColor(inkColor).build(),
        options: [
            {
                label: rgbToCss(adjustColor(inkColorToRgb(InkColor.BLACK), 0.8)),
                value: InkColor.BLACK,
            },
            {
                label: rgbToCss(adjustColor(inkColorToRgb(InkColor.RED), 0.8)),
                value: InkColor.RED,
            },
            {
                label: rgbToCss(adjustColor(inkColorToRgb(InkColor.BLUE), 0.8)),
                value: InkColor.BLUE,
            },
            {
                // Cheat and use the green from the OK button so that the two greens don't clash.
                label: gAcceptButtonColor,
                value: InkColor.GREEN,
            },
        ]
    },
];

// Type of panel to show.
export enum PanelType {
    // Model, RAM, etc.
    HARDWARE,
    // Phosphor color, background, etc.
    VIEW,
    // Printer, plotter, etc.
    PRINTER,
}

// Get the right options blocks for the panel type.
function optionBlocksForPanelType(panelType: PanelType): OptionBlock<any>[] {
    switch (panelType) {
        case PanelType.HARDWARE:
        default:
            return HARDWARE_OPTION_BLOCKS;

        case PanelType.VIEW:
            return VIEW_OPTION_BLOCKS;

        case PanelType.PRINTER:
            return PRINTER_OPTION_BLOCKS;
    }
}

/**
 * Whether the given CSS color is dark.
 *
 * @param color an CSS color in the form "#rrggbb".
 */
function isDarkColor(color: string): boolean {
    if (!color.startsWith("#") || color.length !== 7) {
        throw new Error("isDarkColor: not a color (" + color + ")");
    }

    const red = parseInt(color.substring(1, 3), 16);
    const grn = parseInt(color.substring(3, 5), 16);
    const blu = parseInt(color.substring(5, 7), 16);
    const gray = red*0.3 + grn*0.6 + blu*0.1;

    return gray < 110;
}

let gRadioButtonCounter = 1;

/**
 * A full-screen control panel for configuring the emulator.
 */
export class SettingsPanel {
    private onOpen: (() => void) | undefined;
    private onClose: (() => void) | undefined;
    public readonly panelType: PanelType;
    private readonly trs80: Trs80;
    private readonly panelNode: HTMLElement;
    private readonly displayedOptions: DisplayedOption<any>[] = [];
    private readonly acceptButton: HTMLElement;

    constructor(screenNode: HTMLElement, trs80: Trs80, panelType: PanelType) {
        this.panelType = panelType;
        this.trs80 = trs80;

        // Make global CSS if necessary.
        SettingsPanel.configureStyle();

        screenNode.classList.add(gScreenNodeCssClass);

        this.panelNode = document.createElement("div");
        this.panelNode.classList.add(gPanelCssClass);
        screenNode.appendChild(this.panelNode);

        const div = document.createElement("div");
        this.panelNode.appendChild(div);

        for (const block of optionBlocksForPanelType(panelType)) {
            const name = gCssPrefix + "-" + gRadioButtonCounter++;

            const blockDiv = document.createElement("div");
            div.appendChild(blockDiv);

            const h1 = document.createElement("h1");
            h1.innerText = block.title;
            blockDiv.appendChild(h1);

            const optionsDiv = document.createElement("div");
            optionsDiv.classList.add(gOptionsClass);
            blockDiv.appendChild(optionsDiv);

            for (const option of block.options) {
                const id = gCssPrefix + "-" + gRadioButtonCounter++;

                const input = document.createElement("input");
                input.id = id;
                input.type = "radio";
                input.name = name;
                input.addEventListener("change", () => this.updateEnabledOptions());
                optionsDiv.appendChild(input);

                const label = document.createElement("label");
                label.htmlFor = id;
                if (option.label.startsWith("#")) {
                    // It's a color, show a swatch.
                    label.classList.add(gColorButtonClass);
                    label.style.backgroundColor = option.label;
                    if (isDarkColor(option.label)) {
                        label.classList.add(gDarkColorButtonClass);
                    }
                } else {
                    label.innerText = option.label;
                }
                optionsDiv.appendChild(label);

                this.displayedOptions.push(new DisplayedOption(input, block, option));
            }
        }

        const buttonsDiv = document.createElement("div");
        buttonsDiv.classList.add(gButtonsClass);
        div.appendChild(buttonsDiv);

        this.acceptButton = document.createElement("a");
        this.acceptButton.classList.add(gAcceptButtonCssClass);
        this.acceptButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.accept();
        });
        buttonsDiv.appendChild(this.acceptButton);
        this.configureAcceptButton(this.trs80.getConfig());

        const cancelButton = document.createElement("a");
        cancelButton.innerText = "Cancel";
        cancelButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.close();
        });
        buttonsDiv.appendChild(cancelButton);

        // Close panel on Esc.
        const body = document.querySelector("body") as HTMLBodyElement;
        body.addEventListener("keydown", event => {
            if (this.isOpen() && !event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey) {
                switch (event.key) {
                    case "Enter":
                        event.preventDefault();
                        this.accept();
                        break;

                    case "Escape":
                        event.preventDefault();
                        this.close();
                        break;
                }
            }
        });
    }

    /**
     * Open the settings panel.
     */
    public open(): void {
        if (this.onOpen !== undefined) {
            this.onOpen();
        }

        // Configure options.
        for (const displayedOption of this.displayedOptions) {
            displayedOption.input.checked = displayedOption.block.isChecked(displayedOption.option.value, this.trs80.getConfig());
        }
        this.updateEnabledOptions();

        this.panelNode.classList.add(gShownCssClass);
    }

    /**
     * Whether the panel is being shown.
     */
    public isOpen(): boolean {
        return this.panelNode.classList.contains(gShownCssClass);
    }

    /**
     * Add a function to call after the panel closes. Is called after already-registered functions.
     */
    public addOnOpen(onOpen: () => void): void {
        const oldOnOpen = this.onOpen;
        this.onOpen = () => {
            oldOnOpen?.();
            onOpen();
        };
    }

    /**
     * Add a function to call after the panel closes. Is called after already-registered functions.
     */
    public addOnClose(onClose: () => void): void {
        const oldOnClose = this.onClose;
        this.onClose = () => {
            oldOnClose?.();
            onClose();
        };
    }

    /**
     * Accept the changes, configure the machine, and close the dialog box.
     */
    private accept(): void {
        this.trs80.setConfig(this.getConfig());
        this.close();
    }

    /**
     * Close the settings panel.
     */
    private close(): void {
        this.panelNode.classList.remove(gShownCssClass);

        if (this.onClose !== undefined) {
            this.onClose();
        }
    }

    /**
     * Update which options are enabled based on the current selection.
     */
    private updateEnabledOptions(): void {
        const config = this.getConfig();
        for (const displayedOption of this.displayedOptions) {
            const enabled = displayedOption.block.updateConfig(displayedOption.option.value, config).isValid();
            displayedOption.input.disabled = !enabled;
        }

        this.configureAcceptButton(config);
    }

    /**
     * Set the accept button to be OK or Reboot.
     */
    private configureAcceptButton(config: Config) {
        if (config.needsReboot(this.trs80.getConfig())) {
            this.acceptButton.classList.add(gRebootButtonCssClass);
            this.acceptButton.innerText = "Reboot";
        } else {
            this.acceptButton.classList.remove(gRebootButtonCssClass);
            this.acceptButton.innerText = "OK";
        }
    }

    /**
     * Make a new config from the user's currently selected options.
     */
    private getConfig(): Config {
        let config = this.trs80.getConfig();

        for (const displayedOption of this.displayedOptions) {
            if (displayedOption.input.checked) {
                config = displayedOption.block.updateConfig(displayedOption.option.value, config);
            }
        }

        return config;
    }

    /**
     * Make a global stylesheet for all TRS-80 emulators on this page.
     */
    private static configureStyle(): void {
        const styleId = gCssPrefix;
        if (document.getElementById(styleId) !== null) {
            // Already created.
            return;
        }

        const node = document.createElement("style");
        node.id = styleId;
        node.innerHTML = GLOBAL_CSS;
        document.head.appendChild(node);
    }
}
