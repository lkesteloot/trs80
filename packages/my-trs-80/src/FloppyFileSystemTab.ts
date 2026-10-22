import {FloppyDisk, FloppyFileSystem} from "trs80-base";
import {PageTab} from "./PageTab";
import {withCommas} from "teamten-ts-utils";
import {IFilePanel} from "./IFilePanel";
import {makeExportZipButton} from "./FloppyZip";
import {makeFloppyInfo} from "./FloppyInfo";

/**
 * Format the date for the directory listing as "DD/MM/YYYY" in the local time zone, as the TRSDOS tab
 * shows its dates, followed by "HH:MM" if the time isn't midnight. (The FloppyDirEntry interface doesn't say whether the
 * operating system records a time, and midnight is almost always a date alone.)
 */
function formatDirDate(date: Date): string {
    const pad = (n: number): string => n.toString().padStart(2, "0");
    let text = pad(date.getDate()) + "/" + pad(date.getMonth() + 1) + "/" + date.getFullYear().toString().padStart(4, "0");
    if (date.getHours() !== 0 || date.getMinutes() !== 0) {
        text += " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }
    return text;
}

/**
 * A read-only tab in the file panel for any floppy file system, working through the
 * FloppyFileSystem interface. It lists the files and offers a ZIP export, but can't run or
 * import them. It's for operating systems whose programs the emulator can't run, such as the
 * Model II's TRSDOS and TRSDOS-II (the emulator is Model I, III, and 4), and Xenix. Like the CP/M tab,
 * there's nothing to do with a file other than take it off the disk.
 */
export class FloppyFileSystemTab extends PageTab {
    /**
     * @param name the name of the tab, such as "TRSDOS-II".
     * @param filePanel the panel that this tab is in.
     * @param trs80File the floppy image.
     * @param fileSystem the floppy's file system.
     * @param fallbackZipName the name of the ZIP file (without extension) if the floppy has no usable filename.
     */
    constructor(name: string, filePanel: IFilePanel, trs80File: FloppyDisk, fileSystem: FloppyFileSystem,
                fallbackZipName: string) {

        super(name);

        this.element.classList.add("dos-tab");

        const mainContents = document.createElement("div");
        mainContents.classList.add("dos", "floppy-file-system");
        this.element.append(mainContents);

        mainContents.append(makeFloppyInfo(trs80File, fileSystem));

        // Add directory.

        const dirDiv = document.createElement("div");
        dirDiv.classList.add("dir");
        mainContents.append(dirDiv);

        const addDirEntryField = (value: string, ... cssClass: string[]): void => {
            const dirEntry = document.createElement("div");
            dirEntry.classList.add(... cssClass);
            if (value === "") {
                dirEntry.classList.add("empty-field");
                dirEntry.innerText = "None";
            } else {
                dirEntry.innerText = value;
            }
            dirDiv.append(dirEntry);
        };

        addDirEntryField("Filename", "filename", "header");
        addDirEntryField("Size", "size", "header");
        addDirEntryField("Date", "date", "header");
        addDirEntryField("System", "system", "header");
        // The operating system's own files are listed, but faded.
        const dirEntries = fileSystem.getDirEntries(true);
        for (const dirEntry of dirEntries) {
            const extraCssClasses: string[] = [];
            if (dirEntry.isSystemFile() || dirEntry.isHidden()) {
                extraCssClasses.push("hidden-file");
            }

            const date = dirEntry.getDate();
            addDirEntryField(dirEntry.getFilename("."), "filename", ...extraCssClasses);
            addDirEntryField(withCommas(dirEntry.getSize()), "size", ...extraCssClasses);
            addDirEntryField(date === undefined ? "" : formatDirDate(date), "date", ...extraCssClasses);
            // Ordinary files get an empty cell, to keep the grid's columns lined up.
            if (dirEntry.isSystemFile()) {
                addDirEntryField("System", "system", ...extraCssClasses);
            } else {
                dirDiv.append(document.createElement("div"));
            }
        }

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        // Make a ZIP file for export.
        actionBar.append(makeExportZipButton(filePanel.file.filename, fileSystem, dirEntries, fallbackZipName));
    }
}
