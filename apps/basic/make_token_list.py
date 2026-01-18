
# Generates the assembly language for the token list in the Basic compiler.

TOKENS = [
    "END", "FOR", "RESET", "SET", "CLS", "CMD", "RANDOM", "NEXT",
    "DATA", "INPUT", "DIM", "READ", "LET", "GOTO", "RUN", "IF",
    "RESTORE", "GOSUB", "RETURN", "REM", "STOP", "ELSE", "TRON", "TROFF",
    "DEFSTR", "DEFINT", "DEFSNG", "DEFDBL", "LINE", "EDIT", "ERROR", "RESUME",
    "OUT", "ON", "OPEN", "FIELD", "GET", "PUT", "CLOSE", "LOAD",
    "MERGE", "NAME", "KILL", "LSET", "RSET", "SAVE", "SYSTEM", "LPRINT",
    "DEF", "POKE", "PRINT", "CONT", "LIST", "LLIST", "DELETE", "AUTO",
    "CLEAR", "CLOAD", "CSAVE", "NEW", "TAB(", "TO", "FN", "USING",
    "VARPTR", "USR", "ERL", "ERR", "STRING$", "INSTR", "POINT", "TIME$",
    "MEM", "INKEY$", "THEN", "NOT", "STEP", "+", "-", "*",
    "/", "[", "AND", "OR", ">", "=", "<", "SGN",
    "INT", "ABS", "FRE", "INP", "POS", "SQR", "RND", "LOG",
    "EXP", "COS", "SIN", "TAN", "ATN", "PEEK", "CVI", "CVS",
    "CVD", "EOF", "LOC", "LOF", "MKI$", "MKS$", "MKD$", "CINT",
    "CSNG", "CDBL", "FIX", "LEN", "STR$", "VAL", "ASC", "CHR$",
    "LEFT$", "RIGHT$", "MID$",
]

SYMBOL_TO_NAME = {
        "+": "OP_ADD",
        "-": "OP_SUB",
        "*": "OP_MUL",
        "/": "OP_DIV",
        "[": "OP_BRACKET",
        ">": "OP_GT",
        "=": "OP_EQU",
        "<": "OP_LT",
}

# Make token identifier-safe.
def clean(token):
    token = token.replace("$", "_STR")
    token = token.replace("(", "_PAREN")

    name = SYMBOL_TO_NAME.get(token)
    if name is not None:
        token = name

    return token

for i, token in enumerate(TOKENS):
    # First character has the high bit set.
    print("\tdb '%s'|0x80,\"%s\" ; %s (0x%02X)" % (token[0], token[1:], token, i | 0x80))

for i, token in enumerate(TOKENS):
    # First character has the high bit set.
    print("T_%s equ 0x%02X" % (clean(token), i | 0x80))

