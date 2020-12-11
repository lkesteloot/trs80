import firebase from "firebase";
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
    public readonly binary: Uint8Array;
    public readonly dateAdded: Date;
    public readonly dateModified: Date;

    constructor(doc: QueryDocumentSnapshot<DocumentData>) {
        this.id = doc.id;

        const data = doc.data();
        this.uid = data.uid;
        this.name = data.name;
        this.filename = data.filename;
        this.note = data.note;
        this.shared = data.shared ?? false;
        this.hash = data.hash;
        this.binary = (data.binary as firebase.firestore.Blob).toUint8Array();
        this.dateAdded = (data.dateAdded as firebase.firestore.Timestamp).toDate();
        this.dateModified = (data.dateModified as firebase.firestore.Timestamp).toDate();
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
