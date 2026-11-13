import type {FileRow} from "../FileRows.js";
import type {PreviewFile} from "./Previews.js";

/**
 * The preview input for a file listing's row, which both pages use.
 *
 * @param row the file.
 */
export function previewFileOf(row: FileRow): PreviewFile {
    return {
        name: row.hostName,
        binary: row.bytes,
        trs80File: row.trs80File,
        hostText: row.extractBytes !== row.bytes ? row.extractBytes : undefined,
    };
}
