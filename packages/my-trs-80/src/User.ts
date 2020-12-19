import firebase from "firebase/app";
import DocumentData = firebase.firestore.DocumentData;

/**
 * The user from the perspective of the auth system.
 */
export class AuthUser {
    public readonly uid: string;
    public readonly emailAddress: string;
    public readonly name: string;

    constructor(uid: string, emailAddress: string, name: string) {
        this.uid = uid;
        this.emailAddress = emailAddress;
        this.name = name;
    }

    /**
     * Upgrade an authdata to a full user based on data from the database.
     */
    public toUser(data: DocumentData): User {
        const changed = this.emailAddress !== data.emailAddress || this.name !== data.name;

        return new User(
            this.uid,
            this.emailAddress,
            this.name,
            data.isAdmin,
            data.addedAt,
            changed ? new Date() : data.modifiedAt,
            data.lastActiveAt);
    }

    /**
     * Promote a new auth user to a full user.
     */
    public toNewUser(): User {
        const now = new Date();

        return new User(
            this.uid,
            this.emailAddress,
            this.name,
            false,
            now,
            now,
            now);
    }

    /**
     * Make a new AuthUser from a Firebase user.
     */
    public static fromFirebaseUser(firebaseUser: firebase.User): AuthUser {
        return new AuthUser(firebaseUser.uid,
            firebaseUser.email ?? "",
            firebaseUser.displayName ?? "");
    }
}

/**
 * Represents a user in our database, both basic data such as ID, as well as user preferences.
 */
export class User extends AuthUser {
    public readonly isAdmin: boolean;
    public readonly addedAt: Date;
    public readonly modifiedAt: Date;
    public readonly lastActiveAt: Date;

    constructor(uid: string, emailAddress: string, name: string, isAdmin: boolean,
                addedAt: Date, modifiedAt: Date, lastActiveAt: Date) {

        super(uid, emailAddress, name);

        this.isAdmin = isAdmin;
        this.addedAt = addedAt;
        this.modifiedAt = modifiedAt;
        this.lastActiveAt = lastActiveAt;
    }
}
