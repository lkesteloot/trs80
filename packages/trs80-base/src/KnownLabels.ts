
import { KnownLabel } from "z80-base";

export const TRS80_MODEL_III_KNOWN_LABELS: KnownLabel[] = [
    { name: "clkon", address: 0x0298 }, // Turn clock on.
    { name: "clkoff", address: 0x02a1 }, // Turn clock off.
    { name: "cshin", address: 0x0296 }, // Search for cassette header and sync byte.
    { name: "csin", address: 0x0235 },  // Read cassette byte.
    { name: "cshwr", address: 0x0287 }, // Write cassette leader and sync byte.
    { name: "csoff", address: 0x01f8 }, // Turn off cassette.
    { name: "csout", address: 0x0264 }, // Write byte to cassette.
    { name: "date", address: 0x3033 }, // Get today's date.
    { name: "delay", address: 0x0060 }, // Delay for a specified interval (2.46 + 14.8*BC microseconds).
    { name: "initio", address: 0x0069 }, // Initialize all I/O drivers.
    { name: "kbchar", address: 0x002b }, // Get a keyboard character if available.
    { name: "kbline", address: 0x0040 }, // Wait for a line from the keyboard.
    { name: "kbwait", address: 0x0049 }, // Wait for a keyboard character.
    { name: "kbbrk", address: 0x028d }, // Check for a Break key only.
    { name: "prchar", address: 0x003b }, // Output a character to the printer.
    { name: "prscn", address: 0x01d9 }, // Print entire screen contents.
    { name: "ready", address: 0x1a19 }, // Jump to Model III Basic "Ready".
    { name: "reset", address: 0x0000 }, // Jump to reset.
    { name: "route", address: 0x006c }, // Change I/O device routing.
    { name: "rsinit", address: 0x005a }, // Initialize the RS-232-C interface.
    { name: "rsrcv", address: 0x0050 }, // Receive a character from the RS-232-C interface.
    { name: "rstx", address: 0x0055 }, // Transmit a character to the RS-232-C interface.
    { name: "setcas", address: 0x3042 }, // Prompt user to set cassette baud rate.
    { name: "time", address: 0x3036 }, // Get the time.
    { name: "vdchar", address: 0x0033 }, // Display a character.
    { name: "vdcls", address: 0x01c9 }, // Clear the video display screen.
    { name: "vdline", address: 0x021b }, // Display a line.
];
