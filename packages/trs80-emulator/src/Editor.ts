import {BasicProgram, decodeBasicProgram, ElementType, parseBasicText} from "trs80-base";
import {Trs80} from "./Trs80";
import {CanvasScreen} from "./CanvasScreen";
import {addCssFontToPage} from "./EditorFont";
import {ControlPanel} from "./ControlPanel";

/**
 * Allows the user to edit the in-memory Basic program directly in an HTML text widget,
 * writing the result back into memory.
 */
export class Editor {
    private readonly trs80: Trs80;
    private readonly screen: CanvasScreen;
    public readonly node: HTMLElement;
    private readonly card: HTMLElement;
    private readonly editorNode: HTMLElement;
    private readonly textarea: HTMLTextAreaElement;
    private editing = false;
    private wasStarted = false;

    constructor(trs80: Trs80, screen: CanvasScreen) {
        this.trs80 = trs80;
        this.screen = screen;
        const width = screen.getWidth();
        const height = screen.getHeight();

        addCssFontToPage();

        // This is the "stage" node, which provides perspective for its children.
        this.node = document.createElement("div");
        this.node.style.perspective = "1000px";

        // This is the card that will be flipped around.
        this.card = document.createElement("div");
        this.card.style.width = width + "px";
        this.card.style.height = height + "px";
        this.card.style.position = "relative";
        this.card.style.transition = "transform 0.5s ease-in-out";
        this.card.style.transformStyle = "preserve-3d";
        this.node.append(this.card);

        // This is the "front" of the card, which is the TRS-80 screen.
        const screenNode = screen.getNode();
        screenNode.style.position = "absolute";
        screenNode.style.backfaceVisibility = "hidden";
        screenNode.style.webkitBackfaceVisibility = "hidden";
        screenNode.style.transform = "rotateY(0deg)"; // Need this for backface-visibility to work.

        // This is the "back" of the card, which is the editor.
        this.editorNode = document.createElement("div");
        this.editorNode.style.position = "absolute";
        this.editorNode.style.width = width + "px";
        this.editorNode.style.height = height + "px";
        this.editorNode.style.backfaceVisibility = "hidden";
        this.editorNode.style.webkitBackfaceVisibility = "hidden";
        this.editorNode.style.transform = "rotateY(180deg)";

        this.card.append(screenNode, this.editorNode);

        // The text editor sits in the editor node, on the back of the card.
        const fontSize = Math.round(24*screen.scale);
        this.textarea = document.createElement("textarea");
        this.textarea.style.width = width + "px";
        this.textarea.style.height = height + "px";
        this.textarea.style.padding = this.screen.padding + "px";
        this.textarea.style.border = "0";
        this.textarea.style.borderRadius = this.screen.getBorderRadius() + "px";
        this.textarea.style.fontFamily = `"TreasureMIII64C", monospace`;
        this.textarea.style.fontSize = fontSize + "px";
        this.textarea.style.lineHeight = fontSize + "px";
        this.textarea.style.outline = "0";
        this.textarea.style.boxSizing = "border-box";
        this.textarea.placeholder = "Write your Basic program here...";
        this.editorNode.append(this.textarea);

        // Control panel for saving/canceling.
        const controlPanel = new ControlPanel(this.editorNode);
        controlPanel.addSaveButton(() => this.save());
        controlPanel.addCancelButton(() => this.cancel());

        this.hide();

        // For Ctrl-Enter quick edit/save.
        window.addEventListener("keydown", e => this.keyboardListener(e));
    }

    /**
     * Grab the program from memory and start the editor.
     */
    public startEdit(): void {
        const basicProgram = this.trs80.getBasicProgramFromMemory();
        if (typeof basicProgram === "string") {
            // TODO show error.
            console.error(basicProgram);
        } else {
            this.wasStarted = this.trs80.stop();
            this.setProgram(basicProgram);
            this.show();
        }
    }

    /**
     * Provide hot key for edit/save.
     * @param e
     */
    private keyboardListener(e: KeyboardEvent): void {
        if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.key === "Enter") {
            if (this.editing) {
                this.save();
                e.preventDefault();
                e.stopPropagation();
            } else {
                // If the emulator is not running, then the user's not paying attention to it and
                // we shouldn't invoke the editor.
                if (this.trs80.started) {
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
        if (this.wasStarted) {
            this.trs80.start();
        }
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

        this.editorNode.append(errorNode);
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

    /**
     * Show the editor (back of the card).
     */
    private show(): void {
        this.card.style.transform = "rotateY(180deg)";
        this.textarea.style.color = this.screen.getForegroundColor();
        this.textarea.style.backgroundColor = this.screen.getBackgroundColor();
        this.textarea.focus();
        this.editing = true;
    }

    /**
     * Hide the editor (show the front).
     */
    private hide(): void {
        this.card.style.transform = "rotateY(0deg)";
        this.editing = false;
    }
}
