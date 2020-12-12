import {Trs80} from "trs80-emulator";
import firebase from "firebase/app";
import {PanelManager} from "./PanelManager";
import {Library} from "./Library";
import {File} from "./File";
import {CmdProgram} from "trs80-base";

/**
 * Context of the whole app, with its global variables.
 */
export class Context {
    public readonly library: Library;
    public readonly trs80: Trs80;
    public readonly db: firebase.firestore.Firestore;
    public readonly panelManager: PanelManager;
    public runningFile: File | undefined = undefined;

    constructor(library: Library, trs80: Trs80, db: firebase.firestore.Firestore, panelManager: PanelManager) {
        this.library = library;
        this.trs80 = trs80;
        this.db = db;
        this.panelManager = panelManager;
    }

    /**
     * Run a program.
     */
    public runProgram(file: File): void {
        const cmdProgram = new CmdProgram(file.binary);
        if (cmdProgram.error !== undefined) {
            // TODO
        } else {
            this.runningFile = file;
            this.trs80.runCmdProgram(cmdProgram);
        }
    }
}
