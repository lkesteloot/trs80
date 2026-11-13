import {assertNever} from "z80-base";
import type {DiskSession} from "trs80-disk";

/**
 * What saving an open disk does.
 */
export enum SaveKind {
    /** Write the bytes back through the file handle that the browser gave us. */
    WRITE_BACK,
    /** Download the bytes as a file, since there's no handle to write through. */
    DOWNLOAD,
}

/**
 * The name of a save kind, for a page to show (such as on the Save button's tooltip).
 */
export function saveKindToString(kind: SaveKind): string {
    switch (kind) {
        case SaveKind.WRITE_BACK:
            return "write back";
        case SaveKind.DOWNLOAD:
            return "download";
        default:
            assertNever(kind);
    }
}

/** The ID given to the next open disk. */
let nextDiskId = 1;

/**
 * One disk that's open in a page: its session, a name to show, and where saving goes.
 */
export class OpenDisk {
    /** A number that no other open disk of this page load has, for keying views and the like. */
    public readonly id: number;
    /** The disk's session, which holds its image and its undo history. */
    public readonly session: DiskSession;
    private currentName: string;
    private currentHandle: FileSystemFileHandle | undefined;
    private readonly listeners: (() => void)[] = [];
    private readonly stopWatchingSession: () => void;

    /**
     * @param session the disk's session.
     * @param name the name to show, which is also the name that a download gets.
     * @param handle the handle that the browser gave for the file, or undefined if it gave none.
     */
    constructor(session: DiskSession, name: string, handle?: FileSystemFileHandle | undefined) {
        this.id = nextDiskId++;
        this.session = session;
        this.currentName = name;
        this.currentHandle = handle;
        this.stopWatchingSession = session.onChange(() => this.notify());
    }

    /**
     * The name to show, which a download is saved under.
     */
    public get name(): string {
        return this.currentName;
    }

    /**
     * The file handle that saving writes through, or undefined if there is none.
     */
    public get handle(): FileSystemFileHandle | undefined {
        return this.currentHandle;
    }

    /**
     * What saving does: write back if there's a handle, and otherwise download.
     */
    public get saveKind(): SaveKind {
        return this.currentHandle === undefined ? SaveKind.DOWNLOAD : SaveKind.WRITE_BACK;
    }

    /**
     * Change the name and handle, as after "Save as". Listeners are told.
     *
     * @param name the new name.
     * @param handle the new handle, or undefined for none.
     */
    public setFile(name: string, handle: FileSystemFileHandle | undefined): void {
        this.currentName = name;
        this.currentHandle = handle;
        this.notify();
    }

    /**
     * Ask to be told whenever something about the disk changes: anything that its session announces, and
     * a new name or handle.
     *
     * @param listener called after each change.
     * @returns a function that removes the listener.
     */
    public onChange(listener: () => void): () => void {
        this.listeners.push(listener);

        return () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        };
    }

    /**
     * Stop following the session. Call this when the disk is closed.
     */
    public dispose(): void {
        this.stopWatchingSession();
        this.listeners.length = 0;
    }

    /**
     * Tell the listeners that something changed. A listener that throws doesn't stop the others.
     */
    private notify(): void {
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch (e) {
                console.error("Error in an open disk change listener:", e);
            }
        }
    }
}
