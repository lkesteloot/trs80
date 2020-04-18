import * as fs from "fs";
import chalk from "chalk";
import {toHex} from "z80-base";
import {Asm} from "../assembler/Asm";

const srcPathname = "sio_basic.asm";
const lstPathname = "sio_basic.lst";
const binPathname = "sio_basic.bin";

function loadFile(filename: string): string[] {
    return fs.readFileSync(filename, "utf-8").split(/\r?\n/);
}

function main() {
    const lstFd = fs.openSync(lstPathname, "w");
    const binFd = fs.openSync(binPathname, "w");
    const asm = new Asm(loadFile);
    const assembledLines = asm.assembleFile(srcPathname);
    if (assembledLines === undefined) {
        console.log("Cannot read file " + srcPathname);
        return;
    }

    let errorCount = 0;
    for (const results of assembledLines) {
        if (results.binary.length !== 0) {
            // Show four bytes at a time.
            let displayAddress = results.address;
            for (let i = 0; i < results.binary.length; i += 4) {
                let result = toHex(displayAddress, 4) + ":";
                for (let j = 0; j < 4 && i + j < results.binary.length; j++) {
                    result += " " + toHex(results.binary[i + j], 2);
                    displayAddress++;
                }
                if (i === 0) {
                    result = result.padEnd(24, " ") + results.line;
                }
                fs.writeSync(lstFd, result + "\n");
            }

            fs.writeSync(binFd, new Uint8Array(results.binary));
        } else {
            fs.writeSync(lstFd, " ".repeat(24) + results.line + "\n");
        }
        if (results.error !== undefined) {
            fs.writeSync(lstFd, "error: " + results.error + "\n");
        }

        if (results.error !== undefined) {
            console.log(chalk.gray(results.line));
            console.log(chalk.red("error: " + results.error));
            console.log();
            errorCount += 1;
        }
    }

    if (errorCount !== 0) {
        console.log(errorCount + " errors");
    }

    fs.closeSync(lstFd);
    fs.closeSync(binFd);
}

main();
