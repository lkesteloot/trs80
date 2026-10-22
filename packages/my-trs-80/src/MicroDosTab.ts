import {decodeTrs80File, FloppyDisk, MicroDos, MicroDosFile, MicroDosFileType, microDosFileTypeToString} from "trs80-base";
import {assertNever} from "z80-base";
import {PageTab} from "./PageTab";
import {withCommas} from "teamten-ts-utils";
import {makeIcon, reportError} from "./Utils";
import {IFilePanel} from "./IFilePanel";
import {FileBuilder} from "./File";
import {makeExportZipButton} from "./FloppyZip";
import {makeFloppyInfo} from "./FloppyInfo";

/**
 * Whether the file is a BASIC program, which can be run and imported. Data files can't.
 */
function isBasicProgram(file: MicroDosFile): boolean {
    switch (file.type) {
        case MicroDosFileType.PROGRAM:
            return true;
        case MicroDosFileType.DATA:
            return false;
        default:
            assertNever(file.type);
    }
}

/**
 * Handles the Percom MicroDOS tab in the file panel. BASIC programs are Level II BASIC (with
 * the 0xFF header that MicroDos.readFile() adds), so like the TRSDOS tab it can run them and
 * import them into the library.
 */
export class MicroDosTab extends PageTab {
    constructor(filePanel: IFilePanel, trs80File: FloppyDisk, microDos: MicroDos) {
        super("MicroDOS");

        this.element.classList.add("dos-tab");

        const mainContents = document.createElement("div");
        mainContents.classList.add("dos", "microdos");
        this.element.append(mainContents);

        mainContents.append(makeFloppyInfo(trs80File, microDos));

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
        addDirEntryField("Type", "type", "header");
        addDirEntryField("Remark", "remark", "header");
        addDirEntryField("Run", "run", "header");
        // Only signed-in users can import. Decide now, so that the header and the rows
        // agree on the number of columns even if the user signs in or out later.
        const user = filePanel.context.user;
        if (user !== undefined) {
            addDirEntryField("Import", "import", "header");
        } else {
            dirDiv.classList.add("no-import");
        }
        // The DOS and the directory are listed as files, so show them faded rather than leave them out.
        const dirEntries = microDos.getDirEntries(true);
        for (const dirEntry of dirEntries) {
            const extraCssClasses: string[] = [];
            if (dirEntry.isSystemFile()) {
                extraCssClasses.push("hidden-file");
            }

            addDirEntryField(dirEntry.getFilename("."), "filename", ...extraCssClasses);
            addDirEntryField(withCommas(dirEntry.getSize()), "size", ...extraCssClasses);
            addDirEntryField(microDosFileTypeToString(dirEntry.type), "type", ...extraCssClasses);
            addDirEntryField(dirEntry.remark, "remark", ...extraCssClasses);

            // Data files get empty cells, to keep the grid's columns lined up.
            const basicProgram = isBasicProgram(dirEntry);
            if (basicProgram) {
                const playButton = makeIcon("play_arrow");
                playButton.classList.add("run", ...extraCssClasses);
                playButton.addEventListener("click", () => {
                    const binary = microDos.readFile(dirEntry);
                    const program = decodeTrs80File(binary, { filename: dirEntry.getFilename(".") });
                    // Not quite the right file, but makes screenshots go to the floppy.
                    filePanel.context.runningFile = filePanel.file;
                    filePanel.context.trs80.runTrs80File(program);
                    filePanel.context.panelManager.close();
                });
                dirDiv.append(playButton);
            } else {
                dirDiv.append(document.createElement("div"));
            }

            if (user !== undefined) {
                if (basicProgram) {
                    const importButton = makeIcon("get_app");
                    importButton.classList.add("import", ...extraCssClasses);
                    importButton.addEventListener("click", () => {
                        const binary = microDos.readFile(dirEntry);

                        let file = new FileBuilder()
                            .withUid(user.uid)
                            .withName(dirEntry.getFilename("."))
                            .withNote(`Imported from "${filePanel.file.name}" floppy disk.`)
                            .withAuthor(filePanel.file.author)
                            .withReleaseYear(filePanel.file.releaseYear)
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
                } else {
                    dirDiv.append(document.createElement("div"));
                }
            }
        }

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        // Make a ZIP file for export.
        actionBar.append(makeExportZipButton(filePanel.file.filename, microDos, dirEntries, "microdos"));
    }
}
