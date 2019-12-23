import * as path from "path";
import * as fs from "fs";
import {Delegate} from "./Delegate";
import {Test} from "./Test";
import {Register} from "./Register";
import {MemoryByteContent} from "./MemoryByteContent";
import {CpuEvent} from "./CpuEvent";
import {parseCpuEventType} from "./CpuEventType";

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

    constructor(testFileDir: string, delegate: Delegate) {
        this.testFileDir = testFileDir;
        this.delegate = delegate;
    }

    runAll() {
        const inPathname = path.join(this.testFileDir, IN_FILENAME);
        const expectedPathname = path.join(this.testFileDir, EXPECTED_FILENAME);

        this.tests = new Map();
        this.parseFile(inPathname, false);
        this.parseFile(expectedPathname, true);

        console.log("Found " + this.tests.size + " tests");
        for (const test of this.tests) {
            console.log(test);
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
                        registerSet[Register.AF] = hexFields[0];
                        registerSet[Register.BC] = hexFields[1];
                        registerSet[Register.DE] = hexFields[2];
                        registerSet[Register.HL] = hexFields[3];
                        registerSet[Register.AF_PRIME] = hexFields[4];
                        registerSet[Register.BC_PRIME] = hexFields[5];
                        registerSet[Register.DE_PRIME] = hexFields[6];
                        registerSet[Register.HL_PRIME] = hexFields[7];
                        registerSet[Register.IX] = hexFields[8];
                        registerSet[Register.IY] = hexFields[9];
                        registerSet[Register.SP] = hexFields[10];
                        registerSet[Register.PC] = hexFields[11];
                        registerSet[Register.MEMPTR] = hexFields[12];
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
                    registerSet[Register.I] = parseInt(fields[0], 16);
                    registerSet[Register.R] = parseInt(fields[1], 16);
                    registerSet[Register.IFF1] = parseInt(fields[2]);
                    registerSet[Register.IFF2] = parseInt(fields[3]);
                    registerSet[Register.IM] = parseInt(fields[4]);
                    if (isExpected) {
                        test.postHalted = parseInt(fields[5]) != 0;
                        test.postTCount = parseInt(fields[6]);
                    } else {
                        test.preHalted = parseInt(fields[5]) != 0;
                        test.preTCount = parseInt(fields[6]);
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
                            test.preMemory.push(new MemoryByteContent(address, value));
                            address += 1;
                        }
                    }
                    break;
            }
        })
    }
}