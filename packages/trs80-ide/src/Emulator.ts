import {EditorView} from '@codemirror/view';
import {
    CassettePlayer,
    FdcState,
    RunningState,
    Trs80,
    TRS80_KEYBOARD_BEGIN,
    TRS80_KEYBOARD_END,
    Trs80State
} from 'trs80-emulator';
import {
    CanvasScreen,
    ControlPanel,
    DriveIndicators,
    loadTrs80Config,
    PanelType,
    saveTrs80Config,
    SettingsPanel,
    WebKeyboard,
    WebSoundPlayer,
} from 'trs80-emulator-web';

import {ScreenEditor} from './ScreenEditor';
import {AssemblyResults} from './AssemblyResults';
import {SimpleEventDispatcher} from 'strongly-typed-events';
import {Flag, hi, inc16, lo, RegisterSet, toHexByte, toHexWord, word} from 'z80-base';
import {
    disasmForTrs80,
    HexdumpGenerator,
    ProgramAnnotation,
    Side,
    TRS80_SCREEN_BEGIN,
    TRS80_SCREEN_END
} from 'trs80-base';
import {saveSettings, Settings} from "./Settings";
import {DEFAULT_SCREEN_SIZE, SCREEN_SIZES_MAP, ScreenSize} from "./ScreenSize";
import {Editor} from "./Editor";
import {SymbolType} from "z80-asm";

const LOCAL_STORAGE_CONFIG_KEY = "trs80-ide-config";

const RUNNING_STATE_TO_LABEL = new Map([
    [RunningState.STOPPED, "stopped"],
    [RunningState.STARTED, "started"],
    [RunningState.PAUSED, "paused"],
]);

// Register pair that was pushed by the instruction at this address, or undefined
// if the instruction is not a push. (Calls don't count here, only explicit pushes.)
function pushedRegisterPair(trs80: Trs80, address: number): String | undefined {
    switch (trs80.readMemory(address)) {
        case 0xC5: return "bc";
        case 0xD5: return "de";
        case 0xE5: return "hl";
        case 0xF5: return "af";
        case 0xDD: return trs80.readMemory(address + 1) == 0xE5 ? "ix" : undefined;
        case 0xFD: return trs80.readMemory(address + 1) == 0xE5 ? "iy" : undefined;
        default: return undefined;
    }
}

// Whether the specified opcode is a CALL opcode, with or without the flag.
function isCallOpcode(opcode: number): boolean {
    // Flag is in bits 3 to 5.
    return opcode === 0xCD || (opcode & 0b11000111) === 0b11000100;
}

// Given two instruction bytes, whether we want to continue until the next
// instruction, and if so how long the current instruction is.
function getSkipLength(b1: number, b2: number): number | undefined {
    // Regular CALL or variant with flag.
    if (isCallOpcode(b1)) {
        // CALLs are always 3 bytes.
        return 3;
    }

    if (b1 === 0xED && (b2 & 0b11110100) === 0b10110000) {
        // Repeating instruction like LDIR. They're all two bytes.
        return 2;
    }

    return undefined;
}

// Remove all children from this node.
function emptyNode(node: HTMLElement): void {
    while (node.firstChild !== null) {
        node.firstChild.remove();
    }
}

// Encapsulates the emulator and methods for it.
export class Emulator {
    private readonly settings: Settings;
    private readonly screen: CanvasScreen;
    public readonly trs80: Trs80;
    private readonly controlPanel: ControlPanel;
    private editor: Editor | undefined = undefined;
    private screenEditor: ScreenEditor | undefined = undefined;
    public trs80State: Trs80State | undefined = undefined;
    public readonly debugPc = new SimpleEventDispatcher<number | undefined>();
    private runningStateTimeoutHandle: number | undefined = undefined;

    public constructor(settings: Settings) {
        this.settings = settings;
        const config = loadTrs80Config(LOCAL_STORAGE_CONFIG_KEY);
        const screenSize = SCREEN_SIZES_MAP.get(settings.screenSize) ?? DEFAULT_SCREEN_SIZE;
        this.screen = new CanvasScreen(screenSize.scale);
        const keyboard = new WebKeyboard();
        const cassettePlayer = new CassettePlayer();
        const soundPlayer = new WebSoundPlayer();
        this.trs80 = new Trs80(config, this.screen, keyboard, cassettePlayer, soundPlayer);
        keyboard.configureKeyboard();

        const reboot = () => {
            this.debugPc.dispatch(undefined);
            this.trs80.reset();
            this.trs80.setRunningState(RunningState.STARTED);
        };

        const hardwareSettingsPanel = new SettingsPanel(this.screen.getNode(), this.trs80, PanelType.HARDWARE);
        const viewPanel = new SettingsPanel(this.screen.getNode(), this.trs80, PanelType.VIEW);
        this.controlPanel = new ControlPanel(this.screen.getNode());
        this.controlPanel.addResetButton(reboot);
        this.controlPanel.addSettingsButton(hardwareSettingsPanel);
        this.controlPanel.addSettingsButton(viewPanel);
        this.controlPanel.addMuteButton(soundPlayer);

        // Save the TRS-80 config when it changes.
        this.trs80.onConfig.subscribe(configChange =>
            saveTrs80Config(configChange.newConfig, LOCAL_STORAGE_CONFIG_KEY));

        // Disable keyboard when a settings panel is open.
        keyboard.addInterceptKeys(() =>
            !hardwareSettingsPanel.isOpen() &&
            !viewPanel.isOpen());

        const driveIndicators = new DriveIndicators(this.screen.getNode(), this.trs80.getMaxDrives());
        this.trs80.onMotorOn.subscribe(drive => driveIndicators.setActiveDrive(drive));
        this.trs80.onRunningState.subscribe(this.onRunningState.bind(this));
        document.body.dataset.runningState = RUNNING_STATE_TO_LABEL.get(this.trs80.runningState);
        document.body.dataset.debouncedRunningState = RUNNING_STATE_TO_LABEL.get(this.trs80.runningState);

        reboot();

        // Give focus to the emulator if the editor does not have it.
        keyboard.addInterceptKeys(() => document.activeElement === document.body);
        document.body.focus();

        this.updateBodyDataset();
    }

    public setEditor(editor: Editor) {
        this.editor = editor;
    }

    public getNode(): HTMLElement {
        return this.screen.getNode();
    }

    /**
     * Update the BODY dataset based on settings.
     */
    private updateBodyDataset() {
        document.body.dataset.z80Inspector = this.settings.z80Inspector ? "visible" : "hidden";
        document.body.dataset.memoryInspector = this.settings.memoryInspector ? "visible" : "hidden";
        document.body.dataset.stackInspector = this.settings.stackInspector ? "visible" : "hidden";
        document.body.dataset.fdcInspector = this.settings.fdcInspector ? "visible" : "hidden";
        document.body.dataset.screenSize = this.settings.screenSize;
    }

    /**
     * Start the in-screen screenshot editor.
     */
    public startScreenEditor(view: EditorView, assemblyResults: AssemblyResults,
                             screenshotIndex: number, onClose: () => void) {

        gtag("event", "screenshot_editor");

        this.controlPanel.disable();
        this.closeScreenEditor();
        this.screenEditor = new ScreenEditor(view, assemblyResults, screenshotIndex, this.trs80, this.screen, () => {
            this.screenEditor = undefined;
            this.controlPanel.enable();
            onClose();
        });
    }

    /**
     * Close the screenshot editor if it's open. This abandons any changes to the screenshot.
     */
    public closeScreenEditor() {
        if (this.screenEditor !== undefined) {
            this.screenEditor.cancel();
            // Set to undefined in the close callback.
        }
    }

    /**
     * Update the scale of the emulator display.
     */
    public setScreenSize(size: ScreenSize): void {
        this.screen.setScale(size.scale);
        this.settings.screenSize = size.label;
        this.updateBodyDataset();
        saveSettings(this.settings);
    }

    /**
     * Run the assembled program. We do this even if there are errors so that the
     * editor and RAM have the same contents.
     */
    public runProgram(results: AssemblyResults) {
        if (this.trs80State === undefined) {
            // Disable interrupts, it causes the cursor to blink.
            this.trs80.z80.regs.iff1 = 0;
            this.trs80.z80.regs.iff2 = 0;

            // Blank out screen to get rid of "Cass?".
            for (let addr = TRS80_SCREEN_BEGIN; addr < TRS80_SCREEN_END; addr++) {
                this.trs80.writeMemory(addr, 0x20);
            }

            this.trs80State = this.trs80.save();
        } else {
            this.trs80.restore(this.trs80State);
        }
        // Create the ROM on demand.
        let rom: number[] | undefined = undefined;
        const config = this.trs80.getConfig();
        for (const line of results.asm.assembledLines) {
            const binary = line.binary;
            // Check if we're assembling ROM code.
            if (line.binary.length > 0 && line.address < config.romSize) {
                // Assume no instruction spans the end of ROM and beginning of RAM.
                if (rom === undefined) {
                    rom = new Array(config.romSize).fill(0);
                }
                for (let i = 0; i < binary.length; i++) {
                    rom[line.address + i] = binary[i];
                }
            } else {
                for (let i = 0; i < binary.length; i++) {
                    this.trs80.writeMemory(line.address + i, binary[i]);
                }
            }
        }
        // Configure the ROM, if that's what we're developing.
        this.trs80.setConfig(config.edit()
            .withCustomRom(rom === undefined ? undefined : String.fromCharCode(...rom))
            .build());
        const { entryPoint } = results.asm.getEntryPoint();
        if (entryPoint !== undefined) {
            this.trs80.jumpTo(entryPoint);
            this.debugPc.dispatch(undefined);
            this.trs80.setRunningState(RunningState.STARTED);
        }
    }

    // Set all breakpoints.
    public setBreakpoints(breakpoints: Uint8Array | undefined): void {
        this.trs80.setBreakpoints(breakpoints);
    }

    // Step one instruction.
    public step(): void {
        if (this.trs80.runningState === RunningState.PAUSED) {
            this.trs80.step();
            this.debugPc.dispatch(this.trs80.z80.regs.pc);
        }
    }

    // Step one instruction, unless it's a CALL or instructions like LDIR that might take a while,
    // in which case go to the instruction after that.
    public stepOver(): void {
        if (this.trs80.runningState === RunningState.PAUSED) {
            const pc = this.trs80.z80.regs.pc;
            const b1 = this.trs80.readMemory(pc);
            const b2 = this.trs80.readMemory(inc16(pc));
            const skipLength = getSkipLength(b1, b2);
            if (skipLength !== undefined) {
                this.trs80.setOneShotBreakpoint(pc + skipLength);
                this.continue();
            } else {
                this.step();
            }
        }
    }

    // Stop the program, enter the debugger.
    public breakProgram(): void {
        if (this.trs80.runningState === RunningState.STARTED) {
            this.trs80.setRunningState(RunningState.PAUSED);
            this.debugPc.dispatch(this.trs80.z80.regs.pc);
        }
    }

    // Resume the emulator (if it's stopped). Don't call this to start a program
    // from scratch, only to resume it after a breakpoint. Will skip any breakpoint
    // that we're currently stopped on.
    public continue(): void {
        if (this.trs80.runningState === RunningState.PAUSED) {
            this.debugPc.dispatch(undefined);
            this.trs80.setIgnoreInitialInstructionBreakpoint(true);
            this.trs80.setRunningState(RunningState.STARTED);
        }
    }

    // Called by Trs80 when it starts or stops.
    private onRunningState(runningState: RunningState): void {
        // Immediate state.
        document.body.dataset.runningState = RUNNING_STATE_TO_LABEL.get(runningState);

        // Debounced state.
        if (this.runningStateTimeoutHandle !== undefined) {
            window.clearTimeout(this.runningStateTimeoutHandle);
            this.runningStateTimeoutHandle = undefined;
        }
        if (document.body.dataset.debouncedRunningState === "paused" && runningState === RunningState.STARTED) {
            // We don't want to turn this off too quickly, because if you Continue, it'll
            // probably hit a breakpoint soon and show this right away.
            this.runningStateTimeoutHandle = window.setTimeout(() => {
                document.body.dataset.debouncedRunningState = RUNNING_STATE_TO_LABEL.get(runningState);
            }, 500);
        } else {
            document.body.dataset.debouncedRunningState = RUNNING_STATE_TO_LABEL.get(runningState);
        }

        // Update PC listeners.
        if (runningState !== RunningState.PAUSED) {
            this.debugPc.dispatch(undefined);
        } else {
            this.debugPc.dispatch(this.trs80.z80.regs.pc);
        }
    }

    /**
     * Create the panel for inspecting Z80 state.
     */
    public createZ80Inspector(): HTMLElement {
        const node = document.createElement("div");
        node.classList.add("z80-inspector", "inspector");

        const leftColumn = document.createElement("div");
        leftColumn.classList.add("z80-inspector-column");

        const rightColumn = document.createElement("div");
        rightColumn.classList.add("z80-inspector-column");

        node.append(leftColumn, rightColumn);

        // Info about how to display a register.
        class RegisterSpec {
            public readonly hiValueNode = document.createElement("span");
            public readonly loValueNode = document.createElement("span");
            public readonly extraNode = document.createElement("span");
            public oldValue: number | undefined = undefined;
            public constructor(public readonly label: string,
                               public readonly get: (regs: RegisterSet) => number,
                               public readonly isSplit: boolean,
                               public readonly extra: (value: number, oldValue: number) => Node | string) {}
        }

        const disasm = disasmForTrs80();

        const FLAGS: {value: Flag, label: string, tooltip: string}[] = [
            { value: Flag.S, label: "s", tooltip: "Negative (sign)" },
            { value: Flag.Z, label: "z", tooltip: "Zero" },
            { value: Flag.H, label: "h", tooltip: "Half-carry" },
            { value: Flag.P, label: "p", tooltip: "Parity/overflow" },
            { value: Flag.N, label: "n", tooltip: "Subtraction" },
            { value: Flag.C, label: "c", tooltip: "Carry" },
        ];

        // Make an array of conditions (used with JP, etc.).
        function makeConditions(flags: number): string[] {
            return [
                (flags & Flag.Z) !== 0 ? "Z" : "NZ",
                (flags & Flag.C) !== 0 ? "C" : "NC",
                (flags & Flag.P) !== 0 ? "PE" : "PO",
                (flags & Flag.S) !== 0 ? "M" : "P",
            ];
        }

        // Generate a node for the given new and old value of a byte.
        function getNodeForByte(value: number, oldValue: number, includeHex: boolean, includeNegative: boolean): Node {
            let s = "";

            // Hex value.
            if (includeHex) {
                s += "0x" + toHexByte(value) + " ";
            }

            // Decimal value.
            s += value.toString(10);

            // Two's complement.
            if (value >= 128 && includeNegative) {
                s += " (" + (value - 256).toString(10) + ")";
            }

            // ASCII value.
            if (value >= 32 && value < 127) {
                s += " '" + String.fromCodePoint(value) + "'";
            }

            const node = document.createElement("span");
            node.textContent = s;
            if (value !== oldValue) {
                node.classList.add("z80-inspector-changed");
            }
            return node;
        }

        const extraForAf = (value: number, oldValue: number): Node => {
            const a = hi(value);
            const oldA = hi(oldValue);
            const flags = lo(value);
            const oldFlags = lo(oldValue);

            const lineNode = document.createElement("span");

            // Info about value of A.
            lineNode.append(getNodeForByte(a, oldA, false, true), " ");

            // Info about flags.
            for (const flag of FLAGS) {
                const isOn = (flags & flag.value) !== 0;
                const oldIsOn = (oldFlags & flag.value) !== 0;
                const labelNode = document.createElement("span");
                labelNode.textContent = isOn ? flag.label.toUpperCase() : flag.label.toLowerCase();
                labelNode.title = flag.tooltip;
                if (isOn !== oldIsOn) {
                    labelNode.classList.add("z80-inspector-changed");
                }
                lineNode.append(labelNode);
            }

            // Phrase these as conditions (for JP, CALL, RET).
            const conditions = makeConditions(flags);
            const oldConditions = makeConditions(oldFlags);

            lineNode.append(" (");
            for (let i = 0; i < conditions.length; i++) {
                if (i > 0) {
                    lineNode.append(" ");
                }
                const labelNode = document.createElement("span");
                labelNode.textContent = conditions[i];
                if (conditions[i] !== oldConditions[i]) {
                    labelNode.classList.add("z80-inspector-changed");
                }
                lineNode.append(labelNode);
            }
            lineNode.append(")");

            return lineNode;
        };

        const extraForSp = (value: number, oldValue: number): Node => {
            const lineNode = document.createElement("span");
            let extraBytes = oldValue - value;
            if (extraBytes < -0x8000) {
                extraBytes += 0x10000;
            } else if (extraBytes > 0x8000) {
                extraBytes -= 0x10000;
            }
            for (let i = 0; i < 4; i++) {
                const byteNode = document.createElement("span");
                byteNode.textContent = toHexByte(this.trs80.readMemory((value + i) & 0xFFFF));
                if (i < extraBytes) {
                    byteNode.classList.add("z80-inspector-changed");
                }

                lineNode.append(byteNode, " ");
            }
            lineNode.append("...");
            return lineNode;
        };

        const extraForPc = (value: number): string => {
            return disasm.disassembleTrace(value, address => this.trs80.readMemory(address)).toText(false);
        };

        const extraForPointer = (value: number, oldValue: number): Node | string => {
            const lineNode = document.createElement("span");
            const unsignedNode = document.createElement("span");
            unsignedNode.textContent = value.toString();
            unsignedNode.classList.toggle("z80-inspector-changed", value !== oldValue);
            lineNode.append(unsignedNode);
            if (value >= 32768) {
                const signedNode = document.createElement("span");
                signedNode.textContent = (value - 65536).toString();
                signedNode.classList.toggle("z80-inspector-changed", value !== oldValue);
                lineNode.append(" (", signedNode, ")");
            }

            if (value >= TRS80_SCREEN_BEGIN && value < TRS80_SCREEN_END) {
                const offset = value - TRS80_SCREEN_BEGIN;
                const row = Math.floor(offset/64);
                const col = Math.floor(offset%64);

                const rowNode = document.createElement("span");
                rowNode.textContent = row.toString();
                const colNode = document.createElement("span");
                colNode.textContent = col.toString();

                if (oldValue >= TRS80_SCREEN_BEGIN && oldValue < TRS80_SCREEN_END) {
                    const oldOffset = oldValue - TRS80_SCREEN_BEGIN;
                    const oldRow = Math.floor(oldOffset/64);
                    const oldCol = Math.floor(oldOffset%64);

                    if (row !== oldRow) {
                        rowNode.classList.add("z80-inspector-changed");
                    }
                    if (col !== oldCol) {
                        colNode.classList.add("z80-inspector-changed");
                    }
                }

                lineNode.append(" (", rowNode, ",", colNode, ")");
            }

            // Show value pointed to. Might not make sense if it's not a pointer. We don't keep
            // track of the old value pointed to if the pointer itself doesn't change.
            const memoryValue = this.trs80.readMemory(value);
            const oldMemoryValue = this.trs80.readMemory(oldValue);
            lineNode.append(" \u2192 ", getNodeForByte(memoryValue, oldMemoryValue, true, false));

            return lineNode;
        };

        const regsSpecs: RegisterSpec[] = [
            new RegisterSpec("PC", regs => regs.pc, false, extraForPc),
            new RegisterSpec("SP", regs => regs.sp, false, extraForSp),
            new RegisterSpec("AF", regs => regs.af, true, extraForAf),
            new RegisterSpec("AF'", regs => regs.afPrime, true, extraForAf),
            new RegisterSpec("BC", regs => regs.bc, true, extraForPointer),
            new RegisterSpec("BC'", regs => regs.bcPrime, true, extraForPointer),
            new RegisterSpec("DE", regs => regs.de, true, extraForPointer),
            new RegisterSpec("DE'", regs => regs.dePrime, true, extraForPointer),
            new RegisterSpec("HL", regs => regs.hl, true, extraForPointer),
            new RegisterSpec("HL'", regs => regs.hlPrime, true, extraForPointer),
            new RegisterSpec("IX", regs => regs.ix, false, extraForPointer),
            new RegisterSpec("IY", regs => regs.iy, false, extraForPointer),
        ];

        let leftSide = true;
        for (const spec of regsSpecs) {
            const registerNode = document.createElement("div");
            registerNode.classList.add("z80-inspector-register");

            const labelNode = document.createElement("span");
            labelNode.textContent = spec.label.padEnd(3, " ");
            labelNode.classList.add("z80-inspector-label");

            const hiValueNode = spec.hiValueNode;
            hiValueNode.classList.add("z80-inspector-value");
            const loValueNode = spec.loValueNode;
            loValueNode.classList.add("z80-inspector-value");

            const extraNode = spec.extraNode;
            extraNode.classList.add("z80-inspector-extra");

            registerNode.append(labelNode, hiValueNode, loValueNode, extraNode);

            const container = leftSide ? leftColumn : rightColumn;
            leftSide = !leftSide;

            container.append(registerNode);
        }

        // Show elapsed clock ticks and time.
        const clockNode = document.createElement("div");
        clockNode.classList.add("z80-inspector-clock");
        const clockLabelNode = document.createElement("span");
        clockLabelNode.classList.add("z80-inspector-clock-label");
        clockLabelNode.textContent = "Elapsed cycles: ";
        const clockValueNode = document.createElement("span");
        clockValueNode.classList.add("z80-inspector-clock-value");
        clockNode.append(clockLabelNode, clockValueNode);
        leftColumn.append(clockNode);

        const timeNode = document.createElement("div");
        timeNode.classList.add("z80-inspector-time");
        const timeLabelNode = document.createElement("span");
        timeLabelNode.classList.add("z80-inspector-time-label");
        timeLabelNode.textContent = "Elapsed time: ";
        const timeValueNode = document.createElement("span");
        timeValueNode.classList.add("z80-inspector-time-value");
        timeNode.append(timeLabelNode, timeValueNode);
        rightColumn.append(timeNode);

        let oldClock: number | undefined;

        // Update the contents when the PC changes.
        this.debugPc.subscribe(pc => {
            if (pc === undefined) {
                // Not single-stepping, don't bother.
                return;
            }

            const regs = this.trs80.z80.regs;
            for (const spec of regsSpecs) {
                const value = spec.get(regs);
                const oldValue = spec.oldValue ?? value;

                const changed = value !== oldValue;
                const hiChanged = spec.isSplit ? hi(value) !== hi(oldValue) : changed;
                const loChanged = spec.isSplit ? lo(value) !== lo(oldValue) : changed;

                spec.hiValueNode.textContent = toHexByte(hi(value));
                spec.hiValueNode.classList.toggle("z80-inspector-changed", hiChanged);
                spec.loValueNode.textContent = toHexByte(lo(value)) + " ";
                spec.loValueNode.classList.toggle("z80-inspector-changed", loChanged);

                emptyNode(spec.extraNode);
                spec.extraNode.append(spec.extra?.(value, oldValue));

                spec.oldValue = value;
            }

            const clock = this.trs80.tStateCount;
            clockNode.hidden = oldClock === undefined;
            timeNode.hidden = oldClock === undefined;
            if (oldClock !== undefined) {
                const elapsedClock = clock - oldClock;
                const elapsedMs = Math.round(elapsedClock*1000/this.trs80.clockHz);
                const fps = elapsedMs === 0 ? undefined : Math.round(1000/elapsedMs);

                clockValueNode.textContent = elapsedClock.toLocaleString();
                timeValueNode.textContent = elapsedMs.toLocaleString() + " ms" +
                    (fps === undefined ? "" : " (" + fps + " fps)");
            }
            oldClock = clock;
        });

        return node;
    }

    /**
     * Show or hide the Z80 inspector.
     */
    public showZ80Inspector(show: boolean) {
        this.settings.z80Inspector = show;
        this.updateBodyDataset();
        saveSettings(this.settings);
    }

    /**
     * Create the panel for inspecting memory state.
     */
    public createMemoryInspector(): HTMLElement {
        /**
         * Hexdump generator for HTML output.
         */
        class HtmlHexdumpGenerator extends HexdumpGenerator<HTMLElement, HTMLElement> {
            constructor(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]) {
                super(binary, {
                    collapse,
                    annotations,
                    showEndAddress: false,
                    stride: 8,
                });
            }

            protected newLine(): HTMLElement {
                return document.createElement("div");
            }

            protected getLineText(line: HTMLElement): string {
                return line.textContent ?? "";
            }

            protected newSpan(line: HTMLElement, text: string, ...cssClass: string[]): HTMLElement {
                const e = document.createElement("span");
                e.classList.add(... cssClass.map(c => "memory-inspector-" + c));
                e.innerText = text;
                line.append(e);
                return e;
            }

            protected addTextToSpan(span: HTMLElement, text: string): void {
                span.innerText += text;
            }
        }

        const node = document.createElement("div");
        node.classList.add("memory-inspector", "inspector");

        const rowsNode = document.createElement("div");
        rowsNode.classList.add("memory-inspector-rows");
        node.append(rowsNode);

        const update = () => {
            const memSize = 64*1024;
            const binary = new Uint8Array(memSize);
            for (let addr = 0; addr < binary.length; addr++) {
                binary[addr] = this.trs80.readMemory(addr);
            }

            const annotations: ProgramAnnotation[] = [];
            if (this.editor != undefined) {
                const assemblyResults = this.editor.getAssemblyResults();
                assemblyResults.variableDefinitions.forEach(def => {
                    const symbol = def.symbol;
                    if (symbol.type !== SymbolType.UNKNOWN && symbol.type !== SymbolType.CONSTANT) {
                        annotations.push(
                            new ProgramAnnotation(symbol.name, symbol.value, symbol.value + symbol.size));
                    }
                });
                // Show screen and keyboard.
                annotations.push(new ProgramAnnotation("Screen", TRS80_SCREEN_BEGIN, TRS80_SCREEN_END));
                annotations.push(new ProgramAnnotation("Keyboard", TRS80_KEYBOARD_BEGIN, TRS80_KEYBOARD_END));
                // Show stack if near the end of memory.
                const sp = this.trs80.z80.regs.sp;
                if (sp >= memSize - 1024) {
                    annotations.push(new ProgramAnnotation("Stack", sp, memSize));
                }
            }

            const hexdumpGenerator = new HtmlHexdumpGenerator(binary, true, annotations);
            const lineGenerator = hexdumpGenerator.generate();

            rowsNode.replaceChildren(...lineGenerator);
        };

        this.debugPc.subscribe(pc => {
            if (pc === undefined) {
                // Not single-stepping, don't bother.
                return;
            }
            update();
        });

        return node;
    }
    /**
     * Create the panel for inspecting the stack.
     */
    public createStackInspector(): HTMLElement {
        const MAX_ROWS = 10;

        const node = document.createElement("div");
        node.classList.add("stack-inspector", "inspector");

        // Same of the symbol with an optional offset.
        const symbolWithOffset = (symbol: string, offset: number): string => {
            return offset === 0 ? symbol : symbol + " + " + offset;
        };

        // The note for a stack entry.
        const stackAnnotation = (assemblyResults: AssemblyResults | undefined,
                                 value: number,
                                 callAddress: number | undefined,
                                 instructionAddress: number): string => {

            const register = pushedRegisterPair(this.trs80, instructionAddress);
            const lineNumber = assemblyResults?.addressToLineMap?.get(instructionAddress);

            // Basic information about the value (register it came from, what function was called).
            let s = "";
            if (register !== undefined) {
                s = register.toUpperCase();
            } else if (assemblyResults !== undefined) {
                if (callAddress !== undefined) {
                    const symbolInfos = assemblyResults.valueToSymbols.get(callAddress);
                    if (symbolInfos !== undefined) {
                        for (const symbolInfo of symbolInfos) {
                            if (symbolInfo.type === SymbolType.CODE) {
                                s = "call to " + symbolInfo.name;
                                break;
                            }
                        }
                    }
                }
            }

            // Aux info about the location itself (symbols it's relative to).
            let location = "";
            if (value >= TRS80_SCREEN_BEGIN && value < TRS80_SCREEN_END) {
                location = symbolWithOffset("screen", value - TRS80_SCREEN_BEGIN);
            } else if (value >= TRS80_KEYBOARD_BEGIN && value < TRS80_KEYBOARD_END) {
                location = symbolWithOffset("keyboard", value - TRS80_KEYBOARD_BEGIN);
            } else if (assemblyResults !== undefined) {
                for (const def of assemblyResults.variableDefinitions) {
                    const symbol = def.symbol;
                    if (symbol.type !== SymbolType.UNKNOWN && symbol.type !== SymbolType.CONSTANT) {
                        if (value >= symbol.value && value < symbol.value + symbol.size) {
                            location = symbolWithOffset(symbol.name, value - symbol.value);
                            break;
                        }
                    }
                }
            }

            // Look up a comment on the push line if it's useful.
            if (location === "" && lineNumber !== undefined && assemblyResults !== undefined && callAddress === undefined) {
                const line = assemblyResults.lineMap.get(lineNumber);
                if (line !== undefined) {
                    const lineText = line.line;
                    const i = lineText.indexOf(";");
                    if (i >= 0) {
                        location = lineText.substring(i + 1).trim();
                        if (location.endsWith(".")) {
                            location = location.substring(0, location.length - 1);
                        }
                    }
                }
            }

            if (s !== "" && location !== "") {
                s += " (" + location + ")";
            } else if (location !== "") {
                s = location;
            }

            if (lineNumber !== undefined) {
                if (s !== "") {
                    s += " ";
                }
                s += "at line " + lineNumber;
            }

            return s;
        };

        // Guess whether a value on the stack is the result of a CALL, and if so, return the
        // address that was called.
        const determineCallAddress = (value: number): number | undefined => {
            if (value >= 3 && isCallOpcode(this.trs80.readMemory(value - 3))) {
                return word(this.trs80.readMemory(value - 1), this.trs80.readMemory(value - 2));
            } else {
                return undefined;
            }
        };

        const update = () => {
            const sp = this.trs80.z80.regs.sp;
            const assemblyResults = this.editor?.getAssemblyResults();

            const nodes: HTMLElement[] = [];
            let row = 0;
            for (let addr = sp; addr != 0 && addr < 0x10000 && addr < sp + 2*MAX_ROWS; addr += 2, row++) {
                const value = word(this.trs80.readMemory(addr + 1), this.trs80.readMemory(addr));
                const instructionAddress = this.trs80.z80.pushInstructionAddress[addr];

                const rowNode = document.createElement("div");
                rowNode.classList.add("stack-inspector-row");
                rowNode.style.opacity = (1 - row*0.08).toString();
                const callAddress = determineCallAddress(value);
                if (callAddress !== undefined) {
                    rowNode.classList.add("stack-inspector-call");
                }
                nodes.push(rowNode);

                const addrNode = document.createElement("div");
                addrNode.classList.add("stack-inspector-address");
                addrNode.textContent = toHexWord(addr);
                rowNode.append(addrNode);

                const valueNode = document.createElement("div");
                valueNode.classList.add("stack-inspector-hex-value");
                valueNode.textContent = toHexWord(value);
                rowNode.append(valueNode);

                const decimalNode = document.createElement("div");
                decimalNode.classList.add("stack-inspector-decimal-value");
                decimalNode.textContent = value.toString();
                rowNode.append(decimalNode);

                const noteNode = document.createElement("div");
                noteNode.classList.add("stack-inspector-note");
                noteNode.textContent = stackAnnotation(assemblyResults, value, callAddress, instructionAddress);
                rowNode.append(noteNode);
            }
            node.replaceChildren(...nodes);
        };

        this.debugPc.subscribe(pc => {
            if (pc === undefined) {
                // Not single-stepping, don't bother.
                return;
            }
            update();
        });

        return node;
    }

    /**
     * Create the panel for inspecting Floppy Disk Controller state.
     */
    public createFdcInspector(): HTMLElement {
        const node = document.createElement("div");
        node.classList.add("fdc-inspector", "inspector");

        const leftColumn = document.createElement("div");
        leftColumn.classList.add("fdc-inspector-column");

        const rightColumn = document.createElement("div");
        rightColumn.classList.add("fdc-inspector-column");

        const bottomSection = document.createElement("div");
        bottomSection.classList.add("fdc-inspector-column", "fdc-inspector-bottom");

        node.append(leftColumn, rightColumn, bottomSection);

        type Updater = (fdcState: FdcState) => void;
        type Fetcher = (fdcState: FdcState) => {value?: string, extra?: string};
        const updaters:Updater[] = [];

        // Create a new row.
        const addRowToContainer = (container: HTMLElement, label: string, fetcher: Fetcher) => {
            const rowNode = document.createElement("div");
            rowNode.classList.add("fdc-inspector-row");
            container.append(rowNode);

            const labelNode = document.createElement("span");
            labelNode.textContent = label.padEnd(8, " ");
            labelNode.classList.add("fdc-inspector-label");

            const valueExtraNode = document.createElement("span");
            valueExtraNode.classList.add("fdc-inspector-value-extra")

            const valueNode = document.createElement("span");
            valueNode.classList.add("fdc-inspector-value");

            const extraNode = document.createElement("span");
            extraNode.classList.add("fdc-inspector-extra");

            valueExtraNode.append(valueNode, extraNode);
            rowNode.append(labelNode, valueExtraNode);

            updaters.push(fdcState => {
                const {value, extra} = fetcher(fdcState);
                valueNode.hidden = value === undefined;
                valueNode.textContent = value ?? "";
                extraNode.hidden = extra === undefined;
                extraNode.textContent = extra ?? "";
            });
        };

        // Create a new row, flipping between the two columns.
        let leftSide = true;
        const addRowToColumn = (label: string, fetcher: Fetcher) => {
            addRowToContainer(leftSide ? leftColumn : rightColumn, label, fetcher);
            leftSide = !leftSide;
        };

        addRowToColumn("Status", fdcState => ({
            value: toHexByte(fdcState.status) + "h",
        }));
        addRowToColumn("Side", fdcState => ({
            value: fdcState.side === Side.FRONT ? "Front" : "Back",
        }));
        addRowToColumn("Track", fdcState => ({
            value: toHexByte(fdcState.track) + "h",
            extra: "(" + fdcState.track + ")",
        }));
        addRowToColumn("Density", fdcState => ({
            value: fdcState.doubleDensity ? "Double" : "Single",
        }));
        addRowToColumn("Sector", fdcState => ({
            value: toHexByte(fdcState.sector) + "h",
            extra: "(" + fdcState.sector + ")",
        }));
        addRowToColumn("Drive", fdcState => ({
            value: fdcState.currentDrive.toString(),
        }));
        addRowToColumn("Data", fdcState => ({
            value: toHexByte(fdcState.data) + "h",
            extra: fdcState.data >= 32 && fdcState.data < 127 ? `'${String.fromCodePoint(fdcState.data)}'` : "",
        }));
        addRowToColumn("Motor", fdcState => ({
            value: fdcState.motorOn ? "On" : "Off",
        }));
        addRowToColumn("Command", fdcState => ({
            value: toHexByte(fdcState.currentCommand) + "h",
        }));
        addRowToContainer(bottomSection, "Status", fdcState => ({
            extra: fdcState.getStatusDescription(),
        }));
        addRowToContainer(bottomSection, "Command", fdcState => ({
            extra: fdcState.getCommandDescription(),
        }));

        // Update all values.
        const update = () => {
            const fdcState = this.trs80.getFdcState();

            for (const updater of updaters) {
                updater(fdcState);
            }
        };

        this.debugPc.subscribe(pc => {
            if (pc === undefined) {
                // Not single-stepping, don't bother.
                return;
            }
            update();
        });

        return node;
    }

    /**
     * Show or hide the memory inspector.
     */
    public showMemoryInspector(show: boolean) {
        this.settings.memoryInspector = show;
        this.updateBodyDataset();
        saveSettings(this.settings);
    }

    /**
     * Show or hide the stack inspector.
     */
    public showStackInspector(show: boolean) {
        this.settings.stackInspector = show;
        this.updateBodyDataset();
        saveSettings(this.settings);
    }

    /**
     * Show or hide the FDC inspector.
     */
    public showFdcInspector(show: boolean) {
        this.settings.fdcInspector = show;
        this.updateBodyDataset();
        saveSettings(this.settings);
    }
}
