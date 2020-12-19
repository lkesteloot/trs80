import firebase from "firebase/app";
import {File} from "./File";
import QuerySnapshot = firebase.firestore.QuerySnapshot;
import DocumentData = firebase.firestore.DocumentData;
import DocumentReference = firebase.firestore.DocumentReference;

const FILES_COLLECTION_NAME = "files";
const USERS_COLLECTION_NAME = "users";

/**
 * Interface to the Firestore data.
 */
export class Database {
    private readonly firestore: firebase.firestore.Firestore;

    constructor(firestore: firebase.firestore.Firestore) {
        this.firestore = firestore;
    }

    /**
     * Get all files in the entire database.
     */
    public fetchAllFiles(): Promise<QuerySnapshot<DocumentData>> {
        return this.firestore.collection(FILES_COLLECTION_NAME).get();
    }

    /**
     * Add a file to the database.
     */
    public addFile(file: File): Promise<DocumentReference<DocumentData>> {
        return this.firestore.collection(FILES_COLLECTION_NAME).add({
            uid: file.uid,
            name: file.name,
            filename: file.filename,
            note: file.note,
            shared: file.shared,
            hash: file.hash,
            binary: firebase.firestore.Blob.fromUint8Array(file.binary),
            dateAdded: firebase.firestore.Timestamp.fromDate(file.dateAdded),
            dateModified: firebase.firestore.Timestamp.fromDate(file.dateModified),
        });
    }

    /**
     * Updates an existing file in the database. Both files should have the same ID.
     */
    public updateFile(oldFile: File, newFile: File): Promise<void> {
        if (oldFile.id !== newFile.id) {
            throw new Error("File IDs must match in updateFile");
        }

        return this.firestore.collection(FILES_COLLECTION_NAME).doc(oldFile.id)
            .update(newFile.getUpdateDataComparedTo(oldFile));
    }

    /**
     * Deletes a file in the database.
     */
    public deleteFile(file: File): Promise<void> {
        return this.firestore.collection(FILES_COLLECTION_NAME).doc(file.id).delete();
    }
}
