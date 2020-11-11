
import {CSS_PREFIX} from "./Utils";

const gCssPrefix = CSS_PREFIX + "-settings-panel";
const gScreenNodeCssClass = gCssPrefix + "-screen-node";
const gPanelCssClass = gCssPrefix + "-panel";
const gShownCssClass = gCssPrefix + "-shown";
const gRebootButtonCssClass = gCssPrefix + "-reboot";

const GLOBAL_CSS = `
.` + gPanelCssClass + ` {
    display: flex;
    align-items: stretch;
    justify-content: center;
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    opacity: 0;
    transition: opacity .20s ease-in-out;
}

.` + gPanelCssClass + ` > div {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    
    background-color: rgba(0, 0, 0, 0.6);
    border-radius: 15px;
    color: #ccc;
    font-family: sans-serif;
    font-size: 10pt;
    line-height: normal;
    margin: 20px 0;
    padding: 10px 30px;
}

.` + gPanelCssClass + `.` + gShownCssClass + ` {
    opacity: 1;
}

.` + gPanelCssClass + ` h1 {
    text-transform: uppercase;
    text-align: center;
    letter-spacing: 1px;
    font-size: 10pt;
    margin: 0 0 10px 0;
}

.` + gPanelCssClass + ` input[type=radio] {
    display: none;
}

.` + gPanelCssClass + ` input[type=radio] + label {
    display: block;
    text-align: center;
    padding: 4px 16px;
    border-radius: 3px;
    margin: 5px 0;
    background-color: #44443A;
}

.` + gPanelCssClass + ` input[type=radio]:enabled + label:hover {
    background-color: #66665A;
}

.` + gPanelCssClass + ` input[type=radio]:disabled + label {
    color: #666;
}

.` + gPanelCssClass + ` input[type=radio]:enabled:checked + label {
    color: #444;
    background-color: #ccc;
}

.` + gPanelCssClass + ` a {
    display: block;
    text-align: center;
    padding: 4px 16px;
    border-radius: 3px;
    margin: 5px 0;
    color: #ccc;
    background-color: #44443A;
    cursor: default;
}

.` + gPanelCssClass + ` a.` + gRebootButtonCssClass + ` {
    background-color: #D25F43;
    color: #eee;
    font-weight: bold;
}

.` + gPanelCssClass + ` a:hover {
    background-color: #66665A;
}

.` + gPanelCssClass + ` a.` + gRebootButtonCssClass + `:hover {
    background-color: #BD563C;
}

.` + gScreenNodeCssClass + ` {
    /* Force the screen node to relative positioning. Hope that doesn't screw anything up. */
    position: relative;
}
`;

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
class Config {
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
}

let gOfficialConfig: Config = new Config(ModelType.MODEL3, RamSize.RAM_48_KB);

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
interface OptionBlock {
    title: string;
    /**
     * Whether the option should be checked, based on this config.
     */
    isChecked: (value: any, config: Config) => boolean;
    /**
     * Whether the option should be enabled, based on this config.
     */
    isEnabled: (value: any, config: Config) => boolean;
    /**
     * Return a modified config, given that this option was selected by the user.
     */
    onSelect: (value: any, config: Config) => Config;
    options: Option[];
}

/**
 * An option that's currently displayed to the user.
 */
class DisplayedOption {
    public readonly input: HTMLInputElement;
    public readonly block: OptionBlock;
    public readonly option: Option;

    constructor(input: HTMLInputElement, block: OptionBlock, option: Option) {
        this.input = input;
        this.block = block;
        this.option = option;
    }
}

/**
 * Our full configuration options.
 */
const OPTION_BLOCKS: OptionBlock[] = [
    {
        title: "Model",
        isChecked: (modelType: ModelType, config: Config) => modelType === config.modelType,
        isEnabled: (modelType: ModelType, config: Config) => modelType === ModelType.MODEL1_LEVEL1 || config.ramSize !== RamSize.RAM_4_KB,
        onSelect: (modelType: ModelType, config: Config) => config.withModelType(modelType),
        options: [
            {
                label: "Model I (Level 1)",
                value: ModelType.MODEL1_LEVEL1,
            },
            {
                label: "Model I (Level 2)",
                value: ModelType.MODEL1_LEVEL2,
            },
            {
                label: "Model III",
                value: ModelType.MODEL3,
            },
        ]
    },
    {
        title: "RAM",
        isChecked: (ramSize: RamSize, config: Config) => ramSize === config.ramSize,
        isEnabled: (ramSize: RamSize, config: Config) => ramSize !== RamSize.RAM_4_KB || config.modelType === ModelType.MODEL1_LEVEL1,
        onSelect: (ramSize: RamSize, config: Config) => config.withRamSize(ramSize),
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

let gRadioButtonCounter = 1;

/**
 * A full-screen control panel for configuring the emulator.
 */
export class SettingsPanel {
    public onOpen: (() => void) | undefined;
    public onClose: (() => void) | undefined;
    private readonly panelNode: HTMLElement;
    private readonly displayedOptions: DisplayedOption[] = [];

    constructor(screenNode: HTMLElement) {
        // Make global CSS if necessary.
        SettingsPanel.configureStyle();

        screenNode.classList.add(gScreenNodeCssClass);

        this.panelNode = document.createElement("div");
        this.panelNode.classList.add(gPanelCssClass);
        screenNode.appendChild(this.panelNode);

        const div = document.createElement("div");
        this.panelNode.appendChild(div);

        for (const block of OPTION_BLOCKS) {
            const name = gCssPrefix + "-" + gRadioButtonCounter++;

            const blockDiv = document.createElement("div");
            div.appendChild(blockDiv);

            const h1 = document.createElement("h1");
            h1.innerText = block.title;
            blockDiv.appendChild(h1);

            for (const option of block.options) {
                const id = gCssPrefix + "-" + gRadioButtonCounter++;

                const input = document.createElement("input");
                input.id = id;
                input.type = "radio";
                input.name = name;
                input.addEventListener("change", () => this.updateEnabledOptions());
                blockDiv.appendChild(input);

                const label = document.createElement("label");
                label.htmlFor = id;
                label.innerText = option.label;
                blockDiv.appendChild(label);

                this.displayedOptions.push(new DisplayedOption(input, block, option));
            }
        }

        const buttonDiv = document.createElement("div");
        div.appendChild(buttonDiv);

        const rebootButton = document.createElement("a");
        rebootButton.classList.add(gRebootButtonCssClass);
        rebootButton.innerText = "Reboot";
        rebootButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.reboot();
        });
        buttonDiv.appendChild(rebootButton);

        const cancelButton = document.createElement("a");
        cancelButton.innerText = "Cancel";
        cancelButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.close();
        });
        buttonDiv.appendChild(cancelButton);
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
            displayedOption.input.checked = displayedOption.block.isChecked(displayedOption.option.value, gOfficialConfig);
        }
        this.updateEnabledOptions();

        this.panelNode.classList.add(gShownCssClass);
    }

    /**
     * Reboot the machine (and close the dialog box).
     */
    private reboot(): void {
        gOfficialConfig = this.getConfig();
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
            const enabled = displayedOption.block.isEnabled(displayedOption.option.value, config);
            displayedOption.input.disabled = !enabled;
        }
    }

    /**
     * Make a new config from the user's currently selected options.
     */
    private getConfig(): Config {
        let config = gOfficialConfig;

        for (const displayedOption of this.displayedOptions) {
            if (displayedOption.input.checked) {
                config = displayedOption.block.onSelect(displayedOption.option.value, config);
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
