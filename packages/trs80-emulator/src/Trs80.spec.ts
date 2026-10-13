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

describe("reset", () => {
    it("cancels scheduled events", () => {
        const trs80 = makeMachine();
        let fired = false;
        trs80.eventScheduler.add(undefined, trs80.tStateCount + 100, () => fired = true);
        trs80.reset();
        trs80.eventScheduler.dispatch(trs80.tStateCount + 1000);
        expect(fired).to.equal(false);
    });
});

describe("timer", () => {
    const TIMER_IRQ_MASK = 0x04;
    const TIMER_PERIOD = 2_027_520/30;

    /**
     * Step the machine once and return whether the timer interrupt latch is set, clearing it.
     */
    function stepAndAcknowledge(trs80: Trs80): boolean {
        trs80.step();
        const fired = (trs80.save().irqLatch & TIMER_IRQ_MASK) !== 0;
        // Reading the Model III's timer port acknowledges the interrupt.
        trs80.readPort(0xEC);
        return fired;
    }

    it("doesn't drift", () => {
        const trs80 = makeMachine();
        trs80.tStateCount = TIMER_PERIOD + 20;
        expect(stepAndAcknowledge(trs80)).to.equal(true);

        // The next tick is due exactly one period after the first, not one period after the step
        // that noticed it. Take a step that's due but would not be if the tick had been delayed.
        trs80.tStateCount = 2*TIMER_PERIOD;
        expect(stepAndAcknowledge(trs80)).to.equal(true);
    });
});

describe("Model I timer", () => {
    const TIMER_IRQ_MASK = 0x80;
    const COUNTER_ADDRESS = 0x6000;

    /**
     * Make a Model I that's spinning with interrupts on. The stock ROM sends RST 38 to 0x4012
     * in RAM, where we put a handler that counts the interrupts, acknowledging each one if
     * asked to.
     */
    function makeSpinningModel1(acknowledge: boolean): Trs80 {
        const trs80 = makeMachine(Config.makeDefault().edit().withModelType(ModelType.MODEL1).build());
        trs80.reset();
        const handler = [
            ...(acknowledge ? [0x3A, 0xE0, 0x37] : []),   // ld a,(0x37E0)
            0x21, COUNTER_ADDRESS & 0xFF, COUNTER_ADDRESS >> 8, // ld hl,COUNTER_ADDRESS
            0x34,                                         // inc (hl)
            0xFB,                                         // ei
            0xC9,                                         // ret
        ];
        const main = [
            0xED, 0x56,                                   // im 1
            0xFB,                                         // ei
            0x18, 0xFE,                                   // jr $
        ];
        handler.forEach((value, i) => trs80.writeMemory(0x4012 + i, value));
        main.forEach((value, i) => trs80.writeMemory(0x5000 + i, value));
        trs80.jumpTo(0x5000);
        return trs80;
    }

    /**
     * Step the machine for the given number of t-states.
     */
    function runFor(trs80: Trs80, tStates: number): void {
        const end = trs80.tStateCount + tStates;
        while (trs80.tStateCount < end) {
            trs80.step();
        }
    }

    it("interrupts 40 times a second", () => {
        const trs80 = makeSpinningModel1(true);
        // A little past one second, so that the 40th tick has certainly fired.
        runFor(trs80, trs80.clockHz + 1000);
        expect(trs80.readMemory(COUNTER_ADDRESS)).to.equal(40);
    });
    it("keeps interrupting until acknowledged", () => {
        const trs80 = makeSpinningModel1(false);
        runFor(trs80, trs80.clockHz/10);
        expect(trs80.readMemory(COUNTER_ADDRESS)).to.be.greaterThan(40);
    });
    it("acknowledges when 0x37E0 is read", () => {
        const trs80 = makeMachine(Config.makeDefault().edit().withModelType(ModelType.MODEL1).build());
        runFor(trs80, trs80.clockHz/30);
        expect(trs80.readMemory(0x37E0) & TIMER_IRQ_MASK).to.equal(TIMER_IRQ_MASK);
        expect(trs80.readMemory(0x37E0) & TIMER_IRQ_MASK).to.equal(0);
    });
});

describe("cassette motor", () => {
    const CASSETTE_RISE_IRQ_MASK = 0x01;
    const CASSETTE_FALL_IRQ_MASK = 0x02;
    const MOTOR_ON = 0x02;

    /**
     * Make a machine with the cassette interrupts enabled and the motor just turned on.
     */
    function makeMachineWithMotorOn(): Trs80 {
        const trs80 = makeMachine();
        trs80.setIrqMask(CASSETTE_RISE_IRQ_MASK | CASSETTE_FALL_IRQ_MASK);
        trs80.writePort(0xEC, MOTOR_ON);
        return trs80;
    }

    it("kicks off the cassette one second of t-states after starting", () => {
        const trs80 = makeMachineWithMotorOn();
        trs80.eventScheduler.dispatch(trs80.tStateCount + trs80.clockHz - 1);
        expect(trs80.save().irqLatch & CASSETTE_RISE_IRQ_MASK).to.equal(0);
        trs80.eventScheduler.dispatch(trs80.tStateCount + trs80.clockHz);
        expect(trs80.save().irqLatch & CASSETTE_RISE_IRQ_MASK).to.equal(CASSETTE_RISE_IRQ_MASK);
    });
    it("doesn't kick off the cassette if the motor stops first", () => {
        const trs80 = makeMachineWithMotorOn();
        trs80.writePort(0xEC, 0);
        // Starting again must not leave the first kick-off pending.
        trs80.writePort(0xEC, MOTOR_ON);
        trs80.writePort(0xEC, 0);
        trs80.eventScheduler.dispatch(trs80.tStateCount + 2*trs80.clockHz);
        expect(trs80.save().irqLatch & CASSETTE_RISE_IRQ_MASK).to.equal(0);
    });
});
