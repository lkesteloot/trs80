import {BasicProgram, decodeBasicProgram, ElementType, parseBasicText} from "trs80-base";
import {RunningState, Trs80} from "trs80-emulator";
import {CanvasScreen} from "./CanvasScreen.js";
import {addCssFontToPage} from "./EditorFont.js";
import {ControlPanel} from "./ControlPanel.js";
import {FlipCardSideAdapter} from "./FlipCard.js";

/**
 * Allows the user to edit the in-memory Basic program directly in an HTML text widget,
 * writing the result back into memory.
 */
export class BasicEditor extends FlipCardSideAdapter {
    private readonly trs80: Trs80;
    private readonly node: HTMLElement;
    private readonly textarea: HTMLTextAreaElement;
    private oldRunningState: RunningState = RunningState.STARTED;

    constructor(trs80: Trs80, screen: CanvasScreen) {
        super();

        this.trs80 = trs80;

        addCssFontToPage();

        this.node = document.createElement("div");

        // The text editor sits in the editor node, on the back of the card.
        const fontSize = Math.round(24*screen.scale);
        this.textarea = document.createElement("textarea");
        screen.listenForScreenSize(screenSize => {
            this.node.style.width = screenSize.width + "px";
            this.node.style.height = screenSize.height + "px";
            this.textarea.style.width = screenSize.width + "px";
            this.textarea.style.height = screenSize.height + "px";
            this.textarea.style.padding = screenSize.padding + "px";
        });
        this.textarea.style.border = "0";
        this.textarea.style.borderRadius = screen.getBorderRadius() + "px";
        this.textarea.style.fontFamily = `"TreasureMIII64C", monospace`;
        this.textarea.style.fontSize = fontSize + "px";
        this.textarea.style.lineHeight = fontSize + "px";
        this.textarea.style.outline = "0";
        this.textarea.style.boxSizing = "border-box";
        screen.listenForScreenColor(screenColor => {
            this.textarea.style.color = screenColor.textColor;
            this.textarea.style.backgroundColor = screenColor.backgroundColor;
        });
        this.textarea.placeholder = "Write your Basic program here...";
        this.node.append(this.textarea);

        // Control panel for saving/canceling.
        const controlPanel = new ControlPanel(this.node);
        controlPanel.addSaveButton(() => this.save());
        controlPanel.addCancelButton(() => this.cancel());

        // For Ctrl-Enter quick edit/save.
        window.addEventListener("keydown", e => this.keyboardListener(e));
    }

    public getNode() {
        return this.node;
    }

    /**
     * Grab the program from memory and start the editor.
     */
    public startEdit(): void {
        if (this.flipCard !== undefined) {
            const basicProgram = this.trs80.getBasicProgramFromMemory();
            if (typeof basicProgram === "string") {
                // TODO show error.
                console.error(basicProgram);
            } else {
                this.oldRunningState = this.trs80.setRunningState(RunningState.STOPPED);
                this.setProgram(basicProgram);
                this.show();
            }
        }
    }

    /**
     * Provide hot key for edit/save.
     * @param e
     */
    private keyboardListener(e: KeyboardEvent): void {
        if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.key === "Enter") {
            if (this.isShowing()) {
                this.save();
                e.preventDefault();
                e.stopPropagation();
            } else {
                // If the emulator is not running, then the user's not paying attention to it and
                // we shouldn't invoke the editor.
                if (this.trs80.runningState === RunningState.STARTED) {
                    this.startEdit();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        }
    }

    /**
     * Save the program back out to memory and close the editor.
     */
    private save(): void {
        const newBasicBinary = parseBasicText(this.textarea.value);
        if (typeof newBasicBinary === "string") {
            this.showError(newBasicBinary);
            return;
        }

        const newBasicProgram = decodeBasicProgram(newBasicBinary);
        if (newBasicProgram === undefined) {
            // I don't know how this might happen.
            this.showError("Can't decode Basic program");
            return;
        }

        this.trs80.loadBasicProgram(newBasicProgram);
        this.close();
    }

    /**
     * Cancel the editor, losing the contents.
     */
    private cancel(): void {
        this.close();
    }

    /**
     * Close the editor and restart the emulator, if necessary.
     */
    private close(): void {
        this.trs80.setRunningState(this.oldRunningState);
        this.hide();
    }

    /**
     * Show a temporary compile error.
     */
    private showError(error: string): void {
        const errorNode = document.createElement("div");
        errorNode.innerText = error;
        errorNode.style.position = "absolute";
        errorNode.style.left = "50%";
        errorNode.style.top = "40%";
        errorNode.style.transform = "translate(-50%, 0)";
        errorNode.style.whiteSpace = "nowrap";
        errorNode.style.fontFamily = `"TreasureMIII64C", monospace`;
        errorNode.style.fontSize = "48px";
        errorNode.style.padding = "20px 30px 0 30px";
        errorNode.style.color = "white";
        errorNode.style.backgroundColor = "rgba(40, 40, 40, 0.8)";
        errorNode.style.borderRadius = "999px";
        errorNode.style.opacity = "0";
        errorNode.style.transition = "opacity .20s ease-in-out";

        this.node.append(errorNode);
        setTimeout(() => {
            errorNode.style.opacity = "1";
            setTimeout(() => {
                errorNode.style.opacity = "0";
                setTimeout(() => {
                    errorNode.remove();
                }, 500);
            }, 2000);
        }, 0);
    }

    /**
     * Fill the text editor with this program.
     */
    private setProgram(basicProgram: BasicProgram): void {
        const parts: string[] = [];

        for (const element of basicProgram.elements) {
            if (element.elementType === ElementType.LINE_NUMBER && parts.length > 0) {
                parts.push("\n");
            }

            // Convert to the font we're using.
            parts.push(element.asAnotherMansTreasure());
        }

        const fullText = parts.join("");
        if (fullText !== this.textarea.value) {
            // Try to keep the selection where it is.
            const selectionStart = this.textarea.selectionStart;
            const selectionEnd = this.textarea.selectionEnd;
            this.textarea.value = fullText;
            this.textarea.selectionStart = selectionStart;
            this.textarea.selectionEnd = selectionEnd;
        }
    }

    didShowOnFlipCard() {
        this.textarea.focus();
    }
}
