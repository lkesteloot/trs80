
import {decodeTrs80File, FloppyDisk, Trsdos, trsdosProtectionLevelToString} from "trs80-base";
import {PageTab} from "./PageTab";
import {withCommas} from "teamten-ts-utils";
import {makeIcon, reportError} from "./Utils";
import {IFilePanel} from "./IFilePanel";
import {FileBuilder} from "./File";
import {makeExportZipButton} from "./FloppyZip";
import {makeFloppyInfo} from "./FloppyInfo";

/**
 * Handles the TRSDOS tab in the file panel.
 */
export class TrsdosTab extends PageTab {
    constructor(filePanel: IFilePanel, trs80File: FloppyDisk, trsdos: Trsdos) {
        super("DOS");

        this.element.classList.add("dos-tab");

        const mainContents = document.createElement("div");
        mainContents.classList.add("dos", "trsdos");
        this.element.append(mainContents);

        mainContents.append(makeFloppyInfo(trs80File, trsdos));

        // Add directory.

        const dirDiv = document.createElement("div");
        dirDiv.classList.add("dir");
        mainContents.append(dirDiv);

        const addDirEntryField = (value: string, ... cssClass: string[]): void => {
            const dirEntry = document.createElement("div");
            dirEntry.classList.add(... cssClass);
            dirEntry.innerText = value;
            dirDiv.append(dirEntry);
        };

        addDirEntryField("Filename", "filename", "header");
        addDirEntryField("Size", "size", "header");
        addDirEntryField("Date", "date", "header");
        addDirEntryField("Permission", "protection-level", "header");
        addDirEntryField("Run", "run", "header");
        // Only signed-in users can import. Decide now, so that the header and the rows
        // agree on the number of columns even if the user signs in or out later.
        const user = filePanel.context.user;
        if (user !== undefined) {
            addDirEntryField("Import", "import", "header");
        } else {
            dirDiv.classList.add("no-import");
        }
        const dirEntries = trsdos.getDirEntries(false);
        for (const dirEntry of dirEntries) {
            const extraCssClasses: string[] = [];
            if (dirEntry.isHidden()) {
                extraCssClasses.push("hidden-file");
            }
            if (dirEntry.getExtension() === "CMD") {
                extraCssClasses.push("executable-file");
            }

            addDirEntryField(dirEntry.getFilename("/"), ... ["filename", ...extraCssClasses]);
            addDirEntryField(withCommas(dirEntry.getSize()), ... ["size", ...extraCssClasses]);
            addDirEntryField(dirEntry.getFullDateString().trim(), ... ["date", ...extraCssClasses]);
            addDirEntryField(trsdosProtectionLevelToString(dirEntry.getProtectionLevel(), trsdos.version),
                ... ["protection-level", ...extraCssClasses]);

            const playButton = makeIcon("play_arrow");
            playButton.classList.add(... ["run", ...extraCssClasses]);
            playButton.addEventListener("click", () => {
                const binary = trsdos.readFile(dirEntry);
                const program = decodeTrs80File(binary,
                    { filename: dirEntry.getFilename(".")});
                // Not quite the right file, but makes screenshots go to the floppy.
                filePanel.context.runningFile = filePanel.file;
                filePanel.context.trs80.runTrs80File(program);
                filePanel.context.panelManager.close();

            });
            dirDiv.append(playButton);

            if (user !== undefined) {
                const importButton = makeIcon("get_app");
                importButton.classList.add(...["import", ...extraCssClasses]);
                importButton.addEventListener("click", () => {
                    const binary = trsdos.readFile(dirEntry);

                    let file = new FileBuilder()
                        .withUid(user.uid)
                        .withName(dirEntry.getBasename())
                        .withNote(`Imported from "${filePanel.file.name}" floppy disk.`)
                        .withAuthor(filePanel.file.author)
                        .withReleaseYear(dirEntry.year !== undefined && dirEntry.year > 1975 ? dirEntry.year.toString() : filePanel.file.releaseYear)
                        .withFilename(dirEntry.getFilename("."))
                        .withShared(filePanel.file.shared)
                        .withModelType(filePanel.file.modelType)
                        .withBasicLevel(filePanel.file.basicLevel)
                        .withBinary(binary)
                        .build();

                    filePanel.context.db.addFile(file)
                        .then(docRef => {
                            file = file.builder().withId(docRef.id).build();
                            filePanel.context.library.addFile(file);
                            filePanel.context.openFilePanel(file);
                        })
                        .catch(error => {
                            reportError("Couldn't add the file to your library.", error);
                        });
                });
                dirDiv.append(importButton);
            }
        }

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        // Make a ZIP file for export.
        const exportZipButton = makeExportZipButton(filePanel.file.filename, trsdos, dirEntries, "trsdos");
        actionBar.append(exportZipButton);
    }
}
