import {CpuEvent} from "./CpuEvent";
import {MemoryContent} from "./MemoryContent";
import {RegisterSet} from "./RegisterSet";

/**
 * All the information (in and expected) about one test.
 */
export class Test {
    public name: string;
    public preRegisterSet: RegisterSet = new RegisterSet();
    public preHalted: boolean = false;
    public preTStateCount: number = 0;
    public preMemory: MemoryContent = new Map();

    public postCpuEvents: CpuEvent[] = [];
    public postRegisterSet: RegisterSet = new RegisterSet();
    public postHalted: boolean = false;
    public postTStateCount: number = 0;
    public postMemory: MemoryContent = new Map();

    constructor(name: string) {
        this.name = name;
    }
}
