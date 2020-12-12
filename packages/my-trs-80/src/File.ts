import firebase from "firebase/app";
import {isCmdProgram} from "trs80-base";
import QueryDocumentSnapshot = firebase.firestore.QueryDocumentSnapshot;
import DocumentData = firebase.firestore.DocumentData;

/**
 * Represents a file that the user owns.
 */
export class File {
    public readonly id: string;
    public readonly uid: string;
    public readonly name: string;
    public readonly filename: string;
    public readonly note: string;
    public readonly shared: boolean;
    public readonly hash: string;
    public readonly screenshots: string[]; // Don't modify this, treat as immutable.
    public readonly binary: Uint8Array;
    public readonly dateAdded: Date;
    public readonly dateModified: Date;

    constructor(id: string, uid: string, name: string, filename: string, note: string, shared: boolean, hash: string,
                screenshots: string[], binary: Uint8Array, dateAdded: Date, dateModified: Date) {

        this.id = id;
        this.uid = uid;
        this.name = name;
        this.filename = filename;
        this.note = note;
        this.shared = shared;
        this.hash = hash;
        this.screenshots = screenshots;
        this.binary = binary;
        this.dateAdded = dateAdded;
        this.dateModified = dateModified;
    }

    public builder(): FileBuilder {
        const builder = new FileBuilder();

        builder.id = this.id;
        builder.uid = this.uid;
        builder.name = this.name;
        builder.filename = this.filename;
        builder.note = this.note;
        builder.shared = this.shared;
        builder.hash = this.hash;
        builder.screenshots = this.screenshots;
        builder.binary = this.binary;
        builder.dateAdded = this.dateAdded;
        builder.dateModified = this.dateModified;

        return builder;
    }

    /**
     * Get the type of the file as a string.
     */
    public getType(): string {
        if (isCmdProgram(this.binary)) {
            return "CMD program";
        } else {
            return "Unknown type";
        }
    }

    /**
     * Compare two files for sorting.
     */
    public static compare(a: File, b: File): number {
        // Primary sort by name.
        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        }

        // Break ties with ID so the sort is stable.
        if (a.id < b.id) {
            return -1;
        } else if (a.id > b.id) {
            return 1;
        } else {
            // Shouldn't happen.
            return 0;
        }
    }
}

/**
 * Builder to help construct File objects.
 */
export class FileBuilder {
    public id: string = "";
    public uid: string = "";
    public name: string = "";
    public filename: string = "";
    public note: string = "";
    public shared: boolean = false;
    public hash: string = "";
    public screenshots: string[] = [];
    public binary: Uint8Array = new Uint8Array(0);
    public dateAdded: Date = new Date();
    public dateModified: Date = new Date();

    public static fromDoc(doc: QueryDocumentSnapshot<DocumentData>): FileBuilder {
        const builder = new FileBuilder();
        builder.id = doc.id;

        const data = doc.data();
        builder.uid = data.uid;
        builder.name = data.name;
        builder.filename = data.filename;
        builder.note = data.note;
        builder.shared = data.shared ?? false;
        builder.hash = data.hash;
        builder.screenshots = data.screenshots ?? [];
        builder.binary = (data.binary as firebase.firestore.Blob).toUint8Array();
        builder.dateAdded = (data.dateAdded as firebase.firestore.Timestamp).toDate();
        builder.dateModified = (data.dateModified as firebase.firestore.Timestamp).toDate();

        return builder;
    }

    public withId(id: string): this {
        this.id = id;
        return this;
    }

    public withName(name: string): this {
        this.name = name;
        return this;
    }

    public withFilename(filename: string): this {
        this.filename = filename;
        return this;
    }

    public withNote(note: string): this {
        this.note = note;
        return this;
    }

    public withScreenshots(screenshots: string[]): this {
        this.screenshots = screenshots;
        return this;
    }

    public withBinary(binary: Uint8Array): this {
        this.binary = binary;
        return this;
    }

    public withDateModified(dateModified: Date): this {
        this.dateModified = dateModified;
        return this;
    }

    public build(): File {
        return new File(this.id, this.uid, this.name, this.filename, this.note, this.shared, this.hash,
            this.screenshots, this.binary, this.dateAdded, this.dateModified);
    }
}
