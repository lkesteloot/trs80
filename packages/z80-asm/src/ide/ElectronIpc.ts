
import CodeMirror from "codemirror";
import {ipcRenderer as ipc} from "electron";

export function initIpc(cm: CodeMirror.Editor) {
    console.log("Initialized IPC");
    ipc.on("set-text", (event, text) => cm.setValue(text));
}



