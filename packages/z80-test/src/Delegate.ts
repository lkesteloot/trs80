import {Register} from "./Register";

export interface Delegate {
    /**
     * Reset the machine to a known state for a new test. Reset t-state count.
     */
    startNewTest(name: string): void;

    /**
     * Set the specified register value.
     */
    setRegister(register: Register, value: number): void;

    /**
     * Read the specified register value.
     */
    getRegister(register: Register): number;

    /**
     * Run for at least this many t-states. Complete the last operation.
     */
    run(tStateCount: number): Event[];

    /**
     * Write a byte at the specified address.
     */
    writeMemory(address: number, value: number): void;

    /**
     * Read a byte from the specified address.
     */
    readMemory(address: number): number;

    /**
     * Get the number of t-state counts that ran.
     */
    getTStateCount(): number;
}
