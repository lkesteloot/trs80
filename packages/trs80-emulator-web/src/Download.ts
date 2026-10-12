/**
 * How long to keep a download's object URL before freeing it. The browser may take a while to
 * start the download, and freeing the URL first would fail it, so this is generous. At worst
 * it keeps the data in memory a little longer.
 */
const DOWNLOAD_URL_LIFETIME_MS = 10_000;

/**
 * Have the browser download the blob as a file with the given name.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => window.URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}
