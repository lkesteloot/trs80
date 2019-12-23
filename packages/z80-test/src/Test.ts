import {CpuEvent} from "./CpuEvent";
import {MemoryContent} from "./MemoryContent";
import {makeEmptyRegisterSet, RegisterSet} from "./RegisterSet";

export class Test {
    public name: string;
    public preRegisterSet: RegisterSet = makeEmptyRegisterSet();
    public preHalted: boolean = false;
    public preTStateCount: number = 0;
    public preMemory: MemoryContent = new Map();

    public postCpuEvents: CpuEvent[] = [];
    public postRegisterSet: RegisterSet = makeEmptyRegisterSet();
    public postHalted: boolean = false;
    public postTStateCount: number = 0;
    public postMemory: MemoryContent = new Map();

    constructor(name: string) {
        this.name = name;
    }
}
