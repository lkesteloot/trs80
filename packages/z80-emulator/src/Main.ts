import {Delegate, Register, Runner, toHex} from "z80-test";
import {Z80} from "./Z80";

class DelegateImpl implements Delegate {
    private ram: Uint8Array = new Uint8Array(64*1024);
    private z80: Z80 = new Z80(this.ram);

    public startNewTest(name: string): void {
        console.log("Running test \"" + name + "\"");
        this.z80.reset();
        this.ram.fill(0);
    }

    public getRegister(register: Register): number {
        const value = this.z80.regs.get(register) as number;
        console.log("Checking value of " + Register[register] + " (" + toHex(value, 4) + ")");
        return value;
    }

    public readMemory(address: number): number {
        const value = this.ram[address];
        console.log("Checking value of " + toHex(address, 4) + " (" + toHex(value, 2) + ")");
        return value;
    }

    public run(tStateCount: number): Event[] {
        console.log("Running for " + tStateCount + " t-states");
        while (this.z80.tStateCount < tStateCount) {
            this.z80.step();
        }
        return [];
    }

    public setRegister(register: Register, value: number): void {
        console.log("Setting register " + Register[register] + " to " + toHex(value, 4));
        this.z80.regs.set(register, value);
    }

    public writeMemory(address: number, value: number): void {
        console.log("Writing " + toHex(value, 2) + " to " + toHex(address, 4));
        this.ram[address] = value;
    }

    public getTStateCount(): number {
        return this.z80.tStateCount;
    }
}

const delegate = new DelegateImpl();
const runner = new Runner(delegate);
runner.loadTests();
runner.runAll();
for (const error of runner.errors) {
    console.log(error);
}
console.log(`Passed ${runner.successfulTests} of ${runner.tests.size} (${Math.round(runner.successfulTests*100/runner.tests.size)}%) with ${runner.errors.length} errors`);
