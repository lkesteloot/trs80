import * as path from "path";
import * as fs from "fs";
import {toHex, isWordReg, isByteReg, Flag} from "z80-test/dist";

const BYTE_PARAMS = new Set(["a", "b", "c", "d", "e", "h", "l", "nn", "ixh", "ixl", "iyh", "iyl"]);
const WORD_PARAMS = new Set(["af", "bc", "de", "hl", "nnnn", "ix", "iy", "sp"]);
const TAB = "    ";

enum DataWidth {
    BYTE, WORD
}

let indent = "";
function enter(): void {
    indent += TAB;
}
function exit(): void {
    indent = indent.substr(0, indent.length - TAB.length);
}
function addLine(output: string[], line: string): void {
    if (line.length === 0) {
        output.push("");
    } else {
        output.push(indent + line);
    }
}

function addCondIf(output: string[], cond: string | undefined): void {
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
        addLine(output, "if ((z80.regs.f & Flag." + flag + ") " + (not ? "===" : "!==") + " 0) {");
        enter();
    }
}

function addCondEndIf(output: string[], cond: string | undefined): void {
    if (cond !== undefined) {
        exit();
        addLine(output, "}");
    }
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
    addLine(output, "let value: number;");
    if (src.startsWith("(") && src.endsWith(")")) {
        const addr = src.substr(1, src.length - 2);
        if (isWordReg(addr)) {
            addLine(output, "value = z80.readByte(z80.regs." + addr + ");");
        } else if (addr.endsWith("+dd")) {
            const reg = addr.substr(0, addr.length - 3);
            addLine(output, "value = z80.readByte(z80.regs.pc);");
            addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
            addLine(output, "z80.regs.memptr = (z80.regs." + reg + " + signedByte(value)) & 0xFFFF;");
            addLine(output, "value = z80.readByte(z80.regs.memptr);");
        } else {
            throw new Error("Unknown src address type: " + addr);
        }
    } else if (src === "nn") {
        addLine(output, "value = z80.readByte(z80.regs.pc);");
        addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
    } else if (isByteReg(src)) {
        addLine(output, "value = z80.regs." + src + ";");
    } else {
        throw new Error("Unknown src type: " + src);
    }

    addLine(output, "const diff = (z80.regs.a - value) & 0xFFFF;");
    addLine(output, "const lookup = (((z80.regs.a & 0x88) >> 3) |");
    addLine(output, "               ((value & 0x88) >> 2) |");
    addLine(output, "               ((diff & 0x88) >> 1)) & 0xFF;");
    addLine(output, "let f = Flag.N;");
    addLine(output, "if ((diff & 0x100) != 0) f |= Flag.C;");
    addLine(output, "if (diff == 0) f |= Flag.Z;");
    addLine(output, "f |= halfCarrySubTable[lookup & 0x07];");
    addLine(output, "f |= overflowSubTable[lookup >> 4];");
    addLine(output, "f |= value & (Flag.X3 | Flag.X5);");
    addLine(output, "f |= diff & Flag.S;");
    // overflow_sub_table[lookup >> 4] |\
    // ( value & ( FLAG_3 | FLAG_5 ) ) |\
    // ( cptemp & FLAG_S );\
    addLine(output, "z80.regs.af = word(z80.regs.a, f);")
    // TODO finish.
}

function handleEx(output: string[], op1: string, op2: string): void {
    if (op2 === "af'") {
        op2 = "afPrime";
    }

    addLine(output, "const rightValue = z80.regs." + op2 + ";");
    if (op1 === "(sp)") {
        addLine(output, "const leftValueL = z80.readByte(z80.regs.sp);");
        addLine(output, "const leftValueH = z80.readByte(inc16(z80.regs.sp));");
        addLine(output, "z80.incTStateCount(1);");
        addLine(output, "z80.writeByte(inc16(z80.regs.sp), hi(rightValue));");
        addLine(output, "z80.writeByte(z80.regs.sp, lo(rightValue));");
        addLine(output, "z80.incTStateCount(2);");
        addLine(output, "z80.regs.memptr = word(leftValueH, leftValueL);");
        addLine(output, "z80.regs." + op2 + " = word(leftValueH, leftValueL);");
    } else {
        addLine(output, "z80.regs." + op2 + " = z80.regs." + op1 + ";");
        addLine(output, "z80.regs." + op1 + " = rightValue;");
    }
}

function handleJpCall(output: string[], opcode: string, cond: string | undefined, dest: string): void {
    if (dest === "nnnn") {
        addLine(output, "z80.regs.memptr = z80.readByte(z80.regs.pc);");
        addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
        addLine(output, "z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);");
        addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
    }
    addCondIf(output, cond);
    if (opcode === "call") {
        addLine(output, "z80.pushWord(z80.regs.pc);");
    }
    if (dest === "nnnn") {
        addLine(output, "z80.regs.pc = z80.regs.memptr;");
    } else if (isWordReg(dest)) {
        addLine(output, "z80.regs.pc = z80.regs." + dest + ";");
    } else {
        throw new Error("Unknown " + opcode + " dest: " + dest);
    }
    addCondEndIf(output, cond);
}

function handleLd(output: string[], dest: string, src: string): void {
    if (dest.includes("dd")) {
        // Must fetch this first, before possible "nn" in src.
        addLine(output, "const dd = z80.readByte(z80.regs.pc);");
        addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
    }
    addLine(output, "let value: number;");
    if (determineDataWidth(dest, src) == DataWidth.BYTE) {
        if (src.startsWith("(") && src.endsWith(")")) {
            const addr = src.substr(1, src.length - 2);
            if (isWordReg(addr)) {
                addLine(output, "z80.regs.memptr = inc16(z80.regs." + addr + ");");
                addLine(output, "value = z80.readByte(z80.regs." + addr + ");");
            } else if (addr === "nnnn") {
                addLine(output, "value = z80.readByte(z80.regs.pc);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "value = word(z80.readByte(z80.regs.pc), value);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "value = z80.readByte(value);");
                addLine(output, "z80.regs.memptr = inc16(value);");
            } else if (addr.endsWith("+dd")) {
                const reg = addr.substr(0, addr.length - 3);
                addLine(output, "value = z80.readByte(z80.regs.pc);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "z80.regs.memptr = (z80.regs." + reg + " + signedByte(value)) & 0xFFFF;");
                addLine(output, "value = z80.readByte(z80.regs.memptr);");
            } else {
                throw new Error("Unknown src address type: " + addr);
            }
        } else {
            if (src === "nn") {
                addLine(output, "value = z80.readByte(z80.regs.pc);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
            } else {
                addLine(output, "value = z80.regs." + src + ";");
            }
        }
        if (dest.startsWith("(") && dest.endsWith(")")) {
            const addr = dest.substr(1, dest.length - 2);
            if (isWordReg(addr)) {
                addLine(output, "z80.regs.memptr = word(z80.regs.a, inc16(z80.regs." + addr + "));");
                addLine(output, "z80.writeByte(z80.regs." + addr + ", value);");
            } else if (addr === "nnnn") {
                addLine(output, "value = z80.readByte(z80.regs.pc);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "value = word(z80.readByte(z80.regs.pc), value);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "z80.regs.memptr = word(z80.regs.a, inc16(value));");
                addLine(output, "z80.writeByte(value, z80.regs.a);");
            } else if (addr.endsWith("+dd")) {
                const reg = addr.substr(0, addr.length - 3);
                // Value of "dd" is already in "dd" variable.
                addLine(output, "z80.regs.memptr = (z80.regs." + reg + " + signedByte(dd)) & 0xFFFF;");
                addLine(output, "z80.writeByte(z80.regs.memptr, value);")
            } else {
                throw new Error("Unknown dest address type: " + addr);
            }
        } else {
            addLine(output, "z80.regs." + dest + " = value;");
        }
    } else {
        // DataWidth.WORD.
        if (src.startsWith("(") && src.endsWith(")")) {
            const addr = src.substr(1, src.length - 2);
            if (addr === "nnnn") {
                addLine(output, "value = z80.readByte(z80.regs.pc);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "value = word(z80.readByte(z80.regs.pc), value);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "value = z80.readByte(value);");
                addLine(output, "z80.regs.memptr = inc16(value);");
            } else {
                throw new Error("Unknown src address type: " + addr);
            }
        } else {
            if (src === "nnnn") {
                addLine(output, "value = z80.readByte(z80.regs.pc);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "value = word(z80.readByte(z80.regs.pc), value);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
            } else if (isWordReg(src)) {
                addLine(output, "value = z80.regs." + src + ";");
            } else {
                throw new Error("Unknown src type: " + src);
            }
        }
        if (dest.startsWith("(") && dest.endsWith(")")) {
            const addr = dest.substr(1, dest.length - 2);
            if (addr === "nnnn") {
                addLine(output, "let addr = z80.readByte(z80.regs.pc);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "addr = word(z80.readByte(z80.regs.pc), addr);");
                addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
                addLine(output, "z80.regs.memptr = word(z80.regs.a, inc16(value));");
                addLine(output, "z80.writeByte(addr, lo(value));");
                addLine(output, "z80.regs.memptr = addr;");
                addLine(output, "z80.writeByte(inc16(addr), hi(value));");
            } else {
                throw new Error("Unknown dest address type: " + addr);
            }
        } else {
            if (isWordReg(dest)) {
                addLine(output, "z80.regs." + dest + " = value;");
            } else {
                throw new Error("Unknown dest type: " + dest);
            }
        }
    }
}

function handleLogic(output: string[], opcode: string, operand: string): void {
    addLine(output, "let value: number;");
    if (operand === "nn") {
        addLine(output, "value = z80.readByte(z80.regs.pc);");
        addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
    } else if (operand === "(hl)") {
        addLine(output, "value = z80.readByte(z80.regs.hl);");
    } else if (operand === "(ix+dd)" || operand === "(iy+dd)") {
        const reg = operand.substr(1, 2);
        addLine(output, "value = z80.readByte(z80.regs.pc);");
        addLine(output, "z80.incTStateCount(5);");
        addLine(output, "z80.regs.pc = inc16(z80.regs.pc);");
        addLine(output, "z80.regs.memptr = (z80.regs." + reg + " + signedByte(value)) & 0xFFFF;");
        addLine(output, "value = z80.readByte(z80.regs.memptr);");
    } else if (isByteReg(operand)) {
        addLine(output, "value = z80.regs." + operand + ";");
    } else {
        throw new Error("Unknown " + opcode + " operand " + operand);
    }
    const operator = opcode === "and" ? "&" : opcode === "or" ? "|" : "^";
    addLine(output, "z80.regs.a " + operator + "= value;");
    addLine(output, "z80.regs.f = z80.sz53pTable[z80.regs.a];");
    if (opcode === "and") {
        addLine(output, "z80.regs.f |= Flag.H;");
    }
}

function handleOutiOutd(output: string[], decrement: boolean, repeat: boolean): void {
    addLine(output, "z80.incTStateCount(1);");
    addLine(output, "const value = z80.readByte(z80.regs.hl);");
    addLine(output, "z80.regs.b = dec8(z80.regs.b);");
    addLine(output, "z80.regs.memptr = " + (decrement ? "dec" : "inc") + "16(z80.regs.bc);");
    addLine(output, "z80.writePort(z80.regs.bc, value);");
    addLine(output, "z80.regs.hl = " + (decrement ? "dec" : "inc") + "16(z80.regs.hl);");
    addLine(output, "const other = add8(value, z80.regs.l);");
    addLine(output, "z80.regs.f = (value & 0x80 ? Flag.N : 0 ) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];");
    if (repeat) {
        addLine(output, "if (z80.regs.b > 0) {");
        enter();
        addLine(output, "z80.incTStateCount(5);");
        addLine(output, "z80.regs.pc = add16(z80.regs.pc, -2);");
        exit();
        addLine(output, "}");
    }
}

function handleIniInd(output: string[], decrement: boolean, repeat: boolean): void {
    addLine(output, "z80.incTStateCount(1);");
    addLine(output, "const value = z80.readPort(z80.regs.bc);");
    addLine(output, "z80.writeByte(z80.regs.hl, value);");
    addLine(output, "z80.regs.memptr = " + (decrement ? "dec" : "inc") + "16(z80.regs.bc);");
    addLine(output, "z80.regs.b = dec8(z80.regs.b);");
    addLine(output, "const other = " + (decrement ? "dec" : "inc") + "8(add8(value, z80.regs.c));");
    addLine(output, "z80.regs.f = (value & 0x80 ? Flag.N : 0 ) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];");
    if (repeat) {
        addLine(output, "if (z80.regs.b > 0) {");
        enter();
        addLine(output, "z80.incTStateCount(5);");
        addLine(output, "z80.regs.pc = add16(z80.regs.pc, -2);");
        exit();
        addLine(output, "}");
    }
    addLine(output, "z80.regs.hl = " + (decrement ? "dec" : "inc") + "16(z80.regs.hl);");
}

function handleCpiCpd(output: string[], decrement: boolean, repeat: boolean): void {
    addLine(output, "const value = z80.readByte(z80.regs.hl);");
    addLine(output, "let diff = (z80.regs.a - value) & 0xFF;");
    addLine(output, "const lookup = ((z80.regs.a & 0x08) >> 3) | ((value & 0x08) >> 2) | ((diff & 0x08) >> 1);");
    addLine(output, "z80.incTStateCount(5);");
    addLine(output, "z80.regs.bc = dec16(z80.regs.bc);");
    addLine(output, "z80.regs.f = (z80.regs.f & Flag.C) | (z80.regs.bc !== 0 ? Flag.V : 0) | Flag.N | halfCarrySubTable[lookup] | (diff !== 0 ? 0 : Flag.Z) | (diff & Flag.S);");
    addLine(output, "if ((z80.regs.f & Flag.H) !== 0) diff = dec8(diff);");
    addLine(output, "z80.regs.f |= (diff & Flag.X3) | (((diff & 0x02) !== 0) ? Flag.X5 : 0);");
    if (repeat) {
        addLine(output, "if ((z80.regs.f & (Flag.V | Flag.Z)) === Flag.V) {");
        enter();
        addLine(output, "z80.incTStateCount(5);");
        addLine(output, "z80.regs.pc = add16(z80.regs.pc, -2);");
        addLine(output, "z80.regs.memptr = add16(z80.regs.pc, 1);");
        exit();
        addLine(output, "} else {");
        enter();
        addLine(output, "z80.regs.memptr = " + (decrement ? "dec" : "inc") + "16(z80.regs.memptr);");
        exit();
        addLine(output, "}");
    } else {
        addLine(output, "z80.regs.memptr = " + (decrement ? "dec" : "inc") + "16(z80.regs.memptr);");
    }
    addLine(output, "z80.regs.hl = " + (decrement ? "dec" : "inc") + "16(z80.regs.hl);");
}

function handleLdiLdd(output: string[], decrement: boolean, repeat: boolean): void {
    addLine(output, "let value = z80.readByte(z80.regs.hl);");
    addLine(output, "z80.writeByte(z80.regs.de, value);");
    addLine(output, "z80.incTStateCount(2);");
    addLine(output, "z80.regs.bc = dec16(z80.regs.bc);");
    addLine(output, "value = add16(value, z80.regs.a);");
    addLine(output, "z80.regs.f = (z80.regs.f & (Flag.C | Flag.Z | Flag.S)) | (z80.regs.bc !== 0 ? Flag.V : 0) | (value & Flag.X3) | ((value & 0x02) !== 0 ? Flag.X5 : 0)");
    if (repeat) {
        addLine(output, "if (z80.regs.bc !== 0) {");
        enter();
        addLine(output, "z80.incTStateCount(5);");
        addLine(output, "z80.regs.pc = add16(z80.regs.pc, -2);");
        addLine(output, "z80.regs.memptr = add16(z80.regs.pc, 1);");
        exit();
        addLine(output, "}");
    }
    addLine(output, "z80.regs.hl = " + (decrement ? "dec" : "inc") + "16(z80.regs.hl);");
    addLine(output, "z80.regs.de = " + (decrement ? "dec" : "inc") + "16(z80.regs.de);");
}

function handlePop(output: string[], reg: string): void {
    addLine(output, "z80.regs." + reg + " = z80.popWord();");
}

function handlePush(output: string[], reg: string): void {
    addLine(output, "z80.pushWord(z80.regs." + reg + ");");
}

function handleRet(output: string[], cond: string | undefined): void {
    addLine(output, "z80.incTStateCount(1);");
    addCondIf(output, cond);
    addLine(output, "z80.regs.pc = z80.popWord();");
    addLine(output, "z80.regs.memptr = z80.regs.pc;");
    addCondEndIf(output, cond);
}

function handleRst(output: string[], rst: number): void {
    addLine(output, "z80.incTStateCount(1);");
    addLine(output, "z80.pushWord(z80.regs.pc);");
    addLine(output, "z80.regs.pc = 0x" + toHex(rst, 4)+ ";");
    addLine(output, "z80.regs.memptr = z80.regs.pc;");
}

function generateDispatch(pathname: string): string {
    const output: string[] = [];
    enter();
    enter();
    addLine(output, "");
    addLine(output, "// The content of this switch is auto-generated by GenerateOpcodes.ts.");
    addLine(output, "");

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

        addLine(output, "case 0x" + toHex(number, 2) + ": { // " + ((opcode || "") + " " + (params || "")).trim());
        enter();

        if (extra !== undefined) {
            addLine(output, "// We don't yet implement undocumented opcodes");
        } else if (opcode === undefined) {
            addLine(output, "// Undefined opcode.");
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
                    addLine(output, "z80.regs.iff1 = 0;");
                    addLine(output, "z80.regs.iff2 = 0;");
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
                    addLine(output, "z80.regs.iff1 = 1;");
                    addLine(output, "z80.regs.iff2 = 1;");
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

                case "or":
                case "and":
                case "xor": {
                    if (params === undefined) {
                        throw new Error(opcode + " requires params: " + line);
                    }
                    let operand: string;
                    const parts = params.split(",");
                    if (parts.length === 2) {
                        if (parts[0] === "a") {
                            operand = parts[1];
                        } else {
                            throw new Error("First operand of " + opcode + " must be A");
                        }
                    } else if (parts.length === 1) {
                        operand = parts[0];
                    } else {
                        throw new Error("LD requires two params: " + line);
                    }
                    handleLogic(output, opcode, operand);
                    break;
                }

                case "outi":
                case "outd":
                case "otir":
                case "otdr": {
                    handleOutiOutd(output, opcode === "otdr" || opcode === "outd", opcode.endsWith("r"));
                    break;
                }

                case "ini":
                case "ind":
                case "inir":
                case "indr": {
                    handleIniInd(output, opcode.startsWith("ind"), opcode.endsWith("r"));
                    break;
                }

                case "cpi":
                case "cpd":
                case "cpir":
                case "cpdr": {
                    handleCpiCpd(output, opcode.startsWith("cpd"), opcode.endsWith("r"));
                    break;
                }

                case "ldi":
                case "ldd":
                case "ldir":
                case "lddr": {
                    handleLdiLdd(output, opcode.startsWith("ldd"), opcode.endsWith("r"));
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

                case "ret": {
                    handleRet(output, params);
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
                    addLine(output, "decode" + params.toUpperCase() + "(z80);");
                    break;

                default:
                    console.log("Unhandled opcode: " + line);
                    break;
            }
        }

        addLine(output, "break;");
        exit();
        addLine(output, "}");
        addLine(output, "");
    });

    exit();
    exit();
    if (indent !== "") {
        throw new Error("Unbalanced enter/exit");
    }

    return output.join("\n");
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
    const prefixes = ["base", "cb", "dd", "ddcb", "ed", "fd", "fdcb"];
    const dispatchMap = new Map<string, string>();

    for (const prefix of prefixes) {
        const dataPathname = path.join(opcodesDir, "opcodes_" + prefix + ".dat");
        const dispatch = generateDispatch(dataPathname);
        dispatchMap.set(prefix, dispatch);
    }

    generateSource(dispatchMap);
}

generateOpcodes();
