import {Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType} from "@codemirror/view";
import {Extension, RangeSetBuilder, StateField} from "@codemirror/state"
import {AssemblyResults} from "./AssemblyResults";
import {SymbolType} from "z80-asm";
import {word} from "z80-base";

/**
 * Config options for the variable pill plugin.
 */
export interface Config {
    // State field for finding the assembly results.
    assemblyResultsStateField: StateField<AssemblyResults>;
    // State field for memory, or undefined if unknown.
    memoryStateField: StateField<Uint8Array | undefined>;
}

/**
 * Widget that shows the value of a variable inline at its reference.
 */
class VariableValueWidget extends WidgetType {
    private readonly value: number;
    private readonly size: number;

    constructor(value: number, size: number) {
        super();
        this.value = value;
        this.size = size;
    }

    eq(other: VariableValueWidget): boolean{
        return this.value === other.value && this.size === other.size;
    }

    toDOM(): HTMLElement {
        const button = document.createElement("span");
        button.setAttribute("aria-hidden", "true");
        button.classList.add("inline-pill", "cm-variablePill");
        let text = this.value.toString();
        if (this.size === 1 && this.value >= 128) {
            text += " (" + (this.value - 256) + ")";
        } else if (this.size === 2 && this.value >= 32768) {
            text += " (" + (this.value - 65536) + ")";
        }
        button.innerText = text;
        return button;
    }
}

/**
 * Generate a set of decorations for all variable pills in the code.
 */
function decorationsForVariablePills(view: EditorView, config: Config): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    const assemblyResults = view.state.field(config.assemblyResultsStateField);
    const memory = view.state.field(config.memoryStateField);
    if (memory !== undefined) {
        for (const ref of assemblyResults.variableReferences) {
            const symbol = ref.symbol;
            let value: number | undefined;
            let size = 1;
            switch (symbol.type) {
                case SymbolType.UNKNOWN:
                case SymbolType.CODE:
                case SymbolType.ARRAY:
                default:
                    // Skip.
                    value = undefined;
                    break;

                case SymbolType.BYTE:
                    value = memory[symbol.value];
                    size = 1;
                    break;

                case SymbolType.WORD:
                    value = word(memory[symbol.value + 1], memory[symbol.value]);
                    size = 2;
                    break;
            }
            if (value !== undefined) {
                const widgetDeco = Decoration.widget({
                    widget: new VariableValueWidget(value, size),
                    side: 1,
                });
                const lineNumber = ref.assembledLine?.lineNumber;
                if (lineNumber !== undefined) {
                    const line = view.state.doc.line(lineNumber + 1);
                    const end = line.from + ref.column + ref.symbol.name.length;
                    builder.add(end, end, widgetDeco);
                }
            }
        }
    }

    return builder.finish();
}

/**
 * Plugin to set and update the variable pills in the code.
 */
function makeVariablePillPlugin(config: Config) {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = decorationsForVariablePills(view, config);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || true) { // TODO maybe compare assembly result variable pill info?
                this.decorations = decorationsForVariablePills(update.view, config)
            }
        }
    }, {
        decorations: v => v.decorations,
    });
}

/**
 * The set of extensions for the variable pill plugin.
 */
export function variablePillPlugin(config: Config): Extension {
    return [
        makeVariablePillPlugin(config),
    ];
}
