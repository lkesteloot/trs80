
import {decodeTrs80File, Trs80File, Trsdos, trsdosProtectionLevelToString} from "trs80-base";
import {PageTab} from "./PageTab";
import {withCommas} from "teamten-ts-utils";
import {makeIcon, makeTextButton} from "./Utils";
import {IFilePanel} from "./IFilePanel";
import {FileBuilder} from "./File";
import JSZip from "jszip";

/**
 * Handles the TRSDOS tab in the file panel.
 */
export class TrsdosTab extends PageTab {
    constructor(filePanel: IFilePanel, trs80File: Trs80File, trsdos: Trsdos) {
        super("TRSDOS");

        this.element.classList.add("trsdos-tab");

        const mainContents = document.createElement("div");
        mainContents.classList.add("trsdos");
        this.element.append(mainContents);

        const infoDiv = document.createElement("div");
        infoDiv.classList.add("info");
        const addField = (label: string, value: string, cssClass: string): void => {
            const labelSpan = document.createElement("div");
            labelSpan.classList.add(cssClass + "-label", "label");
            labelSpan.innerText = label + ":";
            infoDiv.append(labelSpan);
            const valueSpan = document.createElement("div");
            valueSpan.classList.add(cssClass, "value");
            if (value === "") {
                valueSpan.classList.add("empty-field");
                valueSpan.innerText = "None";
            } else {
                valueSpan.innerText = value;
            }
            infoDiv.append(valueSpan);
        };
        addField("File type", trs80File.getDescription(), "file-type");
        addField("Version", trsdos.getOperatingSystemName() + " " + trsdos.getVersion(), "version");
        const gatInfo = trsdos.getGatInfo();
        if (typeof gatInfo === "string") {
            addField("Error", gatInfo, "error");
        } else {
            addField("Disk name", gatInfo.name, "name");
            addField("Date", gatInfo.date, "date");
            addField("Auto command", gatInfo.autoCommand, "auto-command");
        }
        mainContents.append(infoDiv);

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
        addDirEntryField("Import", "import", "header");
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
            addDirEntryField(dirEntry.getDateString(), ... ["date", ...extraCssClasses]);
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

            // TODO this breaks the grid.
            const user = filePanel.context.user;
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
                        .withReleaseYear(dirEntry.year > 75 ? (1900 + dirEntry.year).toString() : filePanel.file.releaseYear)
                        .withFilename(dirEntry.getFilename("."))
                        .withShared(filePanel.file.shared) // Questionable.
                        .withBinary(binary)
                        .build();

                    filePanel.context.db.addFile(file)
                        .then(docRef => {
                            file = file.builder().withId(docRef.id).build();
                            filePanel.context.library.addFile(file);
                            filePanel.context.openFilePanel(file);
                        })
                        .catch(error => {
                            // TODO
                            console.error("Error adding document: ", error);
                        });
                });
                dirDiv.append(importButton);
            }
        }

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        // Make a ZIP file for export.
        const exportZipButton = makeTextButton("Export ZIP", "get_app", "export-zip-button", () => {
            const zip = new JSZip();

            for (const dirEntry of dirEntries) {
                zip.file(dirEntry.getFilename("."), trsdos.readFile(dirEntry), {
                    date: dirEntry.getDate(),
                });
            }

            zip.generateAsync({
                type: "blob",
            })
                .then(blob => {
                    let filename = filePanel.file.filename;
                    let i = filename.lastIndexOf("/");
                    if (i >= 0) {
                        // Strip path.
                        filename = filename.substring(i + 1);
                    }
                    i = filename.lastIndexOf(".");
                    if (i > 0) {
                        // Strip existing extension.
                        filename = filename.substring(0, i);
                    }
                    if (filename === "") {
                        filename = "trsdos"
                    }
                    filename += ".zip";

                    const a = document.createElement("a");
                    a.href = window.URL.createObjectURL(blob);
                    a.download = filename;
                    a.click();
                });
        });
        actionBar.append(exportZipButton);
    }
}
