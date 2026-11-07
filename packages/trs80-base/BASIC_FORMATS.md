# Tokenized BASIC programs

How `Basic.ts` reads and writes tokenized programs, for the two BASICs it knows (`BasicDialect`). Model 4
facts were measured, not guessed: the keyword table comes from the BASIC itself, and the rest was checked
against what real Model 4 BASIC (BASIC 01.01.02, from LS-DOS 6.3.1) does, run in trs80gp 2.5.8, and against
tokenized programs saved by TRSDOS 6.x and LS-DOS 6.x.

## What's shared

A file starts with 0xFF (cassette: 0xD3 0xD3 0xD3 and a name byte). Then each line is a 2-byte next-line
pointer, a 2-byte line number, the tokens, and a 0. A pointer of 0 ends the program. Pointers are real
addresses but BASIC relinks them on load, so we write 0xFFFF and the program loads and runs. (A saved
program's first pointer differs from disk to disk, because it depends on where BASIC put the program.)
REM and DATA text, and strings, are stored as typed. The header doesn't say which BASIC wrote the file.

## Model I and III BASIC

The keyword table in `TOKENS` (0x80 up). Numbers are stored as typed (ASCII), and `'` is `:REM` and 0xFB.
`BasicTokens.ts` has the ROM addresses.

## Model 4 BASIC (BASIC/CMD of TRSDOS 6 and LS-DOS 6)

**Keyword table.** BASIC.CMD (TRSDOS 6.2.1 and LS-DOS 6.3.1 have identical ones; the CMD loads at 0x3000)
holds a table at 0x68F7: 26 word pointers (A to Z) to lists, one per first letter. A list is keywords with the
first letter dropped, the last character having bit 7 set, then the token byte, ended by a 0. Within a letter
the order is the tokenizer's (DEFSTR before DEF). This is `Model4BasicTokens.ts`. The BASIC manuals in the
library (`LDOS & LS-DOS BASIC Reference Manual (1992)`) have no token list. Typing every keyword into real BASIC,
saving, and comparing bytes with our tokenizer matched on all of them.

**Tokens.** Codes of 0x80 and up are one byte. Smaller codes are functions, stored as 0xFF then the code plus
0x80 (LEN is 0xFF 0x92). The operators are 0xF0 `>`, F1 `=`, F2 `<`, F3 `+`, F4 `-`, F5 `*`, F6 `/`, F7 `^`,
F8 AND, F9 OR, FA XOR, FB EQV, FC IMP, FD MOD, FE `\`. `'` is `:REM` 0xDC (so `3A 8F DC`). `?` is PRINT. Unassigned
bytes in 0x9A, 0x9B, 0xA0, 0xB2, 0xB3, 0xBC, 0xBE, 0xC6, 0xCC, 0xCE and 0xE3 to 0xEF were never seen; the
High Resolution Driver disk's programs use some (0xE6, 0xE7) for its added keywords.

**Hidden tokens.** ELSE is always preceded by a colon token (`3A A2`), even if the text already has one
(`:ELSE` is `3A 3A A2`). WHILE is always followed by a `+` token (`B4 F3`), which LIST hides.

**Constants** (as GW-BASIC): 0x0B octal and 0x0C hex (2 bytes, little-endian; `&H` with no digits is 0),
0x0E line number (2 bytes), 0x0F a byte (10 to 255), 0x11 to 0x1A the digits 0 to 9, 0x1C a signed 2-byte
integer (256 to 32767), 0x1D single (4 bytes), 0x1F double (8 bytes). Floats are Microsoft binary: mantissa
low byte first, the top bit of the last mantissa byte is the sign, then the exponent (0x80 is 0.5 to 1;
0 is zero). Both are checked against what BASIC lists.
Which constant BASIC chooses: a whole number to 32767 with no exponent or type is an integer (`%` is dropped,
and dropped from other numbers too); E or `!` is single, D or `#` is double; otherwise single up to six
digits and double beyond. Digits in a variable name stay text.

**Line numbers must be constants.** The interpreter gives "Syntax error" for ASCII digits after GOTO and
the like, and for any number starting with a point. BASIC stores `0E nn nn` after GOTO, GOSUB, THEN, ELSE,
RESTORE, RESUME, RUN, LIST, LLIST, DELETE, EDIT, AUTO, RENUM, after each comma of an ON...GOTO/GOSUB list, and after
`ERL` and a comparison. (Line 0 is `0E 00 00`.) Numbers over 65529 stay text.

**Listing floats.** BASIC lists single constants with six digits and doubles with sixteen. A number is
fixed-point unless its whole part is as long as the digits or it would need more than 7 (single) or 16 (double)
decimal places, then it's `1E+10` (`1D+16`). A whole single has `!`, and every fixed double has `#`.

**Not verified or not done.** The `1TO5` case (no spaces after a number) isn't tokenized by BASIC but is by us.
BASIC converts a decimal to binary with small rounding differences in the lowest bit or two, so our float
constants can differ in those. The keywords of the High Resolution Driver and other add-ons are unknown, and
show as the raw byte.
