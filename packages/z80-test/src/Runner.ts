import * as path from "path";
import * as fs from "fs";
import {Delegate} from "./Delegate";
import {Test} from "./Test";
import {Register} from "./Register";
import {CpuEvent} from "./CpuEvent";
import {parseCpuEventType} from "./CpuEventType";
import {toHex} from "./Utils";

const IN_FILENAME = "tests.in";
const EXPECTED_FILENAME = "tests.expected";

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
    testFileDir: string;
    delegate: Delegate;
    tests: Map<string, Test> = new Map();
    errors: string[] = [];
    successfulTests: number = 0;

    constructor(testFileDir: string, delegate: Delegate) {
        this.testFileDir = testFileDir;
        this.delegate = delegate;
    }

    loadTests() {
        const inPathname = path.join(this.testFileDir, IN_FILENAME);
        const expectedPathname = path.join(this.testFileDir, EXPECTED_FILENAME);

        this.tests = new Map();
        this.errors = [];
        this.parseFile(inPathname, false);
        this.parseFile(expectedPathname, true);
        console.log("Loaded " + this.tests.size + " tests");
    }

    runAll() {
        this.successfulTests = 0;
        for (const test of this.tests.values()) {
            const success = this.runTest(test);
            if (success) {
                this.successfulTests += 1;
            }
        }
    }

    runOne(testName: string) {
        // TODO.
    }


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

                    let fields = line.split(/\s+/);
                    if (state == ParserState.EXPECTING_EVENT_OR_REG1 && (fields.length === 3 || fields.length === 4)) {
                        // Event.
                        test.postCpuEvents.push(new CpuEvent(
                            parseInt(fields[0]),
                            parseCpuEventType(fields[1]),
                            parseInt(fields[1], 16),
                            fields.length === 4 ? parseInt(fields[2], 16) : undefined));
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
                    registerSet.set(Register.IFF1, parseInt(fields[2]));
                    registerSet.set(Register.IFF2, parseInt(fields[3]));
                    registerSet.set(Register.IM, parseInt(fields[4]));
                    if (isExpected) {
                        test.postHalted = parseInt(fields[5]) != 0;
                        test.postTStateCount = parseInt(fields[6]);
                    } else {
                        test.preHalted = parseInt(fields[5]) != 0;
                        test.preTStateCount = parseInt(fields[6]);
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
        })
    }

    private runTest(test: Test): boolean {
        let success = true;

        // Setup.
        this.delegate.startNewTest(test.name);
        for (const [register, value] of test.preRegisterSet.entries()) {
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
        // TODO compare events.
        for (const [register, expectedValue] of test.postRegisterSet.entries()) {
            const actualValue = this.delegate.getRegister(register);
            if (actualValue != expectedValue) {
                this.errors.push(test.name + ": expected register " + Register[register] + " to be " +
                    toHex(expectedValue, 4) + " but was " + toHex(actualValue, 4));
                success = false;
            }
        }
        for (const [address, expectedValue] of test.postMemory) {
            const actualValue = this.delegate.readMemory(address);
            if (actualValue != expectedValue) {
                this.errors.push(test.name + ": expected memory " + toHex(address, 4) + " to be " +
                    toHex(expectedValue, 2) + " but was " + toHex(actualValue, 2));
                success = false;
            }
        }
        const actualTStateCount = this.delegate.getTStateCount();
        if (actualTStateCount != test.postTStateCount) {
            this.errors.push(test.name + ": expected " + test.postTStateCount + " t-counts but got " + actualTStateCount);
            success = false;
        }

        return success;
    }
}
