
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

        const addressString = results.binary.length > 0 ? results.address.toString(16).toUpperCase().padStart(4, "0") : "";
        const addressTextElement = document.createTextNode(addressString);
        const addressElement = document.createElement("span");
        addressElement.appendChild(addressTextElement);
        addressElement.classList.add("gutter-style");
        cm.setGutterMarker(i, "gutter-address", addressElement);

        const opcodeString = results.binary.map(opcode => opcode.toString(16).toUpperCase().padStart(2, "0")).join(" ");
        const opcodeTextElement = document.createTextNode(opcodeString);
        const opcodeElement = document.createElement("span");
        opcodeElement.appendChild(opcodeTextElement);
        opcodeElement.classList.add("gutter-style");
        cm.setGutterMarker(i, "gutter-opcodes", opcodeElement);

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
        gutters: ["CodeMirror-linenumbers", "gutter-address", "gutter-opcodes"],
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

