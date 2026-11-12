/**
 * The causes of a {@link DiskError} that a caller may want to tell apart without reading the message,
 * such as a front end that greys out a button, or the tool's exit status. Only errors whose cause is
 * clear get a kind other than {@link DiskErrorKind.GENERAL}.
 */
export enum DiskErrorKind {
    /** Anything not listed below. */
    GENERAL,

    /** A host file, the image, a partition, or a file on the disk isn't there. */
    NOT_FOUND,

    /**
     * The disk can't be written for a reason other than write protection or damage alone: we have no writer or
     * no DOS rules for it, its layout is in doubt, or several of these reasons apply.
     */
    READ_ONLY,

    /** The image is write-protected, and that's the only thing in the way (--force writes anyway). */
    WRITE_PROTECTED,

    /** The file system is damaged, and that's the only thing in the way ("repair" may fix it). */
    DAMAGED,

    /** There's no room for the file: too few free granules, or no free directory entries. */
    DISK_FULL,
}

/**
 * An error to show the user, as opposed to a bug: the disk can't be opened, a file isn't there, the
 * disk can't be written, and so on. The message is complete and ready to print.
 */
export class DiskError extends Error {
    /** What caused the error, if it's one that callers may want to act on. */
    public readonly kind: DiskErrorKind;

    /**
     * @param message the complete message to show the user.
     * @param kind what caused the error.
     */
    constructor(message: string, kind: DiskErrorKind = DiskErrorKind.GENERAL) {
        super(message);
        this.name = "DiskError";
        this.kind = kind;
    }
}
