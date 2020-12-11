import {Panel} from "./Panel";
import {formatDate, makeButton, makeCloseIconButton, makeIcon, makeIconButton} from "./Utils";
import {withCommas} from "teamten-ts-utils";
import {File} from "./File";
import {Context} from "./Context";

/**
 * Panel to explore a file.
 */
export class FilePanel extends Panel {
    private file: File;
    private readonly nameInput: HTMLInputElement;
    private readonly filenameInput: HTMLInputElement;
    private readonly noteInput: HTMLTextAreaElement;
    private readonly typeInput: HTMLInputElement;
    private readonly sizeInput: HTMLInputElement;
    private readonly dateAddedInput: HTMLInputElement;
    private readonly dateModifiedInput: HTMLInputElement;
    private readonly revertButton: HTMLButtonElement;
    private readonly saveButton: HTMLButtonElement;

    constructor(context: Context, file: File) {
        super(context);

        this.file = file;

        this.element.classList.add("file-panel");

        const header = document.createElement("h1");
        const backButton = makeIconButton(makeIcon("arrow_back"), "Back", () => this.context.panelManager.popPanel());
        backButton.classList.add("back-button");
        header.append(backButton);
        const headerTextNode = document.createElement("span");
        headerTextNode.innerText = file.name;
        header.append(headerTextNode);
        header.append(makeCloseIconButton(() => this.context.panelManager.close()));
        this.element.append(header);

        // Form for editing file info.
        const form = document.createElement("form");
        form.classList.add("file-panel-form");
        this.element.append(form);

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
        this.dateAddedInput = makeInputBox("Date added", undefined, false);
        this.sizeInput = makeInputBox("Size", undefined, false);
        this.dateModifiedInput = makeInputBox("Date last modified", undefined, false);
        form.append(miscDiv);

        const screenshotsDiv = document.createElement("div");
        screenshotsDiv.classList.add("screenshots");
        let s = "screenshots ";
        for (let i = 0; i < 8; i++) {
            s = s + s;
        }
        screenshotsDiv.innerText = s;
        form.append(screenshotsDiv);

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        const runButton = makeButton("Run", "play_arrow", "play-button", () => {
            this.runProgram(file);
        });
        actionBar.append(runButton);
        const deleteButton = makeButton("Delete File", "delete", "delete-button", () => {
            // TODO.
        });
        actionBar.append(deleteButton);
        this.revertButton = makeButton("Revert", "undo", "revert-button", undefined);
        actionBar.append(this.revertButton);
        this.saveButton = makeButton("Save", ["save", "cached", "check"], "save-button", undefined);
        actionBar.append(this.saveButton);

        for (const input of [this.nameInput, this.filenameInput, this.noteInput]) {
            input.addEventListener("input", () => this.updateButtonStatus());
        }
        this.nameInput.addEventListener("input", () => {
            let name = this.fileFromUi().name;
            if (name === "") {
                // If we completely blank out the span, the H1 shrinks, so keep it constant height with a space.
                headerTextNode.innerHTML = "&nbsp;";
            } else {
                headerTextNode.innerText = name;
            }
        });

        this.revertButton.addEventListener("click", () => {
            this.updateUi();
        });
        this.saveButton.addEventListener("click", () => {
            const newFile = this.fileFromUi().builder().withDateModified(new Date()).build();

            this.saveButton.classList.add("saving");

            // Disable right away so it's not clicked again.
            this.saveButton.disabled = true;

            // TODO turn save button into progress.
            this.context.db.collection("files").doc(file.id).update({
                name: newFile.name,
                filename: newFile.filename,
                note: newFile.note,
                dateModified: newFile.dateModified,
            })
                .then(() => {
                    this.saveButton.classList.remove("saving");
                    this.saveButton.classList.add("success");
                    setTimeout(() => {
                        this.saveButton.classList.remove("success");
                    }, 1000);
                    this.file = newFile;
                    this.context.library.modifyFile(newFile);
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

        this.updateUi();
    }

    /**
     * Update UI after a change to file.
     */
    private updateUi(): void {
        this.nameInput.value = this.file.name;
        this.filenameInput.value = this.file.filename;
        this.noteInput.value = this.file.note;
        this.typeInput.value = this.file.getType();
        this.sizeInput.value = withCommas(this.file.binary.length) + " byte" + (this.file.binary.length === 1 ? "" : "s");
        this.dateAddedInput.value = formatDate(this.file.dateAdded);
        this.dateModifiedInput.value = formatDate(this.file.dateModified);

        this.updateButtonStatus();
    }

    /**
     * Update the save/restore buttons' enabled status based on input fields.
     */
    private updateButtonStatus(): void {
        const newFile = this.fileFromUi();

        const isSame = newFile.name === this.file.name &&
            newFile.filename === this.file.filename &&
            newFile.note === this.file.note;

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
        return this.file.builder()
            .withName(this.nameInput.value.trim())
            .withFilename(this.filenameInput.value.trim())
            .withNote(this.noteInput.value.trim())
            .build();
    }
}
