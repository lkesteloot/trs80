import type {Help, OutputConfiguration} from "commander";
import {colors, isColorEnabled} from "./colors.js";

/**
 * How Commander formats help text. Section titles are emphasized, command and option names have the color
 * of a name, and the placeholders for arguments (such as "<NAME...>") are underlined (see colors.ts).
 * Descriptions are left plain. Descriptions are wrapped to the terminal's width, even where a long option
 * leaves them only 20 columns (Commander gives up below 40, and leaves the terminal to break the lines
 * wherever it likes). Pass this to configureHelp() of a command before adding subcommands to it,
 * since they inherit it.
 */
export const HELP_STYLE: Partial<Help> = {
    minWidthToWrap: 20,
    styleTitle: str => colors.emphasis(str),
    styleCommandText: str => colors.command(str),
    styleSubcommandText: str => colors.command(str),
    styleOptionText: str => colors.command(str),
    styleArgumentText: str => colors.placeholder(str),
};

/**
 * What Commander needs to know about our output for coloring help: whether we color at all, which is
 * decided by chalk (for the --color option, NO_COLOR and FORCE_COLOR) rather than by Commander's own
 * guess. Without this Commander would remove our colors, or leave out ones that --color asked for.
 * Pass it to configureOutput() of a command before adding subcommands to it.
 */
export const HELP_OUTPUT_COLORS: OutputConfiguration = {
    getOutHasColors: () => isColorEnabled(),
    getErrHasColors: () => isColorEnabled(),
};
