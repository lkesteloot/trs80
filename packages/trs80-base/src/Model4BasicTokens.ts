// The keyword tokens of Model 4 BASIC (the BASIC/CMD of TRSDOS 6 and LS-DOS 6). See BASIC_FORMATS.md
// for where the table came from and how the tokens are laid out in a program.

/**
 * A keyword of Model 4 BASIC and the code that BASIC gives it.
 */
export interface Model4BasicKeyword {
    /** The keyword as it's typed, in upper case: "PRINT", "CHR$", "<". */
    name: string;

    /**
     * The code in BASIC's keyword table. A code of 0x80 or more is the byte in the program. A smaller code
     * is a function, which a program stores as two bytes: 0xFF, then the code plus 0x80.
     */
    code: number;
}

/**
 * The byte that starts a function token in a program.
 */
export const MODEL_4_BASIC_FUNCTION_PREFIX = 0xFF;

/**
 * The first code that's a plain token (one byte in the program). Lower codes are functions.
 */
export const MODEL_4_BASIC_FIRST_PLAIN_CODE = 0x80;

/**
 * The token that stands for a single quote after a colon and REM (":REM'" is how a program stores
 * an apostrophe comment).
 */
export const MODEL_4_BASIC_REMQUOT = 0xDC;

/**
 * The Model 4 BASIC keywords, in the order of BASIC's own table, which is the order that its tokenizer
 * tries them: grouped by first letter, and within a letter with longer keywords ahead of the shorter
 * ones they start with (DEFSTR before DEF, INPUT before INP). The punctuation operators are at the end.
 * Where two spellings share a code (GOTO and "GO TO"), the first is the one a listing shows.
 */
export const MODEL_4_BASIC_KEYWORDS: readonly Model4BasicKeyword[] = [
    { name: "AUTO", code: 0xab },
    { name: "AND", code: 0xf8 },
    { name: "ABS", code: 0x06 },
    { name: "ATN", code: 0x0e },
    { name: "ASC", code: 0x15 },
    { name: "CLOSE", code: 0xc3 },
    { name: "CONT", code: 0x99 },
    { name: "CLEAR", code: 0x92 },
    { name: "CINT", code: 0x1c },
    { name: "CSNG", code: 0x1d },
    { name: "CDBL", code: 0x1e },
    { name: "CVI", code: 0x2a },
    { name: "CVS", code: 0x2b },
    { name: "CVD", code: 0x2c },
    { name: "COS", code: 0x0c },
    { name: "CHR$", code: 0x16 },
    { name: "CALL", code: 0xb6 },
    { name: "COMMON", code: 0xb8 },
    { name: "CHAIN", code: 0xb9 },
    { name: "CLS", code: 0x9f },
    { name: "DELETE", code: 0xaa },
    { name: "DATA", code: 0x84 },
    { name: "DIM", code: 0x86 },
    { name: "DEFSTR", code: 0xad },
    { name: "DEFINT", code: 0xae },
    { name: "DEFSNG", code: 0xaf },
    { name: "DEFDBL", code: 0xb0 },
    { name: "DEF", code: 0x97 },
    { name: "DATE$", code: 0xde },
    { name: "ELSE", code: 0xa2 },
    { name: "END", code: 0x81 },
    { name: "ERASE", code: 0xa6 },
    { name: "EDIT", code: 0xa7 },
    { name: "ERRS$", code: 0xdf },
    { name: "ERROR", code: 0xa8 },
    { name: "ERL", code: 0xd7 },
    { name: "ERR", code: 0xd8 },
    { name: "EXP", code: 0x0b },
    { name: "EOF", code: 0x2d },
    { name: "EQV", code: 0xfb },
    { name: "FOR", code: 0x82 },
    { name: "FIELD", code: 0xc0 },
    { name: "FN", code: 0xd4 },
    { name: "FRE", code: 0x0f },
    { name: "FIX", code: 0x1f },
    { name: "GOTO", code: 0x89 },
    { name: "GO TO", code: 0x89 },
    { name: "GOSUB", code: 0x8d },
    { name: "GET", code: 0xc1 },
    { name: "HEX$", code: 0x1a },
    { name: "INPUT", code: 0x85 },
    { name: "IF", code: 0x8b },
    { name: "INSTR", code: 0xdb },
    { name: "INT", code: 0x05 },
    { name: "INP", code: 0x10 },
    { name: "IMP", code: 0xfc },
    { name: "INKEY$", code: 0xe0 },
    { name: "KILL", code: 0xc8 },
    { name: "LPRINT", code: 0x9d },
    { name: "LLIST", code: 0x9e },
    { name: "LPOS", code: 0x1b },
    { name: "LET", code: 0x88 },
    { name: "LINE", code: 0xb1 },
    { name: "LOAD", code: 0xc4 },
    { name: "LSET", code: 0xc9 },
    { name: "LIST", code: 0x93 },
    { name: "LOG", code: 0x0a },
    { name: "LOC", code: 0x2e },
    { name: "LEN", code: 0x12 },
    { name: "LEFT$", code: 0x01 },
    { name: "LOF", code: 0x2f },
    { name: "MERGE", code: 0xc5 },
    { name: "MOD", code: 0xfd },
    { name: "MKI$", code: 0x30 },
    { name: "MKS$", code: 0x31 },
    { name: "MKD$", code: 0x32 },
    { name: "MID$", code: 0x03 },
    { name: "MEM", code: 0xe1 },
    { name: "NEXT", code: 0x83 },
    { name: "NAME", code: 0xc7 },
    { name: "NEW", code: 0x94 },
    { name: "NOT", code: 0xd6 },
    { name: "OPEN", code: 0xbf },
    { name: "OUT", code: 0x9c },
    { name: "ON", code: 0x95 },
    { name: "OR", code: 0xf9 },
    { name: "OCT$", code: 0x19 },
    { name: "OPTION", code: 0xba },
    { name: "PRINT", code: 0x91 },
    { name: "PUT", code: 0xc2 },
    { name: "POKE", code: 0x98 },
    { name: "POS", code: 0x11 },
    { name: "PEEK", code: 0x17 },
    { name: "RETURN", code: 0x8e },
    { name: "READ", code: 0x87 },
    { name: "RUN", code: 0x8a },
    { name: "RESTORE", code: 0x8c },
    { name: "REM", code: 0x8f },
    { name: "RESUME", code: 0xa9 },
    { name: "RSET", code: 0xca },
    { name: "RIGHT$", code: 0x02 },
    { name: "RND", code: 0x08 },
    { name: "RENUM", code: 0xac },
    { name: "RANDOM", code: 0xbb },
    { name: "ROW", code: 0x33 },
    { name: "STOP", code: 0x90 },
    { name: "SWAP", code: 0xa5 },
    { name: "SAVE", code: 0xcb },
    { name: "SPC(", code: 0xd5 },
    { name: "STEP", code: 0xd2 },
    { name: "SGN", code: 0x04 },
    { name: "SQR", code: 0x07 },
    { name: "SIN", code: 0x09 },
    { name: "STR$", code: 0x13 },
    { name: "STRING$", code: 0xd9 },
    { name: "SPACE$", code: 0x18 },
    { name: "SYSTEM", code: 0xbd },
    { name: "SOUND", code: 0xcd },
    { name: "THEN", code: 0xd0 },
    { name: "TRON", code: 0xa3 },
    { name: "TROFF", code: 0xa4 },
    { name: "TAB(", code: 0xd1 },
    { name: "TO", code: 0xcf },
    { name: "TIME$", code: 0xe2 },
    { name: "TAN", code: 0x0d },
    { name: "USING", code: 0xda },
    { name: "USR", code: 0xd3 },
    { name: "VAL", code: 0x14 },
    { name: "VARPTR", code: 0xdd },
    { name: "WIDTH", code: 0xa1 },
    { name: "WAIT", code: 0x96 },
    { name: "WHILE", code: 0xb4 },
    { name: "WEND", code: 0xb5 },
    { name: "WRITE", code: 0xb7 },
    { name: "XOR", code: 0xfa },
    // The operators. BASIC's table has no names for them, but its tokenizer maps these characters.
    { name: "+", code: 0xf3 },
    { name: "-", code: 0xf4 },
    { name: "*", code: 0xf5 },
    { name: "/", code: 0xf6 },
    { name: "^", code: 0xf7 },
    { name: "\\", code: 0xfe },
    { name: ">", code: 0xf0 },
    { name: "=", code: 0xf1 },
    { name: "<", code: 0xf2 },
];
