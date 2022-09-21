import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from "@codemirror/view";
import {EditorState, Extension, StateField, StateEffect, Transaction} from "@codemirror/state"
import {RangeSetBuilder} from "@codemirror/state";
import {AssemblyResults} from "./AssemblyResults";

/**
 * Config options for the screenshot plugin.
 */
export interface Config {
    // State field for finding the assembly results.
    assemblyResultsStateField: StateField<AssemblyResults>;

    // Function to call to start the screen editor.
    startScreenEditor: (view: EditorView, assemblyResults: AssemblyResults,
                        screenshotIndex: number, onClose: () => void) => void;

    // Function to call when the editor closes.
    onClose: () => void;
}

/**
 * State field for whether editing a screenshot.
 */
const gEditingScreenshotStateEffect = StateEffect.define<boolean>();
const gEditingScreenshotStateField = StateField.define<boolean>({
        create: () => false,
        update: (value: boolean, tr: Transaction) => {
            for (const effect of tr.effects) {
                if (effect.is(gEditingScreenshotStateEffect)) {
                    value = effect.value;
                }
            }
            return value;
        },
        compare: (a: boolean, b: boolean) => a === b,
    }
);

/**
 * Widget that shows an Edit button to the right of a screenshot-start comment.
 */
class EditScreenshotWidget extends WidgetType {
    private readonly screenshotIndex: number;

    constructor(screenshotIndex: number) {
        super();
        this.screenshotIndex = screenshotIndex;
    }

    eq(other: EditScreenshotWidget): boolean{
        return this.screenshotIndex === other.screenshotIndex;
    }

    toDOM(): HTMLElement {
        const button = document.createElement("span");
        button.setAttribute("aria-hidden", "true");
        button.className = "cm-screenshotEdit";
        button.innerText = "Edit";
        button.dataset.screenshotIndex = this.screenshotIndex.toString();
        return button;
    }

    ignoreEvent(): boolean {
        // We want the click.
        return false;
    }
}

const screenshotTheme = EditorView.baseTheme({
    ".cm-screenshotHighlight": { backgroundColor: "rgba(0, 0, 0, 0.05)" },
});

/**
 * Generate a set of decorations for all screenshots in the code.
 */
function decorationsForScreenshots(view: EditorView,
                                   assemblyResultsStateField: StateField<AssemblyResults>): DecorationSet {

    const builder = new RangeSetBuilder<Decoration>();

    const assemblyResults = view.state.field(assemblyResultsStateField);
    for (let i = 0; i < assemblyResults.screenshotSections.length; i++) {
        const s = assemblyResults.screenshotSections[i];
        const line = view.state.doc.line(s.beginCommentLineNumber);
        const widgetDeco = Decoration.widget({
            widget: new EditScreenshotWidget(i),
            side: 1,
        });
        builder.add(line.to, line.to, widgetDeco);

        if (s.firstDataLineNumber !== undefined && s.lastDataLineNumber !== undefined) {
            for (let lineNumber = s.firstDataLineNumber; lineNumber <= s.lastDataLineNumber; lineNumber++) {
                const line = view.state.doc.line(lineNumber);
                const lineDeco = Decoration.line({ // TODO I think I only need to create one of these?
                    attributes: {
                        class: "cm-screenshotHighlight",
                    },
                });
                builder.add(line.from, line.from, lineDeco);
            }
        }
    }

    return builder.finish();
}

/**
 * Plugin to set and update the Edit buttons next to screenshot sections.
 */
function makeScreenshotViewPlugin(config: Config) {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = decorationsForScreenshots(view, config.assemblyResultsStateField);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || true) { // TODO maybe compare assembly result screenshot info?
                this.decorations = decorationsForScreenshots(update.view, config.assemblyResultsStateField)
            }
        }
    }, {
        decorations: v => v.decorations,

        eventHandlers: {
            click: (e, view) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains("cm-screenshotEdit") && !view.state.field(gEditingScreenshotStateField)) {
                    // Disable clicking the Edit button while editing the screenshot.
                    view.dispatch({
                        effects: gEditingScreenshotStateEffect.of(true),
                    });
                    const screenshotIndex = parseInt(target.dataset.screenshotIndex as string);
                    const assemblyResults = view.state.field(config.assemblyResultsStateField);
                    config.startScreenEditor(view, assemblyResults, screenshotIndex, () => {
                        // Re-enable clicking the Edit button.
                        view.dispatch({
                            effects: gEditingScreenshotStateEffect.of(false),
                        });
                        config.onClose;
                    });
                    return true;
                } else {
                    return false;
                }
            }
        }
    });
}

/**
 * The set of extensions for the screenshot plugin.
 */
export function screenshotPlugin(config: Config): Extension {
    return [
        makeScreenshotViewPlugin(config),
        screenshotTheme,
        gEditingScreenshotStateField,
        // Make editor read-only when editing a screenshot.
        EditorState.readOnly.from(gEditingScreenshotStateField, editing => editing),
    ];
}
