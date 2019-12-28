import {Z80} from "z80-emulator";
import {Trs80} from "./Trs80";

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

// Start machine.
let clocksPerTick = 2000;
const startTime = Date.now();
function tick() {
    for (let i = 0; i < clocksPerTick; i++) {
        z80.step();
    }
    scheduleNextTick();
}
function scheduleNextTick() {
    // Delay to match original clock speed.
    const actualElapsed = Date.now() - startTime;
    const expectedElapsed = trs80.tStateCount*1000/Trs80.CLOCK_HZ;
    const delay = Math.round(Math.max(0, expectedElapsed - actualElapsed));
    if (delay === 0) {
        // Delay too short, do more each tick.
        clocksPerTick = Math.min(clocksPerTick + 100, 10000);
    } else if (delay > 1) {
        // Delay too long, do less each tick.
        clocksPerTick = Math.max(clocksPerTick - 100, 100);
    }
    // console.log(clocksPerTick, delay);
    setTimeout(tick, delay);
}
scheduleNextTick();
