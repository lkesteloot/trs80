/**
 * MCP (Model Context Protocol) server, speaking JSON-RPC 2.0 over stdio.
 *
 * This lets an AI assistant drive a TRS-80 headlessly: boot a ROM, type at it,
 * run it for an exact number of clock cycles, and inspect memory, registers and
 * the screen. The machine persists between calls, so a session is a REPL rather
 * than a batch job.
 *
 * We speak the protocol directly instead of pulling in the MCP SDK, because it's
 * only a handful of methods and this tool ships as a standalone binary.
 *
 * IMPORTANT: stdout is the protocol channel. Nothing else may write to it, so we
 * redirect console output to stderr below.
 */

import fs from "fs";
import {
    BasicLevel, CassettePlayer, Config, Keyboard, ModelType, SilentSoundPlayer, Trs80, Trs80Screen,
} from "trs80-emulator";
import {decodeTrs80File} from "trs80-base";

const SCREEN_BEGIN = 0x3C00;
const SCREEN_WIDTH = 64;
const SCREEN_HEIGHT = 16;
const ROM_END = 0x3800;
const MAX_READ = 1024;
const PROTOCOL_VERSION = "2024-11-05";

/**
 * Screen that just remembers what was written, so we can read it back as text.
 */
class HeadlessScreen extends Trs80Screen {
    public readonly mem = new Uint8Array(SCREEN_WIDTH*SCREEN_HEIGHT).fill(32);

    setConfig(): void {
        // Don't care.
    }

    writeChar(address: number, value: number): void {
        const offset = address - SCREEN_BEGIN;
        if (offset >= 0 && offset < this.mem.length) {
            this.mem[offset] = value;
        }
    }

    getForegroundColor(): string {
        return "white";
    }

    getBackgroundColor(): string {
        return "black";
    }

    /**
     * The screen as lines of text. Graphics characters (128-191) become "#", since
     * they've no text equivalent, and trailing blanks are trimmed.
     */
    lines(): string[] {
        const lines: string[] = [];
        for (let row = 0; row < SCREEN_HEIGHT; row++) {
            let line = "";
            for (let col = 0; col < SCREEN_WIDTH; col++) {
                const ch = this.mem[row*SCREEN_WIDTH + col];
                line += ch >= 32 && ch < 128 ? String.fromCharCode(ch) : ch >= 128 ? "#" : " ";
            }
            lines.push(line.replace(/\s+$/, ""));
        }
        return lines;
    }
}

/**
 * A running machine, kept alive between tool calls.
 */
class Machine {
    public readonly trs80: Trs80;
    public readonly screen = new HeadlessScreen();
    public readonly keyboard = new Keyboard();

    constructor(cmdPathname: string | undefined, modelType: ModelType, basicLevel: BasicLevel) {
        // A .cmd that replaces the ROM has blocks below ROM_END (the ROM itself) and
        // above (data the ROM expects to find in RAM). The emulator write-protects the
        // ROM, so the low blocks have to go in as a custom ROM image and the rest gets
        // poked into RAM once we've booted.
        let customRom: string | undefined = undefined;
        const ramBlocks: {address: number, data: Uint8Array}[] = [];
        if (cmdPathname !== undefined) {
            const file = decodeTrs80File(new Uint8Array(fs.readFileSync(cmdPathname)),
                {filename: cmdPathname});
            const chunks = (file as any).chunks ?? [];
            const rom = new Uint8Array(ROM_END);
            let sawRom = false;
            for (const chunk of chunks) {
                if (chunk.className !== "CmdLoadBlockChunk") {
                    continue;
                }
                if (chunk.address < ROM_END) {
                    rom.set(chunk.loadData, chunk.address);
                    sawRom = true;
                } else {
                    ramBlocks.push({address: chunk.address, data: chunk.loadData});
                }
            }
            if (!sawRom) {
                throw new Error(`${cmdPathname} has no data below 0x${ROM_END.toString(16)}, ` +
                    `so it's not a replacement ROM`);
            }
            customRom = String.fromCharCode(...rom);
        }

        const config = Config.makeDefault().edit()
            .withModelType(modelType)
            .withBasicLevel(basicLevel)
            .withCustomRom(customRom)
            .build();
        this.trs80 = new Trs80(config, this.screen, this.keyboard,
            new CassettePlayer(), new SilentSoundPlayer());
        this.trs80.reset();
        for (const block of ramBlocks) {
            for (let i = 0; i < block.data.length; i++) {
                this.trs80.writeMemory(block.address + i, block.data[i]);
            }
        }
    }

    get clockHz(): number {
        return this.trs80.clockHz;
    }

    get tStateCount(): number {
        return this.trs80.tStateCount;
    }

    /**
     * Step until we've burned "cycles" t-states. Returns how many we actually used.
     */
    runCycles(cycles: number): number {
        const start = this.trs80.tStateCount;
        while (this.trs80.tStateCount - start < cycles) {
            this.trs80.step();
        }
        return this.trs80.tStateCount - start;
    }

    registers(): Record<string, number> {
        const r = (this.trs80 as any).z80.regs;
        return {
            pc: r.pc, sp: r.sp, af: r.af, bc: r.bc, de: r.de, hl: r.hl, ix: r.ix, iy: r.iy,
            tStateCount: this.trs80.tStateCount,
        };
    }
}

//--- Tools.

const hex = (n: number, digits = 4) => "0x" + n.toString(16).toUpperCase().padStart(digits, "0");

let machine: Machine | undefined = undefined;

function needMachine(): Machine {
    if (machine === undefined) {
        throw new Error("No machine running. Call \"boot\" first.");
    }
    return machine;
}

interface Tool {
    description: string;
    inputSchema: any;
    run: (args: any) => string;
}

const TOOLS: Record<string, Tool> = {
    boot: {
        description: "Boot (or reboot) a TRS-80. Give a .cmd file that replaces the ROM to run a " +
            "custom ROM, or omit it for the stock Basic ROM. Resets any existing machine.",
        inputSchema: {
            type: "object",
            properties: {
                cmd: {type: "string", description: "Path to a .cmd file holding a replacement ROM"},
                model: {type: "integer", enum: [1, 3, 4], description: "Model, defaults to 3"},
                level: {type: "integer", enum: [1, 2], description: "Basic level, defaults to 2"},
            },
        },
        run: args => {
            const modelType = args.model === 1 ? ModelType.MODEL1 :
                args.model === 4 ? ModelType.MODEL4 : ModelType.MODEL3;
            const basicLevel = args.level === 1 ? BasicLevel.LEVEL1 : BasicLevel.LEVEL2;
            machine = new Machine(args.cmd, modelType, basicLevel);
            return `Booted model ${args.model ?? 3}, level ${args.level ?? 2}, ` +
                `${machine.clockHz} Hz` + (args.cmd ? `, ROM from ${args.cmd}` : ", stock ROM") +
                `.\nNothing has run yet; call "run" to let it boot.`;
        },
    },

    run: {
        description: "Run the machine for a given number of clock cycles (t-states) or emulated " +
            "seconds. This is the clock: t-states are exact and reproducible.",
        inputSchema: {
            type: "object",
            properties: {
                cycles: {type: "integer", description: "T-states to run"},
                seconds: {type: "number", description: "Emulated seconds to run (cycles = seconds*clockHz)"},
            },
        },
        run: args => {
            const m = needMachine();
            const cycles = args.cycles ?? Math.round((args.seconds ?? 1)*m.clockHz);
            const before = m.tStateCount;
            const used = m.runCycles(cycles);
            return `Ran ${used.toLocaleString()} t-states (${(used/m.clockHz).toFixed(3)}s emulated).\n` +
                `tStateCount ${before.toLocaleString()} -> ${m.tStateCount.toLocaleString()}`;
        },
    },

    step: {
        description: "Single-step the CPU, returning the registers afterwards. For close inspection.",
        inputSchema: {
            type: "object",
            properties: {count: {type: "integer", description: "Instructions to step, defaults to 1"}},
        },
        run: args => {
            const m = needMachine();
            const count = args.count ?? 1;
            for (let i = 0; i < count; i++) {
                m.trs80.step();
            }
            const r = m.registers();
            return `Stepped ${count}.\n` + Object.entries(r)
                .map(([k, v]) => k === "tStateCount" ? `${k}=${v.toLocaleString()}` : `${k}=${hex(v)}`)
                .join(" ");
        },
    },

    run_until_pc: {
        description: "Run until the program counter reaches an address, or until maxCycles is spent. " +
            "A breakpoint. Reports whether it was hit and how many cycles it took to get there.",
        inputSchema: {
            type: "object",
            properties: {
                address: {type: "integer", description: "Address to stop at"},
                maxCycles: {type: "integer", description: "Give up after this many t-states"},
            },
            required: ["address", "maxCycles"],
        },
        run: args => {
            const m = needMachine();
            const start = m.tStateCount;
            const limit = start + args.maxCycles;
            const regs = (m.trs80 as any).z80.regs;
            let hit = false;
            while (m.tStateCount < limit) {
                m.trs80.step();
                if (regs.pc === args.address) {
                    hit = true;
                    break;
                }
            }
            const used = m.tStateCount - start;
            return hit
                ? `Reached ${hex(args.address)} after ${used.toLocaleString()} t-states.`
                : `Did NOT reach ${hex(args.address)} within ${args.maxCycles.toLocaleString()} t-states.`;
        },
    },

    screen: {
        description: "The screen as 16 lines of text. Graphics characters show as '#'.",
        inputSchema: {type: "object", properties: {}},
        run: () => {
            const lines = needMachine().screen.lines();
            const last = lines.reduce((acc, l, i) => l.trim() !== "" ? i : acc, 0);
            return lines.slice(0, last + 1).map((l, i) => String(i).padStart(2) + "|" + l).join("\n");
        },
    },

    read_memory: {
        description: `Read memory as hex. Length is capped at ${MAX_READ} bytes.`,
        inputSchema: {
            type: "object",
            properties: {
                address: {type: "integer"},
                length: {type: "integer", description: `Bytes to read, max ${MAX_READ}`},
            },
            required: ["address", "length"],
        },
        run: args => {
            const m = needMachine();
            const length = Math.min(args.length, MAX_READ);
            const out: string[] = [];
            for (let row = 0; row < length; row += 16) {
                const bytes: string[] = [];
                for (let i = row; i < Math.min(row + 16, length); i++) {
                    bytes.push(m.trs80.readMemory(args.address + i).toString(16).toUpperCase().padStart(2, "0"));
                }
                out.push(hex(args.address + row) + ": " + bytes.join(" "));
            }
            return out.join("\n") + (args.length > MAX_READ ? `\n(truncated to ${MAX_READ} bytes)` : "");
        },
    },

    write_memory: {
        description: "Write bytes to RAM. Writes below the ROM end are ignored by the machine.",
        inputSchema: {
            type: "object",
            properties: {
                address: {type: "integer"},
                bytes: {type: "array", items: {type: "integer"}},
            },
            required: ["address", "bytes"],
        },
        run: args => {
            const m = needMachine();
            for (let i = 0; i < args.bytes.length; i++) {
                m.trs80.writeMemory(args.address + i, args.bytes[i] & 0xFF);
            }
            return `Wrote ${args.bytes.length} bytes at ${hex(args.address)}.`;
        },
    },

    registers: {
        description: "The Z80 registers and the current t-state count.",
        inputSchema: {type: "object", properties: {}},
        run: () => {
            const r = needMachine().registers();
            return Object.entries(r)
                .map(([k, v]) => k === "tStateCount" ? `${k}=${v.toLocaleString()}` : `${k}=${hex(v)}`)
                .join(" ");
        },
    },

    profile_pc: {
        description: "Run for some cycles and report where the program counter spent its time, " +
            "as a histogram of the hottest addresses. Use this to find out which loop is costing you.",
        inputSchema: {
            type: "object",
            properties: {
                cycles: {type: "integer", description: "T-states to profile over"},
                top: {type: "integer", description: "How many hot addresses to report, defaults to 20"},
                low: {type: "integer", description: "Only count addresses at or above this"},
                high: {type: "integer", description: "Only count addresses at or below this"},
            },
            required: ["cycles"],
        },
        run: args => {
            const m = needMachine();
            const regs = (m.trs80 as any).z80.regs;
            const low = args.low ?? 0;
            const high = args.high ?? 0xFFFF;
            const counts = new Map<number, number>();
            const start = m.tStateCount;
            let samples = 0;
            while (m.tStateCount - start < args.cycles) {
                const pc = regs.pc;
                if (pc >= low && pc <= high) {
                    counts.set(pc, (counts.get(pc) ?? 0) + 1);
                    samples++;
                }
                m.trs80.step();
            }
            const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, args.top ?? 20);
            const lines = sorted.map(([pc, n]) =>
                `  ${hex(pc)}  ${String(n).padStart(9)}  ${(100*n/samples).toFixed(1)}%`);
            return `Profiled ${(m.tStateCount - start).toLocaleString()} t-states, ` +
                `${samples.toLocaleString()} instructions in range.\n` +
                `  addr        count  share\n` + lines.join("\n");
        },
    },
};

TOOLS["type"] = {
    description: "Type text at the keyboard, as if a person did. Use \\n for Enter. Runs the " +
        "machine afterwards so the ROM has a chance to consume the keystrokes.",
    inputSchema: {
        type: "object",
        properties: {
            text: {type: "string", description: "Text to type. A newline (or the two characters \\n) means Enter."},
            settleSeconds: {type: "number", description: "Emulated seconds to run after typing, defaults to 1"},
        },
        required: ["text"],
    },
    run: args => {
        const m = needMachine();
        // Accept both a real newline and a literal backslash-n, since it's easy
        // to send either and typing "\\n" at Basic is never what anyone wants.
        const text = args.text.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
        m.keyboard.simulateKeyboardText(text);
        const used = m.runCycles(Math.round((args.settleSeconds ?? 1)*m.clockHz));
        return `Typed ${JSON.stringify(text)}, then ran ${used.toLocaleString()} t-states.`;
    },
};

//--- JSON-RPC 2.0 over stdio.

function send(message: any): void {
    process.stdout.write(JSON.stringify(message) + "\n");
}

function reply(id: any, result: any): void {
    send({jsonrpc: "2.0", id, result});
}

function replyError(id: any, code: number, message: string): void {
    send({jsonrpc: "2.0", id, error: {code, message}});
}

function handle(request: any): void {
    const {id, method, params} = request;

    switch (method) {
        case "initialize":
            reply(id, {
                // Echo the client's version back when they ask for one, for compatibility.
                protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
                capabilities: {tools: {}},
                serverInfo: {name: "trs80-tool", version: "1.0.0"},
            });
            break;

        case "notifications/initialized":
        case "notifications/cancelled":
            // Notifications have no id and take no reply.
            break;

        case "ping":
            reply(id, {});
            break;

        case "tools/list":
            reply(id, {
                tools: Object.entries(TOOLS).map(([name, tool]) => ({
                    name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                })),
            });
            break;

        case "tools/call": {
            const tool = TOOLS[params?.name];
            if (tool === undefined) {
                replyError(id, -32602, "Unknown tool: " + params?.name);
                break;
            }
            try {
                const text = tool.run(params.arguments ?? {});
                reply(id, {content: [{type: "text", text}]});
            } catch (e) {
                // Report tool failures in the result, not as protocol errors, so the
                // assistant sees what went wrong and can try something else.
                reply(id, {
                    content: [{type: "text", text: "Error: " + (e instanceof Error ? e.message : String(e))}],
                    isError: true,
                });
            }
            break;
        }

        default:
            if (id !== undefined) {
                replyError(id, -32601, "Method not found: " + method);
            }
            break;
    }
}

/**
 * Run the MCP server, reading requests from stdin until it closes.
 */
export function mcp(): void {
    // stdout belongs to the protocol. The emulator logs things like ROM-write
    // warnings, and any of that on stdout would corrupt the stream.
    console.log = (...args: any[]) => process.stderr.write(args.join(" ") + "\n");
    console.info = console.log;
    console.warn = console.log;
    console.error = console.log;

    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => {
        buffer += chunk;
        for (;;) {
            const newline = buffer.indexOf("\n");
            if (newline < 0) {
                break;
            }
            const line = buffer.substring(0, newline).trim();
            buffer = buffer.substring(newline + 1);
            if (line === "") {
                continue;
            }
            let request: any;
            try {
                request = JSON.parse(line);
            } catch (e) {
                replyError(null, -32700, "Parse error");
                continue;
            }
            try {
                handle(request);
            } catch (e) {
                if (request.id !== undefined) {
                    replyError(request.id, -32603,
                        e instanceof Error ? e.message : String(e));
                }
            }
        }
    });
    process.stdin.on("end", () => process.exit(0));
}
