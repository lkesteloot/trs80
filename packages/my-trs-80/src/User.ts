
/**
 * Represents a user, both basic data such as ID, as well as user preferences.
 */
export class User {
    public readonly uid: string;

    constructor(uid: string) {
        this.uid = uid;
    }
}
