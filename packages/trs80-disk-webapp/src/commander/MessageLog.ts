import {formatCommandLine} from "trs80-disk";
import {el} from "../core/Dom.js";

// The message area under the panels: after each action, the command line that it equals and what it said, newest
// last, keeping the last few.

/**
 * The kinds of line in the message area.
 */
enum LineKind {
    /** A command line, which starts with "$". */
    COMMAND,
    /** What an action said. */
    OUTPUT,
    /** An error. */
    ERROR,
}

/**
 * The CSS class that colors a kind of line.
 */
function lineClass(kind: LineKind): string {
    switch (kind) {
        case LineKind.COMMAND:
            return "cmd";
        case LineKind.ERROR:
            return "err";
        default:
            return "";
    }
}

/**
 * One line of the message area.
 */
interface Line {
    /** What kind of line it is. */
    kind: LineKind;
    /** Its text. */
    text: string;
}

/** How many lines are kept. */
const KEPT_LINES = 40;

/** How many lines show. */
const SHOWN_LINES = 5;

/**
 * The message area.
 */
export class MessageLog {
    private readonly element: HTMLElement;
    private lines: Line[] = [];

    /**
     * @param element the element to fill.
     */
    constructor(element: HTMLElement) {
        this.element = element;
    }

    /**
     * Show the command line that an action equals, as the command-line tool would be run on the disk.
     *
     * @param diskName the disk's name.
     * @param commandLine the command, such as "kill HELLO/BAS".
     */
    public command(diskName: string, commandLine: string): void {
        this.add(LineKind.COMMAND, "$ " + formatCommandLine(["trs80-tool", "disk", diskName]) + " " + commandLine);
    }

    /**
     * Show what an action said, or any other news. Each line of the text is a line of the area.
     *
     * @param text the text.
     */
    public out(text: string): void {
        this.add(LineKind.OUTPUT, text);
    }

    /**
     * Show an error.
     *
     * @param text the text.
     */
    public error(text: string): void {
        this.add(LineKind.ERROR, text);
    }

    /**
     * Add the lines of some text.
     */
    private add(kind: LineKind, text: string): void {
        for (const line of text.split("\n")) {
            if (line !== "") {
                this.lines.push({kind, text: line});
            }
        }
        this.lines = this.lines.slice(-KEPT_LINES);
        this.render();
    }

    /**
     * Redraw the area with the last few lines.
     */
    private render(): void {
        this.element.replaceChildren(...this.lines.slice(-SHOWN_LINES).map(line => {
            const div = el("div", lineClass(line.kind), line.text);
            div.title = line.text;
            return div;
        }));
    }
}
