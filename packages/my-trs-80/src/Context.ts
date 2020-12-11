import {Trs80} from "trs80-emulator";
import firebase from "firebase";
import {PanelManager} from "./PanelManager";
import {Library} from "./Library";

/**
 * Context of the whole app, with its global variables.
 */
export class Context {
    public readonly library: Library;
    public readonly trs80: Trs80;
    public readonly db: firebase.firestore.Firestore;
    public readonly panelManager: PanelManager;

    constructor(library: Library, trs80: Trs80, db: firebase.firestore.Firestore, panelManager: PanelManager) {
        this.library = library;
        this.trs80 = trs80;
        this.db = db;
        this.panelManager = panelManager;
    }
}
