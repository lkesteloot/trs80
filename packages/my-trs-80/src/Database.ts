import {File, FileBuilder} from "./File";
import {
    addDoc,
    Bytes,
    collection,
    CollectionReference,
    deleteDoc,
    doc,
    DocumentData,
    DocumentReference,
    Firestore,
    getDoc,
    getDocs,
    query,
    QuerySnapshot,
    runTransaction,
    setDoc,
    Timestamp,
    where
} from "firebase/firestore";
import {AuthUser, User} from "./User";

/**
 * Interface to the Firestore data.
 */
export class Database {
    private readonly firestore: Firestore;
    private readonly filesCollection:  CollectionReference<DocumentData, DocumentData>;
    private readonly usersCollection:  CollectionReference<DocumentData, DocumentData>;

    constructor(firestore: Firestore) {
        this.firestore = firestore;
        this.filesCollection = collection(this.firestore, "files");
        this.usersCollection = collection(this.firestore, "users");
    }

    /**
     * Get all files for this user.
     */
    public getAllFiles(uid: string): Promise<QuerySnapshot<DocumentData>> {
        return getDocs(query(this.filesCollection, where("uid", "==", uid)));
    }

    /**
     * Get a file by its ID. Rejects without argument if can't be found or has insufficient permission.
     */
    public async getFile(fileId: string): Promise<File> {
        try {
            const d = await getDoc(doc(this.filesCollection, fileId));
            if (d.exists()) {
                return FileBuilder.fromDoc(d).build();
            }
        } catch (e: any) {
            console.error(`Can't get file ${fileId}`, e);
            throw e;
        }

        // I don't know when this can happen because both missing and non-shared
        // files show up in the catch clause.
        throw new Error("can't get file " + fileId);
    }

    /**
     * Add a file to the database.
     */
    public addFile(file: File): Promise<DocumentReference<DocumentData>> {
        return addDoc(this.filesCollection, {
            uid: file.uid,
            name: file.name,
            filename: file.filename,
            note: file.note,
            author: file.author,
            releaseYear: file.releaseYear,
            shared: file.shared,
            tags: file.tags,
            hash: file.hash,
            binary: Bytes.fromUint8Array(file.binary),
            addedAt: Timestamp.fromDate(file.addedAt),
            modifiedAt: Timestamp.fromDate(file.modifiedAt),
        });
    }

    /**
     * Updates an existing file in the database. Both files should have the same ID.
     */
    public updateFile(oldFile: File, newFile: File): Promise<void> {
        if (oldFile.id !== newFile.id) {
            throw new Error("File IDs must match in updateFile");
        }

        return setDoc(doc(this.filesCollection, oldFile.id),
            newFile.getUpdateDataComparedTo(oldFile), {
                merge: true,
            });
    }

    /**
     * Deletes a file in the database.
     */
    public deleteFile(file: File): Promise<void> {
        return deleteDoc(doc(this.filesCollection, file.id));
    }

    /**
     * Get or create a user for the given auth user.
     */
    public async userFromAuthUser(authUser: AuthUser): Promise<User> {
        const docRef = doc(this.usersCollection, authUser.uid);

        return await runTransaction(this.firestore, async transaction => {
            let user: User;

            const d = await transaction.get(docRef);
            if (d.exists()) {
                // User already exists. Remember when they last signed in.
                user = authUser.toUser(d.data() as DocumentData);

                // TODO make delta object.
                transaction.update(docRef, {
                    emailAddress: user.emailAddress,
                    name: user.name,
                    modifiedAt: user.modifiedAt,
                    lastActiveAt: Timestamp.fromDate(new Date()),
                });
            } else {
                // User does not yet exist, create it.
                user = authUser.toNewUser();
                transaction.set(docRef, {
                    emailAddress: user.emailAddress,
                    name: user.name,
                    admin: user.admin,
                    addedAt: user.addedAt,
                    modifiedAt: user.modifiedAt,
                    lastActiveAt: user.lastActiveAt,
                });
            }

            return user;
        });
    }
}
