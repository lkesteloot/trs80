/**
 * An error to show the user, as opposed to a bug: the disk can't be opened, a file isn't there, the
 * disk can't be written, and so on. The message is complete and ready to print.
 */
export class DiskError extends Error {
    /**
     * @param message the complete message to show the user.
     */
    constructor(message: string) {
        super(message);
        this.name = "DiskError";
    }
}
