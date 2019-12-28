
import {Z80} from "z80-emulator";
import {Trs80} from "./Trs80";

const trs80 = new Trs80();
const z80 = new Z80(trs80);
for (let i = 0; i < 100000; i++) {
    z80.step();
}
document.write("Done<br>");
