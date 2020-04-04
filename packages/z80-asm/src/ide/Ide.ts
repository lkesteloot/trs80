
import CodeMirror from "codemirror";
import {Parser} from "../assembler/Parser";

function assembleAll(cm: CodeMirror.Editor) {
    const constants = {};

    const before = Date.now();

    // First pass.
    let address = 0;
    for (let i = 0; i < cm.lineCount(); i++) {
        const line = cm.getLine(i);
        const parser = new Parser(line, address, constants, true);
        const results = parser.assemble();
        address = results.nextAddress;
    }

    // Second pass.
    address = 0;
    for (let i = 0; i < cm.lineCount(); i++) {
        const line = cm.getLine(i);
        const parser = new Parser(line, address, constants, false);
        const results = parser.assemble();

        let addressElement: HTMLElement | null;
        if (results.binary.length > 0) {
            const addressString = results.address.toString(16).toUpperCase().padStart(4, "0") +
                " " + results.binary.map(opcode => opcode.toString(16).toUpperCase().padStart(2, "0")).join(" ");
            const addressTextElement = document.createTextNode(addressString);
            addressElement = document.createElement("span");
            addressElement.appendChild(addressTextElement);
            addressElement.classList.add("gutter-style");
        } else {
            addressElement = null;
        }
        cm.setGutterMarker(i, "gutter-assembled", addressElement);

        if (results.error === undefined) {
            cm.removeLineClass(i, "text", "error-line");
        } else {
            cm.addLineClass(i, "text", "error-line");
        }

        address = results.nextAddress;
    }

    const after = Date.now();
    console.log("Assembly time: " + (after - before));
}

export function main() {
    const element = document.getElementById("editor") as HTMLElement;
    const config = {
        value: "",
        lineNumbers: true,
        tabSize: 8,
        theme: 'mbo',
        gutters: ["CodeMirror-linenumbers", "gutter-assembled"],
    };
    const cm = CodeMirror(element, config);

    cm.on("change", (instance, changeObj) => {
        // It's important to call this in "change", and not in "changes" or
        // after a timeout, because we want to be part of this operation.
        // This way a large re-assemble takes 40ms instead of 300ms.
        assembleAll(cm);
    });

    fetch("samples/basic.asm")
        .then(response => response.text())
        .then(text => cm.setValue(text));
}

