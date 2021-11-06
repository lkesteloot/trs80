import {HexdumpGenerator, ProgramAnnotation} from "trs80-base";

/**
 * Hexdump generator for HTML output.
 */
export class HtmlHexdumpGenerator extends HexdumpGenerator<HTMLElement, HTMLElement> {
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
