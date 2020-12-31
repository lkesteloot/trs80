import firebase from "firebase/app";
import DocumentData = firebase.firestore.DocumentData;
import UpdateData = firebase.firestore.UpdateData;
import {isSameStringArray} from "./Utils";
import DocumentSnapshot = firebase.firestore.DocumentSnapshot;
import * as base64js from "base64-js";
import {sha1} from "./sha1";

/**
 * Represents a file that the user owns.
 */
export class File {
    public readonly id: string;
    public readonly uid: string;
    public readonly name: string;
    public readonly filename: string;
    public readonly note: string;
    public readonly author: string;
    public readonly releaseYear: string;
    public readonly shared: boolean;
    public readonly hash: string;
    public readonly screenshots: string[]; // Don't modify this, treat as immutable.
    public readonly binary: Uint8Array;
    public readonly addedAt: Date;
    public readonly modifiedAt: Date;

    constructor(id: string, uid: string, name: string, filename: string, note: string,
                author: string, releaseYear: string, shared: boolean, hash: string,
                screenshots: string[], binary: Uint8Array, addedAt: Date, modifiedAt: Date) {

        this.id = id;
        this.uid = uid;
        this.name = name;
        this.filename = filename;
        this.note = note;
        this.author = author;
        this.releaseYear = releaseYear;
        this.shared = shared;
        this.hash = hash;
        this.screenshots = screenshots;
        this.binary = binary;
        this.addedAt = addedAt;
        this.modifiedAt = modifiedAt;
    }

    /**
     * Return the file as an object that can be converted to JSON and exported.
     */
    public asMap(): {[key: string]: any} {
        return {
            id: this.id,
            uid: this.uid,
            name: this.name,
            filename: this.filename,
            note: this.note,
            author: this.author,
            releaseYear: this.releaseYear,
            shared: this.shared,
            hash: this.hash,
            screenshots: this.screenshots,
            binary: base64js.fromByteArray(this.binary),
            addedAt: this.addedAt.getTime(),
            modifiedAt: this.modifiedAt.getTime(),
        };
    }

    public builder(): FileBuilder {
        const builder = new FileBuilder();

        builder.id = this.id;
        builder.uid = this.uid;
        builder.name = this.name;
        builder.filename = this.filename;
        builder.note = this.note;
        builder.author = this.author;
        builder.releaseYear = this.releaseYear;
        builder.shared = this.shared;
        builder.hash = this.hash;
        builder.screenshots = this.screenshots;
        builder.binary = this.binary;
        builder.addedAt = this.addedAt;
        builder.modifiedAt = this.modifiedAt;

        return builder;
    }

    /**
     * Returns a Firestore update object to convert oldFile to this.
     */
    public getUpdateDataComparedTo(oldFile: File): UpdateData {
        const updateData: UpdateData = {};

        if (this.name !== oldFile.name) {
            updateData.name = this.name;
        }
        if (this.filename !== oldFile.filename) {
            updateData.filename = this.filename;
        }
        if (this.note !== oldFile.note) {
            updateData.note = this.note;
        }
        if (this.author !== oldFile.author) {
            updateData.author = this.author;
        }
        if (this.releaseYear !== oldFile.releaseYear) {
            updateData.releaseYear = this.releaseYear;
        }
        if (this.shared !== oldFile.shared) {
            updateData.shared = this.shared;
        }
        if (this.hash !== oldFile.hash) {
            updateData.hash = this.hash;
        }
        if (!isSameStringArray(this.screenshots, oldFile.screenshots)) {
            updateData.screenshots = this.screenshots;
        }
        if (this.modifiedAt.getTime() !== oldFile.modifiedAt.getTime()) {
            updateData.modifiedAt = this.modifiedAt;
        }

        return updateData;
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
    public id = "";
    public uid = "";
    public name = "";
    public filename = "";
    public note = "";
    public author = "";
    public releaseYear = "";
    public shared = false;
    public hash = "";
    public screenshots: string[] = [];
    public binary = new Uint8Array(0);
    public addedAt = new Date();
    public modifiedAt = new Date();

    public static fromDoc(doc: DocumentSnapshot<DocumentData>): FileBuilder {
        const builder = new FileBuilder();
        builder.id = doc.id;

        // Assume data() is valid, either because it's a query or because we checked "exists".
        const data = doc.data() as DocumentData;
        builder.uid = data.uid;
        builder.name = data.name;
        builder.filename = data.filename;
        builder.note = data.note;
        builder.author = data.author ?? "";
        builder.releaseYear = data.releaseYear ?? "";
        builder.shared = data.shared ?? false;
        builder.hash = data.hash;
        builder.screenshots = data.screenshots ?? [];
        builder.binary = (data.binary as firebase.firestore.Blob).toUint8Array();
        builder.addedAt = (data.addedAt as firebase.firestore.Timestamp).toDate();
        builder.modifiedAt = (data.modifiedAt as firebase.firestore.Timestamp).toDate();

        return builder;
    }

    public withId(id: string): this {
        this.id = id;
        return this;
    }

    public withUid(uid: string): this {
        this.uid = uid;
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

    public withAuthor(author: string): this {
        this.author = author;
        return this;
    }

    public withReleaseYear(releaseYear: string): this {
        this.releaseYear = releaseYear;
        return this;
    }

    public withShared(shared: boolean): this {
        this.shared = shared;
        return this;
    }

    public withScreenshots(screenshots: string[]): this {
        this.screenshots = screenshots;
        return this;
    }

    public withBinary(binary: Uint8Array): this {
        this.binary = binary;
        this.hash = sha1(binary);
        return this;
    }

    public withModifiedAt(modifiedAt: Date): this {
        this.modifiedAt = modifiedAt;
        return this;
    }

    public build(): File {
        return new File(this.id, this.uid, this.name, this.filename, this.note,
            this.author, this.releaseYear, this.shared, this.hash,
            this.screenshots, this.binary, this.addedAt, this.modifiedAt);
    }
}
