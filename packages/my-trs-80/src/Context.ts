import {Trs80} from "trs80-emulator";
import {PanelManager} from "./PanelManager";
import {Library, LibraryModifyEvent, LibraryRemoveEvent} from "./Library";
import {File} from "./File";
import {Cassette, decodeTrs80File, Trs80File} from "trs80-base";
import {User} from "./User";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {Database} from "./Database";
import {FilePanel} from "./FilePanel";
import {CasFileCassettePlayer} from "./Main";

// Exclamation marks are not allowed in DOM IDs, so this guarantees that it won't jump anywhere.
const FRAGMENT_PREFIX = "#!";

/**
 * Context of the whole app, with its global variables.
 */
export class Context {
    public readonly library: Library;
    public readonly trs80: Trs80;
    public readonly cassettePlayer: CasFileCassettePlayer;
    public readonly db: Database;
    public readonly panelManager: PanelManager;
    private _runningFile: File | undefined = undefined;
    private _user: User | undefined = undefined;
    private userResolved = false;
    public readonly onUser = new SimpleEventDispatcher<User | undefined>();
    public readonly onRunningFile = new SimpleEventDispatcher<File | undefined>();
    // Dispatched when we initially figure out if we're signed in or not.
    public readonly onUserResolved = new SimpleEventDispatcher<void>();

    constructor(library: Library, trs80: Trs80, cassettePlayer: CasFileCassettePlayer,
                db: Database, panelManager: PanelManager) {

        this.library = library;
        this.trs80 = trs80;
        this.cassettePlayer = cassettePlayer;
        this.db = db;
        this.panelManager = panelManager;

        // Listen for changes to the file we're running.
        this.library.onEvent.subscribe(event => {
            if (this._runningFile !== undefined) {
                if (event instanceof LibraryModifyEvent && event.oldFile.id === this._runningFile.id) {
                    this.runningFile = event.newFile;
                }
                if (event instanceof LibraryRemoveEvent && event.oldFile.id === this._runningFile.id) {
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
            trs80File = decodeTrs80File(file.binary, file.filename);
        }

        if (trs80File.error !== undefined) {
            // TODO
            console.error("Error in TRS-80 file: " + trs80File.error);
        } else {
            this.runningFile = file;
            if (trs80File.className === "Cassette") {
                // Always mount cassettes.
                this.cassettePlayer.setCasFile(trs80File);
            }

            this.trs80.runTrs80File(trs80File);
        }
    }

    /**
     * Mount a cassette in the player.
     */
    public mountCassette(file: File, cassette: Cassette): void {
        this.runningFile = file;
        this.cassettePlayer.setCasFile(cassette);
    }

    /**
     * Open a file panel on the given file.
     */
    public openFilePanel(file: File): void {
        const filePanel = new FilePanel(this, file);
        this.panelManager.pushPanel(filePanel);
    }

    /**
     * Get the currently-running file, if any.
     */
    get runningFile(): File | undefined {
        return this._runningFile;
    }

    /**
     * Set the currently-running file, if any.
     */
    set runningFile(file: File | undefined) {
        this._runningFile = file;
        this.onRunningFile.dispatch(file);
    }

    /**
     * Set the currently signed-in user.
     */
    set user(user: User | undefined) {
        this._user = user;
        this.onUser.dispatch(user);
        if (!this.userResolved) {
            this.userResolved = true;
            this.onUserResolved.dispatch();
        }
    }

    /**
     * Get the currently signed-in user.
     */
    get user(): User | undefined {
        return this._user;
    }

    /**
     * Return the URL fragment for this context, including the leading hash.
     */
    public getFragment(): string {
        const parts: string[] = [];

        if (this._runningFile !== undefined) {
            parts.push("runFile=" + this._runningFile.id);
        }

        const fragment = parts.join(",");

        return fragment === "" ? "" : FRAGMENT_PREFIX + fragment;
    }

    /**
     * Returns a map of variables in the fragment. Every value array will have at least one element.
     */
    public static parseFragment(fragment: string): Map<string,string[]> {
        const args = new Map<string,string[]>();

        if (fragment.startsWith(FRAGMENT_PREFIX)) {
            fragment = fragment.substr(FRAGMENT_PREFIX.length);

            const parts = fragment.split(",");
            for (const part of parts) {
                const subparts = part.split("=");
                if (subparts.length !== 2) {
                    console.error(`Fragment part "${part}" is malformed.`);
                } else {
                    const key = subparts[0];
                    const value = subparts[1];
                    let values = args.get(key);
                    if (values === undefined) {
                        values = [];
                        args.set(key, values);
                    }
                    values.push(value);
                }
            }
        }

        return args;
    }
}
