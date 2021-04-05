import firebase from "firebase/app";
import {isSameStringArray, TRASH_TAG} from "./Utils";
import * as base64js from "base64-js";
import {sha1} from "./Sha1";
import {TagSet} from "./TagSet";
import DocumentData = firebase.firestore.DocumentData;
import DocumentSnapshot = firebase.firestore.DocumentSnapshot;
import {BasicProgram, Cassette, decodeTrs80File, setBasicName} from "trs80-base";
type UpdateData = firebase.firestore.UpdateData;

// What's considered a "new" file.
const NEW_TIME_MS = 60*60*24*7*1000;

// Prefix for version of hash. Increment this number when the hash algorithm changes.
const HASH_PREFIX = "1:";

/**
 * Return whether the test string starts with the filter prefix.
 */
function prefixMatches(testString: string, filterPrefix: string): boolean {
    return testString.substr(0, filterPrefix.length).localeCompare(filterPrefix, undefined, {
        usage: "search",
        sensitivity: "base",
    }) === 0;
}

/**
 * Return whether any word in the test string starts with the filter prefix.
 */
function prefixMatchesAnyWord(testString: string, filterPrefix: string): boolean {
    return testString.split(/\W+/).some(word => prefixMatches(word, filterPrefix));
}

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
    public readonly tags: string[]; // Don't modify this, treat as immutable. Always sorted alphabetically.
    public readonly hash: string;
    public readonly isDeleted: boolean;
    public readonly screenshots: string[]; // Don't modify this, treat as immutable.
    public readonly binary: Uint8Array;
    public readonly addedAt: Date;
    public readonly modifiedAt: Date;

    constructor(id: string, uid: string, name: string, filename: string, note: string,
                author: string, releaseYear: string, shared: boolean, tags: string[], hash: string,
                screenshots: string[], binary: Uint8Array, addedAt: Date, modifiedAt: Date) {

        this.id = id;
        this.uid = uid;
        this.name = name;
        this.filename = filename;
        this.note = note;
        this.author = author;
        this.releaseYear = releaseYear;
        this.shared = shared;
        this.tags = [...tags].sort(); // Guarantee it's sorted.
        this.isDeleted = this.tags.indexOf(TRASH_TAG) >= 0;
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
            tags: this.tags,
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
        builder.tags = this.tags;
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
        if (!isSameStringArray(this.tags, oldFile.tags)) {
            updateData.tags = this.tags;
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
     * Get all tags, both stored in the file and the automatically created ones.
     * TODO could cache this, assume the auto ones don't change over time. The "new" would
     * change but not much.
     */
    public getAllTags(): TagSet {
        const allTags = new TagSet();

        if (this.shared) {
            allTags.add("Shared");
        }
        const now = Date.now();
        if (now - this.addedAt.getTime() < NEW_TIME_MS) {
            allTags.add("New");
        }

        // TODO better extension algorithm.
        const i = this.filename.lastIndexOf(".");
        if (i > 0) {
            allTags.add(this.filename.substr(i + 1).toUpperCase());
        }

        if (this.note === "") {
            allTags.add("Missing note");
        }
        if (this.screenshots.length === 0) {
            allTags.add("Missing screenshot");
        }

        allTags.add(...this.tags);

        return allTags;
    }

    /**
     * Whether this file would match the specified filter prefix.
     */
    public matchesFilterPrefix(filterPrefix: string): boolean {
        // Always match empty string.
        if (filterPrefix === "") {
            return true;
        }

        // Check various fields.
        if (prefixMatchesAnyWord(this.name, filterPrefix)) {
            return true;
        }
        if (prefixMatches(this.filename, filterPrefix)) {
            return true;
        }
        if (prefixMatchesAnyWord(this.note, filterPrefix)) {
            return true;
        }
        if (prefixMatchesAnyWord(this.author, filterPrefix)) {
            return true;
        }

        return false;
    }

    /**
     * Whether the hash was computed with an outdated algorithm.
     */
    public isOldHash(): boolean {
        return !this.hash.startsWith(HASH_PREFIX);
    }

    /**
     * Compare two files for sorting.
     */
    public static compare(a: File, b: File): number {
        // Primary sort by name.
        let cmp = a.name.localeCompare(b.name, undefined, {
            usage: "sort",
            sensitivity: "base",
            ignorePunctuation: true,
            numeric: true,
        });
        if (cmp !== 0) {
            return cmp;
        }

        // Secondary sort is filename.
        cmp = a.filename.localeCompare(b.filename, undefined, {
            usage: "sort",
            numeric: true,
        });
        if (cmp !== 0) {
            return cmp;
        }

        // Break ties with ID so the sort is stable.
        return a.id.localeCompare(b.id);
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
    public tags: string[] = [];
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
        builder.tags = data.tags ?? [];
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

    public withTags(tags: string[]): this {
        this.tags = tags;
        return this;
    }

    public withScreenshots(screenshots: string[]): this {
        this.screenshots = screenshots;
        return this;
    }

    public withBinary(binary: Uint8Array): this {
        this.binary = binary;

        // We used to do the raw binary, but that doesn't catch some irrelevant changes, like differences
        // in CAS header or the Basic name. So decode the binary and see if we can zero out the differences.
        // This might create an unfortunate preference for setting the filename first.
        let trs80File = decodeTrs80File(binary, this.filename);

        // Pull the program out of the cassette.
        if (trs80File.className === "Cassette") {
            if (trs80File.files.length > 0) {
                trs80File = trs80File.files[0].file;
                binary = trs80File.binary;
            }
        }

        // Clear out the Basic name.
        if (trs80File.className === "BasicProgram") {
            binary = setBasicName(binary, "A");
        }

        // Prefix with version number.
        this.hash = HASH_PREFIX + sha1(binary);
        return this;
    }

    public withModifiedAt(modifiedAt: Date): this {
        this.modifiedAt = modifiedAt;
        return this;
    }

    public build(): File {
        return new File(this.id, this.uid, this.name, this.filename, this.note,
            this.author, this.releaseYear, this.shared, this.tags, this.hash,
            this.screenshots, this.binary, this.addedAt, this.modifiedAt);
    }
}
