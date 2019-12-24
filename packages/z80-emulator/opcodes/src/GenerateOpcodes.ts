import * as path from "path";
import * as fs from "fs";
import {toHex, isWordReg, isByteReg} from "z80-test/dist";

const BYTE_PARAMS = new Set(["a", "b", "c", "d", "e", "h", "l", "nn", "ixh", "ixl", "iyh", "iyl"]);
const WORD_PARAMS = new Set(["af", "bc", "de", "hl", "nnnn", "ix", "iy"]);

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

function handleCp(output: string[], src: string): void {
    output.push("    let value: number;");
    if (src.startsWith("(") && src.endsWith(")")) {
        const addr = src.substr(1, src.length - 2);
        if (isWordReg(addr)) {
            output.push("    value = z80.readByte(z80.regs." + addr + ");");
        } else if (addr.endsWith("+dd")) {
            const reg = addr.substr(0, addr.length - 3);
            output.push("    value = z80.readByte(z80.regs.pc);");
            output.push("    z80.regs.pc = inc16(z80.regs.pc);");
            output.push("    z80.regs.memptr = (z80.regs." + reg + " + signedByte(value)) & 0xFFFF;");
            output.push("    value = z80.readByte(z80.regs.memptr);");
        } else {
            throw new Error("Unknown src address type: " + addr);
        }
    } else if (src === "nn") {
        output.push("    value = z80.readByte(z80.regs.pc);");
        output.push("    z80.regs.pc = inc16(z80.regs.pc);");
    } else if (isByteReg(src)) {
        output.push("    value = z80.regs." + src + ";");
    } else {
        throw new Error("Unknown src type: " + src);
    }

    output.push("    const diff = (z80.regs.a - value) & 0xFFFF;");
    output.push("    const lookup = (((z80.regs.a & 0x88) >> 3) |");
    output.push("                   ((value & 0x88) >> 2) |");
    output.push("                   ((diff & 0x88) >> 1)) & 0xFF;");
    output.push("    let f = Flag.N;");
    output.push("    if ((diff & 0x100) != 0) f |= Flag.C;");
    output.push("    if (diff == 0) f |= Flag.Z;");
    output.push("    f |= halfCarrySubTable[lookup & 0x07];");
    output.push("    f |= overflowSubTable[lookup >> 4];");
    output.push("    f |= value & (Flag.X3 | Flag.X5);");
    output.push("    f |= diff & Flag.S;");
    // overflow_sub_table[lookup >> 4] |\
    // ( value & ( FLAG_3 | FLAG_5 ) ) |\
    // ( cptemp & FLAG_S );\
    output.push("    z80.regs.af = word(z80.regs.a, f);")
    // TODO finish.
}

function handleEx(output: string[], op1: string, op2: string): void {
    if (op2 === "af'") {
        op2 = "afPrime";
    }

    output.push("    const rightValue = z80.regs." + op2 + ";");
    if (op1 === "(sp)") {
        output.push("    const leftValueL = z80.readByte(z80.regs.sp);");
        output.push("    const leftValueH = z80.readByte(inc16(z80.regs.sp));");
        output.push("    z80.tStateCount += 1;");
        output.push("    z80.writeByte(inc16(z80.regs.sp), hi(rightValue));");
        output.push("    z80.writeByte(z80.regs.sp, lo(rightValue));");
        output.push("    z80.tStateCount += 2;");
        output.push("    z80.regs.memptr = word(leftValueH, leftValueL);");
        output.push("    z80.regs." + op2 + " = word(leftValueH, leftValueL);");
    } else {
        output.push("    z80.regs." + op2 + " = z80.regs." + op1 + ";");
        output.push("    z80.regs." + op1 + " = rightValue;");
    }
}


function handleJpCall(output: string[], opcode: string, cond: string | undefined, dest: string): void {
    if (dest === "nnnn") {
        output.push("    z80.regs.memptr = z80.readByte(z80.regs.pc);");
        output.push("    z80.regs.pc = inc16(z80.regs.pc);");
        output.push("    z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);");
        output.push("    z80.regs.pc = inc16(z80.regs.pc);");
    }
    if (cond !== undefined) {
        let not = cond.startsWith("n");
        let flag = (not ? cond.substr(1) : cond).toUpperCase();
        if (cond === "po") {
            not = true;
            flag = "P";
        } else if (cond === "pe") {
            not = false;
            flag = "P";
        } else if (cond === "p") {
            not = true;
            flag = "S";
        } else if (cond === "m") {
            not = false;
            flag = "S";
        }
        output.push("    if ((z80.regs.f & Flag." + flag + ") " + (not ? "===" : "!==") + " 0) {");
    }
    if (opcode === "call") {
        output.push("    z80.pushWord(z80.regs.pc);");
    }
    if (dest === "nnnn") {
        output.push("    z80.regs.pc = z80.regs.memptr;");
    } else if (isWordReg(dest)) {
        output.push("    z80.regs.pc = z80.regs." + dest + ";");
    } else {
        throw new Error("Unknown JP dest: " + dest);
    }
    if (cond !== undefined) {
        output.push("    }");
    }
}

function handleLd(output: string[], dest: string, src: string): void {
    if (dest.includes("dd")) {
        // Must fetch this first, before possible "nn" in src.
        output.push("    const dd = z80.readByte(z80.regs.pc);");
        output.push("    z80.regs.pc = inc16(z80.regs.pc);");
    }
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
            } else if (addr.endsWith("+dd")) {
                const reg = addr.substr(0, addr.length - 3);
                output.push("    value = z80.readByte(z80.regs.pc);");
                output.push("    z80.regs.pc = inc16(z80.regs.pc);");
                output.push("    z80.regs.memptr = (z80.regs." + reg + " + signedByte(value)) & 0xFFFF;");
                output.push("    value = z80.readByte(z80.regs.memptr);");
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
            } else if (addr.endsWith("+dd")) {
                const reg = addr.substr(0, addr.length - 3);
                // Value of "dd" is already in "dd" variable.
                output.push("    z80.regs.memptr = (z80.regs." + reg + " + signedByte(dd)) & 0xFFFF;");
                output.push("    z80.writeByte(z80.regs.memptr, value);")
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

function handlePop(output: string[], reg: string): void {
    output.push("    z80.regs." + reg + " = z80.popWord();");
}

function handlePush(output: string[], reg: string): void {
    output.push("    z80.pushWord(z80.regs." + reg + ");");
}

function handleRst(output: string[], rst: number): void {
    output.push("    z80.tStateCount += 1;");
    output.push("    z80.pushWord(z80.regs.pc);");
    output.push("    z80.regs.pc = 0x" + toHex(rst, 4)+ ";");
    output.push("    z80.regs.memptr = z80.regs.pc;");
}

function generateDispatch(pathname: string): string {
    const output: string[] = [];
    output.push("");
    output.push("// The content of this switch is auto-generated by GenerateOpcodes.ts.");
    output.push("");

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

        if (extra !== undefined) {
            output.push("    // We don't yet implement undocumented opcodes");
        } else if (opcode === undefined) {
            output.push("    // Undefined opcode.");
        } else {
            switch (opcode) {
                case "cp": {
                    if (params === undefined) {
                        throw new Error("CP requires params: " + line);
                    }
                    const parts = params.split(",");
                    if (parts.length !== 1) {
                        throw new Error("CP requires one param: " + line);
                    }
                    handleCp(output, parts[0]);
                    break;
                }

                case "di": {
                    output.push("    z80.regs.iff1 = 0;");
                    output.push("    z80.regs.iff2 = 0;");
                    break;
                }

                case "ex": {
                    if (params === undefined) {
                        throw new Error("EX requires params: " + line);
                    }
                    const parts = params.split(",");
                    if (parts.length !== 2) {
                        throw new Error("EX requires two params: " + line);
                    }
                    const [op1, op2] = parts;
                    handleEx(output, op1, op2);
                    break;
                }

                case "ei": {
                    // TODO Wait another instruction before enabling interrupts.
                    output.push("    z80.regs.iff1 = 1;");
                    output.push("    z80.regs.iff2 = 1;");
                    break;
                }

                case "call":
                case "jp": {
                    if (params === undefined) {
                        throw new Error(opcode + " requires params: " + line);
                    }
                    const parts = params.split(",");
                    let cond: string | undefined;
                    let dest: string;
                    if (parts.length == 2) {
                        cond = parts[0];
                        dest = parts[1];
                    } else {
                        cond = undefined;
                        dest = parts[0];
                    }
                    handleJpCall(output, opcode, cond, dest)
                    break;
                }

                case "ld": {
                    if (params === undefined) {
                        throw new Error("LD requires params: " + line);
                    }
                    const parts = params.split(",");
                    if (parts.length !== 2) {
                        throw new Error("LD requires two params: " + line);
                    }
                    const [dest, src] = parts;
                    handleLd(output, dest, src);
                    break;
                }

                case "pop": {
                    if (params === undefined) {
                        throw new Error("POP requires params: " + line);
                    }
                    const parts = params.split(",");
                    if (parts.length !== 1) {
                        throw new Error("POP requires one param: " + line);
                    }
                    handlePop(output, parts[0]);
                    break;
                }

                case "push": {
                    if (params === undefined) {
                        throw new Error("PUSH requires params: " + line);
                    }
                    const parts = params.split(",");
                    if (parts.length !== 1) {
                        throw new Error("PUSH requires one param: " + line);
                    }
                    handlePush(output, parts[0]);
                    break;
                }

                case "rst":
                    if (params === undefined) {
                        throw new Error("RST requires params: " + line);
                    }
                    handleRst(output, parseInt(params, 16));
                    break;

                case "shift":
                    if (params === undefined) {
                        throw new Error("Shift requires params: " + line);
                    }
                    output.push("    decode" + params.toUpperCase() + "(z80);");
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

    return output.map((line) => line.length === 0 ? line : "        " + line).join("\n");
}

function generateSource(dispatchMap: Map<string, string>): void {
    let template = fs.readFileSync("src/Decode.template.ts", "utf-8");
    const preamble = "// Do not modify. This file is generated by GenerateOpcodes.ts.\n\n";
    template = preamble + template;

    for (const [prefix, dispatch] of dispatchMap.entries()) {
        const key = "// DECODE_" + prefix.toUpperCase();
        template = template.replace(key, dispatch);
    }

    fs.writeFileSync("src/Decode.ts", template);
}

function generateOpcodes(): void {
    const opcodesDir = path.join(__dirname, "..");
    const prefixes = ["base", "dd", "ddcb", "fd", "fdcb"];
    const dispatchMap = new Map<string, string>();

    for (const prefix of prefixes) {
        const dataPathname = path.join(opcodesDir, "opcodes_" + prefix + ".dat");
        const dispatch = generateDispatch(dataPathname);
        dispatchMap.set(prefix, dispatch);
    }

    generateSource(dispatchMap);
}

generateOpcodes();
