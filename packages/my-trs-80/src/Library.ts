
import {File} from "./File";
import {SimpleEventDispatcher} from "strongly-typed-events";

/**
 * Base class for library event classes.
 */
export class LibraryEvent {
    /* Nothing */
}

/**
 * Event for adding a file to the library.
 */
export class LibraryAddEvent extends LibraryEvent {
    public readonly newFile: File;

    constructor(newFile: File) {
        super();
        this.newFile = newFile;
    }
}

/**
 * Event for modifying a file in the library.
 */
export class LibraryModifyEvent extends LibraryEvent {
    public readonly oldFile: File;
    public readonly newFile: File;

    constructor(oldFile: File, newFile: File) {
        super();
        this.oldFile = oldFile;
        this.newFile = newFile;
    }
}

/**
 * Event for removing a file from the library.
 */
export class LibraryRemoveEvent extends LibraryEvent {
    public readonly oldFile: File;

    constructor(oldFile: File) {
        super();
        this.oldFile = oldFile;
    }
}

/**
 * Keep track of all the files in the user's library. This should be a mirror of the contents
 * of the database in the cloud.
 */
export class Library {
    // Map from ID to file.
    private readonly files = new Map<string,File>();
    // Fires after the map has been updated.
    public readonly onEvent = new SimpleEventDispatcher<LibraryEvent>();
    public inSync = false;
    // Whether the library is in sync with the cloud database. This starts out false
    // and emits a "true" once the first fetch has completed.
    public readonly onInSync = new SimpleEventDispatcher<boolean>();
    // Map from hash string to count of files with that hash, to find duplicates.
    public readonly hashCount = new Map<string,number>();

    /**
     * Get a file by its ID, or undefined it not in the library.
     */
    public getFile(id: string): File | undefined {
        return this.files.get(id);
    }

    /**
     * Return all the files we currently know about.
     */
    public getAllFiles(): File[] {
        return Array.from(this.files.values());
    }

    /**
     * Specify whether the in-memory library is now in sync with the cloud database.
     */
    public setInSync(inSync: boolean): void {
        this.inSync = inSync;
        this.onInSync.dispatch(inSync);
    }

    /**
     * Add a file to the library.
     */
    public addFile(file: File): void {
        if (this.files.has(file.id)) {
            console.error("Library.add(): Library already has file with ID " + file.id);
            this.modifyFile(file);
        } else {
            this.files.set(file.id, file);
            this.incrementHash(file.hash);
            this.onEvent.dispatch(new LibraryAddEvent(file));
        }
    }

    /**
     * Modify a file already in the library.
     */
    public modifyFile(file: File): void {
        const oldFile = this.files.get(file.id);

        if (oldFile === undefined) {
            console.error("Library.modify(): Library does not have file with ID " + file.id);
        } else {
            this.decrementHash(oldFile.hash);
            this.files.set(file.id, file);
            this.incrementHash(file.hash);
            this.onEvent.dispatch(new LibraryModifyEvent(oldFile, file));
        }
    }

    /**
     * Remove a file from the library.
     */
    public removeFile(file: File): void {
        const oldFile = this.files.get(file.id);

        if (oldFile === undefined) {
            console.error("Library.remove(): Library does not have file with ID " + file.id);
        } else {
            // Here we assume that file and oldFile are the same. We could check, or we could just
            // have the caller pass in a file ID.
            this.files.delete(file.id);
            this.decrementHash(oldFile.hash);
            this.onEvent.dispatch(new LibraryRemoveEvent(oldFile));
        }
    }

    /**
     * Remove all files from the library. One event will be triggered per file.
     */
    public removeAll(): void {
        // Make a separate list first since we'll be modifying the map as we go.
        const files: File[] = [];
        for (const file of this.files.values()) {
            files.push(file);
        }

        // Then delete each.
        for (const file of files) {
            this.removeFile(file);
        }
    }

    /**
     * Whether this file has a duplicate file (hash) in the library.
     */
    public isDuplicate(file: File): boolean {
        return (this.hashCount.get(file.hash) ?? 0) > 1;
    }

    /**
     * Increment the count for the given hash.
     */
    private incrementHash(hash: string): void {
        this.hashCount.set(hash, (this.hashCount.get(hash) ?? 0) + 1);
    }

    /**
     * Decrement the count for the given hash.
     */
    private decrementHash(hash: string): void {
        let count = this.hashCount.get(hash) ?? 0;
        if (count < 1) {
            // Coding error.
            throw new Error("hash count for " + hash + " is " + count);
        }
        this.hashCount.set(hash, count - 1);
    }
}
