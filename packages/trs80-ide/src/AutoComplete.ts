import { Asm, AsmToken, AsmTokenizer, AsmTrieNode, getAsmDirectiveDocs, getAsmInstructionTrie } from 'z80-asm';
import { mnemonicMap, OpcodeVariant, opcodeVariantToString } from 'z80-inst';
import { Completion, CompletionContext, CompletionResult, snippetCompletion } from '@codemirror/autocomplete';
import { StateField } from '@codemirror/state';
import { AssemblyResults } from './AssemblyResults';

// Regular expression for entire-line label.
const LABEL_RE = /^[a-z_][a-z0-9_]*$/i;

const ASM_DIRECTIVE_DOCS = getAsmDirectiveDocs();

// Snippet templates to include in auto-complete list.
interface Snippet {
    // See https://codemirror.net/docs/ref/#autocomplete.snippet
    template: string;
    // Short description in pop-up list. Gets matched to what they typed.
    value: string;
    // Shows in overflow panel when highlighting the item. Gets matched to what they typed.
    description: string;
}
const SNIPPETS: Snippet[] = [
    /* Needs unindent. Maybe modify template code to unindent on \b.
    {
        template: "ld b,${count}\n${label}:\n; loop body\ndjnz ${label}\n",
        value: "loop b",
    },
    */
    {
        template: `; Add unsigned "a" to "#{h}#{l}". Destroys "a".
add a,#{l}         ; a = a+#{l}
ld #{l},a          ; #{l} = a+#{l}
adc a,#{h}         ; a = a+#{l}+#{h}+carry
sub #{l}           ; a = #{h}+carry
ld #{h},a          ; #{h} = #{h}+carry
#{}`,
        value: "Add unsigned 8-bit to 16-bit",
        description: 'Add "a" to any 16-bit register, assuming "a" is unsigned. Destroy "a" in the process.',
    },
    {
        template: `; Sign-extend "a" to "#{h}#{l}". Destroys "a".
ld #{l},a          ; Store low byte
add a,a         ; Push sign into carry
sbc a           ; Turn it into 0 or -1 (0xFF)
ld #{h},a          ; Store high byte
#{}`,
        value: 'Sign-extend "a" to 16 bits',
        description: 'Load "a" into any 16-bit register, assuming "a" is signed. Destroy "a" in the process.',
    },
    {
        template: `; Sign-extend "c" to "bc". Destroys "a".
ld a,c          ; Copy low byte.
add a,a         ; Push sign into carry
sbc a           ; Turn it into 0 or -1 (0xFF)
ld b,a          ; Store high byte
#{}`,
        value: 'Sign-extend "c" to "bc"',
        description: 'The sign of "c" is copied to "b" to sign-extend the 8-bit value to its 16-bits version. Destroy "a" in the process.',
    },
    {
        template: `; Sign-extend "e" to "de". Destroys "a".
ld a,e          ; Copy low byte.
add a,a         ; Push sign into carry
sbc a           ; Turn it into 0 or -1 (0xFF)
ld d,a          ; Store high byte
#{}`,
        value: 'Sign-extend "e" to "de"',
        description: 'The sign of "e" is copied to "d" to sign-extend the 8-bit value to its 16-bits version. Destroy "a" in the process.',
    },
    {
        template: `; Sign-extend "l" to "hl". Destroys "a".
ld a,l          ; Copy low byte.
add a,a         ; Push sign into carry
sbc a           ; Turn it into 0 or -1 (0xFF)
ld h,a          ; Store high byte
#{}`,
        value: 'Sign-extend "l" to "hl"',
        description: 'The sign of "l" is copied to "h" to sign-extend the 8-bit value to its 16-bits version. Destroy "a" in the process.',
    },
];

/**
 * Return true if every word appears in the description. The words must already be lower case.
 */
function matchesDescription(words: string[], description: string): boolean {
    if (words.length === 0) {
        return false;
    }

    description = description.toLowerCase();

    for (const word of words) {
        const index = description.indexOf(word);
        if (index === -1) {
            return false;
        }

        // Must be at start of word.
        if (index > 0) {
            const ch = description.charAt(index - 1);
            if (ch !== " " && ch !== "(") {
                return false;
            }
        }
    }

    return true;
}

/**
 * Given a completion context (line written so far, file assembled), can generate list of possible completions.
 */
class Completer {
    private readonly tokens: AsmToken[];
    private readonly options: Completion[] = [];
    /**
     * Where in the line we want to replace what's been written.
     */
    private localFrom = 0;

    public constructor(
        private readonly asm: Asm,
        /**
         * Line until the cursor.
         */
        private readonly line: string,
        /**
         * Where in the file the line starts.
         */
        private readonly globalFrom: number,
        /**
         * Zero-based line number of the line we're completing.
         */
        private readonly lineNumber: number,
        /**
         * Whether the user has explicitly asked for a completion with Ctrl-Space.
         */
        private readonly explicit: boolean) {

        // Nothing.
        const tokenizer = new AsmTokenizer(line);
        this.tokens = tokenizer.tokens;
    }

    /**
     * Get all completions available at this location, or null for none.
     */
    public getCompletions(): CompletionResult | null {
        this.completeNewLabels();
        if (this.options.length === 0) {
            this.completeInstructions();
            this.completeDescriptions(); // TODO dedupe from above list.
            this.completeSnippets();
            this.completeDirectives();
        }
        if (this.options.length === 0) {
            return null;
        }
        return {
            from: this.globalFrom + this.localFrom,
            options: this.options,
            filter: false,
        };
    }

    /**
     * Complete labels at the start of the line to the set of identifiers that have been used but not defined.
     */
    private completeNewLabels(): void {
        // See if we're completing a label.
        if ((this.line === "" && this.explicit) || this.line.match(LABEL_RE)) {
            // Auto-complete labels that are used but not yet defined.
            for (const symbolInfo of this.asm.symbols) {
                // Show the symbol if our typed text is a prefix and the symbol has been used but not
                // defined. There's a special case to handle: the user is typing a new symbol,
                // and as they reach the last letter, it immediately becomes defined, and therefore
                // disappears from the list! We want to keep it in the list, so if the definition is
                // on the line we're typing, then include it.
                if (symbolInfo.name.toLowerCase().startsWith(this.line) &&
                    symbolInfo.references.length > 0 &&
                    (symbolInfo.definitions.length === 0 ||
                        symbolInfo.definitions[0].assembledLine?.lineNumber === this.lineNumber)) {

                    this.options.push(this.makeOption(symbolInfo.name + ":", "New Label", undefined));
                }
            }

            this.options.sort((a, b) => a.label.localeCompare(b.label));
            this.localFrom = 0;
        }
    }

    /**
     * Generate a list of instructions that match the sequence of tokens entered so far.
     */
    private completeInstructions() {
        let trie = getAsmInstructionTrie();

        // Find partially-typed word to filter on.
        let trieEndIndex = this.tokens.length; // Exclusive.
        let filter = "";
        let filterBegin = this.line.length;
        if (this.tokens.length > 0) {
            const lastToken = this.tokens[this.tokens.length - 1];
            // We include "number" here because if the user types "1" we can't autocomplete immediately
            // after that, and the number itself will stop that from happening.
            if (lastToken.end === this.line.length && (lastToken.tag === "identifier" || lastToken.tag === "number")) {
                trieEndIndex -= 1;
                filter = lastToken.text;
                filterBegin = lastToken.begin;
            }
        }
        this.localFrom = this.tokens.length > 0 ? this.tokens[0].begin : this.line.length;

        this.tryTokens(0, trie, trieEndIndex, filter, filterBegin);
    }


    /**
     * Add variants that have a description that match tokens.
     */
    private completeDescriptions() {
        // Find all variants.
        const matchingVariants: OpcodeVariant[] = [];
        const searchWords = this.tokens.filter(token => token.begin > 0).map(token => token.text.toLowerCase());
        for (const variants of mnemonicMap.values()) {
            for (const variant of variants) {
                if (variant.clr !== undefined && matchesDescription(searchWords, variant.clr.description)) {
                    matchingVariants.push(variant);
                }
            }
        }

        // Sort to put most likely on top.
        matchingVariants.sort((a, b) => this.compareVariants(a, b));

        for (const variant of matchingVariants) {
            this.options.push(this.makeOption(opcodeVariantToString(variant), "Instructions", variant.clr?.description));
        }
    }

    /**
     * List snippets that match the words entered so far.
     */
    private completeSnippets() {
        const searchWords = this.tokens.filter(token => token.begin > 0).map(token => token.text.toLowerCase());

        for (const snippet of SNIPPETS) {
            if (matchesDescription(searchWords, snippet.value) ||
                matchesDescription(searchWords, snippet.description)) {
                this.options.push(snippetCompletion(snippet.template, {
                    label: snippet.value,
                    info: snippet.description,
                    section: "Snippets",
                }));
            }
        }
    }

    /**
     * Complete assembly directives that match what's been written so far.
     */
    private completeDirectives() {
        const searchWords = this.tokens.filter(token => token.begin > 0).map(token => token.text.toLowerCase());
        const search = this.line.trim(); // TODO replace with trie search.

        const options: Completion[] = [];

        for (const doc of ASM_DIRECTIVE_DOCS) {
            const descriptionMatches = searchWords.length > 0 &&
                matchesDescription(searchWords, doc.description);
            for (const directive of doc.directives.values()) {
                if (descriptionMatches || directive.toLowerCase().startsWith(search)) {
                    options.push({
                        label: directive,
                        info: doc.description,
                        section: "Directives",
                    });
                }
            }
        }

        options.sort((a, b) => a.label.localeCompare(b.label));

        this.options.push(...options);
    }

    /**
     * Recurse down the trie while moving forward through the user's list of tokens.
     */
    private tryTokens(tokenIndex: number, trieNode: AsmTrieNode, trieEndIndex: number, filter: string, filterBegin: number) {
        if (tokenIndex === this.tokens.length) {
            // Ran out of the line, add all variants below this.
            this.addVariantToOptions(this.line.substring(this.localFrom), trieNode, false, this.explicit);
            return;
        }

        const lastToken = this.tokens[tokenIndex];
        const lastTokenText = lastToken.text;
        // Never do a full match on the last token, that's always for filtering.
        const subTrieNode = tokenIndex < trieEndIndex ? trieNode.tokens.get(lastTokenText) : undefined;
        if (subTrieNode === undefined) {
            // The next token didn't literally match. See if we get a partial match.
            for (const [fullToken, fullTrieNode] of trieNode.tokens.entries()) {
                if (fullToken.startsWith(lastTokenText)) {
                    this.addVariantToOptions(this.line.substring(this.localFrom, lastToken.begin) + fullToken, fullTrieNode,
                        trieNode.isCommand, false);
                }
            }

            // See if an expression is allowed here.
            if (trieNode.expression !== undefined) {
                // Eat up the expression. All expressions either end with a close parenthesis,
                // end of line, or comma, so we don't need a full parser.
                let parensCount = 0;
                while (tokenIndex < this.tokens.length) {
                    if (this.tokens[tokenIndex].text === "(") {
                        parensCount += 1;
                    } else if (this.tokens[tokenIndex].text === ")") {
                        if (parensCount === 0) {
                            // End of expression.
                            break;
                        } else {
                            parensCount -= 1;
                        }
                    } else if (this.tokens[tokenIndex].text === ",") {
                        break;
                    }
                    tokenIndex += 1;
                }

                let subTrieNode: AsmTrieNode;
                if (trieNode.expression instanceof Map) {
                    // Assume all paths have the same set of sub-tries. We don't want to have to
                    // evaluate the expression here to see which key to look up.
                    subTrieNode = trieNode.expression.values().next().value;
                } else {
                    subTrieNode = trieNode.expression.trieNode;
                }

                if (tokenIndex === this.tokens.length) {
                    for (const symbolName of this.symbolsWithPrefix(filter)) {
                        this.addVariantToOptions(this.line.substring(this.localFrom, filterBegin) + symbolName, subTrieNode,
                            trieNode.isCommand, false);
                    }
                } else {
                    this.tryTokens(tokenIndex, subTrieNode, trieEndIndex, filter, filterBegin);
                }
            } else {
                // No expression allowed, this won't match any variant.
            }
        } else {
            // Matched a token, keep going.
            this.tryTokens(tokenIndex + 1, subTrieNode, trieEndIndex, filter, filterBegin);
        }
    }

    /**
     * Add all variants below trieNode to the list of options.
     */
    private addVariantToOptions(prefix: string, trieNode: AsmTrieNode, addSpace: boolean, explicit: boolean): void {
        // We're at a node with a variant; add it to the list of options.
        if (trieNode.variant !== undefined) {
            this.options.push(this.makeOption(prefix, "Instructions", trieNode.variant.clr?.description));
        }
        if (addSpace) {
            // Space after command like "ld".
            prefix += " ";
        }
        // Recurse for tokens available from here.
        for (const [token, child] of trieNode.tokens.entries()) {
            this.addVariantToOptions(prefix + token, child, trieNode.isCommand, false);
        }
        // If we allow numeric constants, recurse for those.
        if (trieNode.expression instanceof Map) {
            // Don't show symbols here for "explicit", it's much more likely that they're going to
            // type a numeric literal than want an expression for this kind of instruction.
            for (const [token, child] of trieNode.expression.entries()) {
                this.addVariantToOptions(prefix + token, child, false, false);
            }
        } else if (trieNode.expression !== undefined) {
            if (explicit) {
                // Show all symbols here for this expression.
                for (const symbolName of this.symbolsWithPrefix("")) {
                    this.addVariantToOptions(prefix + symbolName, trieNode.expression.trieNode,
                        false, false);
                }
            } else {
                // Show the generic operand ("nnnn" etc).
                let operand: string = trieNode.expression.expr;
                if (operand === "dd") {
                    // We strip the + to make parsing elsewhere easier.
                    operand = "+dd";
                }
                this.addVariantToOptions(prefix + operand, trieNode.expression.trieNode,
                    false, false);
            }
        }
    }

    /**
     * Make a completion option from the label, section, and optional HTML description.
     */
    private makeOption(label: string, section: string, htmlInfo: string | undefined): Completion {
        let option: Completion = {
            label,
            info: htmlInfo === undefined ? undefined : () => {
                const span = document.createElement("span");
                span.innerHTML = htmlInfo;
                return span;
            },
            section,
        };

        // Make template with the constants.
        const template = option.label.replace(/\b(offset|nn|nnnn|dd)\b/g, "#{$&}");
        if (template !== option.label) {
            option = snippetCompletion(template, option);
        }

        return option;
    }

    /**
     * Get all defined symbol names starting with the given prefix.
     */
    private symbolsWithPrefix(prefix: string): string[] {
        return this.asm.symbols
            // TODO should we include undefined symbols? Why not, if we allow user to use it
            // before auto-complete definition, they may want to use it multiple times and
            // complete from it. But it might be misleading if it implies that it's defined.
            .filter(symbol => symbol.definitions.length > 0 && symbol.name.startsWith(prefix))
            .map(symbol => symbol.name);
    }

    /**
     * Use various heuristics to put more useful variants on top.
     */
    private compareVariants(a: OpcodeVariant, b: OpcodeVariant): number {
        // Assume those with fewer opcodes are more common/likely.
        let cmp = a.opcodes.length - b.opcodes.length;
        if (cmp !== 0) {
            return cmp;
        }

        // Prefer shorter instructions.
        const aLabel = opcodeVariantToString(a);
        const bLabel = opcodeVariantToString(b);
        cmp = aLabel.length - bLabel.length;
        if (cmp !== 0) {
            return cmp;
        }

        // Break ties with alphabetical sort.
        return aLabel.localeCompare(bLabel);
    }
}

/**
 * Custom auto-completions from the Z80 instruction set, snippets, and directives.
 */
export function customCompletions(context: CompletionContext, assemblyResultsStateField: StateField<AssemblyResults>): CompletionResult | null {
    // Assembly results are useful for symbol completion.
    const assemblyResults = context.state.field(assemblyResultsStateField);

    // Grab entire line.
    const word = context.matchBefore(/.*/);
    if (word === null) {
        return null;
    }

    // Zero-based line number.
    const lineNumber = context.state.doc.lineAt(context.pos).number - 1;

    const completer = new Completer(assemblyResults.asm, word.text, word.from, lineNumber, context.explicit);
    return completer.getCompletions();
}
