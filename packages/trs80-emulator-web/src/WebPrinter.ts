import {FlipCardSideAdapter} from "./FlipCard.js";
import {CanvasScreen} from "./CanvasScreen.js";
import {ControlPanel} from "./ControlPanel.js";
import {LinePrinter, Printer } from "trs80-emulator";
import {addPrinterCssFontToPage, PRINTER_REGULAR_FONT_FAMILY} from "./PrinterFonts";

/**
 * A card side to show the output of the printer.
 */
export class WebPrinter extends FlipCardSideAdapter implements Printer {
    private readonly node: HTMLElement;
    private readonly paper: HTMLElement;
    private readonly linePrinter = new class extends LinePrinter {
        constructor(private readonly webPrinter: WebPrinter) {
            super();
        }

        printLine(line: string): void {
            // Pass on to outer class.
            this.webPrinter.printLine(line);
        }
    }(this);

    constructor(screen: CanvasScreen) {
        super();

        const width = screen.getWidth();
        const height = screen.getHeight();

        this.node = document.createElement("div");
        this.node.style.width = width + "px";
        this.node.style.height = height + "px";
        this.node.style.padding = "20px 0";
        this.node.style.borderRadius = screen.getBorderRadius() + "px";
        this.node.style.backgroundColor = "#eeeee8";
        this.node.style.boxSizing = "border-box";

        this.paper = document.createElement("div");
        this.paper.style.width = "100%";
        this.paper.style.height = "100%";
        this.paper.style.fontFamily = `"${PRINTER_REGULAR_FONT_FAMILY}", monospace`;
        this.paper.style.fontSize = "12.5px"; // To get 80 chars across.
        this.paper.style.lineHeight = "1.5";
        this.paper.style.boxSizing = "border-box";
        this.paper.style.color = "#222";
        this.paper.style.overflowY = "scroll";
        this.node.append(this.paper);

        const controlPanel = new ControlPanel(this.node);
        controlPanel.addSaveButton(() => this.hide());
    }

    printChar(ch: number): void {
        this.linePrinter.printChar(ch);
    }

    printLine(line: string): void {
        const lineNode = document.createElement("div");
        lineNode.style.padding = "0 20px";
        lineNode.textContent = line;
        this.paper.append(lineNode);
    }

    public show() {
        addPrinterCssFontToPage();
        this.flipCard?.show(this);
    }

    private hide() {
        this.flipCard?.hide(this);
    }

    save() {
        throw new Error("Method not implemented.");
    }

    restore(state: any): void {
        throw new Error("Method not implemented.");
    }

    getNode(): HTMLElement {
        return this.node;
    }
}
