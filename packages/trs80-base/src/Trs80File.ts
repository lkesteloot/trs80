import {ProgramAnnotation} from "./ProgramAnnotation.js";

/**
 * Base class for decoded TRS-80 files.
 */
export abstract class AbstractTrs80File {
    /**
     * Field to identify which subclass we are at runtime.
     */
    public abstract readonly className: string;

    /**
     * The current binary, which is the same as the one passed to the constructor unless a
     * subclass replaces it with setBinary().
     */
    private currentBinary: Uint8Array;

    /**
     * Error encountered while decoding, if any.
     */
    public readonly error: string | undefined;

    /**
     * List of annotations from the decoding step.
     */
    public readonly annotations: ProgramAnnotation[];

    protected constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[]) {
        this.currentBinary = binary;
        this.error = error;
        this.annotations = annotations;
    }

    /**
     * The binary representing just this one file.
     */
    public get binary(): Uint8Array {
        return this.currentBinary;
    }

    /**
     * Make a different array the file's binary, for a subclass that edits itself in a way that
     * changes the binary's length.
     */
    protected setBinary(binary: Uint8Array): void {
        this.currentBinary = binary;
    }

    /**
     * Brief description (e.g., "Basic program").
     */
    public abstract getDescription(): string;
}
