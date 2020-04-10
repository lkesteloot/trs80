
import IdeController from "./IdeController";

const ipcRenderer = (window as any).ipcRenderer;

export function initIpc(ide: IdeController) {
    ipcRenderer.on("set-text", (event: any, pathname: string, text: string) => ide.setText(pathname, text));
    ipcRenderer.on("next-error", () => ide.nextError());
}
