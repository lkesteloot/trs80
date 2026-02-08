
# Takes an untokenized text Basic program and generates tokenized assembly code.

def parse_line(line):
    line = line.strip()
    i = line.index(" ")
    line_number = int(line[:i])
    line = line[i+1:]
    return line_number, line

lines = [parse_line(line) for line in open("NO_PARENS.BAS")]

for i in range(len(lines)):
    line_number, line = lines[i]
    next_line_number = lines[i + 1][0] if i < len(lines) - 1 else None
    this_label = "line%d" % line_number
    next_label = ("line%d" % next_line_number) if next_line_number is not None else "line_end"
    asm = "'" + line + "'"
    asm = asm.replace(":DEFINT A-Z", "")
    asm = asm.replace("CLS", "', T_CLS, '")
    asm = asm.replace("=", "', T_OP_EQU, '")
    asm = asm.replace("+", "', T_OP_ADD, '")
    asm = asm.replace("-", "', T_OP_SUB, '")
    asm = asm.replace("*", "', T_OP_MUL, '")
    asm = asm.replace("/", "', T_OP_DIV, '")
    asm = asm.replace("<", "', T_OP_LT, '")
    asm = asm.replace("AND", "', T_AND, '")
    asm = asm.replace("SET", "', T_SET, '")
    asm = asm.replace("THEN", "', T_THEN, '")
    asm = asm.replace("GOTO", "', T_GOTO, '")
    asm = asm.replace("IF", "', T_IF, '")
    asm = asm.replace("'', ", "")
    asm = asm.replace(", ''", "")

    print("%s: db lo(%s), hi(%s), lo(%d), hi(%d), 0, 0, %s, 0" %
          (this_label, next_label, next_label, line_number, line_number, asm))

