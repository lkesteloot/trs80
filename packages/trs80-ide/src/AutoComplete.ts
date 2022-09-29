import { getAsmDirectiveDocs } from "z80-asm";
import {mnemonicMap, OpcodeVariant } from "z80-inst";
import {CompletionContext, Completion, CompletionResult} from "@codemirror/autocomplete";
import {getInitialSpaceCount} from "./utils";

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

// Custom auto-completions from the Z80 instruction set.
export function customCompletions(context: CompletionContext): CompletionResult | null {
    // Grab entire line.
    const word = context.matchBefore(/.*/);
    if (word === null) {
        return null;
    }

    // Skip initial space.
    let spaceCount = getInitialSpaceCount(word.text);
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
    const matchingVariantsLabel: OpcodeVariant[] = [];
    const matchingVariantsDesc: OpcodeVariant[] = [];
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

    // Sort to put most likely on top.
    matchingVariantsLabel.sort((a, b) => a.opcodes.length - b.opcodes.length);
    matchingVariantsDesc.sort((a, b) => a.opcodes.length - b.opcodes.length);

    // Put label matches first, then description matches.
    const matchingVariants = [... matchingVariantsLabel, ... matchingVariantsDesc];

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
