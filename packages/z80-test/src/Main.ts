import {Runner} from "./Runner";
import {Delegate} from "./Delegate";
import {Register} from "./Register";

class DelegateImpl implements Delegate {
    getRegister(register: Register): number {
        return 0;
    }

    readMemory(address: number): number {
        return 0;
    }

    run(tStateCount: number): Event[] {
        return [];
    }

    setRegister(register: Register, value: number): void {
    }

    startNewTest(name: string): void {
        console.log(name);
    }

    writeMemory(address: number, value: number): void {
    }

}

const delegate = new DelegateImpl();
const runner = new Runner("tests", delegate);
runner.runAll();
