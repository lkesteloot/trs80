import {describe, expect, it} from "vitest";
import {CassettePlayer} from "./CassettePlayer.js";
import {Config, ModelType, RamSize} from "./Config.js";
import {Keyboard} from "./Keyboard.js";
import {SilentSoundPlayer} from "./SoundPlayer.js";
import {Trs80} from "./Trs80.js";
import {Trs80Screen} from "./Trs80Screen.js";

// Tests for the machine itself: save and restore, reset, timers.

/**
 * Screen that does nothing.
 */
class NullScreen extends Trs80Screen {
    setConfig(config: Config): void {
        // Nothing.
    }

    writeChar(address: number, value: number): void {
        // Nothing.
    }
}

/**
 * Make a headless machine with the given config.
 */
function makeMachine(config = Config.makeDefault()): Trs80 {
    return new Trs80(config, new NullScreen(), new Keyboard(), new CassettePlayer(), new SilentSoundPlayer());
}

describe("save and restore", () => {
    it("keeps interrupt masks and latches", () => {
        const trs80 = makeMachine();
        trs80.setIrqMask(0x04);
        trs80.setNmiMask(0x20);
        trs80.writePort(0xEC, 0x04);
        const state = trs80.save();
        expect(state.irqMask).to.equal(0x04);

        trs80.reset();
        expect(trs80.save().irqMask).to.equal(0);

        trs80.restore(state);
        const restored = trs80.save();
        expect(restored.irqMask).to.equal(state.irqMask);
        expect(restored.irqLatch).to.equal(state.irqLatch);
        expect(restored.nmiMask).to.equal(state.nmiMask);
        expect(restored.nmiLatch).to.equal(state.nmiLatch);
        expect(restored.nmiSeen).to.equal(state.nmiSeen);
        expect(restored.modeImage).to.equal(0x04);
    });
    it("applies the saved config", () => {
        const base = Config.makeDefault();
        const model1State = makeMachine(base.edit().withModelType(ModelType.MODEL1)
            .withRamSize(RamSize.RAM_48_KB).build()).save();
        const trs80 = makeMachine(base.edit().withModelType(ModelType.MODEL3)
            .withRamSize(RamSize.RAM_16_KB).build());
        const model3ClockHz = trs80.clockHz;

        // The saved memory is bigger than the machine's.
        trs80.restore(model1State);
        expect(trs80.getConfig()).to.equal(model1State.config);
        expect(trs80.clockHz).to.not.equal(model3ClockHz);
        expect(trs80.save().memory.length).to.equal(model1State.memory.length);
    });
});
