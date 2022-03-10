
import {EditorState} from "@codemirror/state"
import {EditorView, keymap} from "@codemirror/view"
import {defaultKeymap} from "@codemirror/commands"
import {Asm} from "z80-asm";

let startState = EditorState.create({
  doc: "Hello World",
  extensions: [keymap.of(defaultKeymap)]
});

let view = new EditorView({
  state: startState,
  parent: document.getElementById("editor") as HTMLDivElement
});

const button = document.getElementById("assemble_button");
button?.addEventListener("click", () => {
  const code = view.state.doc.toJSON();
  console.log(code);
  const asm = new Asm({
    readBinaryFile(pathname: string): Uint8Array | undefined {
      return undefined;
    }, readDirectory(pathname: string): string[] | undefined {
      return undefined;
    }, readTextFile(pathname: string): string[] | undefined {
      return code;
    }
  });
  const sourceFile = asm.assembleFile("current.asm");
  console.log(sourceFile);
});
