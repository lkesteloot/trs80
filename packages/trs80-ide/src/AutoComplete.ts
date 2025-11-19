import {Asm, AsmToken, AsmTokenizer, AsmTrieNode, getAsmDirectiveDocs, getAsmInstructionTrie} from 'z80-asm';
import {mnemonicMap, OpcodeVariant, opcodeVariantToString} from 'z80-inst';
import {
    Completion,
    CompletionContext,
    CompletionResult,
    CompletionSection,
    snippetCompletion
} from '@codemirror/autocomplete';
import {StateField} from '@codemirror/state';
import {AssemblyResults} from './AssemblyResults';

// Regular expression for entire-line label.
const LABEL_RE = /^[a-z_][a-z0-9_]*$/i;

const ASM_DIRECTIVE_DOCS = getAsmDirectiveDocs();

// Sections that the completions can be in. We list them here so that
// we can sort them explicitly. The important thing is to put instructions
// first because if a user types one, we shouldn't ever route them elsewhere.
const INSTRUCTIONS_SECTION: CompletionSection = {
    name: "Instructions",
    rank: 1,
};
const NEW_LABEL_SECTION: CompletionSection = {
    name: "New Label",
    rank: 2,
};
const DIRECTIVES_SECTION: CompletionSection = {
    name: "Directives",
    rank: 3,
};
const SNIPPETS_SECTION: CompletionSection = {
    name: "Snippets",
    rank: 4,
};

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
 * Extract the alphanumeric words from the string, converting to lower case.
 *
 * @param s the string to break into words
 * @param skipLabel skip any word at the start of the line (first character, location 0)
 * @param includePrefixes for each word, also include its prefixes (e.g., for "the" also
 * include "t" and "th")
 */
function extractWords(s: string, skipLabel: boolean, includePrefixes: boolean): Set<string> {
    let wordMatches = [...s.toLowerCase().matchAll(/\w+/g)];
    if (skipLabel) {
        // Skip words at the beginning of the line.
        wordMatches = wordMatches.filter(match => match.index !== undefined && match.index > 0);
    }
    // Extract the actual strings.
    const words = wordMatches.map(match => match[0]);
    if (includePrefixes) {
        const set = new Set<string>();
        for (const word of words) {
            for (let letterCount = 1; letterCount <= word.length; letterCount++) {
                set.add(word.substring(0, letterCount));
            }
        }
        return set;
    } else {
        return new Set(words);
    }
}

/**
 * Whether all words in searchWords are in the set targetPrefixes.
 */
function allWordsFound(searchWords: Set<string>, targetPrefixes: Set<string>): boolean {
    for (const searchWord of searchWords) {
        if (!targetPrefixes.has(searchWord)) {
            return false;
        }
    }

    return true;
}

// Our own Completion type where we keep track of the variant.
type CompletionWithVariant = Completion & { variant?: OpcodeVariant };

/**
 * Use various heuristics to put more useful variants on top.
 */
function compareCompletionWithVariants(a: CompletionWithVariant, b: CompletionWithVariant): number {
    if (a.variant === undefined && b.variant === undefined) {
        return a.label.localeCompare(b.label);
    }
    // Put those without variants later.
    if (a.variant === undefined) {
        return 1;
    }
    if (b.variant === undefined) {
        return -1;
    }
    return compareVariants(a.variant, b.variant);
}

/**
 * Use various heuristics to put more useful variants on top.
 */
function compareVariants(a: OpcodeVariant, b: OpcodeVariant): number {
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

/**
 * Given a completion context (line written so far, file assembled), can generate list of possible completions.
 */
class Completer {
    // All tokens on the line so far.
    private readonly tokens: AsmToken[];
    // Distinct words on the line so far.
    private readonly searchWords: Set<string>;
    // Accumulated completion options.
    private readonly options: CompletionWithVariant[] = [];
    /**
     * Where in the line we want to replace what's been written.
     */
    private localFrom = 0;

    public constructor(
        /**
         * Results of assembling the code.
         */
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

        this.tokens = new AsmTokenizer(line).tokens;
        this.searchWords = extractWords(this.line, true, false);
    }

    /**
     * Get all completions available at this location, or null for none.
     */
    public getCompletions(): CompletionResult | null {
        // Never complete inside a comment or string.
        if (this.tokens.length > 0) {
            const lastToken = this.tokens[this.tokens.length - 1];
            if (lastToken.tag === "comment" || lastToken.tag === "string") {
                return null;
            }
        }

        if ((this.line === "" && this.explicit) || this.line.match(LABEL_RE)) {
            this.completeNewLabels();
        } else {
            this.completeInstructions();
            this.completeDescriptions();
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
        const options: CompletionWithVariant[] = []
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

                options.push(this.makeOption(symbolInfo.name + ":", NEW_LABEL_SECTION,
                    undefined, undefined));
            }
        }
        options.sort(compareCompletionWithVariants);
        this.options.push(...options);
        this.localFrom = 0;
    }

    /**
     * Generate a list of instructions that match the sequence of tokens entered so far.
     */
    private completeInstructions() {
        let trie = getAsmInstructionTrie();

        // Find partially-typed word to filter on.
        let trieStartIndex = 0;
        let trieEndIndex = this.tokens.length; // Exclusive.
        let filter = "";
        let filterBegin = this.line.length;
        this.localFrom = this.tokens.length > 0 ? this.tokens[0].begin : this.line.length;
        if (this.tokens.length > 0) {
            // Skip label.
            if (this.tokens[0].begin === 0) {
                trieStartIndex += 1;
                if (this.tokens.length > 1) {
                    if (this.tokens[1].text === ":") {
                        trieStartIndex += 1;
                        if (this.tokens.length > 2) {
                            this.localFrom = this.tokens[2].begin;
                        }
                    } else {
                        this.localFrom = this.tokens[1].begin;
                    }
                }
            }

            const lastToken = this.tokens[this.tokens.length - 1];
            // We include "number" here because if the user types "1" we can't autocomplete immediately
            // after that, and the number itself will stop that from happening.
            if (lastToken.end === this.line.length && (lastToken.tag === "identifier" || lastToken.tag === "number")) {
                trieEndIndex -= 1;
                filter = lastToken.text;
                filterBegin = lastToken.begin;
            }
        }

        const beginIndex = this.options.length;
        this.tryTokens(trieStartIndex, trie, trieEndIndex, filter, filterBegin);
        const endIndex = this.options.length;

        // Sort to put most likely on top.
        const subOptions = this.options.splice(beginIndex, endIndex - beginIndex);
        subOptions.sort(compareCompletionWithVariants);
        this.options.splice(beginIndex, 0, ...subOptions);
    }

    /**
     * Add variants that have a description that match tokens.
     */
    private completeDescriptions() {
        // See what variants we've already added (by matching the trie tokens) and don't add those again.
        // This map uses the identity of the variant, which is fine.
        const alreadyAdded = new Set<OpcodeVariant>();
        for (const option of this.options) {
            if (option.variant !== undefined) {
                alreadyAdded.add(option.variant);
            }
        }

        // Find all variants.
        const matchingVariants: OpcodeVariant[] = [];
        for (const variants of mnemonicMap.values()) {
            for (const variant of variants) {
                if (variant.clr !== undefined &&
                    !alreadyAdded.has(variant) &&
                    allWordsFound(this.searchWords, extractWords(variant.clr.description, false, true))) {

                    matchingVariants.push(variant);
                }
            }
        }

        // Sort to put most likely on top.
        matchingVariants.sort(compareVariants);

        for (const variant of matchingVariants) {
            this.options.push(this.makeOption(opcodeVariantToString(variant), INSTRUCTIONS_SECTION,
                variant.clr?.description, variant));
        }
    }

    /**
     * List snippets that match the words entered so far.
     */
    private completeSnippets() {
        const options: CompletionWithVariant[] = [];
        for (const snippet of SNIPPETS) {
            if (allWordsFound(this.searchWords, extractWords(snippet.value, false, true)) ||
                allWordsFound(this.searchWords, extractWords(snippet.description, false, true))) {
                options.push(snippetCompletion(snippet.template, {
                    label: snippet.value,
                    info: snippet.description,
                    section: SNIPPETS_SECTION,
                }));
            }
        }

        options.sort(compareCompletionWithVariants);
        this.options.push(...options);
    }

    /**
     * Complete assembly directives that match what's been written so far.
     */
    private completeDirectives() {
        const search = this.line.trim();

        const options: Completion[] = [];

        for (const doc of ASM_DIRECTIVE_DOCS) {
            const descriptionMatches = this.searchWords.size > 0 &&
                allWordsFound(this.searchWords, extractWords(doc.description, false, true));
            for (const directive of doc.directives.values()) {
                if (descriptionMatches || directive.toLowerCase().startsWith(search)) {
                    options.push({
                        label: directive,
                        info: doc.description,
                        section: DIRECTIVES_SECTION,
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
    private tryTokens(tokenIndex: number, trieNode: AsmTrieNode, trieEndIndex: number,
                      filter: string, filterBegin: number) {

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
                    subTrieNode = trieNode.expression.values().next().value!;
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
            this.options.push(this.makeOption(prefix, INSTRUCTIONS_SECTION,
                trieNode.variant.clr?.description, trieNode.variant));
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
    private makeOption(label: string, section: CompletionSection, htmlInfo: string | undefined, variant: OpcodeVariant | undefined): Completion {
        let option: CompletionWithVariant = {
            label,
            info: htmlInfo === undefined ? undefined : () => {
                const span = document.createElement("span");
                span.innerHTML = htmlInfo;
                return span;
            },
            section,
            variant,
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
        // Symbol names are stored lower case.
        prefix = prefix.toLowerCase();

        return this.asm.symbols
            // Should we include undefined symbols? Why not, if we allow user to use it
            // before auto-complete definition, they may want to use it multiple times and
            // complete from it. But it might be misleading if it implies that it's defined.
            // One problem is that as you're typing, you're defining that new symbol, and it
            // shows up in the list of completions. Leaving it alone for now.
            .filter(symbol => symbol.definitions.length > 0 && symbol.name.startsWith(prefix))
            // Use the capitalization originally used to define the symbol.
            .map(symbol => symbol.originalSpelling);
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
