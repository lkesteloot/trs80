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
 *
 * When you add, remove, or change a tool, update the user documentation to match:
 * the "mcp" section of site/index.html lists every tool with a one-line description,
 * and the change log at the bottom of that page should mention the change.
 *
 * Adding a tool: add an entry to TOOLS with a description written for the model that
 * will call it, a JSON schema for its arguments, and a run() that returns text. Keep
 * the output compact -- it all lands in the caller's context window -- and cap
 * anything that could get large. Report failures by throwing; they come back as an
 * isError result the model can read and react to. Test by piping JSON-RPC into
 * "node bin/trs80-tool.js mcp", update the site as above, and keep a pull request
 * to one tool.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {spawnSync} from "child_process";
import {
    BasicLevel, CassettePlayer, Config, Keyboard, ModelType, SilentSoundPlayer, Trs80, Trs80Screen,
    model1ScreenCodeToModel3,
} from "trs80-emulator";
import {decodeBasicProgram, decodeTrs80File, isFloppy, MODEL3_FONT, parseBasicText} from "trs80-base";
import {Disasm} from "z80-disasm";

const SCREEN_BEGIN = 0x3C00;
const SCREEN_WIDTH = 64;
const SCREEN_HEIGHT = 16;
const MAX_READ = 1024;
const PROTOCOL_VERSION = "2024-11-05";

// Model III glyphs are 8 CRT pixels wide and 24 tall, so a whole screen is 512x384.
const GLYPH_WIDTH = MODEL3_FONT.width;
const GLYPH_HEIGHT = 24;
const GRID_WIDTH = SCREEN_WIDTH*GLYPH_WIDTH;
const GRID_HEIGHT = SCREEN_HEIGHT*GLYPH_HEIGHT;

// Margin around the character grid, in the same CRT pixels, so that text and graphics
// don't sit flush against the edge. This is what trs80-emulator-web uses for its
// default display type (the padding for DisplayType.SIMPLE in CanvasScreen's ConfiguredCanvas).
const SCREEN_PADDING = 10;

const FRAME_WIDTH = GRID_WIDTH + 2*SCREEN_PADDING;
const FRAME_HEIGHT = GRID_HEIGHT + 2*SCREEN_PADDING;

// What trs80-emulator-web shows by default: white P4 phosphor on a dark green
// screen (AUTHENTIC_BACKGROUND in CanvasScreen.ts).
const FOREGROUND = [0xFF, 0xFF, 0xFF];
const BACKGROUND = [0x33, 0x48, 0x43];

const DEFAULT_FPS = 30;
const DEFAULT_SCALE = 2;
// At 30 fps that's two minutes, and 1 KB per frame of memory.
const MAX_FRAMES = 3600;

// Given to the model once, when the session starts. Informational on purpose: it's
// read by agents that rightly distrust imperative text arriving from a tool.
const SERVER_INSTRUCTIONS = [
    "Drives a TRS-80 emulator headlessly. The machine persists between calls, so work",
    "interactively: boot, look at the screen, act, look again. Times are in t-states",
    "(Z80 clock cycles), which are exact and reproducible.",
    "",
    "Things that trip people up: the keyboard only takes about 15 characters per emulated",
    "second (\"type\" waits for that), so on the stock ROM use load_basic, which puts a",
    "listing straight into memory. (boot answers the stock ROM's startup questions itself:",
    "Memory Size?, and Cass? too on the Model III and 4, which are the only ones that ask it.)",
    "For exact timing, use run_until_memory and let the",
    "program's own writes be the clock; run_until_screen only checks every ~2,000",
    "instructions.",
    "",
    "This server is open source: " +
        "https://github.com/lkesteloot/trs80/blob/master/packages/trs80-tool/src/mcp.ts",
    "If a tool you need is missing, mention it to your user; they may want to contribute",
    "one. Each tool is a small, self-contained entry in the TOOLS table, and the comment",
    "at the top of the file says what a good addition looks like.",
].join("\n");

/**
 * Screen that just remembers what was written, so we can read it back as text.
 */
class HeadlessScreen extends Trs80Screen {
    public readonly mem = new Uint8Array(SCREEN_WIDTH*SCREEN_HEIGHT).fill(32);
    private config: Config | undefined = undefined;

    /**
     * Remember the config, so that {@link writeChar()} knows which model's screen codes it's getting.
     */
    setConfig(config: Config): void {
        this.config = config;
    }

    /**
     * Store the character. On a Model I the byte is converted to the Model III character code that
     * looks the same, because the Model I's Level II ROM stores capitals as 0x00 to 0x1F, which
     * {@link lines()} would show as blanks and which MODEL3_FONT (the only font we render with) draws
     * as other glyphs. That's fine for the original Model I generator too: it has no lowercase and
     * the Model III font's capitals are the same shapes, and the graphics blocks are identical.
     */
    writeChar(address: number, value: number): void {
        const offset = address - SCREEN_BEGIN;
        if (offset >= 0 && offset < this.mem.length) {
            this.mem[offset] = this.config?.modelType === ModelType.MODEL1 ?
                model1ScreenCodeToModel3(value) : value;
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


//--- Rendering the screen to pixels.

// Laid out as [row of pixels][character][column of pixels], 0 or 255.
const FONT_SHEET = new Uint8Array(MODEL3_FONT.makeFontSheet());

/**
 * Rasterize the 1 KB screen into an RGB24 frame, FRAME_WIDTH by FRAME_HEIGHT,
 * with the character grid inset by SCREEN_PADDING on all sides.
 */
function renderFrame(mem: Uint8Array, out: Uint8Array): void {
    // The margin, and anything we don't draw over.
    for (let i = 0; i < FRAME_WIDTH*FRAME_HEIGHT; i++) {
        out[i*3 + 0] = BACKGROUND[0];
        out[i*3 + 1] = BACKGROUND[1];
        out[i*3 + 2] = BACKGROUND[2];
    }

    for (let row = 0; row < SCREEN_HEIGHT; row++) {
        for (let y = 0; y < GLYPH_HEIGHT; y++) {
            const sheetRow = y*256*GLYPH_WIDTH;
            let o = ((SCREEN_PADDING + row*GLYPH_HEIGHT + y)*FRAME_WIDTH + SCREEN_PADDING)*3;
            for (let col = 0; col < SCREEN_WIDTH; col++) {
                const sheetChar = sheetRow + mem[row*SCREEN_WIDTH + col]*GLYPH_WIDTH;
                for (let x = 0; x < GLYPH_WIDTH; x++) {
                    const color = FONT_SHEET[sheetChar + x] === 0 ? BACKGROUND : FOREGROUND;
                    out[o++] = color[0];
                    out[o++] = color[1];
                    out[o++] = color[2];
                }
            }
        }
    }
}

/**
 * Hand raw RGB24 frames to ffmpeg. Scaling happens here rather than in renderFrame
 * so that the pipe stays small, and it's nearest-neighbor so the pixels stay square
 * and sharp -- a smooth upscale makes H.264 ring badly on this kind of image.
 */
function runFfmpeg(rawInput: string | Uint8Array, outPathname: string, fps: number,
                   scale: number, pngFrame: boolean): void {

    const args = [
        "-y",
        "-f", "rawvideo",
        "-pixel_format", "rgb24",
        "-video_size", `${FRAME_WIDTH}x${FRAME_HEIGHT}`,
        "-framerate", String(fps),
        "-i", typeof rawInput === "string" ? rawInput : "-",
        "-vf", `scale=${FRAME_WIDTH*scale}:${FRAME_HEIGHT*scale}:flags=neighbor`,
    ];
    if (pngFrame) {
        args.push("-frames:v", "1");
    } else {
        args.push(
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-an");
    }
    args.push(outPathname);

    const result = spawnSync("ffmpeg", args, {
        input: typeof rawInput === "string" ? undefined : Buffer.from(rawInput),
        maxBuffer: 64*1024*1024,
    });
    if (result.error !== undefined) {
        throw new Error(`Can't run ffmpeg (${result.error.message}). Install it with "brew install ffmpeg".`);
    }
    if (result.status !== 0) {
        const stderr = (result.stderr ?? "").toString().trim().split("\n").slice(-5).join("\n");
        throw new Error(`ffmpeg failed (status ${result.status}):\n${stderr}`);
    }
}

/**
 * Collects screen snapshots at a fixed interval of *emulated* time, so playback is
 * real time no matter how long we take to compute it. Frames are kept as the 1 KB
 * screen and only rasterized at the end, which keeps a long recording cheap.
 */
class Recorder {
    private readonly frames: Uint8Array[] = [];
    private nextFrameTState: number;
    public truncated = false;

    constructor(public readonly pathname: string, public readonly fps: number,
                public readonly scale: number, public readonly startTState: number,
                private readonly tStatesPerFrame: number) {

        this.nextFrameTState = startTState;
    }

    get frameCount(): number {
        return this.frames.length;
    }

    /**
     * Called after every instruction. Emits as many frames as the elapsed time calls
     * for, so a single long-running tool call still produces a smooth video.
     */
    capture(tStateCount: number, mem: Uint8Array): void {
        while (tStateCount >= this.nextFrameTState) {
            if (this.frames.length >= MAX_FRAMES) {
                this.truncated = true;
                return;
            }
            this.frames.push(mem.slice());
            this.nextFrameTState += this.tStatesPerFrame;
        }
    }

    /**
     * Rasterize everything through a temporary file and encode it. The raw frames are
     * far too big to hold in memory (about 0.6 MB each), but they compress to very
     * little, since this kind of screen barely changes from frame to frame.
     */
    encode(): void {
        if (this.frames.length === 0) {
            throw new Error("Nothing was recorded. Run the machine between record_start and record_stop.");
        }

        const rawPathname = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "trs80-video-")), "frames.rgb");
        try {
            const frame = new Uint8Array(FRAME_WIDTH*FRAME_HEIGHT*3);
            const fd = fs.openSync(rawPathname, "w");
            try {
                for (const mem of this.frames) {
                    renderFrame(mem, frame);
                    fs.writeSync(fd, frame);
                }
            } finally {
                fs.closeSync(fd);
            }
            runFfmpeg(rawPathname, this.pathname, this.fps, this.scale, false);
        } finally {
            fs.rmSync(path.dirname(rawPathname), {recursive: true, force: true});
        }
    }
}

/**
 * A running machine, kept alive between tool calls.
 */
class Machine {
    public readonly trs80: Trs80;
    public readonly screen = new HeadlessScreen();
    public readonly keyboard = new Keyboard();
    // In the stock Level II ROM, "rst 08" is followed by an inline byte: the
    // character the syntax checker expects next in the Basic text.
    public readonly rst8IsSyntaxCheck: boolean;
    // Set by record_start. Every tool that runs the machine goes through step(),
    // so recording picks up whatever the caller does next.
    public recorder: Recorder | undefined = undefined;

    constructor(cmdPathname: string | undefined, modelType: ModelType, basicLevel: BasicLevel) {
        // A .cmd that replaces the ROM has blocks below the end of the ROM (the ROM itself)
        // and above (data the ROM expects to find in RAM). The emulator write-protects the
        // ROM, so the low blocks have to go in as a custom ROM image and the rest gets
        // poked into RAM once we've booted.
        const configBuilder = Config.makeDefault().edit()
            .withModelType(modelType)
            .withBasicLevel(basicLevel);
        const romSize = configBuilder.build().romSize;
        let customRom: string | undefined = undefined;
        const ramBlocks: {address: number, data: Uint8Array}[] = [];
        if (cmdPathname !== undefined) {
            const file = decodeTrs80File(new Uint8Array(fs.readFileSync(cmdPathname)),
                {filename: cmdPathname});
            const chunks = (file as any).chunks ?? [];
            const rom = new Uint8Array(romSize);
            let sawRom = false;
            for (const chunk of chunks) {
                if (chunk.className !== "CmdLoadBlockChunk") {
                    continue;
                }
                if (chunk.address < romSize) {
                    if (chunk.address + chunk.loadData.length > romSize) {
                        throw new Error(`${cmdPathname} has a block at 0x${chunk.address.toString(16)} ` +
                            `of ${chunk.loadData.length} bytes that crosses the end of the ` +
                            `${romSize} byte ROM (0x${romSize.toString(16)})`);
                    }
                    rom.set(chunk.loadData, chunk.address);
                    sawRom = true;
                } else {
                    ramBlocks.push({address: chunk.address, data: chunk.loadData});
                }
            }
            if (!sawRom) {
                throw new Error(`${cmdPathname} has no data below 0x${romSize.toString(16)}, ` +
                    `so it's not a replacement ROM`);
            }
            customRom = String.fromCharCode(...rom);
        }

        const config = configBuilder.withCustomRom(customRom).build();
        this.rst8IsSyntaxCheck = customRom === undefined && basicLevel === BasicLevel.LEVEL2;
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
     * One instruction. Everything in this file steps the machine through here so that
     * a recording in progress sees every frame.
     */
    step(): void {
        this.trs80.step();
        this.recorder?.capture(this.trs80.tStateCount, this.screen.mem);
    }

    /**
     * Step until we've burned "cycles" t-states. Returns how many we actually used.
     */
    runCycles(cycles: number): number {
        const start = this.trs80.tStateCount;
        while (this.trs80.tStateCount - start < cycles) {
            this.step();
        }
        return this.trs80.tStateCount - start;
    }

    /**
     * Run until the ROM has taken every queued key, or maxCycles pass. The keyboard
     * holds each key event until the machine reads its row, and for a while after,
     * so this is the only reliable way to know typing is finished. Returns whether
     * the queue emptied.
     */
    drainKeyboard(maxCycles: number): boolean {
        const limit = this.trs80.tStateCount + maxCycles;
        while (this.keyboard.keyQueue.length > 0 && this.trs80.tStateCount < limit) {
            this.step();
        }
        return this.keyboard.keyQueue.length === 0;
    }

    /**
     * Run until the text appears on screen, checking every few thousand instructions.
     * Returns whether it appeared within maxCycles.
     */
    runUntilScreen(text: string, maxCycles: number, checkEvery = 2000): boolean {
        const limit = this.trs80.tStateCount + maxCycles;
        while (this.trs80.tStateCount < limit) {
            for (let i = 0; i < checkEvery; i++) {
                this.step();
            }
            if (this.screen.lines().join("\n").includes(text)) {
                return true;
            }
        }
        return false;
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
                answerPrompts: {type: "boolean", description: "On the stock Level II ROM, answer the " +
                    "Memory Size? question (and Cass?, which only the Model III and 4 ask) and run until READY. Defaults to true. Ignored " +
                    "for a replacement ROM, which is left un-run."},
            },
        },
        run: args => {
            const modelType = args.model === 1 ? ModelType.MODEL1 :
                args.model === 4 ? ModelType.MODEL4 : ModelType.MODEL3;
            const basicLevel = args.level === 1 ? BasicLevel.LEVEL1 : BasicLevel.LEVEL2;
            const m = machine = new Machine(args.cmd, modelType, basicLevel);
            const booted = `Booted model ${args.model ?? 3}, level ${args.level ?? 2}, ` +
                `${m.clockHz} Hz` + (args.cmd ? `, ROM from ${args.cmd}` : ", stock ROM") + ".";
            if (!m.rst8IsSyntaxCheck || args.answerPrompts === false) {
                return booted + `\nNothing has run yet; call "run" to let it boot.`;
            }
            // Same as Trs80.runBasicProgram(): give it a moment to ask its questions, then press
            // Enter for each. The Model I doesn't ask Cass?. Enter for Memory Size? makes the ROM
            // test memory, which takes a couple of seconds. (On the Model III and 4, "0" would
            // skip the test, but the ROM only takes it with 48 KB installed.)
            const questions = modelType === ModelType.MODEL1 ? "Memory Size?" : "Cass? and Memory Size?";
            const answers = modelType === ModelType.MODEL1 ? "\n" : "\n\n";
            m.runCycles(Math.round(0.1*m.clockHz));
            m.keyboard.simulateKeyboardText(answers);
            m.drainKeyboard(Math.round(10*m.clockHz));
            if (!m.runUntilScreen("READY", Math.round(5*m.clockHz))) {
                return booted + ` Answered ${questions} but never saw READY. Screen:\n` +
                    m.screen.lines().filter(l => l.trim() !== "").join("\n");
            }
            return booted + ` Answered ${questions}; at READY after ` +
                `${m.tStateCount.toLocaleString()} t-states.`;
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
                m.step();
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
                m.step();
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
                m.step();
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
    description: "Type text at the keyboard, as if a person did. Runs the machine until the ROM " +
        "or DOS has taken every keystroke (about 15 characters per emulated second), then " +
        "a short settle so it can act on the last one. Each key waits until the machine next " +
        "scans the keyboard, so keys typed while a DOS is busy aren't lost. Use \\n for Enter.",
    inputSchema: {
        type: "object",
        properties: {
            text: {type: "string", description: "Text to type. A newline (or the two characters \\n) means Enter."},
            settleSeconds: {type: "number", description: "Emulated seconds to run after the last key is taken, defaults to 0.1"},
            maxSeconds: {type: "number", description: "Give up if the keys aren't all taken within this many emulated seconds, defaults to 60"},
        },
        required: ["text"],
    },
    run: args => {
        const m = needMachine();
        // Accept both a real newline and a literal backslash-n, since it's easy
        // to send either and typing "\\n" at Basic is never what anyone wants.
        const text = args.text.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
        m.keyboard.simulateKeyboardText(text);

        // The keyboard holds each key event until the machine reads its row, and for
        // a while after, so any fixed settle time is a guess. Guess too short and the
        // leftover keys leak into whatever you do next. Instead run until the queue
        // is empty.
        const start = m.tStateCount;
        m.drainKeyboard(Math.round((args.maxSeconds ?? 60)*m.clockHz));
        const typing = m.tStateCount - start;
        if (m.keyboard.keyQueue.length > 0) {
            // Don't leave stale keys behind to corrupt the next step.
            const left = m.keyboard.keyQueue.length;
            m.keyboard.keyQueue.length = 0;
            m.keyboard.clearKeyboard();
            throw new Error(`Only some of the text was taken after ${typing.toLocaleString()} t-states; ` +
                `${left} key events were still queued and have been discarded. Is the ROM reading ` +
                `the keyboard? (A running program that doesn't poll it won't take keys.)`);
        }
        const settle = m.runCycles(Math.round((args.settleSeconds ?? 0.1)*m.clockHz));
        return `Typed ${JSON.stringify(text)}. All keys taken after ${typing.toLocaleString()} t-states ` +
            `(${(typing/m.clockHz).toFixed(2)}s), then settled ${settle.toLocaleString()} more.`;
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
                instructions: SERVER_INSTRUCTIONS,
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

TOOLS["run_until_screen"] = {
    description: "Run until some text appears on the screen, then report how many t-states it " +
        "took. The screen is only checked every checkEvery instructions (default 2,000, roughly " +
        "10,000-20,000 t-states), so the time can be that much late: fine for runs of millions of " +
        "t-states, too coarse for short ones. For exact timing use run_until_memory.",
    inputSchema: {
        type: "object",
        properties: {
            text: {type: "string", description: "Text to wait for, anywhere on screen"},
            maxCycles: {type: "integer", description: "Give up after this many t-states"},
            checkEvery: {type: "integer", description: "Instructions between screen checks, defaults to 2000"},
        },
        required: ["text", "maxCycles"],
    },
    run: args => {
        const m = needMachine();
        const start = m.tStateCount;
        const limit = start + args.maxCycles;
        // Checking the screen after every instruction would dominate the run time,
        // so only look every so often. The screen doesn't change that fast.
        const CHECK_EVERY = Math.max(1, args.checkEvery ?? 2000);
        let found = false;
        while (m.tStateCount < limit) {
            for (let i = 0; i < CHECK_EVERY; i++) {
                m.step();
            }
            if (m.screen.lines().join("\n").includes(args.text)) {
                found = true;
                break;
            }
        }
        const used = m.tStateCount - start;
        return found
            ? `Found ${JSON.stringify(args.text)} after ${used.toLocaleString()} t-states ` +
              `(${(used/m.clockHz).toFixed(3)}s emulated).`
            : `Did NOT see ${JSON.stringify(args.text)} within ${args.maxCycles.toLocaleString()} t-states.`;
    },
};

TOOLS["disassemble"] = {
    description: "Disassemble instructions straight out of the machine's memory, following the " +
        "bytes as the CPU would. Works on ROM as well as RAM. On the stock Level II ROM, " +
        "\"rst 08\" is followed by an inline byte (the character the Basic syntax checker " +
        "expects), and this shows it as such rather than decoding it as an instruction.",
    inputSchema: {
        type: "object",
        properties: {
            address: {type: "integer", description: "Address to start at"},
            count: {type: "integer", description: "How many instructions, defaults to 16, max 200"},
            rst8Inline: {type: "boolean", description: "Treat the byte after \"rst 08\" as inline data. " +
                "Defaults to true on the stock Level II ROM and false otherwise."},
        },
        required: ["address"],
    },
    run: args => {
        const m = needMachine();
        const count = Math.min(args.count ?? 16, 200);
        const rst8Inline = args.rst8Inline ?? m.rst8IsSyntaxCheck;
        const disasm = new Disasm();
        const lines: string[] = [];
        let address = args.address;
        for (let i = 0; i < count; i++) {
            const instruction = disasm.disassembleTrace(address, a => m.trs80.readMemory(a));
            if (instruction === undefined) {
                break;
            }
            if (rst8Inline && instruction.bin.length === 1 && instruction.bin[0] === 0xCF) {
                const expected = m.trs80.readMemory(address + 1);
                const shown = expected >= 32 && expected < 127 ? `'${String.fromCharCode(expected)}'` : hex(expected, 2);
                lines.push(`${hex(address)}  ${("CF " + hex(expected, 2).substring(2)).padEnd(12)}  ` +
                    `rst 08  ; syntax check, expects ${shown}`);
                address += 2;
                continue;
            }
            lines.push(`${hex(address)}  ${instruction.binText().padEnd(12)}  ${instruction.toText(false)}`);
            address += instruction.bin.length;
        }
        return lines.join("\n");
    },
};

TOOLS["search_memory"] = {
    description: "Find a byte sequence in memory. Useful for locating a known code idiom in ROM " +
        "when you don't have a symbol for it.",
    inputSchema: {
        type: "object",
        properties: {
            bytes: {type: "array", items: {type: "integer"}, description: "Byte sequence to find"},
            start: {type: "integer", description: "First address to search, defaults to 0"},
            end: {type: "integer", description: "Last address to search, defaults to 0xFFFF"},
        },
        required: ["bytes"],
    },
    run: args => {
        const m = needMachine();
        const start = args.start ?? 0;
        const end = Math.min(args.end ?? 0xFFFF, 0xFFFF);
        const pattern: number[] = args.bytes.map((b: number) => b & 0xFF);
        const hits: number[] = [];
        for (let address = start; address + pattern.length - 1 <= end; address++) {
            let match = true;
            for (let i = 0; i < pattern.length; i++) {
                if (m.trs80.readMemory(address + i) !== pattern[i]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                hits.push(address);
                if (hits.length >= 50) {
                    break;
                }
            }
        }
        return hits.length === 0
            ? "Not found."
            : `${hits.length} match${hits.length === 1 ? "" : "es"}: ` + hits.map(a => hex(a)).join(", ");
    },
};

TOOLS["key"] = {
    description: "Press or release a single key, and leave it that way. Use this when a program " +
        "cares that a key is held down, like a game reading the keyboard every frame. Key names " +
        "are browser style: \"a\", \" \", \"Enter\", \"ArrowLeft\", \"Shift\".",
    inputSchema: {
        type: "object",
        properties: {
            key: {type: "string", description: "Key name, browser style"},
            pressed: {type: "boolean", description: "True to press, false to release"},
        },
        required: ["key", "pressed"],
    },
    run: args => {
        const m = needMachine();
        m.keyboard.keyEvent(args.key, args.pressed);
        return `${args.pressed ? "Pressed" : "Released"} ${JSON.stringify(args.key)}. ` +
            `It stays that way until you change it; call "run" to let the machine see it.`;
    },
};

TOOLS["load_program"] = {
    description: "Load and start a program file (.cmd, .cas, .bas and so on) on the running " +
        "machine, the way \"trs80-tool run <program>\" does. For a program that replaces the ROM, " +
        "use \"boot\" instead.",
    inputSchema: {
        type: "object",
        properties: {path: {type: "string", description: "Path to the program file"}},
        required: ["path"],
    },
    run: args => {
        const m = needMachine();
        const file = decodeTrs80File(new Uint8Array(fs.readFileSync(args.path)), {filename: args.path});
        if ((file as any).error !== undefined) {
            throw new Error(`Can't read ${args.path}: ${(file as any).error}`);
        }
        m.trs80.runTrs80File(file as any);
        return `Loaded and started ${args.path} (${(file as any).className}).`;
    },
};

// Where call_routine's pushed return address points. The routine returning here is
// how we know it's done; that instruction never actually runs.
const RETURN_SENTINEL = 0xFFFF;
const ALL_REGISTERS = ["af", "bc", "de", "hl", "afPrime", "bcPrime", "dePrime", "hlPrime",
    "ix", "iy", "sp", "pc", "memptr", "i", "r", "iff1", "iff2", "im", "halted"];

TOOLS["call_routine"] = {
    description: "Call a machine-language routine the way a program would: set registers, push a " +
        "return address, jump in, and run until it returns. Reports exactly how many t-states the " +
        "routine took, including its final RET but not the caller's 17-cycle CALL. Interrupts are " +
        "held off during the call so they don't pollute the count. Afterwards every CPU register is " +
        "put back, so the machine carries on where it was; memory changes (pixels drawn, " +
        "variables written) are kept.",
    inputSchema: {
        type: "object",
        properties: {
            address: {type: "integer", description: "Address of the routine"},
            a: {type: "integer", description: "Value for A"},
            bc: {type: "integer"}, de: {type: "integer"}, hl: {type: "integer"},
            ix: {type: "integer"}, iy: {type: "integer"},
            push: {type: "array", items: {type: "integer"},
                description: "16-bit words to push after the return address, in order, so the last " +
                    "ends up on top. For entering a routine partway through, where it expects things " +
                    "already on the stack."},
            maxCycles: {type: "integer", description: "Give up after this many t-states, defaults to 10,000,000"},
            interrupts: {type: "boolean", description: "Leave interrupts enabled during the call, defaults to false"},
        },
        required: ["address"],
    },
    run: args => {
        const m = needMachine();
        const regs = (m.trs80 as any).z80.regs;
        const saved: Record<string, number> = {};
        for (const name of ALL_REGISTERS) {
            saved[name] = regs[name];
        }
        try {
            if (args.a !== undefined) {
                regs.af = ((args.a & 0xFF) << 8) | (regs.af & 0xFF);
            }
            for (const name of ["bc", "de", "hl", "ix", "iy"]) {
                if (args[name] !== undefined) {
                    regs[name] = args[name] & 0xFFFF;
                }
            }
            if (!args.interrupts) {
                regs.iff1 = 0;
                regs.iff2 = 0;
            }
            regs.halted = 0;

            const push = (word: number) => {
                regs.sp = (regs.sp - 2) & 0xFFFF;
                m.trs80.writeMemory(regs.sp, word & 0xFF);
                m.trs80.writeMemory((regs.sp + 1) & 0xFFFF, (word >> 8) & 0xFF);
            };
            // Once the routine has popped everything and returned, SP is back here.
            // Checking SP as well as PC means a stray jump to the sentinel doesn't count.
            const returnSp = regs.sp;
            push(RETURN_SENTINEL);
            for (const word of args.push ?? []) {
                push(word);
            }
            regs.pc = args.address;

            const start = m.tStateCount;
            const limit = start + (args.maxCycles ?? 10_000_000);
            let returned = false;
            while (m.tStateCount < limit) {
                m.step();
                if (regs.pc === RETURN_SENTINEL && regs.sp === returnSp) {
                    returned = true;
                    break;
                }
            }
            const used = m.tStateCount - start;
            const state = ["af", "bc", "de", "hl", "ix", "iy"].map(r => `${r}=${hex(regs[r])}`).join(" ");
            return returned
                ? `Returned after ${used.toLocaleString()} t-states.\nRegisters at return: ${state}`
                : `Did NOT return within ${used.toLocaleString()} t-states. PC was ${hex(regs.pc)}, ` +
                  `SP ${hex(regs.sp)}.\nRegisters: ${state}`;
        } finally {
            for (const name of ALL_REGISTERS) {
                regs[name] = saved[name];
            }
        }
    },
};

TOOLS["run_until_memory"] = {
    description: "Run until a memory byte holds a given value, checking after every instruction, and " +
        "report exactly how many t-states that took. Exact to the instruction, unlike " +
        "run_until_screen. Good for timing a program by its own work: wait for the first and last " +
        "bytes of a screen fill to be written, or have the program POKE a flag when it's done.",
    inputSchema: {
        type: "object",
        properties: {
            address: {type: "integer", description: "Address to watch"},
            value: {type: "integer", description: "Value to wait for"},
            mask: {type: "integer", description: "Only compare these bits, defaults to 0xFF"},
            maxCycles: {type: "integer", description: "Give up after this many t-states"},
        },
        required: ["address", "value", "maxCycles"],
    },
    run: args => {
        const m = needMachine();
        if (args.address >= 0x3800 && args.address < 0x3C00) {
            // Reading the keyboard matrix feeds queued keys to the machine, so watching
            // it would change what we're watching.
            throw new Error("Can't watch the keyboard matrix (0x3800-0x3BFF); reading it consumes keys.");
        }
        const mask = (args.mask ?? 0xFF) & 0xFF;
        const value = args.value & mask;
        const matches = () => (m.trs80.readMemory(args.address) & mask) === value;
        if (matches()) {
            return `${hex(args.address)} already holds ${hex(value, 2)}; ran nothing.`;
        }
        const start = m.tStateCount;
        const limit = start + args.maxCycles;
        let found = false;
        while (m.tStateCount < limit) {
            m.step();
            if (matches()) {
                found = true;
                break;
            }
        }
        const used = m.tStateCount - start;
        return found
            ? `${hex(args.address)} became ${hex(value, 2)} after ${used.toLocaleString()} t-states ` +
              `(${(used/m.clockHz).toFixed(4)}s emulated).`
            : `${hex(args.address)} did NOT become ${hex(value, 2)} within ${args.maxCycles.toLocaleString()} ` +
              `t-states; it holds ${hex(m.trs80.readMemory(args.address), 2)}.`;
    },
};

TOOLS["load_basic"] = {
    description: "Put a Basic listing straight into memory on the stock ROM, the way loading it " +
        "from tape would, instead of typing it. Much faster than \"type\", which manages about " +
        "20 characters a second. Replaces any program already there and doesn't run it. The " +
        "machine must be at READY. Stock Level II ROM only; with a replacement ROM, type the " +
        "program instead.",
    inputSchema: {
        type: "object",
        properties: {
            text: {type: "string", description: "The listing, one numbered line per line"},
        },
        required: ["text"],
    },
    run: args => {
        const m = needMachine();
        if (!m.rst8IsSyntaxCheck) {
            throw new Error("load_basic only works with the stock Level II ROM, whose program format " +
                "it writes. With a replacement ROM, use \"type\".");
        }
        // Basic keeps the address of its first program line here once it's set up memory.
        const start = m.trs80.readMemory(0x40A4) | (m.trs80.readMemory(0x40A5) << 8);
        if (start < 0x4200) {
            throw new Error("Basic hasn't set up memory yet. Boot and let it reach READY first.");
        }
        const text = args.text.replace(/\\n/g, "\n");
        const binary = parseBasicText(text);
        if (typeof binary === "string") {
            throw new Error("Couldn't parse the listing: " + binary);
        }
        const program = decodeBasicProgram(binary);
        if (program === undefined) {
            throw new Error("Parsed the listing but couldn't decode the result.");
        }
        m.trs80.loadBasicProgram(program);
        const lines = text.split("\n").filter((l: string) => l.trim() !== "").length;
        return `Loaded ${lines} line${lines === 1 ? "" : "s"} at ${hex(start)}. Type RUN to run it ` +
            `(for exact timing, type RUN without the Enter and press Enter with "key").`;
    },
};

TOOLS["record_start"] = {
    description: "Start recording video. Frames are taken at a fixed interval of emulated " +
        "time, so the result plays back in real time and shows honestly how fast a program " +
        "is. Everything that runs the machine after this is recorded, so type RUN without " +
        "the Enter first, start recording, then press Enter with \"key\". Call record_stop " +
        "to write the file.",
    inputSchema: {
        type: "object",
        properties: {
            path: {type: "string", description: "Where to write the .mp4"},
            fps: {type: "integer", description: "Frames per second, defaults to 30"},
            scale: {type: "integer",
                description: "Whole-number pixel scale, defaults to 2 (so 1024x768)"},
        },
        required: ["path"],
    },
    run: args => {
        const m = needMachine();
        if (m.recorder !== undefined) {
            throw new Error(`Already recording to ${m.recorder.pathname}. Call record_stop first.`);
        }
        const fps = args.fps ?? DEFAULT_FPS;
        const scale = args.scale ?? DEFAULT_SCALE;
        if (fps < 1 || fps > 60) {
            throw new Error("fps must be between 1 and 60");
        }
        if (scale < 1 || scale > 8) {
            throw new Error("scale must be between 1 and 8");
        }
        const tStatesPerFrame = Math.round(m.clockHz/fps);
        m.recorder = new Recorder(args.path, fps, scale, m.tStateCount, tStatesPerFrame);
        return `Recording to ${args.path} at ${fps} fps, ` +
            `${FRAME_WIDTH*scale}x${FRAME_HEIGHT*scale}, ` +
            `one frame every ${tStatesPerFrame.toLocaleString()} t-states. ` +
            `Run the machine, then call record_stop.`;
    },
};

TOOLS["record_stop"] = {
    description: "Stop recording and encode the video with ffmpeg. Reports how long the " +
        "clip is, which is emulated time, not how long the recording took.",
    inputSchema: {
        type: "object",
        properties: {},
    },
    run: () => {
        const m = needMachine();
        const recorder = m.recorder;
        if (recorder === undefined) {
            throw new Error("Not recording. Call record_start first.");
        }
        m.recorder = undefined;
        recorder.encode();

        const seconds = recorder.frameCount/recorder.fps;
        const bytes = fs.statSync(recorder.pathname).size;
        return `Wrote ${recorder.pathname}: ${recorder.frameCount} frames, ` +
            `${seconds.toFixed(1)}s at ${recorder.fps} fps, ` +
            `${(bytes/1024).toFixed(0)} KB.` +
            (recorder.truncated ? ` Stopped early at the ${MAX_FRAMES} frame limit.` : "");
    },
};

TOOLS["screenshot"] = {
    description: "Write the current screen to a PNG, in the same colors as the video.",
    inputSchema: {
        type: "object",
        properties: {
            path: {type: "string", description: "Where to write the .png"},
            scale: {type: "integer",
                description: "Whole-number pixel scale, defaults to 2 (so 1024x768)"},
        },
        required: ["path"],
    },
    run: args => {
        const m = needMachine();
        const scale = args.scale ?? DEFAULT_SCALE;
        if (scale < 1 || scale > 8) {
            throw new Error("scale must be between 1 and 8");
        }
        const frame = new Uint8Array(FRAME_WIDTH*FRAME_HEIGHT*3);
        renderFrame(m.screen.mem, frame);
        runFfmpeg(frame, args.path, 1, scale, true);
        const bytes = fs.statSync(args.path).size;
        return `Wrote ${args.path}: ${FRAME_WIDTH*scale}x${FRAME_HEIGHT*scale}, ` +
            `${(bytes/1024).toFixed(0)} KB.`;
    },
};

TOOLS["mount_disk"] = {
    description: "Mount a floppy disk image (.dsk, .dmk, .jv1, .jv3, .hfe, .imd) in a drive, without " +
        "rebooting. Use this when a program needs more than one disk, for instance a DOS in " +
        "drive 0 and an application in drive 1: mount them all, then call \"reset\" to boot " +
        "from drive 0. For the single-disk case, \"load_program\" mounts and boots in one step.",
    inputSchema: {
        type: "object",
        properties: {
            path: {type: "string", description: "Path to the disk image"},
            drive: {type: "integer", description: "Drive number, defaults to 0"},
        },
        required: ["path"],
    },
    run: args => {
        const m = needMachine();
        const drive = args.drive ?? 0;
        const file = decodeTrs80File(new Uint8Array(fs.readFileSync(args.path)), {filename: args.path});
        if ((file as any).error !== undefined) {
            throw new Error(`Can't read ${args.path}: ${(file as any).error}`);
        }
        if (!isFloppy(file as any)) {
            throw new Error(`${args.path} is a ${(file as any).className}, not a floppy disk`);
        }
        m.trs80.loadFloppyDisk(file as any, drive);
        return `Mounted ${args.path} (${(file as any).className}) in drive ${drive}. ` +
            `Call "reset" to boot from drive 0.`;
    },
};

TOOLS["reset"] = {
    description: "Reset the machine, as if you'd pressed the reset button. Keeps whatever " +
        "disks are mounted, so this is how you boot from a disk you mounted with mount_disk. " +
        "On a Model I the button only raises a non-maskable interrupt, which boots from drive 0 if " +
        "there's a disk there and otherwise returns to Basic with memory intact.",
    inputSchema: {
        type: "object",
        properties: {},
    },
    run: () => {
        const m = needMachine();
        m.trs80.pressResetButton();
        return `Reset. Run the machine to let it boot.`;
    },
};
