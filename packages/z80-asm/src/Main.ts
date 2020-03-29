import * as fs from "fs";
import chalk from "chalk";
import {toHex} from "z80-base";
import {Parser} from "./Parser";

const srcPathname = "sio_basic.asm";
const lstPathname = "sio_basic.lst";

function main() {
    const constants: any = {};
    const lstFd = fs.openSync(lstPathname, "w");
    const lines = fs.readFileSync(srcPathname, "utf-8").split(/\r?\n/);
    for (let pass = 0; pass < 2; pass++) {
        let errorCount = 0;
        let address = 0;
        lines.forEach((line: string) => {
            const parser = new Parser(line, address, constants, pass === 0);
            parser.assemble();
            if (pass !== 0) {
                if (parser.binary.length !== 0) {
                    // Show four bytes at a time.
                    let displayAddress = address;
                    for (let i = 0; i < parser.binary.length; i += 4) {
                        let result = toHex(displayAddress, 4) + ":";
                        for (let j = 0; j < 4 && i + j < parser.binary.length; j++) {
                            result += " " + toHex(parser.binary[i + j], 2);
                            displayAddress++;
                        }
                        if (i === 0) {
                            result = result.padEnd(24, " ") + line;
                        }
                        fs.writeSync(lstFd, result + "\n");
                    }
                } else {
                    fs.writeSync(lstFd, " ".repeat(24) + line + "\n");
                }
                if (parser.error !== undefined) {
                    fs.writeSync(lstFd, "error: " + parser.error + "\n");
                }

                if (parser.error !== undefined) {
                    console.log(chalk.gray(line));
                    console.log(chalk.red("error: " + parser.error));
                    console.log();
                    errorCount += 1;
                }
            }
            address += parser.binary.length;
        });
        if (pass !== 0 && errorCount !== 0) {
            console.log(errorCount + " errors");
        }
    }
    fs.closeSync(lstFd);
}

main();
