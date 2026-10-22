/**
 * Level at which to log a message.
 */
export enum LogLevel {
    /**
     * For messages that trace the logic of the code, for example how
     * we decided that a floppy was a particular operating system.
     */
    TRACE,

    /**
     * Regular messages. There shouldn't be many of these, since these
     * kinds of messages are typically just written directly to the console
     * for a node program, or to the webpage itself for a web app.
     */
    INFO,

    /**
     * Something is suspicious, for example, the emulator got an instruction
     * to write to the ROM.
     */
    WARN,
}

/**
 * Type of the function that takes a log level and message and shows it to
 * the user or sends it to another sink. Must not filter by log level;
 * that's already done upstream.
 */
export type LogSink = (level: LogLevel, message: string) => void;

/**
 * Logger with convenience functions and a minimum log level filter.
 */
export class Logger {
    /**
     * The minimum level to log at.
     */
    public minLevel: LogLevel;
    /**
     * The sink to send filtered log events to.
     */
    public readonly logSink: LogSink;

    constructor(minLevel: LogLevel, logSink: LogSink) {
        this.minLevel = minLevel;
        this.logSink = logSink;
    }

    /**
     * Whether the specified level is enabled in this logger.
     */
    public isEnabled(level: LogLevel): boolean {
        return level >= this.minLevel;
    }

    /**
     * Whether the trace level is enabled in this logger.
     */
    public isTraceEnabled(): boolean {
        return this.isEnabled(LogLevel.TRACE);
    }

    /**
     * Whether the info level is enabled in this logger.
     */
    public isInfoEnabled(): boolean {
        return this.isEnabled(LogLevel.INFO);
    }

    /**
     * Whether the warn level is enabled in this logger.
     */
    public isWarnEnabled(): boolean {
        return this.isEnabled(LogLevel.WARN);
    }

    /**
     * Generic log function with the log level parameter.
     */
    public log(level: LogLevel, message: string): void {
        if (this.isEnabled(level)) {
            this.logSink(level, message);
        }
    }

    /**
     * For messages that trace the logic of the code, for example how
     * we decided that a floppy was a particular operating system.
     */
    public trace(message: string): void {
        this.log(LogLevel.TRACE, message);
    }

    /**
     * Regular messages. There shouldn't be many of these, since these
     * kinds of messages are typically just written directly to the console
     * for a node program, or to the webpage itself for a web app.
     */
    public info(message: string): void {
        this.log(LogLevel.INFO, message);
    }

    /**
     * Something is suspicious, for example, the emulator got an instruction
     * to write to the ROM.
     */
    public warn(message: string): void {
        this.log(LogLevel.WARN, message);
    }
}

/**
 * A sink that logs to the console.
 */
export const CONSOLE_SINK: LogSink = (level: LogLevel, message: string): void => {
    switch (level) {
        case LogLevel.TRACE:
        case LogLevel.INFO:
            console.log(message);
            break;

        case LogLevel.WARN:
            console.warn(message);
            break;
    }
};

/**
 * How long to wait, after the last message, before printing a message that's being held
 * back in case it repeats.
 */
const BATCHING_FLUSH_DELAY_MS = 100;

/**
 * Make a sink that batches identical sequential messages. A message is held back until
 * a different one arrives or until no message has arrived for a short while, so the last
 * message is always printed.
 */
export function makeBatchingSink(delegatedSink: LogSink): LogSink {
    let lastLevel: LogLevel = LogLevel.TRACE;
    let lastMessage = "";
    let lastCount = 0;
    let flushTimer: ReturnType<typeof setTimeout> | undefined = undefined;

    /**
     * Print the held message, if any, with its repeat count.
     */
    function flush(): void {
        if (lastCount > 0) {
            let message = lastMessage;
            if (lastCount > 1) {
                message += " (x" + lastCount + ")";
            }
            lastCount = 0;
            delegatedSink(lastLevel, message);
        }
    }

    return (level: LogLevel, message: string): void => {
        clearTimeout(flushTimer);
        if (lastCount > 0 && level === lastLevel && message === lastMessage) {
            lastCount += 1;
        } else {
            flush();
            lastLevel = level;
            lastMessage = message;
            lastCount = 1;
        }
        flushTimer = setTimeout(flush, BATCHING_FLUSH_DELAY_MS);
    };
}

/**
 * Sends a log event to multiple sinks.
 */
export class SplittingSink {
    /**
     * Modify this array to send to other sinks.
     */
    public readonly delegatedSinks: LogSink[];
    /**
     * Write to this sink.
     */
    public readonly sink = (level: LogLevel, message: string): void => {
        for (const sink of this.delegatedSinks) {
            sink(level, message);
        }
    };

    constructor(... delegatedSinks: LogSink[]) {
        this.delegatedSinks = [... delegatedSinks];
    }
}

/**
 * The top-level sink. All loggers point to this. Replace its delegated sinks to sink elsewhere.
 */
export const MAIN_SINK = new SplittingSink(makeBatchingSink(CONSOLE_SINK));

/**
 * Loggers for specific sub-systems. These can be individually configured.
 */
// Misc code in the "trs80-base" library.
export const TRS80_BASE_LOGGER = new Logger(LogLevel.INFO, MAIN_SINK.sink);
// Access to floppy files (JV1, JV3, DMK, etc.).
export const TRS80_FLOPPY_LOGGER = new Logger(LogLevel.INFO, MAIN_SINK.sink);
// The TRS-80 hardware emulator in the "trs80-emulator" library.
export const TRS80_EMULATOR_LOGGER = new Logger(LogLevel.INFO, MAIN_SINK.sink);
// The Z80 CPU emulator in the "z80-emulator" library.
export const Z80_EMULATOR_LOGGER = new Logger(LogLevel.INFO, MAIN_SINK.sink);

/**
 * Map from the name of a module to its logger.
 */
export const MODULE_NAME_TO_LOGGER: {[moduleName: string]: Logger} = {
    "base": TRS80_BASE_LOGGER,
    "floppy": TRS80_FLOPPY_LOGGER,
    "emulator": TRS80_EMULATOR_LOGGER,
    "z80": Z80_EMULATOR_LOGGER,
};
