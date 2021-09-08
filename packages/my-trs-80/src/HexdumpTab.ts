import {ProgramAnnotation, Trs80File} from "trs80-base";
import {PageTab} from "./PageTab";
import {clearElement} from "teamten-ts-utils";
import {Context} from "./Context";
import {HexdumpGenerator} from "trs80-base";

/**
 * Hexdump generator for HTML output.
 */
class HtmlHexdumpGenerator extends HexdumpGenerator<HTMLElement, HTMLElement> {
    constructor(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]) {
        super(binary, collapse, annotations);
    }

    protected newLine(): HTMLElement {
        return document.createElement("div");
    }

    protected getLineText(line: HTMLElement): string {
        return line.textContent ?? "";
    }

    protected newSpan(line: HTMLElement, text: string, ...cssClass: string[]): HTMLElement {
        const e = document.createElement("span");
        e.classList.add(...cssClass);
        e.innerText = text;
        line.append(e);
        return e;
    }

    protected addTextToSpan(span: HTMLElement, text: string): void {
        span.innerText += text;
    }
}

/**
 * Tab for displaying the hex and ASCII of the binary.
 */
export class HexdumpTab extends PageTab {
    private readonly binary: Uint8Array;
    private readonly trs80File: Trs80File;
    private readonly hexdumpElement: HTMLElement;
    private readonly windowResizeListener: () => void;
    private collapse = true;
    private annotate = true;
    private lineGenerator: Generator<HTMLElement, void, void> | undefined = undefined;
    private lastLine: HTMLElement | undefined = undefined;

    constructor(context: Context, trs80File: Trs80File) {
        super("Hexdump");

        this.binary = trs80File.binary;
        this.trs80File = trs80File;

        this.element.classList.add("hexdump-tab");

        const outer = document.createElement("div");
        outer.classList.add("hexdump-outer");
        this.element.append(outer);

        this.hexdumpElement = document.createElement("div");
        this.hexdumpElement.classList.add("hexdump");
        this.hexdumpElement.addEventListener("scroll", () => {
            this.checkLoadMore();
        });
        outer.append(this.hexdumpElement);

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

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

        // Hide the hexdump when the panel is hidden because it slows down things
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

        this.windowResizeListener = () => {
            this.checkLoadMore();
        };
    }

    public onShow(): void {
        super.onShow();
        window.addEventListener("resize", this.windowResizeListener);

        // Wait for layout or our rectangle testing fails.
        setTimeout(() => this.checkLoadMore(), 10);
    }

    public onFirstShow(): void {
        this.generateHexdump();
    }

    public onHide(): void {
        window.removeEventListener("resize", this.windowResizeListener);
        super.onHide();
    }

    /**
     * Regenerate the HTML for the hexdump.
     */
    private generateHexdump(): void {
        clearElement(this.hexdumpElement);
        this.lastLine = undefined;

        const hexdumpGenerator = new HtmlHexdumpGenerator(this.binary, this.collapse,
            this.annotate ? this.trs80File.annotations : []);
        this.lineGenerator = hexdumpGenerator.generate();

        this.checkLoadMore();
    }

    /**
     * See if we should generate more lines, and if so, do so.
     */
    private checkLoadMore(): void {
        while (this.lineGenerator !== undefined && this.shouldLoadMore()) {
            const lineInfo = this.lineGenerator.next();
            if (lineInfo.done) {
                // All done.
                this.lineGenerator = undefined;
            } else {
                // Generate one more line.
                this.lastLine = lineInfo.value;
                this.hexdumpElement.append(this.lastLine);
            }
        }
    }

    /**
     * Whether we're close enough to the bottom of the text that we should generate more.
     */
    private shouldLoadMore(): boolean {
        if (this.lastLine === undefined) {
            // We've not loaded anything yet.
            return true;
        } else {
            // See if we're close to running out of text.
            const containerRect = this.hexdumpElement.getBoundingClientRect();
            const lineRect = this.lastLine.getBoundingClientRect();
            return lineRect.top < containerRect.bottom + 1000;
        }
    }
}
