import {Trs80File} from "trs80-base";
import {PageTabs} from "./PageTabs";
import {PageTab} from "./PageTab";
import {HexdumpGenerator} from "./HexdumpGenerator";
import {clearElement} from "teamten-ts-utils";
import {Context} from "./Context";

/**
 * Tab for displaying the hex and ASCII of the binary.
 */
export class HexdumpTab {
    private readonly binary: Uint8Array;
    private readonly trs80File: Trs80File;
    private readonly hexdumpElement: HTMLElement;
    private needGeneration = true;
    private collapse = true;
    private annotate = true;

    constructor(context: Context, pageTabs: PageTabs, trs80File: Trs80File) {
        this.binary = trs80File.binary;
        this.trs80File = trs80File;

        const tab = new PageTab("Hexdump");
        tab.element.classList.add("hexdump-tab");

        const outer = document.createElement("div");
        outer.classList.add("hexdump-outer");
        tab.element.append(outer);

        this.hexdumpElement = document.createElement("div");
        this.hexdumpElement.classList.add("hexdump");
        outer.append(this.hexdumpElement);
        tab.onShow.subscribe(() => {
            // Wait until user switches to tab to compute initial display, so that
            // it doesn't slow down the animation to the file panel. Also do it
            // asynchronously so that we don't block the display of the tab change.
            if (this.needGeneration) {
                this.needGeneration = false;
                setTimeout(() => this.generateHexdump(), 0);
            }
        });

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        tab.element.append(actionBar);

        const collapseLabel = document.createElement("label");
        const collapseCheckbox = document.createElement("input");
        collapseCheckbox.type = "checkbox";
        collapseCheckbox.checked = this.collapse;
        collapseLabel.append(collapseCheckbox);
        collapseLabel.append(" Collapse duplicate lines");
        collapseCheckbox.addEventListener("change", () => {
            this.collapse = collapseCheckbox.checked;
            this.generateHexdump();
        });
        actionBar.append(collapseLabel);

        const annotateLabel = document.createElement("label");
        const annotateCheckbox = document.createElement("input");
        annotateCheckbox.type = "checkbox";
        annotateCheckbox.checked = this.annotate;
        annotateLabel.append(annotateCheckbox);
        annotateLabel.append(" Show annotations");
        annotateCheckbox.addEventListener("change", () => {
            this.annotate = annotateCheckbox.checked;
            this.generateHexdump();
        });
        actionBar.append(annotateLabel);

        // Take the hexdump out of the dom when the panel is hidden because it slows down things
        // like changing themes (the animations aren't smooth).
        let hideHandle: number | undefined = undefined;
        const cancelHide = () => {
            if (hideHandle !== undefined) {
                window.clearTimeout(hideHandle);
                hideHandle = undefined;
            }
        };
        context.panelManager.onOpenClose.subscribe(isOpen => {
            cancelHide();
            if (isOpen) {
                this.hexdumpElement.classList.remove("hidden");
            } else {
                hideHandle = window.setTimeout(() => this.hexdumpElement.classList.add("hidden"), 400);
            }
        });

        pageTabs.addTab(tab);
    }

    /**
     * Regenerate the HTML for the hexdump.
     */
    private generateHexdump(): void {
        const hexdumpGenerator = new HexdumpGenerator(this.binary, this.collapse,
            this.annotate ? this.trs80File.annotations : []);
        const lines = hexdumpGenerator.generate();

        clearElement(this.hexdumpElement);
        this.hexdumpElement.append(... lines);
    }
}
