import "./style.css";
import {UserInterface} from "./UserInterface";
import {Emulator} from "./Emulator";
import {Editor} from "./Editor";

// /**
//  * Plugin to set and update the timing results.
//  */
// const timingViewPlugin = ViewPlugin.fromClass(class {
//     decorations: DecorationSet
//
//     constructor(view: EditorView) {
//         this.decorations = decorationsForTiming(view);
//     }
//
//     update(update: ViewUpdate) {
//         if (update.docChanged || true) { // TODO maybe compare assembly result screenshot info?
//             this.decorations = decorationsForTiming(update.view)
//         }
//     }
// }, {
//     decorations: v => v.decorations,
// });
//
// function timingPlugin(): Extension {
//     return [
//         timingViewPlugin,
//     ];
// }

const gEmulator = new Emulator();
const gEditor = new Editor(gEmulator);
const gUserInterface = new UserInterface(gEmulator, gEditor);

// Don't assemble right away, give the ROM a chance to start.
setTimeout(() => gEditor.reassemble(), 500);
