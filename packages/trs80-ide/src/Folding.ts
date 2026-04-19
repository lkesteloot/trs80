import {
    EditorState,
    StateField,
    Transaction
} from "@codemirror/state"
import {foldService,foldGutter,codeFolding} from "@codemirror/language"
import {pluralizeWithCount} from "./utils";

const FOLDABLE_MARKER = ";---";

/**
 * Information about all foldable sections.
 */
class FoldableSections {
    // Map from (1-based) starting line number to next (1-based) line number, or undefined if last section.
    public readonly sections = new Map<number,number | undefined>();

    public static fromLines(lines: string[]): FoldableSections {
        // Find starting lines of sections.
        const startLines: number[] = [];
        let lineNumber = 1;
        for (const line of lines) {
            if (line.startsWith(FOLDABLE_MARKER)) {
                startLines.push(lineNumber);
            }
            lineNumber += 1;
        }

        // Make a map from each starting line to the next one.
        const sections = new FoldableSections();
        for (let i = 0; i < startLines.length; i++) {
            sections.sections.set(startLines[i], i === startLines.length - 1 ? undefined : startLines[i + 1]);
        }
        return sections;
    }
}

/**
 * Return all extensions responsible for code folding.
 */
export function foldingExtensions() {
    // State field for keeping track of foldable sections.
    const foldableSectionsStateField = StateField.define<FoldableSections>({
        create: (state: EditorState) => {
            return FoldableSections.fromLines(state.doc.toJSON());
        },
        update: (value: FoldableSections, tr: Transaction) => {
            // See if we should recompute based on changes to the doc.
            if (tr.docChanged) {
                return FoldableSections.fromLines(tr.state.doc.toJSON());
            } else {
                // No, return old value.
                return value;
            }
        },
    });

    return [
        foldableSectionsStateField,
        foldService.of((state, lineStart, lineEnd) => {
            const lineNumber = state.doc.lineAt(lineStart).number;
            const foldableSections = state.field(foldableSectionsStateField);
            if (foldableSections.sections.has(lineNumber)) {
                const nextLineNumber = foldableSections.sections.get(lineNumber);
                return {
                    from: lineStart,
                    to: nextLineNumber === undefined
                        ? state.doc.length
                        : state.doc.line(nextLineNumber).from - 1,
                };
            } else {
                return null;
            }
        }),
        foldGutter(),
        codeFolding({
            placeholderDOM: (view, onclick, prepared) => {
                // Just show the first line.
                const element = document.createElement("span");
                element.textContent = prepared;
                element.className = "cm-foldPlaceholder";
                element.onclick = onclick;
                return element;
            },
            preparePlaceholder: (state, range) => {
                // Make line we show when folded. It's the text of the line and number of lines collapsed.
                const lineNumber = state.doc.lineAt(range.from).number;
                const foldableSections = state.field(foldableSectionsStateField);
                const line = state.doc.line(lineNumber).text;
                if (foldableSections.sections.has(lineNumber)) {
                    const nextLineNumber = foldableSections.sections.get(lineNumber) ?? state.doc.lines + 1;
                    const lineCount = nextLineNumber - lineNumber - 1;
                    return line + " (" + pluralizeWithCount(lineCount, "line") + ")";
                } else {
                    // Shouldn't happen.
                    return line;
                }
            },
        }),
    ];
}
