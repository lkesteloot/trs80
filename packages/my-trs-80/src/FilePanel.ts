import {Panel} from "./Panel";
import {formatDate, makeTextButton, makeCloseIconButton, makeIcon, makeIconButton} from "./Utils";
import {clearElement, withCommas} from "teamten-ts-utils";
import {File} from "./File";
import {Context} from "./Context";
import {PageTabs} from "./PageTabs";
import {CanvasScreen} from "trs80-emulator";
import isEmpty from "lodash/isEmpty";
import {LibraryModifyEvent, LibraryRemoveEvent} from "./Library";
import firebase from "firebase";
import UpdateData = firebase.firestore.UpdateData;
import {decodeTrs80File, Trs80File} from "trs80-base";
import {HexdumpGenerator} from "./HexdumpGenerator";

const SCREENSHOT_ATTR = "data-screenshot";

/**
 * Handles the file info tab in the file panel.
 */
class FileInfoTab {
    private readonly filePanel: FilePanel;
    private readonly trs80File: Trs80File;
    private readonly nameInput: HTMLInputElement;
    private readonly filenameInput: HTMLInputElement;
    private readonly noteInput: HTMLTextAreaElement;
    private readonly typeInput: HTMLInputElement;
    private readonly sizeInput: HTMLInputElement;
    private readonly addedAtInput: HTMLInputElement;
    private readonly modifiedAtInput: HTMLInputElement;
    private readonly screenshotsDiv: HTMLElement;
    private readonly revertButton: HTMLButtonElement;
    private readonly saveButton: HTMLButtonElement;

    constructor(filePanel: FilePanel, pageTabs: PageTabs, trs80File: Trs80File) {
        this.filePanel = filePanel;
        this.trs80File = trs80File;

        const infoTab = pageTabs.newTab("File Info");
        infoTab.element.classList.add("file-info-tab");

        // Form for editing file info.
        const form = document.createElement("form");
        form.classList.add("file-panel-form");
        infoTab.element.append(form);

        const makeInputBox = (label: string, cssClass: string | undefined, enabled: boolean): HTMLInputElement => {
            const labelElement = document.createElement("label");
            if (cssClass !== undefined) {
                labelElement.classList.add(cssClass);
            }
            labelElement.innerText = label;
            form.append(labelElement);

            const inputElement = document.createElement("input");
            inputElement.disabled = !enabled;
            labelElement.append(inputElement);

            return inputElement;
        };

        this.nameInput = makeInputBox("Name", "name", true);
        this.filenameInput = makeInputBox("Filename", "filename", true);

        const noteLabel = document.createElement("label");
        noteLabel.classList.add("note");
        noteLabel.innerText = "Note";
        form.append(noteLabel);
        this.noteInput = document.createElement("textarea");
        this.noteInput.rows = 10;
        noteLabel.append(this.noteInput);

        const miscDiv = document.createElement("div");
        miscDiv.classList.add("misc");
        this.typeInput = makeInputBox("Type", undefined, false);
        this.addedAtInput = makeInputBox("Date added", undefined, false);
        this.sizeInput = makeInputBox("Size", undefined, false);
        this.modifiedAtInput = makeInputBox("Date last modified", undefined, false);
        form.append(miscDiv);

        this.screenshotsDiv = document.createElement("div");
        this.screenshotsDiv.classList.add("screenshots");
        form.append(this.screenshotsDiv);

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        infoTab.element.append(actionBar);

        const runButton = makeTextButton("Run", "play_arrow", "play-button", () => {
            this.filePanel.context.runProgram(this.filePanel.file, this.trs80File);
            this.filePanel.context.panelManager.close();

        });
        actionBar.append(runButton);
        const deleteButton = makeTextButton("Delete File", "delete", "delete-button", () => {
            this.filePanel.context.db.deleteFile(this.filePanel.file)
                .then(() => {
                    this.filePanel.context.library.removeFile(this.filePanel.file);
                    // We automatically close as a result of the file being removed from the library.
                })
                .catch(error => {
                    // TODO.
                    console.error(error);
                });
        });
        actionBar.append(deleteButton);
        this.revertButton = makeTextButton("Revert", "undo", "revert-button", undefined);
        actionBar.append(this.revertButton);
        this.saveButton = makeTextButton("Save", ["save", "cached", "check"], "save-button", undefined);
        actionBar.append(this.saveButton);

        for (const input of [this.nameInput, this.filenameInput, this.noteInput]) {
            input.addEventListener("input", () => this.updateButtonStatus());
        }
        this.nameInput.addEventListener("input", () => {
            let name = this.fileFromUi().name;
            if (name === "") {
                // If we completely blank out the span, the H1 shrinks, so keep it constant height with a space.
                this.filePanel.headerTextNode.innerHTML = "&nbsp;";
            } else {
                this.filePanel.headerTextNode.innerText = name;
            }
        });

        this.revertButton.addEventListener("click", () => {
            this.updateUi();
        });
        this.saveButton.addEventListener("click", () => {
            const newFile = this.fileFromUi().builder().withModifiedAt(new Date()).build();

            this.saveButton.classList.add("saving");

            // Disable right away so it's not clicked again.
            this.saveButton.disabled = true;

            this.filePanel.context.db.updateFile(this.filePanel.file, newFile)
                .then(() => {
                    this.saveButton.classList.remove("saving");
                    this.saveButton.classList.add("success");
                    setTimeout(() => {
                        this.saveButton.classList.remove("success");
                    }, 2000);
                    this.filePanel.file = newFile;
                    this.filePanel.context.library.modifyFile(newFile);
                    this.updateUi();
                })
                .catch(error => {
                    this.saveButton.classList.remove("saving");
                    // TODO show error.
                    // The document probably doesn't exist.
                    console.error("Error updating document: ", error);
                    this.updateUi();
                });
        });

        this.filePanel.context.library.onEvent.subscribe(event => {
            if (event instanceof LibraryModifyEvent && event.newFile.id === this.filePanel.file.id) {
                // Make sure we don't clobber any user-entered data in the input fields.
                const updateData = this.filePanel.file.getUpdateDataComparedTo(event.newFile);
                this.filePanel.file = event.newFile;
                this.updateUi(updateData);
            }
            if (event instanceof LibraryRemoveEvent && event.oldFile.id === this.filePanel.file.id) {
                // We've been deleted.
                this.filePanel.context.panelManager.popPanel();
            }
        });

        this.updateUi();
    }

    /**
     * Update UI after a change to file.
     *
     * @param updateData if specified, only fields defined in the object will be updated. (The _values_ of
     * those fields are ignored -- only their presence is important because that indicates that the data
     * is fresh in the file object.) The purpose is to avoid clobbering user-entered data in the various
     * input fields when the file object changes elsewhere in unrelated ways, such as new screenshots.
     */
    private updateUi(updateData?: UpdateData): void {
        const file = this.filePanel.file;

        if (updateData === undefined || updateData.hasOwnProperty("name")) {
            this.nameInput.value = file.name;
        }
        if (updateData === undefined || updateData.hasOwnProperty("filename")) {
            this.filenameInput.value = file.filename;
        }
        if (updateData === undefined || updateData.hasOwnProperty("note")) {
            this.noteInput.value = file.note;
        }
        this.typeInput.value = this.trs80File.getDescription();
        this.sizeInput.value = withCommas(file.binary.length) + " byte" + (file.binary.length === 1 ? "" : "s");
        this.addedAtInput.value = formatDate(file.addedAt);
        this.modifiedAtInput.value = formatDate(file.modifiedAt);
        if (updateData === undefined || updateData.hasOwnProperty("screenshots")) {
            this.populateScreenshots();
        }

        this.updateButtonStatus();
    }

    /**
     * Fill the screenshots UI with those from the file.
     */
    private populateScreenshots(): void {
        clearElement(this.screenshotsDiv);

        for (const screenshot of this.filePanel.file.screenshots) {
            const screen = new CanvasScreen();
            screen.displayScreenshot(screenshot);
            const image = screen.asImage();

            const screenshotDiv = document.createElement("div");
            screenshotDiv.setAttribute(SCREENSHOT_ATTR, screenshot);
            screenshotDiv.classList.add("screenshot");
            screenshotDiv.append(image);
            const deleteButton = makeIconButton(makeIcon("delete"), "Delete screenshot", () => {
                screenshotDiv.remove();
                this.updateButtonStatus();
            });
            screenshotDiv.append(deleteButton);
            this.screenshotsDiv.append(screenshotDiv);
        }
    }

    /**
     * Update the save/restore buttons' enabled status based on input fields.
     */
    private updateButtonStatus(): void {
        const file = this.filePanel.file;
        const newFile = this.fileFromUi();

        const isSame = isEmpty(newFile.getUpdateDataComparedTo(file));
        const isValid = newFile.name.length > 0 &&
            newFile.filename.length > 0;

        const isDisabled = isSame || !isValid;

        this.revertButton.disabled = isDisabled;
        this.saveButton.disabled = isDisabled;
    }

    /**
     * Make a new File object based on the user's inputs.
     */
    private fileFromUi(): File {
        // Collect screenshots from UI.
        const screenshots: string[] = [];
        for (const screenshotDiv of this.screenshotsDiv.children) {
            let screenshot = screenshotDiv.getAttribute(SCREENSHOT_ATTR);
            if (screenshot === null) {
                console.error("Screenshot attribute " + SCREENSHOT_ATTR + " is null");
            } else {
                screenshots.push(screenshot);
            }
        }

        return this.filePanel.file.builder()
            .withName(this.nameInput.value.trim())
            .withFilename(this.filenameInput.value.trim())
            .withNote(this.noteInput.value.trim())
            .withScreenshots(screenshots)
            .build();
    }
}

/**
 * Tab for displaying the hex and ASCII of the binary.
 */
class HexdumpTab {
    private readonly binary: Uint8Array;
    private readonly trs80File: Trs80File;
    private readonly hexdumpElement: HTMLElement;
    private collapse = false; // TODO re-enable.
    private annotate = true;

    constructor(filePanel: FilePanel, pageTabs: PageTabs, trs80File: Trs80File) {
        this.binary = filePanel.file.binary;
        this.trs80File = trs80File;

        const infoTab = pageTabs.newTab("Hexdump");
        infoTab.element.classList.add("hexdump-tab");

        const outer = document.createElement("div");
        outer.classList.add("hexdump-outer");
        infoTab.element.append(outer);

        this.hexdumpElement = document.createElement("div");
        this.hexdumpElement.classList.add("hexdump");
        outer.append(this.hexdumpElement);
        this.generateHexdump();

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        infoTab.element.append(actionBar);

        const collapseLabel = document.createElement("label");
        const collapseCheckbox = document.createElement("input");
        collapseCheckbox.type = "checkbox";
        collapseCheckbox.checked = this.collapse;
        collapseLabel.append(collapseCheckbox);
        collapseLabel.append(" Collapse duplicate lines");
        collapseCheckbox.addEventListener("change", () => {
            this.collapse = collapseCheckbox.checked;
            this.generateHexdump();
        });
        actionBar.append(collapseLabel);

        const annotateLabel = document.createElement("label");
        const annotateCheckbox = document.createElement("input");
        annotateCheckbox.type = "checkbox";
        annotateCheckbox.checked = this.annotate;
        annotateLabel.append(annotateCheckbox);
        annotateLabel.append(" Show annotations");
        annotateCheckbox.addEventListener("change", () => {
            this.annotate = annotateCheckbox.checked;
            this.generateHexdump();
        });
        actionBar.append(annotateLabel);
    }

    /**
     * Regenerate the HTML for the hexdump.
     */
    private generateHexdump(): void {
        const hexdumpGenerator = new HexdumpGenerator(this.binary, this.collapse,
            this.annotate ? this.trs80File.annotations : []);
        const lines = hexdumpGenerator.generate();

        clearElement(this.hexdumpElement);
        this.hexdumpElement.append(... lines);
    }
}

/**
 * Panel to explore a file.
 */
export class FilePanel extends Panel {
    public file: File;
    private readonly fileInfoTab: FileInfoTab;
    private readonly hexdumpTab: HexdumpTab;
    public readonly headerTextNode: HTMLElement;

    constructor(context: Context, file: File) {
        super(context);

        this.file = file;

        this.element.classList.add("file-panel");

        const trs80File = decodeTrs80File(file.binary);

        const header = document.createElement("h1");
        const backButton = makeIconButton(makeIcon("arrow_back"), "Back", () => this.context.panelManager.popPanel());
        backButton.classList.add("back-button");
        header.append(backButton);
        this.headerTextNode = document.createElement("span");
        this.headerTextNode.innerText = file.name;
        header.append(this.headerTextNode);
        header.append(makeCloseIconButton(() => this.context.panelManager.close()));
        this.element.append(header);

        const content = document.createElement("div");
        content.classList.add("panel-content");
        this.element.append(content);

        const pageTabs = new PageTabs(content);
        this.fileInfoTab = new FileInfoTab(this, pageTabs, trs80File);
        this.hexdumpTab = new HexdumpTab(this, pageTabs, trs80File);
    }
}
