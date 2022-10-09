
import { StreamParser } from "@codemirror/language";

enum ParseState {
    START,
    PARSED_MNEMONIC,
    PARSED_JUMP,
    X3,
    EXPECT_PARAM,
    PSEUDO_MNEMONIC,
}

interface Z80State {
    context: ParseState;
}

function mkZ80(): StreamParser<Z80State> {
    const mnemonics = /^(exx?|(ld|cp)([di]r?)?|[lp]ea|pop|push|ad[cd]|cpl|daa|dec|inc|neg|sbc|sub|and|bit|[cs]cf|x?or|res|set|r[lr]c?a?|r[lr]d|s[lr]a|srl|djnz|nop|[de]i|halt|im|in([di]mr?|ir?|irx|2r?)|ot(dmr?|[id]rx|imr?)|out(0?|[di]r?|[di]2r?)|tst(io)?|slp)(\.([sl]?i)?[sl])?\b/i;
    const jumps = /^(((call|j[pr]|rst|ret[in]?)(\.([sl]?i)?[sl])?)|(rs|st)mix)\b/i;
    const registers = /^(af?|bc?|c|de?|e|hl?|l|i[xy]?|r|sp)\b/i;
    const flags = /^(n?[zc]|p[oe]?|m)\b/i;
    const errors = /^([hl][xy]|i[xy][hl]|slia|sll)\b/i;
    const numbers = /^([\da-f]+h|[0-7]+o|[01]+b|\d+d?)\b/i;
    const hexLiteral = /^0x[0-9a-f]+/i;

    return {
        startState: function() {
            return {
                context: ParseState.START,
            };
        },
        token: function(stream, state) {
            if (stream.column() === 0) {
                // Reset at start of line.
                state.context = ParseState.START;
            }

            if (stream.eatSpace()) {
                // Eat initial space.
                return null;
            }

            if (stream.eatWhile(/\w/)) {
                // Each a bunch of alphanumeric characters or underscore.
                const token = stream.current();

                if (stream.indentation() > 0) {
                    // We're indented, this is a mnemonic.
                    if ((state.context == ParseState.PARSED_MNEMONIC || state.context == ParseState.EXPECT_PARAM) &&
                        registers.test(token)) {

                        // Register.
                        state.context = ParseState.EXPECT_PARAM;
                        return "variable";
                    }

                    if (state.context == ParseState.PARSED_JUMP && flags.test(token)) {
                        // Jump flag.
                        state.context = ParseState.EXPECT_PARAM;
                        return "variableName.special";
                    }

                    if (mnemonics.test(token)) {
                        // Mnemonic (non-jump).
                        state.context = ParseState.PARSED_MNEMONIC;
                        return "keyword";
                    } else if (jumps.test(token)) {
                        // Jump.
                        state.context = ParseState.PARSED_JUMP;
                        return "keyword";
                    } else if (state.context == ParseState.EXPECT_PARAM && numbers.test(token)) {
                        // Numeric literal.
                        return "number";
                    }

                    if (errors.test(token)) {
                        return "error";
                    }
                } else if (stream.match(numbers)) {
                    return "number";
                } else {
                    return null;
                }
            } else if (stream.eat(';')) {
                stream.skipToEnd();
                return "comment";
            } else if (stream.eat('"')) {
                // String.
                let ch;

                while (ch = stream.next()) {
                    if (ch == '"') {
                        break;
                    }

                    if (ch == '\\') {
                        // TODO not in our assembler.
                        stream.next();
                    }
                }

                return 'string';
            } else if (stream.eat("'")) {
                // Character.
                if (stream.match(/\\?.'/)) {
                    return 'number';
                }
            } else if (stream.eat(".") || (stream.sol() && stream.eat("#"))) {
                // Pseudo-mnemonic.
                state.context = ParseState.PSEUDO_MNEMONIC;

                if (stream.eatWhile(/\w/)) {
                    return "def";
                }
            } else if (stream.eat('$')) {
                // Hex number $...
                if (stream.eatWhile(/[\da-f]/i)) {
                    return "number";
                }
            } else if (stream.match(hexLiteral)) {
                // Hex number 0x...
                return "number";
            } else if (stream.eat('%')) {
                // Binary number.
                if (stream.eatWhile(/[01]/)) {
                    return "number";
                }
            } else {
                // Unknown, maybe punctuation.
                stream.next();
            }
            return null;
        }
    };
}

export const z80 = mkZ80();
