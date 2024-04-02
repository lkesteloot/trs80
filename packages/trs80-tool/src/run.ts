import fs from "fs";
import chalk from "chalk";
import {BasicLevel, CGChip, Config, Keyboard,
    LinePrinter, ModelType, RunningState, SilentSoundPlayer, Trs80, Trs80Screen } from "trs80-emulator";
import {connectXray} from "./xray.js";
import {TRS80_CHAR_HEIGHT, TRS80_CHAR_WIDTH, TRS80_SCREEN_BEGIN, isFloppy } from "trs80-base";
import { AudioFileCassettePlayer } from "trs80-cassette-player";
import { AudioFile } from "trs80-cassette";
import { readTrs80File } from "./utils.js";
import { word } from "z80-base";
import {CONSOLE_LOG_FUNCTION, LogFunction, LogLevel, TRS80_MAIN_LOGGER } from "trs80-logger";

// Size of screen.
const WIDTH = TRS80_CHAR_WIDTH;
const HEIGHT = TRS80_CHAR_HEIGHT;

/**
 * Class to update a VT-100 screen.
 */
class Vt100Control {
    // Cursor position, 1-based, relative to where it was when we started the program.
    private row: number = 1;
    private col: number = 1;
    private savedRow: number = 1;
    private savedCol: number = 1;

    /**
     * Save the current position, and think of it as being at the specified location.
     */
    public saveCursorPositionAs(row: number, col: number): void {
        process.stdout.write("\x1b7");
        this.savedRow = row;
        this.savedCol = col;
    }

    /**
     * Restore the position to where it was when {@link saveCursorPositionAs} was called.
     */
    public restoreCursorPosition(): void {
        process.stdout.write("\x1b8");
        this.row = this.savedRow;
        this.col = this.savedCol;
    }

    /**
     * Move cursor to specified location.
     *
     * @param row 1-based line number.
     * @param col 1-base column number.
     */
    public moveTo(row: number, col: number): void {
        if (row < this.row) {
            process.stdout.write("\x1b[" + (this.row - row) + "A");
        } else if (row > this.row) {
            process.stdout.write("\x1b[" + (row - this.row) + "B");
        }

        if (col < this.col) {
            process.stdout.write("\x1b[" + (this.col - col) + "D");
        } else if (col > this.col) {
            process.stdout.write("\x1b[" + (col - this.col) + "C");
        }

        this.row = row;
        this.col = col;
    }

    /**
     * Inform us that the cursor has moved forward count character.
     */
    public advancedCol(count: number = 1): void {
        this.col += count;
    }

    /**
     * Inform us that the cursor has moved down count rows and reset back to the left column.
     */
    public advancedRow(count: number = 1): void {
        this.row += count;
        this.col = 1;
    }
}

/**
 * Screen implementation for an ANSI TTY.
 */
class TtyScreen extends Trs80Screen {
    private readonly readMemory: (address: number) => number;
    private readonly config: Config;
    // Cache of what we've drawn already.
    private readonly drawnScreen = new Uint8Array(WIDTH*HEIGHT);
    private readonly vt100Control = new Vt100Control();
    private readonly logMessages: { logLevel: LogLevel, message: string }[] = [];
    private lastCursorIndex: number | undefined = undefined;
    private lastUnderscoreIndex = 0;

    constructor(readMemory: (address: number) => number, config: Config) {
        super();
        this.readMemory = readMemory;
        this.config = config;
        this.drawFrame();
        this.vt100Control.saveCursorPositionAs(HEIGHT + 3, 1);

        // Update cursor periodically. Have to do this on a timer since the memory location
        // can be updated anytime.
        setInterval(() => this.checkCursorPosition(false), 10);

        // Resizing the window might require redrawing the log.
        process.stdout.on("resize", () => this.redraw());
    }

    public exit(): void {
        this.vt100Control.moveTo(HEIGHT + 3, 1);
    }

    /**
     * Draw the frame around the screen.
     */
    private drawFrame(): void {
        // Draw frame.
        const color = chalk.green;
        process.stdout.write(color("+" + "-".repeat(WIDTH) + "+\n"));
        for (let row = 0; row < HEIGHT; row++) {
            process.stdout.write(color("|" + " ".repeat(WIDTH) + "|\n"));
        }
        process.stdout.write(color("+" + "-".repeat(WIDTH) + "+\n"));
        this.vt100Control.advancedRow(HEIGHT + 2);
    }

    setConfig(config: Config) {
        // Nothing.
    }

    writeChar(address: number, value: number) {
        const index = address - TRS80_SCREEN_BEGIN;
        if (index >= 0 && index < WIDTH * HEIGHT) {
            this.updateScreen(false);
        }
    }

    /**
     * Redraw any characters that have changed since the old screen.
     */
    private updateScreen(force: boolean): void {
        let row = 1;
        let col = 1;

        for (let i = 0; i < WIDTH*HEIGHT; i++) {
            // Draw a space at the current cursor.
            let value = i === this.lastCursorIndex ? 32 : this.readMemory(i + TRS80_SCREEN_BEGIN);
            if (this.config.modelType === ModelType.MODEL1) {
                // Level 2 used the letters from values 0 to 31.
                if (value < 32) {
                    value += 64;
                } else if (this.config.cgChip === CGChip.ORIGINAL && value >= 96 && value < 128) {
                    value -= 64;
                }
            }

            if (force || value !== this.drawnScreen[i]) {
                // Keep track of where we saw our last underscore, for Level 1 support.
                if (value === 95) {
                    this.lastUnderscoreIndex = i;
                }

                // Replace non-ASCII.
                const ch = value >= 128 && value <= 191
                    ? TtyScreen.trs80ToBraille(value)
                    : value < 32 || value >= 127
                        ? chalk.gray("?")
                        : String.fromCodePoint(value);

                // Draw at location.
                this.vt100Control.moveTo(row + 1, col + 1);
                process.stdout.write(ch);
                this.vt100Control.advancedCol();

                this.drawnScreen[i] = value;
            }

            col += 1;
            if (col === WIDTH + 1) {
                col = 1;
                row += 1;
            }
        }
    }

    /**
     * Redraw from memory.
     */
    public redraw(): void {
        this.vt100Control.restoreCursorPosition();
        this.vt100Control.moveTo(1, 1);
        this.drawFrame();
        this.updateScreen(true);
        this.redrawLogMessages();
    }

    /**
     * Check RAM for the cursor position and update it.
     *
     * @param forceUpdate force the position update even if it hasn't changed in simulation.
     */
    private checkCursorPosition(forceUpdate: boolean): void {
        // Figure out where the cursor is.
        let cursorIndex;
        if (this.config.basicLevel === BasicLevel.LEVEL1) {
            // We don't know where the cursor position is stored in Level 1. Guess based on the last
            // underscore we saw.
            cursorIndex = this.lastUnderscoreIndex;
        } else {
            // Get cursor position from RAM.
            const cursorAddress = word(this.readMemory(0x4021), this.readMemory(0x4020));
            cursorIndex = cursorAddress - TRS80_SCREEN_BEGIN;
        }

        // Ignore bad values.
        if (cursorIndex < 0 || cursorIndex >= WIDTH*HEIGHT) {
            return;
        }

        this.lastCursorIndex = cursorIndex;
        this.updateScreen(false);

        // 1-based.
        const row = Math.floor(cursorIndex / WIDTH) + 1;
        const col = cursorIndex % WIDTH + 1;

        // Adjust for frame.
        this.vt100Control.moveTo(row + 1, col + 1);
    }

    public log(logLevel: LogLevel, message: string): void {
        this.logMessages.push({logLevel, message});
        while (this.logMessages.length > HEIGHT + 2) {
            this.logMessages.shift();
        }
        this.redrawLogMessages();
    }

    public redrawLogMessages(): void {
        const terminalColumns = process.stdout.columns ?? 80;
        const messageColumn = WIDTH + 2;
        const maxMessageLength = Math.max(terminalColumns - messageColumn - 1, 0);

        for (let i = 0; i < this.logMessages.length; i++) {
            const logEvent = this.logMessages[i];
            const message = (" " + logEvent.message).slice(0, maxMessageLength).padEnd(maxMessageLength, " ");

            switch (logEvent.logLevel) {
                case LogLevel.TRACE:
                    // Don't display.
                    continue;

                case LogLevel.WARN:
                    process.stdout.write("\x1B[33m");
                    break;

                case LogLevel.INFO:
                    // Draw normally.
                    break;
            }

            this.vt100Control.moveTo(i + 1, messageColumn + 1);
            process.stdout.write(message);
            // Reset style.
            process.stdout.write("\x1B[0m");
            this.vt100Control.advancedCol(message.length);
        }
    }

    /**
     * Convert a TRS-80 graphics character to a braille character with
     * the same pattern. Thanks to George Phillips for this idea!
     */
    private static trs80ToBraille(ch: number): string {
        // Remap to 0-63.
        ch -= 128;

        // Remap bits.
        const ul = (ch >> 0) & 0x01;
        const ur = (ch >> 1) & 0x01;
        const cl = (ch >> 2) & 0x01;
        const cr = (ch >> 3) & 0x01;
        const ll = (ch >> 4) & 0x01;
        const lr = (ch >> 5) & 0x01;
        ch = (ul << 0) | (cl << 1) | (ll << 2) | (ur << 3) | (cr << 4) | (lr << 5);

        // Convert to braille.
        return String.fromCodePoint(0x2800 + ch);
    }
}

/**
 * Screen that does nothing.
 */
class NopScreen extends Trs80Screen {
    setConfig(config: Config) {
        // Nothing.
    }

    writeChar(address: number, value: number) {
        // Nothing.
    }
}

/**
 * Keyboard implementation for a TTY. Puts the TTY into raw mode.
 */
class TtyKeyboard extends Keyboard {
    private readonly screen: TtyScreen;

    constructor(screen: TtyScreen) {
        super();
        this.screen = screen;

        process.stdin.setRawMode(true);
        process.stdin.on("data", buffer => this.processBuffer(buffer));
    }

    /**
     * Process all keys in a buffer.
     */
    private processBuffer(buffer: Buffer): void {
        for (let i = 0; i < buffer.length; i++) {
            const key = buffer[i];

            let keyName: string | undefined = undefined;

            switch (key) {
                case 0x03:
                    // Ctrl-C.
                    this.screen.exit();
                    process.exit();
                    break;

                case 0x0C:
                    // Ctrl-L.
                    this.screen.redraw();
                    break;

                case 0x08:
                case 0x7F:
                    keyName = "Backspace";
                    break;

                case 0x0A:
                case 0x0D:
                    keyName = "Enter";
                    break;

                case 0x1B:
                    // Escape.
                    if (i + 2 < buffer.length && buffer[i + 1] === 0x5B) {
                        // Arrow keys.
                        switch (buffer[i + 2]) {
                            case 0x41:
                                keyName = "ArrowUp";
                                break;

                            case 0x42:
                                keyName = "ArrowDown";
                                break;

                            case 0x43:
                                keyName = "ArrowRight";
                                break;

                            case 0x44:
                                keyName = "ArrowLeft";
                                break;
                        }
                        i += 2;
                    } else {
                        keyName = "Escape";
                    }
                    break;

                default:
                    keyName = String.fromCodePoint(key);
                    break;
            }

            if (keyName !== undefined) {
                this.keyEvent(keyName, true);
                this.keyEvent(keyName, false);
            }
        }
    }
}

/**
 * Printer implementation that writes to a file.
 */
class FilePrinter extends LinePrinter {
    private readonly file: fs.WriteStream;

    constructor(pathname: string, onError: (msg: string) => void) {
        super();

        this.file = fs.createWriteStream(pathname, {
            flags: "a", // Append to any existing file.
        });
        this.file.on("error", (err) => {
            this.file.end();
            onError("Can't write to \"" + pathname + "\" (" + err.message + ")");
        });
    }

    override printLine(line: string): void {
        this.file.write(line + "\n");
    }
}

/**
 * Handle the "run" command.
 *
 * @param programFilename optional file to run
 * @param mountedFilenames optional cassette or floppy files to mount
 * @param xray whether to run the xray server
 * @param writeProtected mark mounted floppies as write-protected.
 * @param config machine configuration
 * @param printerPathname file to write printer output to, or undefined to write to the console.
 */
export function run(programFilename: string | undefined,
                    mountedFilenames: string[],
                    xray: boolean,
                    writeProtected: boolean,
                    config: Config,
                    printerPathname: string | undefined) {

    let screen: Trs80Screen;
    let keyboard: Keyboard;
    let exitScreen: () => void;
    if (xray) {
        screen = new NopScreen();
        exitScreen = () => {};
        keyboard = new Keyboard();
    } else {
        const ttyScreen = new TtyScreen(readMemory, config);
        exitScreen = () => ttyScreen.exit();
        keyboard = new TtyKeyboard(ttyScreen);
        screen = ttyScreen;
        TRS80_MAIN_LOGGER.logFunction = ttyScreen.log.bind(ttyScreen);
    }

    const cassette = new AudioFileCassettePlayer();
    const soundPlayer = new SilentSoundPlayer();
    const trs80 = new Trs80(config, screen, keyboard, cassette, soundPlayer);
    if (printerPathname !== undefined) {
        trs80.setPrinter(new FilePrinter(printerPathname, msg => {
            exitScreen();
            console.log(msg);
            process.exit();
        }));
    }
    trs80.reset();
    trs80.setRunningState(RunningState.STARTED);

    /**
     * The trs80 and (tty) screen variables are mutually dependent on each other, so break
     * that with this function, which is hoisted above the TtyScreen() constructor call but can
     * access the trs80 variable.
     */
    function readMemory(address: number): number {
        return trs80.readMemory(address);
    }

    // Run the program if specified.
    if (programFilename !== undefined) {
        const program = readTrs80File(programFilename);
        if (typeof(program) === "string") {
            console.log(program);
            return;
        } else if (program instanceof AudioFile) {
            // TODO I don't see why not.
            console.log("Can't run WAV files directly");
            return;
        }
        trs80.runTrs80File(program);
    }

    // Mount floppies or cassettes.
    let driveNumber = 0;
    let mountedCassette = false;
    for (const mountedFilename of mountedFilenames) {
        const program = readTrs80File(mountedFilename);
        if (typeof program === "string") {
            console.log(program);
            return;
        }

        if (program instanceof AudioFile) {
            if (mountedCassette) {
                console.log("Can only mount a single cassette");
                return;
            }
            cassette.setAudioFile(program, 0);
            mountedCassette = true;
        } else if (isFloppy(program)) {
            program.setMountedWriteProtected(writeProtected);
            program.onWrite.subscribe(floppyWrite => {
                const fd = fs.openSync(mountedFilename, "r+");
                fs.writeSync(fd, floppyWrite.data, 0, floppyWrite.data.length, floppyWrite.offset);
                fs.closeSync(fd);
            });
            trs80.loadFloppyDisk(program, driveNumber++);
        } else if (program.className === "Cassette") {
            // Cassette.
            if (mountedCassette) {
                console.log("Can only mount a single cassette");
                return;
            }
            cassette.setCasFile(program, 0);
            mountedCassette = true;
        } else {
            console.log("Can only mount cassettes or floppies: " + mountedFilename);
            return;
        }
    }

    if (xray) {
        connectXray(trs80, keyboard, config);
    }
}
