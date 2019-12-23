import {makeEmptyRegisterSet, RegisterSet} from "./RegisterSet";
import {MemoryContent} from "./MemoryContent";
import {CpuEvent} from "./CpuEvent";

export class Test {
    name: string;
    preRegisterSet: RegisterSet = makeEmptyRegisterSet();
    preHalted: boolean = false;
    preTStateCount: number = 0;
    preMemory: MemoryContent = new Map();

    postCpuEvents: CpuEvent[] = [];
    postRegisterSet: RegisterSet = makeEmptyRegisterSet();
    postHalted: boolean = false;
    postTStateCount: number = 0;
    postMemory: MemoryContent = new Map();

    constructor(name: string) {
        this.name = name;
    }
}