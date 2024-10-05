import {PageTab} from "./PageTab";
import {anyFilePanel, IFilePanel} from "./IFilePanel";
import {FilePanel} from "./FilePanel";
import {decodeTrs80File} from "trs80-base";
import {makeIcon, TRASH_TAG} from "./Utils";
import {File} from "./File";
import {clearElement} from "teamten-ts-utils";

/**
 * Tab to show duplicates of the current file.
 */
export class DuplicatesTab extends PageTab {
    private readonly filePanel: IFilePanel;
    private readonly mainContents: HTMLElement;
    private readonly cancelLibrarySubscription: () => void;

    constructor(filePanel: IFilePanel) {
        super("Duplicates");

        this.filePanel = filePanel;

        this.element.classList.add("duplicates-tab");

        this.mainContents = document.createElement("div");
        this.mainContents.classList.add("duplicates");
        this.element.append(this.mainContents);

        // Handler to update our data.
        this.cancelLibrarySubscription = this.filePanel.context.library.onEvent.subscribe(() => this.updateContents());
    }

    onFirstShow(): void {
        this.updateContents();
    }

    onDestroy(): void {
        this.cancelLibrarySubscription();
        super.onDestroy();
    }

    /**
     * Update the UI with data from the library.
     */
    private updateContents(): void {
        clearElement(this.mainContents);

        const addDirEntryField = (value: string, ... cssClass: string[]): void => {
            const dirEntry = document.createElement("div");
            dirEntry.classList.add(... cssClass);
            dirEntry.innerText = value;
            this.mainContents.append(dirEntry);
        };

        addDirEntryField("Name", "name", "header");
        addDirEntryField("Filename", "filename", "header");
        addDirEntryField("Type", "type", "header");
        addDirEntryField("In trash", "in-trash", "header");
        addDirEntryField("Edit", "edit", "header");

        const allFiles = this.filePanel.context.library.getAllFiles();
        allFiles.sort(File.compare);

        for (const file of allFiles) {
            if (file.hash === this.filePanel.file.hash) {
                // See if we've show this file already in the panel stack.
                const alreadyVisited = anyFilePanel(this.filePanel, panel => panel.file.id === file.id);

                const trs80File = decodeTrs80File(file.binary, { filename: file.filename });
                addDirEntryField(file.name, "name");
                addDirEntryField(file.filename, "filename");
                addDirEntryField(trs80File.getDescription(), "type");

                const inTrash = file.tags.indexOf(TRASH_TAG) >= 0;
                if (inTrash) {
                    const inTrashIcon = makeIcon("delete");
                    inTrashIcon.classList.add("in-trash");
                    this.mainContents.append(inTrashIcon);
                } else {
                    // Dummy cell for the grid.
                    this.mainContents.append(document.createElement("span"));
                }

                const openButton = makeIcon("edit");
                openButton.classList.add("edit");
                if (alreadyVisited) {
                    openButton.classList.add("disabled");
                } else {
                    openButton.addEventListener("click", () => {
                        this.filePanel.context.openFilePanel(file);
                    });
                }
                this.mainContents.append(openButton);
            }
        }
    }
}
