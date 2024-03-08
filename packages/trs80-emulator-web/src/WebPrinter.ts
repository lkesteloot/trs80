import {FlipCardSideAdapter} from "./FlipCard.js";
import {CanvasScreen} from "./CanvasScreen.js";
import {ControlPanel} from "./ControlPanel.js";
import {InkColor, LinePrinter, Printer, PrinterModel, Trs80} from "trs80-emulator";
import {addPrinterCssFontToPage, PRINTER_REGULAR_FONT_FAMILY} from "./PrinterFonts.js";
import {PanelType, SettingsPanel} from "./SettingsPanel.js";
import {Fp215, PenColor} from "fp-215";

// Holes on sides. See assets/README.md.
const BACKGROUND_LEFT_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAQAAACROWYpAAABH0lEQVQ4y+XUvU7DMBhG4cdJoECFQPwIRjbukAtlRowsIH6KgCZpbAZAIq1LUBYGPNrfsY/ez3YwYlyw49xlMQZG7VocC287YSyc7CrGwnNXf6ldrV3eNFHo1Np12nl4x7Hpp1Xn2a06oz3LwQdOtB40ksLE1Jkbz7/R3nPk0UwjSoLSzL5TC29DaW848OTeq1Yn6jRe3Hl12As3m/ZU60kjfZuLao8KW8vafTjY9LKEfuFzkyFtGfQj83pVu1op6rIwnfCzdrLolfTHYki7UWTxIGiG0q5RZuBS7F3T7JOMGtXKlqXKvJfFmrRbnerb6UGp0uh6Vdm0P/BCqZAkQUArLtX88CSj+IklKdu6gZ8kiaK4puv/9gP8E+0th9I7ord+FFKRmsMAAAAASUVORK5CYII=";
const BACKGROUND_RIGHT_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAQAAACROWYpAAABKklEQVQ4y+XUwU7cMBRG4S9OyoDQdFGKQGx4gz4eD9E3rFR1XyEhQCWaZGK7m6EicTIt0xXiLm0d6dj/vbe6qX3xTfvV6ytIfugOIBFw4eRQOFjLh8LJd5u3pt3s0f5gpZZ0+iWYC9GvyfnKubUaJE9utXPwnPbalexRJ6kcOXXtp7t/0T5xqXWvE2WV4NFHn0UPf9MOzrTudNLuJBoMkk9a2/2/fSy4f4FC1nuwdTqNaqq9spmgz/iTI9UYnjZJ0IkzueQysFI7zqLk8qbUHixVZRiHWmr3qvHL/qBhKl5qb6VdZ42rZro0Su1soynwoNFPM5gbyajXqF/I1xpx3CAs9XaU1YIs735gKJK3PJJJ2mFZXpr3fZskS5K0vCre4wL8T+3szPFh8G8+SIOIlEKP2QAAAABJRU5ErkJggg==";

// Amount of time to wait before we'll alert about activity again.
const MIN_ACTIVITY_CALLBACK_MS = 60*1000;

const BLACK_INK_COLOR: PenColor = [0, 0, 0];
const RED_INK_COLOR: PenColor = [200, 0, 0];
const BLUE_INK_COLOR: PenColor = [0, 0, 255];
const GREEN_INK_COLOR: PenColor = [0, 200, 0];

// Gets an RGB array (0-255) for an ink color.
export function inkColorToRgb(inkColor: InkColor): PenColor {
    switch (inkColor) {
        case InkColor.BLACK:
        default:
            return BLACK_INK_COLOR;

        case InkColor.RED:
            return RED_INK_COLOR;

        case InkColor.BLUE:
            return BLUE_INK_COLOR;

        case InkColor.GREEN:
            return GREEN_INK_COLOR;
    }
}

/**
 * A card side to show the output of the printer.
 */
export class WebPrinter extends FlipCardSideAdapter implements Printer {
    private readonly trs80: Trs80;
    private readonly node: HTMLElement;
    private readonly linePrinterPaper: HTMLElement;
    private readonly plotterPaper: HTMLCanvasElement;
    private readonly fp215: Fp215;
    private readonly linePrinter = new class extends LinePrinter {
        constructor(private readonly webPrinter: WebPrinter) {
            super();
        }

        printLine(line: string): void {
            // Pass on to outer class.
            this.webPrinter.printLine(line);
        }
    }(this);
    private activityCallback = () => {};
    private lastActivityCallback = 0;

    constructor(trs80: Trs80, screen: CanvasScreen) {
        super();

        this.trs80 = trs80;

        const width = screen.getWidth();
        const height = screen.getHeight();

        this.node = document.createElement("div");
        this.node.style.width = width + "px";
        this.node.style.height = height + "px";
        this.node.style.borderRadius = screen.getBorderRadius() + "px";
        this.node.style.backgroundColor = "#ddddd8";
        this.node.style.boxSizing = "border-box";
        this.node.style.display = "grid"; // For centering the children.

        this.linePrinterPaper = document.createElement("div");
        this.linePrinterPaper.style.width = "100%";
        this.linePrinterPaper.style.height = "100%";
        this.linePrinterPaper.style.padding = "20px 0";
        this.linePrinterPaper.style.fontFamily = `"${PRINTER_REGULAR_FONT_FAMILY}", monospace`;
        this.linePrinterPaper.style.fontSize = "12px"; // To get 80 chars across.
        this.linePrinterPaper.style.lineHeight = "1.5";
        this.linePrinterPaper.style.boxSizing = "border-box";
        this.linePrinterPaper.style.borderRadius = "inherit";
        this.linePrinterPaper.style.color = "#222";
        this.linePrinterPaper.style.overflowY = "scroll";
        this.linePrinterPaper.style.background = "local url(" + BACKGROUND_LEFT_URL + ") top left repeat-y, " +
            "local url(" + BACKGROUND_RIGHT_URL + ") top right repeat-y, #fffff8";

        this.plotterPaper = document.createElement("canvas");
        this.plotterPaper.style.maxWidth = "calc(100% - 40px)";
        this.plotterPaper.style.maxHeight = "calc(100% - 40px)";
        this.plotterPaper.style.margin = "auto"; // Center both directions because of grid parent.
        this.plotterPaper.style.background = "#fffff8";
        this.plotterPaper.style.boxShadow = "0 0 10px 5px rgb(0 0 0 / 5%)";
        this.plotterPaper.style.display = "none";

        this.fp215 = new Fp215(this.plotterPaper);

        this.node.append(this.linePrinterPaper, this.plotterPaper);

        const settingsPanel = new SettingsPanel(this.getNode(), trs80, PanelType.PRINTER);
        settingsPanel.addOnClose(() => {
            this.syncPrinterModel();
            this.syncPenColor();
        });

        const controlPanel = new ControlPanel(this.node);
        controlPanel.addCloseButton(() => this.hide());
        controlPanel.addSettingsButton(settingsPanel);
        controlPanel.addTrashButton(() => this.clearPrintout());

        this.syncPrinterModel();
        this.syncPenColor();
    }

    /**
     * The activity callback gets called when a line is printed, the card is not being shown,
     * and it's been a while since we called the callback.
     */
    public setActivityCallback(callback: () => void) {
        this.activityCallback = callback;
    }

    printChar(ch: number): void {
        // console.log("Printing \"" + String.fromCodePoint(ch) + "\" (" + ch + ")");

        // Call the activity callback.
        if ((ch === 10 || ch === 13) && !this.isShowing()) {
            const now = Date.now();
            if (now - this.lastActivityCallback > MIN_ACTIVITY_CALLBACK_MS) {
                this.lastActivityCallback = now;
                this.activityCallback();
            }
        }

        // Switch to line printer. (This is an FP-215 command to print text.)
        if ((ch === 17 || ch === 18) && this.trs80.getConfig().printerModel === PrinterModel.FP_215) {
            this.trs80.setConfig(this.trs80.getConfig()
                .edit()
                .withPrinterModel(PrinterModel.EPSON_MX_80)
                .build());
            this.syncPrinterModel();
        }
        // Switch to plotter. (This is an FP-215 command to switch to graphics mode.)
        if (ch === 19 && this.trs80.getConfig().printerModel === PrinterModel.EPSON_MX_80) {
            this.trs80.setConfig(this.trs80.getConfig()
                .edit()
                .withPrinterModel(PrinterModel.FP_215)
                .build());
            this.syncPrinterModel();
        }

        switch (this.trs80.getConfig().printerModel) {
            case PrinterModel.EPSON_MX_80:
                this.linePrinter.printChar(ch);
                break;

            case PrinterModel.FP_215:
                this.fp215.processByte(String.fromCodePoint(ch));
                break;
        }
    }

    printLine(line: string): void {
        // Figure out scroll space at the bottom:
        const bottomSpace = Math.abs(this.linePrinterPaper.scrollHeight - this.linePrinterPaper.scrollTop - this.linePrinterPaper.clientHeight);
        // There's some rounding, be sloppy:
        const wasAtBottom = bottomSpace < 1;

        // Add the new line.
        const lineNode = document.createElement("div");
        lineNode.style.padding = "0 40px";
        lineNode.style.whiteSpace = "pre-wrap";
        lineNode.style.minHeight = "1lh"; // For blank lines.
        lineNode.textContent = line;
        this.linePrinterPaper.append(lineNode);

        if (wasAtBottom) {
            // Stay scrolled at the bottom.
            this.linePrinterPaper.scrollTop = this.linePrinterPaper.scrollHeight;
        }
    }

    public show() {
        addPrinterCssFontToPage();
        super.show();
    }

    private clearPrintout() {
        this.linePrinterPaper.replaceChildren();
        this.fp215.newPaper();
    }

    save() {
        // Could save printer output.
        return undefined;
    }

    restore(state: any): void {
        // Nothing to do.
    }

    getNode(): HTMLElement {
        return this.node;
    }

    /**
     * Show the correct DOM element for the current printer.
     */
    private syncPrinterModel(): void {
        const printerModel = this.trs80.getConfig().printerModel;
        const isPlotter = printerModel === PrinterModel.FP_215;

        if (isPlotter) {
            this.linePrinterPaper.style.display = "none";
            this.plotterPaper.style.display = "block";
        } else {
            this.linePrinterPaper.style.display = "block";
            this.plotterPaper.style.display = "none";
        }
    }

    /**
     * Update the FP-215 with the current pen color.
     */
    private syncPenColor(): void {
        this.fp215.setPenColor(inkColorToRgb(this.trs80.getConfig().inkColor));
    }
}
