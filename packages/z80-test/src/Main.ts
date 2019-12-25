import {Delegate} from "./Delegate";
import {Register} from "./Register";
import {Runner} from "./Runner";
import {toHex} from "./Utils";
import {CpuEvent} from "./CpuEvent";

class DelegateImpl implements Delegate {
    public getRegister(register: Register): number {
        const value = 0;
        console.log("Checking value of " + Register[register] + " (" + toHex(value, 4) + ")");
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
        console.log("Setting register " + Register[register] + " to " + toHex(value, 4));
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

const delegate = new DelegateImpl();
const runner = new Runner(delegate);
runner.checkTStates = false;
runner.checkEvents = false;
runner.loadTests();
runner.runAll();
for (const error of runner.errors) {
    console.log(error);
}
console.log(`Passed ${runner.successfulTests} of ${runner.tests.size} (${Math.round(runner.successfulTests*100/runner.tests.size)}%) with ${runner.errors.length} errors`);
