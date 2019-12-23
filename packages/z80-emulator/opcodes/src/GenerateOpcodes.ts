import * as path from "path";
import * as fs from "fs";
import {toHex, isWordReg} from "z80-test/dist";

const BYTE_PARAMS = new Set(["a", "b", "c", "d", "e", "h", "l", "nn"]);
const WORD_PARAMS = new Set(["af", "bc", "de", "hl", "nnnn"]);

enum DataWidth {
    BYTE, WORD
}

function determineParamWidth(param: string): DataWidth | undefined {
    if (BYTE_PARAMS.has(param)) {
        return DataWidth.BYTE;
    }
    if (WORD_PARAMS.has(param)) {
        return DataWidth.WORD;
    }

    return undefined;
}

function determineDataWidth(param1: string, param2: string): DataWidth {
    let dataWidth1 = determineParamWidth(param1);
    let dataWidth2 = determineParamWidth(param2);

    if (dataWidth1 === undefined) {
        if (dataWidth2 === undefined) {
            throw new Error(`Can't determine data width from "${param1}" and "${param2}"`);
        }
        return dataWidth2;
    }

    if (dataWidth2 !== undefined && dataWidth1 !== dataWidth2) {
        throw new Error(`Mismatch of data width between "${param1}" and "${param2}"`);
    }

    return dataWidth1;
}

function handleRst(output: string[], rst: number): void {
    output.push("    z80.tStateCount += 1;");
    output.push("    z80.pushWord(z80.regs.pc);");
    output.push("    z80.regs.pc = 0x" + toHex(rst, 4)+ ";");
    output.push("    z80.regs.memptr = z80.regs.pc;");
}

function handleLd(output: string[], dest: string, src: string): void {
    output.push("    let value: number;");
    if (determineDataWidth(dest, src) == DataWidth.BYTE) {
        if (src.startsWith("(") && src.endsWith(")")) {
            const addr = src.substr(1, src.length - 2);
            if (isWordReg(addr)) {
                output.push("    z80.regs.memptr = inc16(z80.regs." + addr + ");");
                output.push("    value = z80.readByte(z80.regs." + addr + ");");
            } else if (addr === "nnnn") {
                output.push("    value = z80.readByte(z80.regs.pc);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    value = word(z80.readByte(z80.regs.pc), value);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    value = z80.readByte(value);");
                output.push("    z80.regs.memptr = inc16(value);");
            } else {
                throw new Error("Unknown src address type: " + addr);
            }
        } else {
            if (src === "nn") {
                output.push("    value = z80.readByte(z80.regs.pc);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
            } else {
                output.push("    value = z80.regs." + src + ";");
            }
        }
        if (dest.startsWith("(") && dest.endsWith(")")) {
            const addr = dest.substr(1, dest.length - 2);
            if (isWordReg(addr)) {
                output.push("    z80.regs.memptr = word(z80.regs.a, inc16(z80.regs." + addr + "));");
                output.push("    z80.writeByte(z80.regs." + addr + ", value);");
            } else if (addr === "nnnn") {
                output.push("    value = z80.readByte(z80.regs.pc);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    value = word(z80.readByte(z80.regs.pc), value);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    z80.regs.memptr = word(z80.regs.a, inc16(value));");
                output.push("    z80.writeByte(value, z80.regs.a);");
            } else {
                throw new Error("Unknown dest address type: " + addr);
            }
        } else {
            output.push("    z80.regs." + dest + " = value;");
        }
    } else {
        // DataWidth.WORD.
        if (src.startsWith("(") && src.endsWith(")")) {
            const addr = src.substr(1, src.length - 2);
            if (addr === "nnnn") {
                output.push("    value = z80.readByte(z80.regs.pc);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    value = word(z80.readByte(z80.regs.pc), value);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    value = z80.readByte(value);");
                output.push("    z80.regs.memptr = inc16(value);");
            } else {
                throw new Error("Unknown src address type: " + addr);
            }
        } else {
            if (src === "nnnn") {
                output.push("    value = z80.readByte(z80.regs.pc);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    value = word(z80.readByte(z80.regs.pc), value);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
            } else if (isWordReg(src)) {
                output.push("    value = z80.regs." + src + ";");
            } else {
                throw new Error("Unknown src type: " + src);
            }
        }
        if (dest.startsWith("(") && dest.endsWith(")")) {
            const addr = dest.substr(1, dest.length - 2);
            if (addr === "nnnn") {
                output.push("    let addr = z80.readByte(z80.regs.pc);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    addr = word(z80.readByte(z80.regs.pc), addr);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    z80.regs.memptr = word(z80.regs.a, inc16(value));");
                output.push("    z80.writeByte(addr, lo(value));");
                output.push("    z80.regs.memptr = addr;");
                output.push("    z80.writeByte(inc16(addr), hi(value));");
            } else {
                throw new Error("Unknown dest address type: " + addr);
            }
        } else {
            if (isWordReg(dest)) {
                output.push("    z80.regs." + dest + " = value;");
            } else {
                throw new Error("Unknown dest type: " + dest);
            }
        }
    }
}

function processFile(pathname: string): void {
    const output: string[] = [];
    output.push("");
    output.push("// The content of this switch is auto-generated by GenerateOpcodes.ts.");
    output.push("");

    const template = fs.readFileSync("src/Decode.template.ts", "utf-8");

    fs.readFileSync(pathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
        line = line.trim();
        if (line.length === 0 || line.startsWith("#")) {
            // Comment or empty line.
            return;
        }

        const fields = line.split(/\s+/);
        const numberString = fields.length >= 1 ? fields[0] : undefined;
        const opcode = fields.length >= 2 ? fields[1].toLowerCase() : undefined;
        const params = fields.length >= 3 ? fields[2].toLowerCase() : undefined;
        const extra = fields.length >= 4 ? fields[3] : undefined;
        if (fields.length > 4) {
            throw new Error("Invalid opcode line: " + line);
        }

        if (numberString === undefined || numberString.length == 0 || !numberString.startsWith("0x")) {
            throw new Error("Invalid number: " + line);
        }

        const number = parseInt(numberString, 16);

        output.push("case 0x" + toHex(number, 2) + ": { // " + ((opcode || "") + " " + (params || "")).trim());

        if (opcode === undefined) {
            output.push("    // Undefined opcode.");
        } else {
            switch (opcode) {
                case "ld": {
                    if (params === undefined) {
                        throw new Error("LD requires params: " + line);
                    }
                    const locs = params.split(",");
                    if (locs.length !== 2) {
                        throw new Error("LD requires two params: " + line);
                    }
                    const [dest, src] = locs;
                    handleLd(output, dest, src);
                    break;
                }

                case "rst":
                    if (params === undefined) {
                        throw new Error("RST requires params: " + line);
                    }
                    handleRst(output, parseInt(params, 16));
                    break;

                default:
                    console.log("Unhandled opcode: " + line);
                    break;
            }
        }

        output.push("    break;");
        output.push("}");
        output.push("");
    });

    const replacement = output.map((line) => line.length === 0 ? line : "        " + line).join("\n");
    const preamble = "// Do not modify. This file is generated by GenerateOpcodes.ts.\n\n";
    const finalCode = preamble + template.replace("// DECODE", replacement);

    fs.writeFileSync("src/Decode.ts", finalCode);
}

function generateOpcodes(): void {
    const opcodesDir = path.join(__dirname, "..");
    const basePathname = path.join(opcodesDir, "opcodes_base.dat");

    processFile(basePathname);
}

generateOpcodes();
