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
    WARNING,
}

/**
 * Type for the function that logs a message.
 */
export type Logger = (level: LogLevel, message: string) => void;

/**
 * A good default logger that logs to the console.
 */
export const DEFAULT_LOGGER: Logger = (level, message) => {
    switch (level) {
        case LogLevel.TRACE:
            // Don't log traces by default.
            break;

        case LogLevel.INFO:
            console.log(message);
            break;

        case LogLevel.WARNING:
            console.warn(message);
            break;
    }
}
