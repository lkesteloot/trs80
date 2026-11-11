import {getWriteProtect, setWriteProtect} from "trs80-disk";
import {ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";

/**
 * The "protect" command: show or change the image's write-protect flag, the one an emulator or a floppy
 * emulator honors, as the tab on a real floppy does.
 */
export const PROTECT_COMMAND: DiskCommand = {
    spec: {
        name: "protect",
        aliases: [],
        args: "[on|off]",
        summary: "show the image's write-protect flag, or turn it on or off",
        options: [],
        extraHelp: [
            "With no argument, this says whether the image is marked write-protected. With \"on\" or \"off\", it " +
                "sets or clears the mark. The mark is in the image file itself, and emulators honor it as a real " +
                "drive honors the tab on a floppy; this command and the others refuse to change a write-protected " +
                "disk's files unless you give --force.",
            "DMK, JV3 and HFE floppies and HDV hard disks have the flag. JV1 and IMD images have nowhere to keep " +
                "one, so they can't be marked.",
        ],
    },

    endsSession: false,

    /**
     * Show the flag, or set it to the argument's state.
     *
     * @throws ToolError if the argument isn't "on" or "off", or the image's format has no flag.
     */
    run(session, command) {
        const wanted = command.args[0]?.toLowerCase();
        if (wanted === undefined) {
            const current = getWriteProtect(session);
            if (typeof current === "string") {
                console.log(current);
            } else {
                console.log(current ? "The image is write-protected." : "The image isn't write-protected.");
            }
            return;
        }

        if (wanted !== "on" && wanted !== "off") {
            throw new ToolError("Use \"protect on\" or \"protect off\", not \"" + command.args[0] + "\"");
        }

        const writeProtected = wanted === "on";
        const changed = setWriteProtect(session, writeProtected);
        if (!changed) {
            console.log(writeProtected ? "The image is already write-protected." : "The image is already writable.");
            return;
        }
        console.log(writeProtected ? "The image is now write-protected." : "The image is now writable.");
    },
};
