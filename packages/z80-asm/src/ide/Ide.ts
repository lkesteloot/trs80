
import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/mbo.css";
import sample from "./Sample";
import {Parser} from "../assembler/Parser";

export function main() {
    const element = document.getElementById("editor") as HTMLElement;
    const config = {
        value: sample,
        lineNumbers: true,
        tabSize: 8,
        theme: 'mbo',
        gutters: ["CodeMirror-linenumbers", "gutter-address", "gutter-opcodes"],
    };
    const cm = CodeMirror(element, config);



    setTimeout(() => {
        let address = 0;
        const constants = {};

        const before = Date.now();
        for (let i = 0; i < cm.lineCount(); i++) {
            const line = cm.getLine(i);
            const parser = new Parser(line, address, constants, true);
            const results = parser.assemble();
            address = results.nextAddress;
        }
        address = 0;
        for (let i = 0; i < cm.lineCount(); i++) {
            const line = cm.getLine(i);
            const parser = new Parser(line, address, constants, false);
            const results = parser.assemble();

            const addressString = results.address.toString(16).toUpperCase().padStart(4, "0");
            const addressElement = document.createTextNode(addressString) as any as HTMLElement;
            cm.setGutterMarker(i, "gutter-address", addressElement);

            const opcodeString = results.binary.map(opcode => opcode.toString(16).toUpperCase().padStart(2, "0")).join(" ");
            const opcodeElement = document.createTextNode(opcodeString) as any as HTMLElement;
            cm.setGutterMarker(i, "gutter-opcodes", opcodeElement);

            address = results.nextAddress;
        }
        const after = Date.now();
        console.log("Assembly time: " + (after - before));
    }, 100);
}

