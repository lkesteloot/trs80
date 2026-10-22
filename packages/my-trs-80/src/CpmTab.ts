
import {Cpm, FloppyDisk} from "trs80-base";
import {PageTab} from "./PageTab";
import {withCommas} from "teamten-ts-utils";
import {IFilePanel} from "./IFilePanel";
import {makeExportZipButton} from "./FloppyZip";
import {makeFloppyInfo} from "./FloppyInfo";

/**
 * Handles the CP/M tab in the file panel. Unlike the TRSDOS tab, there's no way to run or
 * import a file: CP/M programs don't run on the emulator's stock ROMs, so an imported
 * file wouldn't be useful.
 */
export class CpmTab extends PageTab {
    constructor(filePanel: IFilePanel, trs80File: FloppyDisk, cpm: Cpm) {
        super("CP/M");

        this.element.classList.add("dos-tab");

        const mainContents = document.createElement("div");
        mainContents.classList.add("dos", "cpm");
        this.element.append(mainContents);

        mainContents.append(makeFloppyInfo(trs80File, cpm));

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
        addDirEntryField("User", "user", "header");
        addDirEntryField("Attributes", "attributes", "header");
        // SYS files are only hidden from DIR, not part of the operating system, so list them faded.
        const dirEntries = cpm.getDirEntries(true);
        for (const dirEntry of dirEntries) {
            const extraCssClasses: string[] = [];
            if (dirEntry.isHidden()) {
                extraCssClasses.push("hidden-file");
            }

            // CP/M writes filenames with a period.
            addDirEntryField(dirEntry.getFilename("."), "filename", ...extraCssClasses);
            addDirEntryField(withCommas(dirEntry.getSize()), "size", ...extraCssClasses);
            addDirEntryField(dirEntry.user.toString(), "user", ...extraCssClasses);
            addDirEntryField(dirEntry.getAttributesString(), "attributes", ...extraCssClasses);
        }

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        // Make a ZIP file for export.
        actionBar.append(makeExportZipButton(filePanel.file.filename, cpm, dirEntries, "cpm"));
    }
}
