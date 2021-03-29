import {RegisterSet} from "z80-base";
import {CpuEvent} from "./CpuEvent.js";
import {MemoryContent} from "./MemoryContent.js";

/**
 * All the information (in and expected) about one test.
 */
export class Test {
    public name: string;
    public preRegisterSet: RegisterSet = new RegisterSet();
    public preTStateCount: number = 0;
    public preMemory: MemoryContent = new Map();

    public postCpuEvents: CpuEvent[] = [];
    public postRegisterSet: RegisterSet = new RegisterSet();
    public postTStateCount: number = 0;
    public postMemory: MemoryContent = new Map();

    constructor(name: string) {
        this.name = name;
    }
}
