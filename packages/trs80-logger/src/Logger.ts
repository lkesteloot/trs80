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
     * Generic log function with the log level parameter.
     */
    public log(level: LogLevel, message: string): void {
        if (level >= this.minLevel) {
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
export const TRS80_CONSOLE_SINK: LogSink = (level: LogLevel, message: string): void => {
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
 * Make a sink that batches identical sequential messages.
 */
export function makeBatchingSink(delegatedSink: LogSink): LogSink {
    let lastLevel: LogLevel = LogLevel.TRACE;
    let lastMessage = "";
    let lastCount = 0;

    return (level: LogLevel, message: string): void => {
        if (level === lastLevel && message === lastMessage) {
            lastCount += 1;
        } else {
            if (lastCount > 0) {
                if (lastCount > 1) {
                    lastMessage += " (x" + lastCount + ")";
                }
                delegatedSink(lastLevel, lastMessage);
            }

            lastLevel = level;
            lastMessage = message;
            lastCount = 1;
        }
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
export const TRS80_MAIN_SINK = new SplittingSink(makeBatchingSink(TRS80_CONSOLE_SINK));

/**
 * Loggers for specific sub-systems. These can be individually configured.
 */
export const TRS80_BASE_LOGGER = new Logger(LogLevel.INFO, TRS80_MAIN_SINK.sink);
export const TRS80_EMULATOR_LOGGER = new Logger(LogLevel.INFO, TRS80_MAIN_SINK.sink);

/**
 * Map from the name of a module to its logger.
 */
export const TRS80_MODULE_NAME_TO_LOGGER: {[moduleName: string]: Logger} = {
    "base": TRS80_BASE_LOGGER,
    "emulator": TRS80_EMULATOR_LOGGER,
};
