import zlib from "zlib";
import type {DiskTemplateSource} from "trs80-disk";
import {DATA_DISK_BOOT_SECTORS_HEX, SYSTEM_DISK_TEMPLATES_BASE64} from "./Templates.js";

/**
 * The templates that are embedded in this build of the tool (see Templates.ts), for the disk engine's
 * create, format and partition. The system disks are stored gzipped, so this needs Node's zlib.
 */
export const NODE_TEMPLATES: DiskTemplateSource = {
    /**
     * Unzip the embedded system disk of that name, or return undefined if there isn't one.
     */
    systemDisk(name: string): Uint8Array | undefined {
        const base64 = SYSTEM_DISK_TEMPLATES_BASE64[name];
        if (base64 === undefined) {
            return undefined;
        }
        return new Uint8Array(zlib.gunzipSync(Buffer.from(base64, "base64")));
    },

    /**
     * The embedded boot sectors of that name, as hex strings, or undefined if there are none.
     */
    bootSectorsHex(key: string): readonly string[] | undefined {
        return DATA_DISK_BOOT_SECTORS_HEX[key];
    },
};
