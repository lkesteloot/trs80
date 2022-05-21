
export class ScreenshotSection {
    // All line numbers are 1-based.
    public readonly beginCommentLineNumber: number;
    public readonly endCommentLineNumber: number | undefined;
    public readonly firstDataLineNumber: number | undefined;
    public readonly lastDataLineNumber: number | undefined;
    public readonly byteCount: number;

    constructor(beginCommentLineNumber: number,
                endCommentLineNumber: number | undefined,
                firstDataLineNumber: number | undefined,
                lastDataLineNumber: number | undefined,
                byteCount: number) {

        this.beginCommentLineNumber = beginCommentLineNumber;
        this.endCommentLineNumber = endCommentLineNumber;
        this.firstDataLineNumber = firstDataLineNumber;
        this.lastDataLineNumber = lastDataLineNumber;
        this.byteCount = byteCount;
    }
}
