import {CSS_PREFIX} from "./Utils";
import {BasicLevel, CGChip, Config, ModelType, Phosphor, RamSize} from "./Config";
import {Trs80} from "./Trs80";

const gCssPrefix = CSS_PREFIX + "-settings-panel";
const gScreenNodeCssClass = gCssPrefix + "-screen-node";
const gPanelCssClass = gCssPrefix + "-panel";
const gShownCssClass = gCssPrefix + "-shown";
const gAcceptButtonCssClass = gCssPrefix + "-accept";
const gRebootButtonCssClass = gCssPrefix + "-reboot";
const gOptionsClass = gCssPrefix + "-options";
const gButtonsClass = gCssPrefix + "-buttons";

const GLOBAL_CSS = `
.${gPanelCssClass} {
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

.${gPanelCssClass} > div {
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

.${gPanelCssClass}.${gShownCssClass} {
    opacity: 1;
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
    background-color: #449944;
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
interface OptionBlock {
    title: string;
    /**
     * Whether the option should be checked, based on this config.
     */
    isChecked: (value: any, config: Config) => boolean;
    /**
     * Return a modified config, given that this option was selected by the user.
     */
    updateConfig: (value: any, config: Config) => Config;
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
        updateConfig: (modelType: ModelType, config: Config) => config.withModelType(modelType),
        options: [
            {
                label: "Model I",
                value: ModelType.MODEL1,
            },
            {
                label: "Model III",
                value: ModelType.MODEL3,
            },
        ]
    },
    {
        title: "Basic",
        isChecked: (basicLevel: BasicLevel, config: Config) => basicLevel === config.basicLevel,
        updateConfig: (basicLevel: BasicLevel, config: Config) => config.withBasicLevel(basicLevel),
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
        updateConfig: (cgChip: CGChip, config: Config) => config.withCGChip(cgChip),
        options: [
            {
                label: "Original",
                value: CGChip.ORIGINAL,
            },
            {
                label: "Lower case",
                value: CGChip.LOWER_CASE,
            },
        ]
    },
    {
        title: "RAM",
        isChecked: (ramSize: RamSize, config: Config) => ramSize === config.ramSize,
        updateConfig: (ramSize: RamSize, config: Config) => config.withRamSize(ramSize),
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
    {
        title: "Phosphor",
        isChecked: (phosphor: Phosphor, config: Config) => phosphor === config.phosphor,
        updateConfig: (phosphor: Phosphor, config: Config) => config.withPhosphor(phosphor),
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
];

let gRadioButtonCounter = 1;

/**
 * A full-screen control panel for configuring the emulator.
 */
export class SettingsPanel {
    public onOpen: (() => void) | undefined;
    public onClose: (() => void) | undefined;
    private readonly trs80: Trs80;
    private readonly panelNode: HTMLElement;
    private readonly displayedOptions: DisplayedOption[] = [];
    private readonly acceptButton: HTMLElement;

    constructor(screenNode: HTMLElement, trs80: Trs80) {
        this.trs80 = trs80;

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
                label.innerText = option.label;
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
        // Any config works here, we override it below.
        let config = Config.makeDefault();

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
