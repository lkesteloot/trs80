
export const TRS80_MODEL_III_KNOWN_LABELS: [number, string][] = [
    [0x0298, "clkon"], // Turn clock on.
    [0x02a1, "clkoff"], // Turn clock off.
    [0x0296, "cshin"], // Search for cassette header and sync byte.
    [0x0235, "csin"],  // Read cassette byte.
    [0x0287, "cshwr"], // Write cassette leader and sync byte.
    [0x01f8, "csoff"], // Turn off cassette.
    [0x0264, "csout"], // Write byte to cassette.
    [0x3033, "date"], // Get today's date.
    [0x0060, "delay"], // Delay for a specified interval (2.46 + 14.8*BC microseconds).
    [0x0069, "initio"], // Initialize all I/O drivers.
    [0x002b, "kbchar"], // Get a keyboard character if available.
    [0x0040, "kbline"], // Wait for a line from the keyboard.
    [0x0049, "kbwait"], // Wait for a keyboard character.
    [0x028d, "kbbrk"], // Check for a Break key only.
    [0x003b, "prchar"], // Output a character to the printer.
    [0x01d9, "prscn"], // Print entire screen contents.
    [0x1a19, "ready"], // Jump to Model III Basic "Ready".
    [0x0000, "reset"], // Jump to reset.
    [0x006c, "route"], // Change I/O device routing.
    [0x005a, "rsinit"], // Initialize the RS-232-C interface.
    [0x0050, "rsrcv"], // Receive a character from the RS-232-C interface.
    [0x0055, "rstx"], // Transmit a character to the RS-232-C interface.
    [0x3042, "setcas"], // Prompt user to set cassette baud rate.
    [0x3036, "time"], // Get the time.
    [0x0033, "vdchar"], // Display a character.
    [0x01c9, "vdcls"], // Clear the video display screen.
    [0x021b, "vdline"], // Display a line.
];
