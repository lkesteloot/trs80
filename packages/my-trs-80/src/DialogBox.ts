
export class DialogBox {
    private backgroundNode: HTMLElement | undefined = undefined;
    private readonly escListener: (e: KeyboardEvent) => void;

    constructor(title: string, content: HTMLElement) {
        const body = document.querySelector("body") as HTMLElement;
        this.backgroundNode = document.createElement("div");
        this.backgroundNode.classList.add("dialog-box-background");
        this.backgroundNode.addEventListener("click", e => {
            if (e.target === this.backgroundNode) {
                this.close();
                e.preventDefault();
                e.stopPropagation();
            }
        });
        body.append(this.backgroundNode);

        const frame = document.createElement("div");
        frame.classList.add("dialog-box-frame");
        this.backgroundNode.append(frame);

        const h1 = document.createElement("h1");
        h1.innerText = title;
        frame.append(h1);

        const contentFrame = document.createElement("div");
        contentFrame.classList.add("dialog-box-content-frame");
        frame.append(contentFrame);

        contentFrame.append(content);

        // Handler for the ESC key.
        this.escListener = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            }
        };
        document.addEventListener("keydown", this.escListener);

        // Wait a bit to let the initial view render, which enables the fade-in animation.
        setTimeout(() => this.backgroundNode?.classList.add("dialog-box-shown"), 10);
    }

    /**
     * Close and destroy the dialog box. The dialog box cannot be re-opened.
     */
    public close(): void {
        if (this.backgroundNode !== undefined) {
            document.removeEventListener("keydown", this.escListener);
            const backgroundNode = this.backgroundNode;
            backgroundNode.classList.remove("dialog-box-shown")
            this.backgroundNode = undefined;
            setTimeout(() => backgroundNode.remove(), 500);
        }
    }
}
