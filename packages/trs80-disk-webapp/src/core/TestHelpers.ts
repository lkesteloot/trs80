import {TrsdosFormatDos} from "trs80-base";
import type {CreateFloppyRequest} from "trs80-disk";
import {addPlanned, planAddFiles} from "./Actions.js";
import type {OpenDisk} from "./OpenDisk.js";
import {newDisk} from "./Opening.js";

// Helpers for this folder's tests.

/**
 * A "create" request for a blank LDOS 5.3 data disk, with a fixed date so that two disks are the same.
 */
export function blankLdosRequest(): CreateFloppyRequest {
    return {
        format: {dos: TrsdosFormatDos.LDOS_5_3, cylinders: undefined, sides: undefined, density: undefined,
            model: undefined, name: "TESTDISK", date: new Date(1990, 0, 2)},
        system: false,
        minimal: false,
        force: false,
    };
}

/**
 * Make a host file from text.
 *
 * @param name the file's name.
 * @param text its contents, one character per byte.
 * @param lastModified its modification time.
 */
export function textFile(name: string, text: string, lastModified = Date.UTC(2001, 5, 15, 12)): File {
    return new File([Uint8Array.from(text, c => c.charCodeAt(0))], name, {lastModified});
}

/**
 * A small CMD program: a load block of three bytes at 0x5000, then a transfer address.
 */
export function cmdFile(name: string): File {
    const bytes = new Uint8Array([0x01, 0x05, 0x00, 0x50, 0x3E, 0x01, 0xC9, 0x02, 0x02, 0x00, 0x50]);
    return new File([bytes], name, {lastModified: Date.UTC(2001, 5, 15, 12)});
}

/**
 * Make a new LDOS disk in memory.
 */
export async function makeBlankDisk(): Promise<OpenDisk> {
    return (await newDisk(blankLdosRequest())).disk;
}

/**
 * Make an LDOS disk with HELLO/BAS (a BASIC program) and PROG/CMD (a CMD program), added through the same
 * functions that a page uses. The two additions are in the disk's history.
 */
export async function makeDiskWithFiles(): Promise<OpenDisk> {
    const disk = await makeBlankDisk();
    const options = {ascii: false, binary: false, text: false, system: false, invisible: false, overwrite: false,
        date: new Date(2001, 5, 15)};
    const files = [textFile("hello.bas", "10 PRINT \"HELLO\"\n20 END\n"), cmdFile("prog.cmd")];
    const plan = await planAddFiles(disk.session, files, options);
    await addPlanned(disk.session, plan, options);
    return disk;
}
