import { getAsmDirectiveDocs } from "z80-asm";
import {mnemonicMap, OpcodeVariant } from "z80-inst";
import {CompletionContext, Completion, CompletionResult} from "@codemirror/autocomplete";

// Get the full label (such as "ld a,b") for the variant.
function getVariantLabel(variant: OpcodeVariant): string {
    const label = variant.mnemonic + " " + variant.params.join(",");
    return label.trim();
}

const ASM_DIRECTIVE_DOCS = getAsmDirectiveDocs();

/**
 * Return true if every word appears in the description.
 */
function matchesDescription(words: string[], description: string): boolean {
    if (words.length === 0) {
        return false;
    }

    description = description.toLowerCase();

    for (const word of words) {
        if (description.indexOf(word) === -1) {
            return false;
        }
    }

    return true;
}

// Custom auto-completions from the Z80 instruction set.
export function customCompletions(context: CompletionContext): CompletionResult | null {
    // Grab entire line.
    const word = context.matchBefore(/.*/);
    if (word === null) {
        return null;
    }

    // Skip initial space.
    let spaceCount = 0;
    for (let i = 0; i < word.text.length; i++) {
        if (word.text.charAt(i) === " ") {
            spaceCount += 1;
        } else {
            break;
        }
    }
    if (spaceCount === 0) {
        // Don't autocomplete at start of line, that's for labels.
        return null;
    }
    // Skip leading spaces, normalize to lower case, and collapse spaces.
    const search = word.text.substring(spaceCount).toLowerCase().replace(/[ \t]+/g, " ");
    if (search === "" && !context.explicit) {
        return null;
    }
    // Remove words that start with a period, only want those in "search".
    const searchWords = search.split(" ").filter(word => word !== "" && !word.startsWith("."));

    // Find all variants.
    const options: Completion[] = [];
    const matchingVariants: OpcodeVariant[] = [];
    for (const variants of mnemonicMap.values()) {
        for (const variant of variants) {
            if ((variant.clr !== undefined && matchesDescription(searchWords, variant.clr.description)) ||
                getVariantLabel(variant).toLowerCase().startsWith(search)) {

                matchingVariants.push(variant);
            }
        }
    }

    // Sort to put most likely on top.
    matchingVariants.sort((a, b) => a.opcodes.length - b.opcodes.length);

    // Convert to options.
    for (const variant of matchingVariants) {
        const option: Completion = {
            label: getVariantLabel(variant),
        };
        if (variant.clr !== undefined) {
            option.info = variant.clr.description;
            // Or "detail"?
        }
        options.push(option);
    }

    // Now check assembler directives.
    for (const doc of ASM_DIRECTIVE_DOCS) {
        const descriptionMatches = searchWords.length > 0 &&
            matchesDescription(searchWords, doc.description);
        for (const directive of doc.directives.values()) {
            if (descriptionMatches || directive.toLowerCase().startsWith(search)) {
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
