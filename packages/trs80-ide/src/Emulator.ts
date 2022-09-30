import {EditorView,} from "@codemirror/view"
import {CassettePlayer, Config, RunningState, Trs80, Trs80State} from "trs80-emulator";
import {
    CanvasScreen,
    ControlPanel,
    DriveIndicators,
    PanelType,
    SettingsPanel,
    WebKeyboard,
    WebSoundPlayer
} from "trs80-emulator-web";

import {ScreenEditor} from "./ScreenEditor";
import {AssemblyResults} from "./AssemblyResults";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {Flag, hi, lo, RegisterSet, toHexByte} from "z80-base";
import {disasmForTrs80} from "trs80-disasm";
import {TRS80_SCREEN_BEGIN, TRS80_SCREEN_END} from "trs80-base";

// Remove all children from this node.
function emptyNode(node: HTMLElement): void {
    while (node.firstChild !== null) {
        node.firstChild.remove();
    }
}

// Encapsulates the emulator and methods for it.
export class Emulator {
    private readonly screen: CanvasScreen;
    private readonly trs80: Trs80;
    private readonly controlPanel: ControlPanel;
    private screenEditor: ScreenEditor | undefined = undefined;
    private trs80State: Trs80State | undefined = undefined;
    public readonly debugPc = new SimpleEventDispatcher<number | undefined>();

    public constructor() {
        const config = Config.makeDefault();
        this.screen = new CanvasScreen(1.5);
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

        const driveIndicators = new DriveIndicators(this.screen.getNode(), this.trs80.getMaxDrives());
        this.trs80.onMotorOn.subscribe(drive => driveIndicators.setActiveDrive(drive));
        this.trs80.onRunningState.subscribe(this.onRunningState.bind(this));

        reboot();

        // Give focus to the emulator if the editor does not have it.
        function updateFocus() {
            keyboard.interceptKeys = document.activeElement === document.body;
        }

        document.body.addEventListener("focus", () => updateFocus(), true);
        document.body.addEventListener("blur", () => updateFocus(), true);
        document.body.focus();
        updateFocus();
    }

    public getNode(): HTMLElement {
        return this.screen.getNode();
    }

    public startScreenEditor(view: EditorView, assemblyResults: AssemblyResults,
                             screenshotIndex: number, onClose: () => void) {

        this.controlPanel.disable();
        this.closeScreenEditor();
        this.screenEditor = new ScreenEditor(view, assemblyResults, screenshotIndex, this.trs80, this.screen, () => {
            this.screenEditor = undefined;
            this.controlPanel.enable();
            onClose();
        });
    }

    public closeScreenEditor() {
        if (this.screenEditor !== undefined) {
            this.screenEditor.cancel();
            // Set to undefined in the close callback.
        }
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

            this.trs80State = this.trs80.save();
        } else {
            this.trs80.restore(this.trs80State);
        }
        for (const line of results.sourceFile.assembledLines) {
            for (let i = 0; i < line.binary.length; i++) {
                this.trs80.writeMemory(line.address + i, line.binary[i]);
            }
        }
        let entryPoint = results.asm.entryPoint;
        if (entryPoint === undefined) {
            for (const line of results.sourceFile.assembledLines) {
                if (line.binary.length > 0) {
                    entryPoint = line.address;
                    break;
                }
            }
        }
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
        this.trs80.step();
        this.debugPc.dispatch(this.trs80.z80.regs.pc);
    }

    // Resume the emulator (if it's stopped). Don't call this to start a program
    // from scratch, only to resume it after a breakpoint. Will skip any breakpoint
    // that we're currently stopped on.
    public continue(): void {
        this.debugPc.dispatch(undefined);
        this.trs80.setIgnoreInitialInstructionBreakpoint(true);
        this.trs80.setRunningState(RunningState.STARTED);
    }

    // Called by Trs80 when it starts or stops.
    private onRunningState(runningState: RunningState): void {
        if (runningState === RunningState.STARTED) {
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
        node.classList.add("z80-inspector");

        let timeoutHandle: number | undefined = undefined;
        this.trs80.onRunningState.subscribe(runningState => {
            const visible = runningState === RunningState.PAUSED;

            // We don't want to turn this off to quickly, because if you Continue, it'll
            // probably hit a breakpoint soon and show this right away.
            if (timeoutHandle !== undefined) {
                window.clearTimeout(timeoutHandle);
                timeoutHandle = undefined;
            }
            if (!visible) {
                timeoutHandle = window.setTimeout(() => {
                    node.classList.toggle("z80-inspector-visible", false);
                }, 500);
            } else {
                node.classList.toggle("z80-inspector-visible", true);
            }
        });

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

        const extraForAf = (value: number, oldValue: number): Node => {
            const a = hi(value);
            const oldA = hi(oldValue);
            const flags = lo(value);
            const oldFlags = lo(oldValue);

            const lineNode = document.createElement("span");

            if (a >= 32 && a < 127) {
                const aNode = document.createElement("span");
                aNode.textContent = '"' + String.fromCodePoint(a) + '" ';
                if (a !== oldA) {
                    aNode.classList.add("z80-inspector-changed");
                }
                lineNode.append(aNode);
            }

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
            return disasm.disassembleTrace(value, address => this.trs80.readMemory(address)).toText();
        };

        const extraForPointer = (value: number, oldValue: number): Node | string => {
            if (value >= TRS80_SCREEN_BEGIN && value < TRS80_SCREEN_END) {
                const offset = value - TRS80_SCREEN_BEGIN;
                const row = Math.floor(offset/64);
                const col = Math.floor(offset%64);

                const lineNode = document.createElement("span");
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

                lineNode.append("row ", rowNode, ", col ", colNode);
                return lineNode;
            }
            return "";
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
        });

        return node;
    }
}
