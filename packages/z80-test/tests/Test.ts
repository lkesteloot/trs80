import {Register, toHex} from "z80-base";
import {CpuEvent} from "../src/CpuEvent.js";
import {Delegate} from "../src/Delegate.js";
import {Runner} from "../src/Runner.js";

// Dummy delegate that does nothing.
class DelegateImpl implements Delegate {
    public getRegister(register: Register): number {
        const value = 0;
        console.log("Checking value of " + register + " (" + toHex(value, 4) + ")");
        return value;
    }

    public readMemory(address: number): number {
        const value = 0;
        console.log("Checking value of " + toHex(address, 4) + " (" + toHex(value, 2) + ")");
        return value;
    }

    public run(tStateCount: number): CpuEvent[] {
        console.log("Running for " + tStateCount + " t-states");
        return [];
    }

    public setRegister(register: Register, value: number): void {
        console.log("Setting register " + register + " to " + toHex(value, 4));
    }

    public startNewTest(name: string): void {
        console.log("Running test \"" + name + "\"");
    }

    public writeMemory(address: number, value: number): void {
        console.log("Writing " + toHex(value, 2) + " to " + toHex(address, 4));
    }

    public getTStateCount(): number {
        return 0;
    }
}

// Check that the test files load and that every test has expected results.
// Actually running the tests needs a real Z80; z80-emulator's tests use this
// runner to do that.
const runner = new Runner(new DelegateImpl());
runner.loadTests(); // Throws if a file is malformed.

// Every instruction takes at least four t-states, so zero means that the
// "expected" file had nothing for that test.
const incomplete = [...runner.tests.values()].filter(test => test.postTStateCount === 0);
if (runner.tests.size === 0 || incomplete.length > 0) {
    console.log(`Found ${runner.tests.size} tests, ${incomplete.length} without expected results: ` +
        incomplete.slice(0, 10).map(test => test.name).join(", "));
    process.exitCode = 1;
} else {
    console.log(`All ${runner.tests.size} tests have expected results`);
}
