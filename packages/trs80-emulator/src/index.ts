
import {Z80} from "z80-emulator";
import {Trs80} from "./Trs80";
import {toHex} from "z80-base";

// Set up the screen.
const screen = document.getElementById("screen") as HTMLDivElement;
const screenAddress = 15360;
for (let offset = 0; offset < 1024; offset++) {
    const address = screenAddress + offset;
    const c = document.createElement("span");
    c.id = "c" + address;
    c.innerText = " ";
    screen.appendChild(c);

    // Newlines.
    if (offset % 64 == 63) {
        screen.appendChild(document.createElement("br"));
    }
}

const trs80 = new Trs80();
const z80 = new Z80(trs80);

function manySteps() {
    for (let i = 0; i < 10000; i++) {
        z80.step();
    }
    // console.log("PC = " + toHex(z80.regs.pc, 4));
    go();
}
function go() {
    setTimeout(manySteps, 1);
}
go();
