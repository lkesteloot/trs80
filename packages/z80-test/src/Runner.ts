import * as fs from "fs";
import * as path from "path";
import {CpuEvent} from "./CpuEvent";
import {CpuEventType, parseCpuEventType} from "./CpuEventType";
import {Delegate} from "./Delegate";
import {allRegisters, Register} from "./Register";
import {Test} from "./Test";
import {toHex} from "./Utils";

const IN_FILENAME = "tests.in";
const EXPECTED_FILENAME = "tests.expected";

/**
 * State of the parser of "in" and "expected" files.
 */
enum ParserState {
    EXPECTING_NAME,
    EXPECTING_REG1,
    EXPECTING_REG2,
    EXPECTING_MEMORY,
    EXPECTING_EVENT_OR_REG1,
}

/**
 * Runs the Z80 tests.
 */
export class Runner {
    /**
     * All the tests that were parsed, keyed on the test name.
     */
    public tests: Map<string, Test> = new Map();
    /**
     * All errors found when running the tests.
     */
    public errors: string[] = [];
    /**
     * Number of passed tests.
     */
    public successfulTests: number = 0;
    /**
     * Whether to check that the t-state count is correct after each test.
     */
    public checkTStates: boolean = true;
    /**
     * Whether to check that the CPU events are correct after each test.
     */
    public checkEvents: boolean = true;
    /**
     * Whether to check that memory and port contend CPU events are correct after each test.
     */
    public checkContend: boolean = true;
    /**
     * CPU delegate for the test.
     */
    private readonly delegate: Delegate;

    constructor(delegate: Delegate) {
        this.delegate = delegate;
    }

    /**
     * Load tests from the text files.
     */
    public loadTests() {
        const moduleDir = path.join(__dirname, "..");
        const testDir = path.join(moduleDir, "tests");
        const inPathname = path.join(testDir, IN_FILENAME);
        const expectedPathname = path.join(testDir, EXPECTED_FILENAME);

        this.tests = new Map();
        this.errors = [];
        this.parseFile(inPathname, false);
        this.parseFile(expectedPathname, true);
        console.log("Loaded " + this.tests.size + " tests");
    }

    /**
     * Run all tests.
     */
    public runAll(): void {
        this.successfulTests = 0;
        for (const test of this.tests.values()) {
            const success = this.runTest(test);
            if (success) {
                this.successfulTests += 1;
            }
        }
    }

    /**
     * Run one particular test by name.
     */
    public runOne(name: string): boolean {
        const test = this.tests.get(name);
        if (test === undefined) {
            console.log("Can't find test \"" + name + "\"");
            return false;
        } else {
            const success =  this.runTest(test);
            if (success) {
                this.successfulTests += 1;
                console.log("Passed " + test.name);
            }
            return success;
        }
    }

    /**
     * Parse a test file, adding it to the map.
     */
    private parseFile(pathname: string, isExpected: boolean) {
        let state = ParserState.EXPECTING_NAME;
        let test = new Test("unset");

        fs.readFileSync(pathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
            line = line.trim();

            switch (state) {
                case ParserState.EXPECTING_NAME:
                    if (line === "") {
                        // Stay in this state.
                    } else {
                        const name = line;
                        if (isExpected) {
                            const possibleTest = this.tests.get(name);
                            if (test === undefined) {
                                throw new Error("Test " + name + " in \"expected\" file not found in \"in\" file");
                            }
                            test = possibleTest as Test;
                            state = ParserState.EXPECTING_EVENT_OR_REG1;
                        } else {
                            test = new Test(name);
                            this.tests.set(name, test);
                            state = ParserState.EXPECTING_REG1;
                        }
                    }
                    break;

                case ParserState.EXPECTING_REG1:
                case ParserState.EXPECTING_EVENT_OR_REG1: {
                    // AF BC DE HL AF' BC' DE' HL' IX IY SP PC MEMPTR
                    // <time> <type> <address> <data>

                    const fields = line.split(/\s+/);
                    if (state === ParserState.EXPECTING_EVENT_OR_REG1 && (fields.length === 3 || fields.length === 4)) {
                        // Event.
                        test.postCpuEvents.push(new CpuEvent(
                            parseInt(fields[0], 10),
                            parseCpuEventType(fields[1]),
                            parseInt(fields[2], 16),
                            fields.length === 4 ? parseInt(fields[3], 16) : undefined));
                    } else if (fields.length === 13) {
                        // REG1.
                        const hexFields = fields.map((value) => parseInt(value, 16));
                        const registerSet = isExpected ? test.postRegisterSet : test.preRegisterSet;
                        registerSet.set(Register.AF, hexFields[0]);
                        registerSet.set(Register.BC, hexFields[1]);
                        registerSet.set(Register.DE, hexFields[2]);
                        registerSet.set(Register.HL, hexFields[3]);
                        registerSet.set(Register.AF_PRIME, hexFields[4]);
                        registerSet.set(Register.BC_PRIME, hexFields[5]);
                        registerSet.set(Register.DE_PRIME, hexFields[6]);
                        registerSet.set(Register.HL_PRIME, hexFields[7]);
                        registerSet.set(Register.IX, hexFields[8]);
                        registerSet.set(Register.IY, hexFields[9]);
                        registerSet.set(Register.SP, hexFields[10]);
                        registerSet.set(Register.PC, hexFields[11]);
                        registerSet.set(Register.MEMPTR, hexFields[12]);
                        state = ParserState.EXPECTING_REG2;
                    } else {
                        throw new Error("Unexpected line: " + line);
                    }
                    break;
                }

                case ParserState.EXPECTING_REG2: {
                    // I R IFF1 IFF2 IM <halted> <tstates>
                    const fields = line.split(/\s+/);
                    if (fields.length !== 7) {
                        throw new Error("Found " + fields.length + " fields in REG2: " + line);
                    }
                    const registerSet = isExpected ? test.postRegisterSet : test.preRegisterSet;
                    registerSet.set(Register.I, parseInt(fields[0], 16));
                    registerSet.set(Register.R, parseInt(fields[1], 16));
                    registerSet.set(Register.IFF1, parseInt(fields[2], 10));
                    registerSet.set(Register.IFF2, parseInt(fields[3], 10));
                    registerSet.set(Register.IM, parseInt(fields[4], 10));
                    if (isExpected) {
                        test.postHalted = parseInt(fields[5], 10) !== 0;
                        test.postTStateCount = parseInt(fields[6], 10);
                    } else {
                        test.preHalted = parseInt(fields[5], 10) !== 0;
                        test.preTStateCount = parseInt(fields[6], 10);
                    }
                    state = ParserState.EXPECTING_MEMORY;
                    break;
                }

                case ParserState.EXPECTING_MEMORY:
                    // <start address> <byte1> <byte2> ... -1
                    if (line === "-1" || line === "") {
                        // End of test.
                        state = ParserState.EXPECTING_NAME;
                    } else {
                        // Split at whitespace.
                        const fields = line.split(/\s+/);
                        if (fields.length < 3) {
                            throw new Error("Found unusual memory line: " + line);
                        }

                        let address = parseInt(fields[0], 16);
                        for (let i = 1; i < fields.length; i++) {
                            const field = fields[i];
                            if (field === "-1") {
                                break;
                            }
                            const value = parseInt(fields[i], 16);
                            if (isExpected) {
                                test.postMemory.set(address, value);
                            } else {
                                test.preMemory.set(address, value);
                            }
                            address += 1;
                        }
                    }
                    break;
            }
        });
    }

    /**
     * Run one test.
     */
    private runTest(test: Test): boolean {
        let success = true;

        // Setup.
        this.delegate.startNewTest(test.name);
        for (const register of allRegisters) {
            const value = test.preRegisterSet.get(register);
            this.delegate.setRegister(register, value);
        }
        for (const [address, value] of test.preMemory) {
            this.delegate.writeMemory(address, value);
        }
        if (test.preHalted) {
            throw new Error("Don't know how to handle preHalted");
        }

        // Run the test.
        const events = this.delegate.run(test.preTStateCount);

        // Check results.
        for (const register of allRegisters) {
            const expectedValue = test.postRegisterSet.get(register);
            const actualValue = this.delegate.getRegister(register);
            if (actualValue !== expectedValue) {
                this.errors.push(test.name + ": expected register " + Register[register] + " to be " +
                    toHex(expectedValue, 4) + " but was " + toHex(actualValue, 4));
                success = false;
            }
        }
        for (const [address, expectedValue] of test.postMemory) {
            const actualValue = this.delegate.readMemory(address);
            if (actualValue !== expectedValue) {
                this.errors.push(test.name + ": expected memory " + toHex(address, 4) + " to be " +
                    toHex(expectedValue, 2) + " but was " + toHex(actualValue, 2));
                success = false;
            }
        }
        const actualTStateCount = this.delegate.getTStateCount();
        if (this.checkTStates && actualTStateCount !== test.postTStateCount) {
            this.errors.push(test.name + ": expected " + test.postTStateCount +
                " t-counts but got " + actualTStateCount);
            success = false;
        }
        if (this.checkEvents) {
            // TODO compare events.
            console.log("Expected events:");
            for (const event of test.postCpuEvents) {
                if (this.checkContend ||
                    (event.eventType !== CpuEventType.MEMORY_CONTEND &&
                     event.eventType !== CpuEventType.PORT_CONTEND)) {
                    console.log(event.toString());
                }
            }
            console.log("Actual events:");
            for (const event of events) {
                if (this.checkContend ||
                    (event.eventType !== CpuEventType.MEMORY_CONTEND &&
                     event.eventType !== CpuEventType.PORT_CONTEND)) {
                    console.log(event.toString());
                }
            }
        }
        if (test.postHalted) {
            // TODO, we don't currently check this.
        }

        return success;
    }
}
