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
 * Type for the function that logs a message.
 */
export type LogFunction = (level: LogLevel, message: string) => void;

/**
 * A logger that logs to the console.
 */
export const CONSOLE_LOG_FUNCTION: LogFunction = (level, message) => {
    switch (level) {
        case LogLevel.TRACE:
        case LogLevel.INFO:
            console.log(message);
            break;

        case LogLevel.WARN:
            console.warn(message);
            break;
    }
}

/**
 * Parent class of loggers, with the convenience functions (info, warn, etc.).
 */
export abstract class Logger {
    /**
     * The minimum level to log at.
     */
    public minLevel: LogLevel;

    constructor(minLevel: LogLevel) {
        this.minLevel = minLevel;
    }

    /**
     * Subclass must implement this. The log level will already have been filtered for.
     */
    protected abstract logInternal(level: LogLevel, message: string): void;

    /**
     * Generic log function with the log level parameter.
     */
    public log(level: LogLevel, message: string): void {
        if (level >= this.minLevel) {
            this.logInternal(level, message);
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
 * Logger that delegates output to a logging function, which can be replaced by the application.
 */
export class FunctionLogger extends Logger {
    /**
     * By default log to the console, but replace this to send the logs elsewhere.
     */
    public logFunction: LogFunction = CONSOLE_LOG_FUNCTION;

    protected logInternal(level: LogLevel, message: string): void {
        this.logFunction(level, message);
    }
}

/**
 * Logger that delegates output to another logger.
 */
export class DelegatingLogger extends Logger {
    private readonly parentLogger: Logger;

    constructor(minLevel: LogLevel, parentLogger: Logger) {
        super(minLevel);
        this.parentLogger = parentLogger;
    }

    protected logInternal(level: LogLevel, message: string): void {
        this.parentLogger.log(level, message);
    }
}

/**
 * The top-level logger. This determines where the message go, via its log function. Don't
 * log using this function, use the specific ones below.
 */
export const TRS80_MAIN_LOGGER = new FunctionLogger(LogLevel.TRACE);

/**
 * Loggers for specific sub-systems. These can be individually configured.
 */
export const TRS80_BASE_LOGGER = new DelegatingLogger(LogLevel.INFO, TRS80_MAIN_LOGGER);
export const TRS80_EMULATOR_LOGGER = new DelegatingLogger(LogLevel.INFO, TRS80_MAIN_LOGGER);
