import { getAsmDirectiveDocs } from "z80-asm";
import {mnemonicMap, OpcodeVariant, opcodeVariantToString } from "z80-inst";
import {CompletionContext, Completion, CompletionResult, snippetCompletion} from "@codemirror/autocomplete";
import {StateField} from "@codemirror/state";
import {getInitialSpaceCount} from "./utils";
import {AssemblyResults} from "./AssemblyResults";

// Get the full label (such as "ld a,b") for the variant.
function getVariantLabel(variant: OpcodeVariant): string {
    return opcodeVariantToString(variant);
}

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
 * Return true if every word appears in the description.
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
 * Custom auto-completions from the Z80 instruction set.
 *
 * If we're defining a new label, look for symbols that have been used but not yet defined.
 *
 * Otherwise, if the first word matches a mnemonic, then figure out which parameter we're on and
 * complete only that (e.g., registers, identifiers).
 *
 * Otherwise, tokenize the line and look for its words in snippets, mnemonics, and directives.
 */
export function customCompletions(context: CompletionContext, assemblyResultsStateField: StateField<AssemblyResults>): CompletionResult | null {
    // Assembly results are useful for symbol completion.
    const assemblyResults = context.state.field(assemblyResultsStateField);

    // Grab entire line.
    const word = context.matchBefore(/.*/);
    if (word === null) {
        return null;
    }

    if (2 < 3) { // TODO
        const lineNumber = context.state.doc.lineAt(context.pos).number - 1;
        const completionResult = assemblyResults.asm.getCompletions(word.text, context.explicit, lineNumber);
        if (completionResult === undefined) {
            return null;
        }
        return {
            from: word.from + completionResult.from,
            options: completionResult.options.map(option => {
                const htmlInfo = option.htmlInfo;
                return {
                    label: option.label,
                    info: htmlInfo === undefined ? undefined : () => {
                        const span = document.createElement("span");
                        span.innerHTML = htmlInfo;
                        return span;
                    },
                };
            }),
            filter: false,
        };
    }

    // Count space at the front of the line.
    let spaceCount = getInitialSpaceCount(word.text);

    // Skip leading spaces, normalize to lower case, and collapse spaces.
    const search = word.text.substring(spaceCount).toLowerCase().replace(/[ \t]+/g, " ");
    if (search === "" && !context.explicit) {
        return null;
    }

    // All the options we'll show, in order.
    const options: Completion[] = [];

    // Break search string into words. Remove words that start with a period, only want those in "search".
    const searchWords = search.split(" ").filter(word => word !== "" && !word.startsWith("."));

    // Add snippets that match.
    for (const snippet of SNIPPETS) {
        if (matchesDescription(searchWords, snippet.value) ||
            matchesDescription(searchWords, snippet.description)) {
            options.push(snippetCompletion(snippet.template, {
                label: snippet.value,
                info: snippet.description,
            }));
        }
    }

    // Find all variants.
    const matchingVariantsLabel: OpcodeVariant[] = []; // Match by label, we'll put those first.
    const matchingVariantsDesc: OpcodeVariant[] = [];  // Match by description, put those later.
    for (const variants of mnemonicMap.values()) {
        for (const variant of variants) {
            const variantLabel = getVariantLabel(variant).toLowerCase();
            if (variantLabel === search) {
                // If we exactly match a variant, then don't auto-complete. It's annoying
                // to have to close the pop-up when you've typed the full string.
                return null;
            } else if (variantLabel.startsWith(search)) {
                matchingVariantsLabel.push(variant);
            } else if (variant.clr !== undefined && matchesDescription(searchWords, variant.clr.description)) {
                matchingVariantsDesc.push(variant);
            }
        }
    }

    // Sort to put most likely on top. Assume those with fewer opcodes are more common/likely.
    matchingVariantsLabel.sort((a, b) => a.opcodes.length - b.opcodes.length);
    matchingVariantsDesc.sort((a, b) => a.opcodes.length - b.opcodes.length);

    // Put label matches first, then description matches.
    const matchingVariants = [... matchingVariantsLabel, ... matchingVariantsDesc];

    // Convert to options.
    for (const variant of matchingVariants) {
        const label = getVariantLabel(variant);
        let option: Completion = {
            label: label,
        };
        if (variant.clr !== undefined) {
            const description = variant.clr.description;
            // Use the callback because that's the only way to use the HTML in the description.
            option.info = () => {
                const span = document.createElement("span");
                span.innerHTML = description;
                return span;
            };
        }

        // Make template with the constants.
        const template = label.replace(/\b(offset|nn|nnnn|dd)\b/g, "#{$&}");
        if (template !== label) {
            option = snippetCompletion(template, option);
        }
        options.push(option);
    }

    // Now check assembler directives.
    for (const doc of ASM_DIRECTIVE_DOCS) {
        const descriptionMatches = searchWords.length > 0 &&
            matchesDescription(searchWords, doc.description);
        for (const directive of doc.directives.values()) {
            const d = directive.toLowerCase();
            if (d !== search && (descriptionMatches || d.startsWith(search))) {
                options.push({
                    label: directive,
                    info: doc.description,
                });
            }
        }
    }

    return {
        from: word.from + spaceCount,
        options: options,
        filter: false,
    };
}
