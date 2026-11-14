import {TrsdosFormatDos} from "trs80-base";
import type {CreateFloppyRequest} from "trs80-disk";
import {addPlanned, planAddFiles, type AddActionOptions} from "../core/Actions.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {newDisk} from "../core/Opening.js";

/**
 * A short BASIC program for the sample disk.
 */
export interface SampleProgram {
    /** The host file name that it's added under, which makes its name on the disk. */
    fileName: string;
    /** The program's text, in TRS-80 Level II BASIC. */
    text: string;
}

/**
 * The name of the sample disk.
 */
export const SAMPLE_DISK_NAME = "sample.dmk";

/**
 * The programs on the sample disk: a hello, a times table, and a number-guessing game.
 */
export const SAMPLE_PROGRAMS: readonly SampleProgram[] = [
    {
        fileName: "hello.bas",
        text: [
            "10 REM HELLO, WORLD",
            "20 CLS",
            "30 PRINT \"HELLO, WORLD!\"",
            "40 FOR I=1 TO 5",
            "50 PRINT \"THIS IS LINE\";I",
            "60 NEXT I",
            "70 END",
            "",
        ].join("\n"),
    },
    {
        fileName: "times.bas",
        text: [
            "10 REM TIMES TABLE",
            "20 CLS",
            "30 INPUT \"WHICH TABLE (1-12)\";N",
            "40 IF N<1 OR N>12 THEN 30",
            "50 FOR I=1 TO 12",
            "60 PRINT N;\"X\";I;\"=\";N*I",
            "70 NEXT I",
            "80 END",
            "",
        ].join("\n"),
    },
    {
        fileName: "guess.bas",
        text: [
            "10 REM NUMBER GUESSING GAME",
            "20 CLS",
            "30 N=RND(100)",
            "40 T=0",
            "50 PRINT \"I'M THINKING OF A NUMBER FROM 1 TO 100.\"",
            "60 INPUT \"YOUR GUESS\";G",
            "70 T=T+1",
            "80 IF G<N THEN PRINT \"TOO LOW.\":GOTO 60",
            "90 IF G>N THEN PRINT \"TOO HIGH.\":GOTO 60",
            "100 PRINT \"YOU GOT IT IN\";T;\"GUESSES!\"",
            "110 END",
            "",
        ].join("\n"),
    },
];

/**
 * Make the sample disk: an LDOS 5.3 data disk, with the sample programs added through the same actions that the
 * Add sheet uses, so that they're in its history. The disk isn't yet in any store, and counts as unmodified.
 *
 * The files get no date, since LDOS 5.3 can't store a year after 2011. The disk gets the date it was made.
 *
 * @param now the date to put on the disk.
 */
export async function makeSampleDisk(now = new Date()): Promise<OpenDisk> {
    const request: CreateFloppyRequest = {
        format: {dos: TrsdosFormatDos.LDOS_5_3, cylinders: undefined, sides: undefined, density: undefined,
            model: undefined, name: "SAMPLE", date: now},
        system: false,
        minimal: false,
        force: false,
    };
    const {disk} = await newDisk(request, SAMPLE_DISK_NAME);

    const files = SAMPLE_PROGRAMS.map(program =>
        new File([Uint8Array.from(program.text, c => c.charCodeAt(0))], program.fileName, {lastModified: now.getTime()}));
    const options: AddActionOptions = {
        ascii: false, binary: false, text: false, system: false, invisible: false, overwrite: false, date: undefined,
    };
    const plan = await planAddFiles(disk.session, files, options);
    await addPlanned(disk.session, plan, options);
    // The sample is what the page offers, not the user's work, so it starts out clean. The adds stay in the undo
    // history, so undoing them is still possible (and then counts as a change).
    disk.session.markSaved();
    return disk;
}
