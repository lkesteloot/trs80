import {makeEmptyRegisterSet, RegisterSet} from "./RegisterSet";
import {MemoryContent} from "./MemoryContent";
import {CpuEvent} from "./CpuEvent";

export class Test {
    name: string;
    preRegisterSet: RegisterSet = makeEmptyRegisterSet();
    preHalted: boolean = false;
    preTCount: number = 0;
    preMemory: MemoryContent = [];

    postCpuEvents: CpuEvent[] = [];
    postRegisterSet: RegisterSet = makeEmptyRegisterSet();
    postHalted: boolean = false;
    postTCount: number = 0;

    constructor(name: string) {
        this.name = name;
    }
}