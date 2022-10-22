
import { StreamParser } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const MNEMONICS = /^(exx?|(ld|cp)([di]r?)?|[lp]ea|pop|push|ad[cd]|cpl|daa|dec|inc|neg|sbc|sub|and|bit|[cs]cf|x?or|res|set|r[lr]c?a?|r[lr]d|s[lr]a|srl|djnz|nop|[de]i|halt|im|in([di]mr?|ir?|irx|2r?)|ot(dmr?|[id]rx|imr?)|out(0?|[di]r?|[di]2r?)|tst(io)?|slp)(\.([sl]?i)?[sl])?\b/i;
const JUMPS = /^(((call|j[pr]|rst|ret[in]?)(\.([sl]?i)?[sl])?)|(rs|st)mix)\b/i;
const REGISTERS = /^(af?|bc?|c|de?|e|hl?|l|i[xy]?|r|sp)\b/i;
const FLAGS = /^(n?[zc]|p[oe]?|m)\b/i;
const NUMBERS = /^(\$[\da-f]+|%[01]+|0x[\da-f]+|0b[01]+|\d[\da-f]*h|[01]+b|\d+)\b/i;
const COMMENT = /^;.*/;
const STRING = /^"[^"]*"|'[^']*'/;
const IDENTIFIER = /^\.?\w+/;

export const INDENTATION_SIZE = 8;

interface Z80State {
    // Nothing.
}

/**
 * Simple streaming parser for Z80 assembly language.
 */
export const z80StreamParser: StreamParser<Z80State> = {
    startState: function() {
        return {
            // Nothing.
        };
    },
    token: function(stream): keyof typeof tags | null {
        if (stream.eatSpace()) {
            // Eat any space.
            return null;
        }

        if (stream.match(COMMENT)) {
            return "lineComment";
        }

        if (stream.match(NUMBERS)) {
            return "integer";
        }

        if (stream.match(STRING)) {
            return "string";
        }

        if (stream.match(REGISTERS)) {
            return "operator";
        }

        if (stream.match(FLAGS)) {
            return "operator";
        }

        if (stream.match(MNEMONICS) || stream.match(JUMPS)) {
            return "keyword";
        }

        if (stream.match(IDENTIFIER)) {
            return "variableName";
        }

        // Punctuation.
        stream.next();
        return "punctuation";
    },
    indent: function() {
        return INDENTATION_SIZE;
    },
    languageData: {
        commentTokens: {
            line: ";",
        },
    },
};
