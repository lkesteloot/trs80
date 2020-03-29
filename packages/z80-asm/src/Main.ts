import * as fs from "fs";
import chalk from "chalk";
import {toHex} from "z80-base";
import {Parser} from "./Parser";

const srcPathname = "sio_basic.asm";
const lstPathname = "sio_basic.lst";
const binPathname = "sio_basic.bin";

function main() {
    const constants: any = {};
    const lstFd = fs.openSync(lstPathname, "w");
    const binFd = fs.openSync(binPathname, "w");
    const lines = fs.readFileSync(srcPathname, "utf-8").split(/\r?\n/);
    for (let pass = 0; pass < 2; pass++) {
        let errorCount = 0;
        let address = 0;
        lines.forEach((line: string) => {
            const parser = new Parser(line, address, constants, pass === 0);
            const results = parser.assemble();
            if (pass !== 0) {
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
                            result = result.padEnd(24, " ") + line;
                        }
                        fs.writeSync(lstFd, result + "\n");
                    }

                    fs.writeSync(binFd, new Uint8Array(results.binary));
                } else {
                    fs.writeSync(lstFd, " ".repeat(24) + line + "\n");
                }
                if (results.error !== undefined) {
                    fs.writeSync(lstFd, "error: " + results.error + "\n");
                }

                if (results.error !== undefined) {
                    console.log(chalk.gray(line));
                    console.log(chalk.red("error: " + results.error));
                    console.log();
                    errorCount += 1;
                }
            }
            address = results.nextAddress;
        });
        if (pass !== 0 && errorCount !== 0) {
            console.log(errorCount + " errors");
        }
    }
    fs.closeSync(lstFd);
    fs.closeSync(binFd);
}

main();
