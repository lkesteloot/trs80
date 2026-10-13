import {describe, expect, it} from "vitest";
import {TRS80_SCREEN_BEGIN, TRS80_SCREEN_END} from "trs80-base";
import {CassettePlayer} from "./CassettePlayer.js";
import {Config, ModelType} from "./Config.js";
import {Keyboard} from "./Keyboard.js";
import {SilentSoundPlayer} from "./SoundPlayer.js";
import {Trs80} from "./Trs80.js";
import {model1ScreenCodeToModel3, Trs80Screen} from "./Trs80Screen.js";

// Tests for Trs80.getScreenshot() and Trs80Screen.displayScreenshot().

const SCREEN_SIZE = TRS80_SCREEN_END - TRS80_SCREEN_BEGIN;

/**
 * Screen that records what's written to it.
 */
class RecordingScreen extends Trs80Screen {
    public readonly chars = new Array<number>(SCREEN_SIZE).fill(-1);

    setConfig(config: Config): void {
        // Nothing.
    }

    writeChar(address: number, value: number): void {
        const index = address - TRS80_SCREEN_BEGIN;
        if (index < 0 || index >= SCREEN_SIZE) {
            throw new Error("wrote outside the screen at " + address);
        }
        this.chars[index] = value;
    }
}

/**
 * Put the screen contents into a machine, take a screenshot, and return it.
 */
function makeScreenshot(screen: number[], expanded = false, config = Config.makeDefault()): string {
    const trs80 = new Trs80(config, new RecordingScreen(), new Keyboard(),
        new CassettePlayer(), new SilentSoundPlayer());
    for (let i = 0; i < SCREEN_SIZE; i++) {
        trs80.writeMemory(TRS80_SCREEN_BEGIN + i, screen[i]);
    }
    // Set the screen mode the way a program would.
    if (config.modelType === ModelType.MODEL1) {
        trs80.writePort(0xFF, expanded ? 0x08 : 0x00);
    } else {
        trs80.writePort(0xEC, expanded ? 0x04 : 0x00);
    }
    return trs80.getScreenshot();
}

/**
 * Decode the screenshot into a fresh screen.
 */
function displayScreenshot(screenshot: string): RecordingScreen {
    const screen = new RecordingScreen();
    screen.displayScreenshot(screenshot);
    return screen;
}

/**
 * Check that the screen survives a round trip through a screenshot.
 */
function expectRoundTrip(screen: number[], expanded = false): void {
    const decoded = displayScreenshot(makeScreenshot(screen, expanded));
    expect(decoded.chars).to.eql(screen);
    expect(decoded.isExpandedCharacters()).to.equal(expanded);
}

/**
 * Make a screen from a list of (value, count) runs, padded with spaces.
 */
function makeScreen(runs: [number, number][]): number[] {
    const screen: number[] = [];
    for (const [value, count] of runs) {
        for (let i = 0; i < count; i++) {
            screen.push(value);
        }
    }
    while (screen.length < SCREEN_SIZE) {
        screen.push(32);
    }
    return screen;
}

/**
 * Small deterministic random number generator, so failures are reproducible.
 */
function makeRandom(seed: number): () => number {
    return () => {
        seed = (seed*1103515245 + 12345) & 0x7FFFFFFF;
        return seed/0x80000000;
    };
}

describe("screenshot round trip", () => {
    it("blank screen", () => {
        expectRoundTrip(makeScreen([]));
    });
    it("expanded mode", () => {
        expectRoundTrip(makeScreen([[65, 10]]), true);
    });
    it("all literals", () => {
        const screen = new Array<number>(SCREEN_SIZE);
        for (let i = 0; i < SCREEN_SIZE; i++) {
            screen[i] = 33 + i % 95;
        }
        expectRoundTrip(screen);
    });
    it("run of every non-literal value", () => {
        const screen = new Array<number>(SCREEN_SIZE);
        for (let i = 0; i < SCREEN_SIZE; i++) {
            const value = Math.floor(i/4);
            screen[i] = value > 32 && value < 128 ? 0 : value;
        }
        expectRoundTrip(screen);
    });
    it("run longer than 255", () => {
        expectRoundTrip(makeScreen([[0x80, 600], [65, 1]]));
    });
    it("run whose count equals the next byte", () => {
        // This used to increment the "A" instead of starting a run of spaces.
        expectRoundTrip(makeScreen([[32, 32], [65, 1], [32, 5], [66, 1]]));
    });
    it("graphics run whose count equals the next byte", () => {
        expectRoundTrip(makeScreen([[32, 129], [65, 1], [129, 3], [66, 1]]));
    });
    it("run of 255 followed by literal and same value", () => {
        expectRoundTrip(makeScreen([[0xBF, 255], [65, 1], [0xBF, 2]]));
    });
    it("random screens", () => {
        const random = makeRandom(1);
        for (let iteration = 0; iteration < 1000; iteration++) {
            const runs: [number, number][] = [];
            let length = 0;
            while (length < SCREEN_SIZE) {
                const value = Math.floor(random()*256);
                const count = random() < 0.5 ? 1 : Math.floor(random()*300) + 1;
                runs.push([value, count]);
                length += count;
            }
            expectRoundTrip(makeScreen(runs).slice(0, SCREEN_SIZE));
        }
    });
});

describe("screenshot decoding", () => {
    it("empty string is blank", () => {
        expect(displayScreenshot("").chars).to.eql(makeScreen([]));
    });
    it("short screenshot is padded", () => {
        const screenshot = "0:" + btoa(String.fromCharCode(0, 65, 66));
        expect(displayScreenshot(screenshot).chars).to.eql(makeScreen([[65, 1], [66, 1]]));
    });
    it("missing count is padded", () => {
        const screenshot = "0:" + btoa(String.fromCharCode(0, 65, 0x80));
        expect(displayScreenshot(screenshot).chars).to.eql(makeScreen([[65, 1]]));
    });
    it("long screenshot is clipped", () => {
        const screenshot = "0:" + btoa(String.fromCharCode(0, 0x80, 255, 0x80, 255, 0x80, 255, 0x80, 255, 0x80, 255));
        expect(displayScreenshot(screenshot).chars).to.eql(makeScreen([[0x80, SCREEN_SIZE]]));
    });
});

describe("Model I screenshots", () => {
    const model1 = Config.makeDefault().edit().withModelType(ModelType.MODEL1).build();

    it("converts the Level II ROM's capitals and the high graphics", () => {
        const screen = makeScreen([[0x00, 1], [0x08, 1], [0x1F, 1], [0x20, 1], [0x41, 1], [0x7F, 1],
            [0x80, 1], [0xBF, 1], [0xC0, 1], [0xFF, 1]]);
        const decoded = displayScreenshot(makeScreenshot(screen, false, model1));
        expect(decoded.chars.slice(0, 10)).to.eql([0x40, 0x48, 0x5F, 0x20, 0x41, 0x7F, 0x80, 0xBF, 0x80, 0xBF]);
    });
    it("leaves a Model III screen alone", () => {
        const screen = makeScreen([[0x00, 1], [0xC0, 1]]);
        expect(displayScreenshot(makeScreenshot(screen)).chars).to.eql(screen);
    });
    it("keeps the expanded mode flag", () => {
        const decoded = displayScreenshot(makeScreenshot(makeScreen([[0x01, 3]]), true, model1));
        expect(decoded.isExpandedCharacters()).to.equal(true);
        expect(decoded.chars.slice(0, 3)).to.eql([0x41, 0x41, 0x41]);
    });
    it("converts single codes", () => {
        expect(model1ScreenCodeToModel3(0x1F)).to.equal(0x5F);
        expect(model1ScreenCodeToModel3(0x20)).to.equal(0x20);
        expect(model1ScreenCodeToModel3(0xBF)).to.equal(0xBF);
        expect(model1ScreenCodeToModel3(0xC0)).to.equal(0x80);
    });
});
