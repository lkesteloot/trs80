import {formatCommandLine} from "trs80-disk";
import {copyText, el, makeButton} from "./Dom.js";

/**
 * What the command strip shows for one disk: the last command, and what it said.
 */
interface LastResult {
    /** The command line that the action equals, without the "trs80-tool disk FILE" before it, or undefined. */
    commandLine: string | undefined;
    /** What it said, one string per message. */
    lines: string[];
    /** Whether it failed. */
    isError: boolean;
}

/**
 * The page's ways of telling the user what happened: the command strip at the bottom, small alerts above it,
 * and brief toasts. The strip remembers the last result of each disk.
 */
export class Messages {
    private readonly strip: HTMLElement;
    private readonly alerts: HTMLElement;
    private readonly lastByDisk = new Map<number, LastResult>();
    private currentDiskId: number | undefined = undefined;
    private currentDiskName = "";
    private toastTimer: ReturnType<typeof setTimeout> | undefined = undefined;

    /**
     * @param strip the strip's element.
     */
    constructor(strip: HTMLElement) {
        this.strip = strip;
        this.alerts = el("div", "alerts");
        document.body.append(this.alerts);
    }

    /**
     * Choose the disk whose last result the strip shows. The strip is hidden when there's no disk.
     *
     * @param diskId the disk's ID, or undefined for none.
     * @param diskName the disk's name, for the command line.
     */
    public setDisk(diskId: number | undefined, diskName: string): void {
        this.currentDiskId = diskId;
        this.currentDiskName = diskName;
        this.render();
    }

    /**
     * Forget a closed disk's result.
     */
    public forgetDisk(diskId: number): void {
        this.lastByDisk.delete(diskId);
    }

    /**
     * Show what an action did.
     *
     * @param diskId the disk that it was done on.
     * @param commandLine the command line that it equals, or undefined if it equals none.
     * @param lines what it said.
     */
    public reportDone(diskId: number, commandLine: string | undefined, lines: string[]): void {
        this.lastByDisk.set(diskId, {commandLine, lines, isError: false});
        this.render();
    }

    /**
     * Show an error in the strip and in a small alert that the user can dismiss.
     *
     * @param diskId the disk that it was about, or undefined if none.
     * @param message the error.
     */
    public reportError(diskId: number | undefined, message: string): void {
        if (diskId !== undefined) {
            this.lastByDisk.set(diskId, {commandLine: undefined, lines: [message], isError: true});
            this.render();
        }
        this.showAlert(message);
    }

    /**
     * Show a brief notice that goes away by itself.
     *
     * @param text the notice.
     */
    public toast(text: string): void {
        document.querySelector(".toast")?.remove();
        if (this.toastTimer !== undefined) {
            clearTimeout(this.toastTimer);
        }
        const toast = el("div", "toast", text);
        document.body.append(toast);
        this.toastTimer = setTimeout(() => toast.remove(), 3500);
    }

    /**
     * Show an alert.
     */
    private showAlert(message: string): void {
        const alert = el("div", "alert", el("span", "", message));
        alert.setAttribute("role", "alert");
        const dismiss = makeButton("×", () => alert.remove(), "icon");
        dismiss.title = "Dismiss";
        alert.append(dismiss);
        this.alerts.append(alert);
    }

    /**
     * The full command line to show and copy: the tool, the disk's name, and the command.
     */
    private fullCommandLine(commandLine: string): string {
        return formatCommandLine(["trs80-tool", "disk", this.currentDiskName]) + " " + commandLine;
    }

    /**
     * Redraw the strip.
     */
    private render(): void {
        this.strip.hidden = this.currentDiskId === undefined;
        if (this.currentDiskId === undefined) {
            return;
        }

        const last = this.lastByDisk.get(this.currentDiskId);
        const children: Node[] = [el("span", "prompt", "$")];
        if (last?.commandLine !== undefined) {
            const full = this.fullCommandLine(last.commandLine);
            children.push(el("span", "cmd", full));
            const output = el("span", "out", last.lines.join(" "));
            output.title = last.lines.join("\n");
            children.push(output);
            const copy = makeButton("Copy", async () => {
                const worked = await copyText(full);
                copy.textContent = worked ? "Copied" : "Can't copy";
                setTimeout(() => copy.textContent = "Copy", 1500);
            });
            copy.title = "Copy the command line";
            children.push(copy);
        } else {
            const text = last === undefined ? "Every change shows its trs80-tool command here." : last.lines.join(" ");
            const output = el("span", "out" + (last?.isError === true ? " error" : ""), text);
            output.title = last === undefined ? "" : last.lines.join("\n");
            children.push(output);
        }
        this.strip.replaceChildren(...children);
    }
}
