
import {ipcRenderer as ipc} from "electron";
import IdeController from "./IdeController";

export function initIpc(ide: IdeController) {
    ipc.on("set-text", (event, pathname, text) => ide.setText(pathname, text));
    ipc.on("next-error", () => ide.nextError());
}



