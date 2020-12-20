import {Trs80} from "trs80-emulator";
import {PanelManager} from "./PanelManager";
import {Library, LibraryModifyEvent, LibraryRemoveEvent} from "./Library";
import {File} from "./File";
import {decodeTrs80File, Trs80File} from "trs80-base";
import {User} from "./User";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {Database} from "./Database";
import {FilePanel} from "./FilePanel";

/**
 * Context of the whole app, with its global variables.
 */
export class Context {
    public readonly library: Library;
    public readonly trs80: Trs80;
    public readonly db: Database;
    public readonly panelManager: PanelManager;
    public runningFile: File | undefined = undefined;
    private _user: User | undefined = undefined;
    public readonly onUser = new SimpleEventDispatcher<User | undefined>();

    constructor(library: Library, trs80: Trs80, db: Database, panelManager: PanelManager) {
        this.library = library;
        this.trs80 = trs80;
        this.db = db;
        this.panelManager = panelManager;

        // Listen for changes to the file we're running.
        this.library.onEvent.subscribe(event => {
            if (this.runningFile !== undefined) {
                if (event instanceof LibraryModifyEvent && event.oldFile.id === this.runningFile.id) {
                    this.runningFile = event.newFile;
                }
                if (event instanceof LibraryRemoveEvent && event.oldFile.id === this.runningFile.id) {
                    this.runningFile = undefined;
                }
            }
        });
    }

    /**
     * Run a program.
     */
    public runProgram(file: File, trs80File?: Trs80File): void {
        if (trs80File === undefined) {
            trs80File = decodeTrs80File(file.binary);
        }

        if (trs80File.error !== undefined) {
            // TODO
        } else {
            this.runningFile = file;
            this.trs80.runTrs80File(trs80File);
        }
    }

    /**
     * Open a file panel on the given file.
     */
    public openFilePanel(file: File): void {
        const filePanel = new FilePanel(this, file);
        this.panelManager.pushPanel(filePanel);
    }

    /**
     * Set the currently signed-in user.
     */
    set user(user: User | undefined) {
        this._user = user;
        this.onUser.dispatch(user);
    }

    /**
     * Get the currently signed-in user.
     */
    get user(): User | undefined {
        return this._user;
    }
}
