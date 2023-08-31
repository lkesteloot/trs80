import { Trs80File } from "trs80-base";

/**
 * Information about each input file.
 */
export class InputFile {
    public readonly filename: string;
    public readonly trs80File: Trs80File;
    public readonly baud: number | undefined;
    public readonly date: Date | undefined;

    constructor(filename: string, trs80File: Trs80File, baud?: number, date?: Date) {
        this.filename = filename;
        this.trs80File = trs80File;
        this.baud = baud;
        this.date = date;
    }

    /**
     * Return a new InputFile but with the file replaced by the parameter.
     */
    public withFile(trs80File: Trs80File): InputFile {
        return new InputFile(this.filename, trs80File, this.baud, this.date);
    }
}
