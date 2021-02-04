
import {CSS_PREFIX} from "./Utils";
import {PanelType, SettingsPanel} from "./SettingsPanel";
import {Mutable} from "./Mutable";

const gCssPrefix = CSS_PREFIX + "-control-panel";
const gScreenNodeCssClass = gCssPrefix + "-screen-node";
const gPanelCssClass = gCssPrefix + "-panel";
const gButtonCssClass = gCssPrefix + "-button";
const gButtonHiddenCssClass = gCssPrefix + "-button-hidden";
const gShowingOtherPanelCssClass = gCssPrefix + "-showing-other-panel";

// https://thenounproject.com/search/?q=reset&i=3012384
const RESET_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 100 100" xml:space="preserve">
    <switch>
        <g fill="white">
            <path d="M5273.1,2400.1v-2c0-2.8-5-4-9.7-4s-9.7,1.3-9.7,4v2c0,1.8,0.7,3.6,2,4.9l5,4.9c0.3,0.3,0.4,0.6,0.4,1v6.4     c0,0.4,0.2,0.7,0.6,0.8l2.9,0.9c0.5,0.1,1-0.2,1-0.8v-7.2c0-0.4,0.2-0.7,0.4-1l5.1-5C5272.4,2403.7,5273.1,2401.9,5273.1,2400.1z      M5263.4,2400c-4.8,0-7.4-1.3-7.5-1.8v0c0.1-0.5,2.7-1.8,7.5-1.8c4.8,0,7.3,1.3,7.5,1.8C5270.7,2398.7,5268.2,2400,5263.4,2400z"/>
            <path d="M5268.4,2410.3c-0.6,0-1,0.4-1,1c0,0.6,0.4,1,1,1h4.3c0.6,0,1-0.4,1-1c0-0.6-0.4-1-1-1H5268.4z"/>
            <path d="M5272.7,2413.7h-4.3c-0.6,0-1,0.4-1,1c0,0.6,0.4,1,1,1h4.3c0.6,0,1-0.4,1-1C5273.7,2414.1,5273.3,2413.7,5272.7,2413.7z"/>
            <path d="M5272.7,2417h-4.3c-0.6,0-1,0.4-1,1c0,0.6,0.4,1,1,1h4.3c0.6,0,1-0.4,1-1C5273.7,2417.5,5273.3,2417,5272.7,2417z"/>
            <path d="M84.3,18C67.1,0.8,39.5,0.4,21.8,16.5l-4.1-4.1c-1.6-1.6-4-2.2-6.2-1.6c-2.2,0.7-3.9,2.5-4.3,4.7L2.6,36.9    c-0.4,2.1,0.2,4.2,1.7,5.7c1.5,1.5,3.6,2.1,5.7,1.7l21.4-4.5c1.2-0.3,2.3-0.9,3.1-1.7c0.7-0.7,1.3-1.6,1.6-2.6    c0.6-2.2,0-4.6-1.6-6.2l-3.9-3.9C43.5,14,63.1,14.5,75.4,26.8c12.8,12.8,12.8,33.6,0,46.4C62.6,86,41.8,86,29,73.2    c-4.1-4.1-7-9.2-8.5-14.8c-0.9-3.3-4.3-5.3-7.6-4.4c-3.3,0.9-5.3,4.3-4.4,7.6c2,7.7,6.1,14.8,11.8,20.4    c17.7,17.7,46.4,17.7,64.1,0C101.9,64.4,101.9,35.6,84.3,18z"/>
        </g>
    </switch>
</svg>
`;

// https://thenounproject.com/search/?q=camera&i=1841396
const CAMERA_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 100 100">
    <g fill="white">
        <circle cx="50" cy="55.4" r="13.8"/>
        <path d="M80.6,25.4H67.1l-1.8-7.2c-0.5-2.1-2.5-3.6-4.7-3.6H39.3c-2.2,0-4.1,1.5-4.7,3.6l-1.8,7.2H19.4C11.5,25.4,5,31.9,5,39.8V71   c0,7.9,6.5,14.4,14.4,14.4h61.2C88.5,85.4,95,78.9,95,71V39.8C95,31.9,88.5,25.4,80.6,25.4z M50,76.4c-11.6,0-21-9.4-21-21   s9.4-21,21-21s21,9.4,21,21S61.6,76.4,50,76.4z M81.4,40.3c-2,0-3.6-1.6-3.6-3.6c0-2,1.6-3.6,3.6-3.6s3.6,1.6,3.6,3.6   C85,38.7,83.4,40.3,81.4,40.3z"/>
    </g>
</svg>
`;

// https://thenounproject.com/search/?q=previous%20track&i=658409
const PREVIOUS_TRACK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -2 16 21" version="1.1">
    <g fill="white" fill-rule="evenodd">
        <g transform="translate(-320.000000, -618.000000)">
            <path d="M330,628.032958 L330,634.00004 C330,634.545291 330.45191,635 331.009369,635 L332.990631,635 C333.556647,635 334,634.552303 334,634.00004 L334,618.99996 C334,618.454709 333.54809,618 332.990631,618 L331.009369,618 C330.443353,618 330,618.447697 330,618.99996 L330,624.967057 C329.894605,624.850473 329.775773,624.739153 329.643504,624.634441 L322.356496,618.865559 C321.054403,617.834736 320,618.3432 320,620.000122 L320,632.999878 C320,634.663957 321.055039,635.164761 322.356496,634.134441 L329.643504,628.365559 C329.775779,628.260841 329.894611,628.149527 330,628.032958 Z" transform="translate(327.000000, 626.500000) scale(-1, 1) translate(-327.000000, -626.500000) "/>
        </g>
    </g>
</svg>
`;

// https://thenounproject.com/search/?q=settings&i=3593545
const HARDWARE_SETTINGS_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="7 7 121 121" version="1.1">
    <g fill="white" transform="translate(0,-161.53332)">
        <path d="m 61.57997,173.33818 c -1.653804,0 -3.159177,0.77847 -4.132553,1.85984 -0.973402,1.08136 -1.513575,2.40442 -1.771491,3.76721 a 2.1609049,2.1609049 0 0 0 0,0.002 l -1.654678,8.74831 c -2.047981,0.67947 -4.038494,1.50768 -5.964476,2.48047 l -7.367508,-5.02347 c -1.145302,-0.78076 -2.462953,-1.33572 -3.916045,-1.41232 -1.4546,-0.0764 -3.068029,0.44118 -4.235926,1.60921 l -8.699209,8.69921 c -1.169405,1.16909 -1.685211,2.78351 -1.609725,4.23643 0.07501,1.45291 0.629259,2.7738 1.410256,3.92018 l 5.001762,7.336 c -0.9702,1.93582 -1.794192,3.93628 -2.468589,5.99392 l -8.740034,1.65417 c -1.362789,0.25787 -2.688378,0.79815 -3.769783,1.77147 -1.081405,0.97346 -1.859333,2.4815 -1.859333,4.13526 v 12.30262 c 0,1.65378 0.777928,3.1592 1.859333,4.13255 1.081405,0.97338 2.406994,1.51567 3.769783,1.77353 l 8.754004,1.6583 c 0.679477,2.04603 1.506088,4.03461 2.478379,5.95882 l -5.025522,7.3675 c -0.781606,1.14644 -1.334744,2.4664 -1.410256,3.91967 -0.07498,1.45325 0.439817,3.06745 1.609725,4.23643 l 8.699209,8.69921 c 1.1693,1.16941 2.782914,1.68325 4.235926,1.60713 1.452986,-0.0761 2.771908,-0.63037 3.918109,-1.41179 l 7.33597,-5.00022 c 1.9363,0.97001 3.937926,1.79294 5.996014,2.46702 l 1.654175,8.74004 c 0.257889,1.36284 0.798486,2.68843 1.771994,3.76981 0.973402,1.08138 2.478749,1.8593 4.132553,1.8593 H 73.88672 c 1.653805,0 3.159152,-0.77792 4.132554,-1.8593 0.973005,-1.0809 1.513999,-2.40554 1.771994,-3.76772 v -0.003 l 1.656212,-8.74778 c 2.048113,-0.67943 4.038415,-1.50768 5.964502,-2.48047 l 7.365445,5.02142 c 1.146095,0.78144 2.465096,1.33567 3.918108,1.41179 1.452905,0.0761 3.068585,-0.43786 4.237995,-1.60713 l 8.6992,-8.69921 c 1.16931,-1.16946 1.68395,-2.78551 1.60767,-4.23852 -0.076,-1.45301 -0.63074,-2.77196 -1.41232,-3.91811 l -5.00177,-7.33547 c 0.9705,-1.93617 1.79398,-3.93639 2.46857,-5.99445 l 8.74003,-1.65418 c 1.36271,-0.25794 2.68841,-0.80018 3.76981,-1.77352 1.0813,-0.97335 1.85931,-2.47881 1.85931,-4.13256 v -12.30312 c 0,-1.65378 -0.77801,-3.16127 -1.85931,-4.13465 -1.0809,-0.97292 -2.40562,-1.51344 -3.76772,-1.77146 l -8.74988,-1.65624 c -0.67918,-2.04684 -1.50825,-4.03585 -2.48046,-5.96088 l 5.02348,-7.36698 c 0.78118,-1.14583 1.33572,-2.46501 1.41232,-3.91811 0.077,-1.45309 -0.43952,-3.06905 -1.60973,-4.2385 l -8.69714,-8.69921 c -1.16962,-1.16891 -2.78461,-1.68557 -4.238494,-1.6092 -1.4528,0.0768 -2.770425,0.63186 -3.915542,1.41232 l -7.33597,5.00176 c -1.9363,-0.96998 -3.937926,-1.79297 -5.996014,-2.46703 l -1.656768,-8.74211 c -0.257783,-1.36269 -0.798062,-2.68582 -1.771464,-3.76721 -0.973297,-1.0814 -2.478749,-1.85984 -4.132554,-1.85984 z m 6.152595,34.74051 c 11.726704,0 21.185664,9.46065 21.185267,21.18735 0,11.7262 -9.459066,21.18696 -21.185267,21.18733 -11.726704,0 -21.187463,-9.4606 -21.18786,-21.18733 0,-11.72726 9.460653,-21.18772 21.18786,-21.18735 z"/>
    </g>
</svg>
`;

// https://thenounproject.com/search/?q=view&i=485540
const VIEW_SETTINGS_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="20 20 60 60">
    <g fill="white">
        <path d="M80,48.6c-7.8-10.4-18.4-16.7-30-16.7c-11.6,0-22.2,6.4-30,16.7c-0.6,0.9-0.6,2,0,2.9c7.8,10.4,18.4,16.7,30,16.7  s22.2-6.4,30-16.7C80.7,50.6,80.7,49.4,80,48.6z M62.8,50.8c-0.4,6.4-5.6,11.6-12,12c-7.7,0.5-14.1-5.9-13.6-13.6  c0.4-6.4,5.6-11.6,12-12C56.9,36.7,63.3,43.1,62.8,50.8z M56.9,50.4c-0.2,3.4-3,6.2-6.4,6.4c-4.2,0.3-7.6-3.2-7.3-7.3  c0.2-3.4,3-6.2,6.4-6.4C53.7,42.8,57.2,46.3,56.9,50.4z"/>
    </g>
</svg>
`;

// https://thenounproject.com/search/?q=edit&i=1072354
const EDIT_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-25 -25 562 562">
    <g fill="white">
        <path d="M318.37,85.45L422.53,190.11,158.89,455,54.79,350.38ZM501.56,60.2L455.11,13.53a45.93,45.93,0,0,0-65.11,0L345.51,58.24,449.66,162.9l51.9-52.15A35.8,35.8,0,0,0,501.56,60.2ZM0.29,497.49a11.88,11.88,0,0,0,14.34,14.17l116.06-28.28L26.59,378.72Z"/>
    </g>
</svg>
`;

// https://thenounproject.com/search/?q=checkmark&i=1409439
const CHECK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <g fill="white">
        <line x1="19.713" y1="55.055" x2="33.258" y2="68.6"/>
        <path d="M92.059,19.7c-2.733-2.733-7.165-2.734-9.9,0L33.258,68.6L17.841,53.183c-2.734-2.732-7.166-2.733-9.899,0.001   c-2.734,2.733-2.734,7.165,0,9.899l20.367,20.366c1.367,1.366,3.158,2.05,4.95,2.05s3.583-0.684,4.95-2.05l53.85-53.85   C94.792,26.866,94.792,22.434,92.059,19.7z"/>
    </g>
</svg>

`;

// https://thenounproject.com/search/?q=close&i=1609004
const CROSS_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="-5 -5 110 110">
    <style type="text/css">
        .st0 {
            fill-rule: evenodd;
            clip-rule: evenodd;
        }
    </style>
    <path fill="white" class="st0" d="M61.2,50.5l32.1,32.1c3,3,3,7.7,0,10.7c-3,3-7.7,3-10.7,0L50.5,61.2L18.4,93.3c-3,3-7.7,3-10.7,0  c-3-3-3-7.7,0-10.7l32.1-32.1L7.7,18.4c-3-3-3-7.7,0-10.7s7.7-3,10.7,0l32.1,32.1L82.6,7.7c3-3,7.7-3,10.7,0c3,3,3,7.7,0,10.7  L61.2,50.5z"/>
</svg>
`;

// https://thenounproject.com/term/mute/1915537
const MUTED_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" viewBox="-100 0 1024 1024">
    <path fill="white" d="M 706,852.3 V 781 c -6.7,-6.6 -13.3,-13.3 -20,-19.9 -6.7,-6.6 -13.3,-13.3 -20,-19.9 -2.3,-2.2 -4.5,-4.5 -6.8,-6.7 L 469,545.2 c -61.6,-61.3 -123.3,-122.6 -184.9,-184 -1.6,-1.6 -3.3,-3.2 -4.9,-4.9 -5.2,-5.1 -10.3,-10.2 -15.5,-15.4 -6.7,-6.7 -13.4,-13 -20.1,-20 H 90 c -10.8,0 -20,9.1 -20,20 v 299.9 c 0,13.8 -0.4,27.7 0,41.5 v 0.6 c 0,10.8 9.2,20 20,20 h 214.7 c 22,19 44,37.6 66,56.3 46.5,39.8 93.1,79.5 139.6,119.3 29.3,25 58.7,50.1 88,75.2 22.8,19.5 58,30.7 83.1,9.3 17.3,-14.7 23.1,-40.3 24.5,-62 1,-16 0.1,-32.5 0.1,-48.7 z"/>
    <path fill="white" d="m 694.3,70.7 c -8,-11.7 -19.6,-19.1 -33.6,-21 -16.8,-2.3 -34.9,2.8 -49.5,11.3 -5.1,2.9 -9.6,7.5 -14,11.3 -10.3,8.8 -20.7,17.6 -31,26.4 -33.9,28.9 -67.8,57.7 -101.7,86.5 -23.5,19.9 -47,39.8 -70.4,59.8 4.7,4.7 9.4,9.4 14.2,14.1 4.7,4.7 9.4,9.4 14.2,14.1 6.5,6.5 13,13 19.6,19.5 63.4,63.1 126.8,126.1 190.1,189.2 11.3,11.2 22.6,22.5 33.8,33.7 6.7,6.6 13.3,13.3 20,19.9 6.7,6.6 13.3,13.3 20,19.9 V 119 c -0.1,-16.3 -2.2,-34.5 -11.7,-48.3 z"/>
    <path stroke="white" stroke-width="80.1" stroke-linecap="round" d="M 139.75018,103.02184 934.53553,895.07339"/>
</svg>
`;

// https://thenounproject.com/term/mute/1915537 (modified by me to get rid of line).
const UNMUTED_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" viewBox="-100 0 1024 1024">
    <path fill="white" d="M 88.65873,702.7619 304.7,702.9 605.71429,960 c 40.51022,32.06833 100.31746,5.28523 100.31746,-46.98413 l -0.41421,-806.94435 c 0,-57.136329 -64.88295,-70.781271 -94.96826,-45.714278 L 304.7,320.8616 93.968254,321.01984 c -14.687138,0 -23.396825,7.42695 -23.396825,21.27778 l -0.08532,344.06151 c 0,7.13959 8.057136,16.40277 18.172619,16.40277 z"/>
</svg>
`;

const GLOBAL_CSS = `
.${gPanelCssClass} {
    background-color: rgba(40, 40, 40, 0.8);
    position: absolute;
    right: 10px;
    top: 10px;
    border-radius: 5px;
    opacity: 0;
    transition: opacity .20s ease-in-out;
}

.${gScreenNodeCssClass} {
    /* Force the screen node to relative positioning. Hope that doesn't screw anything up. */
    position: relative;
}

.${gScreenNodeCssClass}:hover .${gPanelCssClass} {
    opacity: 1;
}

/* Hide the control panel if any other panel is showing (like settings). */
.${gScreenNodeCssClass}.${gShowingOtherPanelCssClass}:hover .${gPanelCssClass} {
    opacity: 0;
}

.${gButtonCssClass} {
    display: block;
    /* background-color: red; */
    margin: 15px;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity .05s ease-in-out, transform 0.05s ease-in-out;
}

.${gButtonCssClass}:hover {
    opacity: 1;
}

.${gButtonCssClass}:active {
    transform: scale(1.15);
}

.${gButtonCssClass}.${gButtonHiddenCssClass} {
    display: none;
}

`;

/**
 * Control panel that hovers in the screen for doing things like resetting the computer.
 */
export class ControlPanel {
    private readonly screenNode: HTMLElement;
    private readonly panelNode: HTMLElement;

    /**
     * @param screenNode the node from the Trs80Screen object's getNode() method.
     */
    constructor(screenNode: HTMLElement) {
        // Make global CSS if necessary.
        ControlPanel.configureStyle();

        this.screenNode = screenNode;
        screenNode.classList.add(gScreenNodeCssClass);

        this.panelNode = document.createElement("div");
        this.panelNode.classList.add(gPanelCssClass);
        screenNode.appendChild(this.panelNode);
    }

    /**
     * Generic function to add a button to the control panel.
     */
    private addButton(iconSvg: string, title: string, callback?: () => void): HTMLElement {
        let icon = document.createElement("img");
        icon.classList.add(gButtonCssClass);
        icon.width = 30;
        icon.height = 30;
        icon.src = "data:image/svg+xml;base64," + btoa(iconSvg);
        icon.title = title;
        if (callback !== undefined) {
            icon.addEventListener("click", callback);
        }
        this.panelNode.append(icon);
        return icon;
    }

    /**
     * Add a reset button.
     */
    public addResetButton(callback: () => void) {
        this.addButton(RESET_ICON, "Reboot the computer", callback);
    }

    /**
     * Add a screenshot button.
     */
    public addScreenshotButton(callback: () => void) {
        this.addButton(CAMERA_ICON, "Take a screenshot", callback);
    }

    /**
     * Add a tape rewind button.
     */
    public addTapeRewindButton(callback: () => void) {
        this.addButton(PREVIOUS_TRACK_ICON, "Rewind the cassette", callback);
    }

    /**
     * Add a settings button.
     */
    public addSettingsButton(settingsPanel: SettingsPanel) {
        settingsPanel.onOpen = () => this.screenNode.classList.add(gShowingOtherPanelCssClass);
        settingsPanel.onClose = () => this.screenNode.classList.remove(gShowingOtherPanelCssClass);

        let iconSvg: string;
        switch (settingsPanel.panelType) {
            case PanelType.HARDWARE:
            default:
                iconSvg = HARDWARE_SETTINGS_ICON;
                break;
            case PanelType.VIEW:
                iconSvg = VIEW_SETTINGS_ICON;
                break;
        }


        let icon = document.createElement("img");
        icon.classList.add(gButtonCssClass);
        icon.src = "data:image/svg+xml;base64," + btoa(iconSvg);
        icon.title = "Show the settings panel";
        icon.addEventListener("click", () => settingsPanel.open());
        this.panelNode.appendChild(icon);
    }

    /**
     * Add a button to edit the program.
     */
    public addEditorButton(callback: () => void): void {
        this.addButton(EDIT_ICON, "Edit the program (Ctrl-Enter)", callback);
    }

    /**
     * Add button to toggle mute.
     */
    public addMuteButton(mutable: Mutable): void {
        const mutedButton = this.addButton(MUTED_ICON, "Unmute");
        const unmutedButton = this.addButton(UNMUTED_ICON, "Mute");

        const updateVisibility = () => {
            const isMuted = mutable.isMuted();
            mutedButton.classList.toggle(gButtonHiddenCssClass, !isMuted);
            unmutedButton.classList.toggle(gButtonHiddenCssClass, isMuted);
        };

        mutedButton.addEventListener("click", () => {
            mutable.unmute();
            updateVisibility();
        });
        unmutedButton.addEventListener("click", () => {
            mutable.mute();
            updateVisibility();
        });

        updateVisibility();
    }

    /**
     * Add a button to save.
     */
    public addSaveButton(callback: () => void): void {
        this.addButton(CHECK_ICON, "Save (Ctrl-Enter)", callback);
    }

    /**
     * Add a button to cancel.
     */
    public addCancelButton(callback: () => void): void {
        this.addButton(CROSS_ICON, "Cancel", callback);
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
