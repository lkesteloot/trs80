import {Delegate, Register, Runner, toHex} from "z80-test";
import {Z80} from "./Z80";
import {Hal} from "./Hal";
import {CpuEvent} from "z80-test/dist/CpuEvent";
import {CpuEventType} from "z80-test/dist/CpuEventType";

class HalImpl implements Hal {
    public memory: Uint8Array = new Uint8Array(64*1024);
    public events: CpuEvent[] = [];
    public tStateCount = 0;

    public reset(): void {
        this.memory.fill(0);
        this.events = [];
        this.tStateCount = 0;
    }

    contendMemory(address: number): void {
        this.events.push(new CpuEvent(this.tStateCount, CpuEventType.MEMORY_CONTEND, address));
    }

    contendPort(address: number): void {
        this.events.push(new CpuEvent(this.tStateCount, CpuEventType.PORT_CONTEND, address));
    }

    readMemory(address: number): number {
        const value = this.memory[address];
        this.events.push(new CpuEvent(this.tStateCount, CpuEventType.MEMORY_READ, address, value));
        return value;
    }

    readPort(address: number): number {
        const value = 0;
        this.events.push(new CpuEvent(this.tStateCount, CpuEventType.PORT_READ, address, value));
        return value;
    }

    writeMemory(address: number, value: number): void {
        this.events.push(new CpuEvent(this.tStateCount, CpuEventType.MEMORY_WRITE, address, value));
        this.memory[address] = value;
    }

    writePort(address: number, value: number): void {
        this.events.push(new CpuEvent(this.tStateCount, CpuEventType.PORT_WRITE, address, value));
    }
}

class DelegateImpl implements Delegate {
    private hal: HalImpl = new HalImpl();
    private z80: Z80 = new Z80(this.hal);

    public startNewTest(name: string): void {
        console.log("Running test \"" + name + "\"");
        this.z80.reset();
        this.hal.reset();
    }

    public getRegister(register: Register): number {
        const value = this.z80.regs.get(register) as number;
        console.log("Checking value of " + Register[register] + " (" + toHex(value, 4) + ")");
        return value;
    }

    public readMemory(address: number): number {
        const value = this.hal.memory[address];
        console.log("Checking value of " + toHex(address, 4) + " (" + toHex(value, 2) + ")");
        return value;
    }

    public run(tStateCount: number): CpuEvent[] {
        console.log("Running for " + tStateCount + " t-states");
        while (this.hal.tStateCount < tStateCount) {
            this.z80.step();
        }
        return this.hal.events;
    }

    public setRegister(register: Register, value: number): void {
        console.log("Setting register " + Register[register] + " to " + toHex(value, 4));
        this.z80.regs.set(register, value);
    }

    public writeMemory(address: number, value: number): void {
        console.log("Writing " + toHex(value, 2) + " to " + toHex(address, 4));
        this.hal.memory[address] = value;
    }

    public getTStateCount(): number {
        return this.hal.tStateCount;
    }
}

const delegate = new DelegateImpl();
const runner = new Runner(delegate);
runner.checkEvents = false;
runner.checkTStates = false;
runner.checkContend = false;
runner.loadTests();
if (true) {
    runner.runAll();
} else {
    runner.runOne("edbb");
}
for (const error of runner.errors) {
    console.log(error);
}
console.log(`Passed ${runner.successfulTests} of ${runner.tests.size} (${Math.round(runner.successfulTests*100/runner.tests.size)}%) with ${runner.errors.length} errors`);
