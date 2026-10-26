import type {DiskCommand} from "./DiskCommands.js";

/**
 * The "undo" command: take back the most recent change to the disk.
 */
export const UNDO_COMMAND: DiskCommand = {
    spec: {
        name: "undo",
        aliases: [],
        args: "",
        summary: "undo the most recent change to the disk",
        options: [],
    },

    endsSession: false,
    worksWithoutDisk: true,
    managesHistory: true,

    /**
     * Restore the disk to how it was before the last change, saying which command that was. Having nothing to
     * undo isn't an error.
     */
    run(session) {
        const label = session.undo();
        console.log(label === undefined ? "Nothing to undo." : "Undid \"" + label + "\".");
    },
};

/**
 * The "redo" command: do again what "undo" took back.
 */
export const REDO_COMMAND: DiskCommand = {
    spec: {
        name: "redo",
        aliases: [],
        args: "",
        summary: "redo the change that was last undone",
        options: [],
    },

    endsSession: false,
    worksWithoutDisk: true,
    managesHistory: true,

    /**
     * Restore the disk to how it was after the change that was last undone, saying which command that was.
     * Having nothing to redo isn't an error.
     */
    run(session) {
        const label = session.redo();
        console.log(label === undefined ? "Nothing to redo." : "Redid \"" + label + "\".");
    },
};

/**
 * The "revert" command: go back to the disk as it was when last saved.
 */
export const REVERT_COMMAND: DiskCommand = {
    spec: {
        name: "revert",
        aliases: [],
        args: "",
        summary: "go back to the disk as last saved (or as opened); \"undo\" takes it back",
        options: [],
    },

    endsSession: false,
    worksWithoutDisk: true,
    managesHistory: true,

    /**
     * Restore the disk to how it was when it was last saved, as one change that "undo" can take back.
     * Having nothing to revert isn't an error.
     */
    run(session) {
        const reverted = session.revert();
        console.log(reverted ? "Reverted to the disk as last saved." : "Nothing to revert: the disk is as last saved.");
    },
};
