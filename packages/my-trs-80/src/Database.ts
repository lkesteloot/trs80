import firebase from "firebase/app";
import {File} from "./File";
import QuerySnapshot = firebase.firestore.QuerySnapshot;
import DocumentData = firebase.firestore.DocumentData;
import DocumentReference = firebase.firestore.DocumentReference;
import {AuthUser, User} from "./User";

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
     * Get all files for this user.
     */
    public getAllFiles(uid: string): Promise<QuerySnapshot<DocumentData>> {
        return this.firestore.collection(FILES_COLLECTION_NAME).where("uid", "==", uid).get();
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
            addedAt: firebase.firestore.Timestamp.fromDate(file.addedAt),
            modifiedAt: firebase.firestore.Timestamp.fromDate(file.modifiedAt),
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

    /**
     * Get or create a user for the given auth user.
     */
    public userFromAuthUser(authUser: AuthUser): Promise<User> {
        const docRef = this.firestore.collection(USERS_COLLECTION_NAME).doc(authUser.uid);

        return this.firestore.runTransaction(transaction => {
            return transaction.get(docRef)
                .then(doc => {
                    let user: User;

                    if (doc.exists) {
                        // User already exists. Remember when they last signed in.
                        user = authUser.toUser(doc.data() as DocumentData);

                        // TODO make delta object.
                        transaction.update(docRef, {
                            emailAddress: user.emailAddress,
                            name: user.name,
                            modifiedAt: user.modifiedAt,
                            lastActiveAt: firebase.firestore.Timestamp.fromDate(new Date()),
                        });
                    } else {
                        // User does not yet exist, create it.
                        user = authUser.toNewUser();
                        transaction.set(docRef, {
                            emailAddress: user.emailAddress,
                            name: user.name,
                            isAdmin: user.isAdmin,
                            addedAt: user.addedAt,
                            modifiedAt: user.modifiedAt,
                            lastActiveAt: user.lastActiveAt,
                        });
                    }

                    return user;
                });
        });
    }
}
