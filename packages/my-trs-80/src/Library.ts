
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
export class LibraryAddEvent {
    public readonly newFile: File;

    constructor(newFile: File) {
        this.newFile = newFile;
    }
}

/**
 * Event for modifying a file in the library.
 */
export class LibraryModifyEvent {
    public readonly oldFile: File;
    public readonly newFile: File;

    constructor(oldFile: File, newFile: File) {
        this.oldFile = oldFile;
        this.newFile = newFile;
    }
}

/**
 * Event for removing a file from the library.
 */
export class LibraryRemoveEvent {
    public readonly oldFile: File;

    constructor(oldFile: File) {
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

    /**
     * Get a file by its ID, or undefined it not in the library.
     */
    public getFile(id: string): File | undefined {
        return this.files.get(id);
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
            this.files.set(file.id, file);
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
}
