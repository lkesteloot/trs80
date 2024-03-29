// Automatically generated from process_tokens.py. Do not modify.

import { KnownLabel } from "z80-base";

export interface BasicToken {
    // Name or symbol of the Basic token.
    name: string;
    // Tokenized byte.
    token: number;
    // Address in ROM of routine to handle token, if any.
    address: number | undefined;
}

export const TRS80_MODEL_III_BASIC_TOKENS: BasicToken[] = [
    { name: "ABS", token: 0xd9, address: 0x0977 },
    { name: "AND", token: 0xd2, address: 0x25fd },
    { name: "ASC", token: 0xf6, address: 0x2a0f },
    { name: "ATN", token: 0xe4, address: 0x15bd },
    { name: "AUTO", token: 0xb7, address: 0x2008 },
    { name: "CDBL", token: 0xf1, address: 0x0adb },
    { name: "CHR$(", token: 0xf7, address: 0x2a1f },
    { name: "CINT", token: 0xef, address: 0x0a7f },
    { name: "CLEAR", token: 0xb8, address: 0x1e7a },
    { name: "CLOAD", token: 0xb9, address: 0x2c1f },
    { name: "CLS", token: 0x84, address: 0x01c9 },
    { name: "CONT", token: 0xb3, address: 0x1de4 },
    { name: "COS", token: 0xe1, address: 0x1541 },
    { name: "CSAVE", token: 0xba, address: 0x2bf5 },
    { name: "CSNG", token: 0xf0, address: 0x0ab1 },
    { name: "DATA", token: 0x88, address: 0x1f05 },
    { name: "DEFDBL", token: 0x9b, address: 0x1e09 },
    { name: "DEFINT", token: 0x99, address: 0x1e03 },
    { name: "DEFSNG", token: 0x9a, address: 0x1e06 },
    { name: "DEFSTR", token: 0x98, address: 0x1e00 },
    { name: "DELETE", token: 0xb6, address: 0x2bc6 },
    { name: "DIM", token: 0x8a, address: 0x2608 },
    { name: "EDIT", token: 0x9d, address: 0x2e60 },
    { name: "ELSE", token: 0x95, address: 0x1f07 },
    { name: "END", token: 0x80, address: 0x1dae },
    { name: "ERL", token: 0xc2, address: 0x24dd },
    { name: "ERR", token: 0xc3, address: 0x24cf },
    { name: "ERROR", token: 0x9e, address: 0x1ff4 },
    { name: "EXP", token: 0xe0, address: 0x1439 },
    { name: "FIX", token: 0xf2, address: 0x0b26 },
    { name: "FOR", token: 0x81, address: 0x1ca1 },
    { name: "FRE", token: 0xda, address: 0x27d4 },
    { name: "GOSUB", token: 0x91, address: 0x1eb1 },
    { name: "GOTO", token: 0x5d, address: 0x1ec2 },
    { name: "IF", token: 0x8f, address: 0x2039 },
    { name: "INKEY$", token: 0xc9, address: 0x019d },
    { name: "INP", token: 0xdb, address: 0x2aef },
    { name: "INPUT", token: 0x89, address: 0x219a },
    { name: "INT", token: 0xd8, address: 0x0b37 },
    { name: "LEFT$", token: 0xf8, address: 0x2a61 },
    { name: "LEN", token: 0xf3, address: 0x2a03 },
    { name: "LET", token: 0x8c, address: 0x1f21 },
    { name: "LIST", token: 0xb4, address: 0x2b2e },
    { name: "LLIST", token: 0xb5, address: 0x2b29 },
    { name: "LOG", token: 0xdf, address: 0x0809 },
    { name: "LPRINT", token: 0xaf, address: 0x2067 },
    { name: "MEM", token: 0xc8, address: 0x27c9 },
    { name: "MID$", token: 0xfa, address: 0x2a9a },
    { name: "NEW", token: 0xbb, address: 0x1849 },
    { name: "NEXT", token: 0x87, address: 0x22b6 },
    { name: "NOT", token: 0xcb, address: 0x25c4 },
    { name: "ON", token: 0xa1, address: 0x1fc6 },
    { name: "OR", token: 0xd3, address: 0x25f7 },
    { name: "OUT", token: 0xa0, address: 0x2afb },
    { name: "PEEK", token: 0xe5, address: 0x2caa },
    { name: "POINT", token: 0xc6, address: 0x0132 },
    { name: "POKE", token: 0xb1, address: 0x2cb1 },
    { name: "POS", token: 0xdc, address: 0x27f5 },
    { name: "PRINT", token: 0xb2, address: 0x206f },
    { name: "RANDOM", token: 0x86, address: 0x01d3 },
    { name: "READ", token: 0x8b, address: 0x21ef },
    { name: "REM", token: 0x93, address: 0x1f07 },
    { name: "RESET", token: 0x82, address: 0x0138 },
    { name: "RESTORE", token: 0x90, address: 0x1d91 },
    { name: "RESUME", token: 0x9f, address: 0x1faf },
    { name: "RETURN", token: 0x92, address: 0x1ede },
    { name: "RIGHT$", token: 0xf9, address: 0x2a91 },
    { name: "RND", token: 0xde, address: 0x14c9 },
    { name: "RUN", token: 0x8e, address: 0x1ea3 },
    { name: "SET", token: 0x83, address: 0x0135 },
    { name: "SGN", token: 0xd7, address: 0x098a },
    { name: "SIN", token: 0xe2, address: 0x1547 },
    { name: "SQR", token: 0xcd, address: 0x13e7 },
    { name: "STEP", token: 0xcc, address: 0x2b01 },
    { name: "STOP", token: 0x94, address: 0x1da9 },
    { name: "STR$", token: 0xf4, address: 0x2836 },
    { name: "STRING$", token: 0xc4, address: 0x2a2f },
    { name: "SYSTEM", token: 0xae, address: 0x02b2 },
    { name: "TAB(", token: 0xbc, address: 0x2137 },
    { name: "TAN", token: 0xe3, address: 0x15a8 },
    { name: "THEN", token: 0xca, address: undefined },
    { name: "TO", token: 0xbd, address: undefined },
    { name: "TROFF", token: 0x97, address: 0x1df8 },
    { name: "TRON", token: 0x96, address: 0x1df8 },
    { name: "USING", token: 0xbf, address: 0x2cbd },
    { name: "USR", token: 0xc1, address: 0x27fe },
    { name: "VAL", token: 0xff, address: 0x2ac5 },
    { name: "VARPTR", token: 0xc0, address: 0x24eb },
    { name: "+", token: 0xcd, address: 0x249f },
    { name: "-", token: 0xce, address: 0x2532 },
    { name: "*", token: 0xcf, address: undefined },
    { name: "/", token: 0xd0, address: undefined },
    { name: "?", token: 0xd1, address: undefined },
    { name: ">", token: 0xd4, address: undefined },
    { name: "=", token: 0xd5, address: undefined },
    { name: "<", token: 0xd6, address: undefined },
    { name: "&", token: 0x26, address: undefined },
];

// Non-alphanumeric keywords and their replacements.
const BASIC_KEYWORD_REPLACEMENT: { [keyword: string]: string } = {
    "+": "ADD",
    "-": "SUBTRACT",
    "*": "MULTIPLY",
    "/": "DIVIDE",
    "?": "PRINT",
    ">": "GREATER_THAN",
    "=": "EQUAL",
    "<": "LESS_THAN",
    "&": "AMPERSAND",
    "'": "COMMENT",
}

/**
 * Make an assembly language label for the given Basic keyword or symbol.
 */
function makeLabelForBasicKeyword(name: string): string {
    const replacement = BASIC_KEYWORD_REPLACEMENT[name];
    if (replacement !== undefined) {
        name = replacement;
    }

    // Strip out $ and (.
    name = name.replace(/[$(]/g, "");

    // Prefix with something that indicates where it came from.
    name = "basic_keyword_" + name;

    return name;
}

export const TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS: KnownLabel[] = [];
for (const basicToken of TRS80_MODEL_III_BASIC_TOKENS) {
    if (basicToken.address !== undefined) {
        TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS.push({
            name: makeLabelForBasicKeyword(basicToken.name),
            address: basicToken.address,
        });
    }
}
