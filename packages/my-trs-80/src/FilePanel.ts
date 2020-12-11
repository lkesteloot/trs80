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

    constructor(context: Context, file: File) {
        super(context);

        this.file = file;

        this.element.classList.add("file-info");

        const header = document.createElement("h1");
        const backButton = makeIconButton(makeIcon("arrow_back"), "Back", () => this.context.panelManager.popPanel());
        backButton.classList.add("back-button");
        header.append(backButton);
        header.append(makeCloseIconButton(() => this.context.panelManager.close()));
        header.append(document.createTextNode(file.name));
        this.element.append(header);

        // Form for editing file info.
        const form = document.createElement("form");
        form.classList.add("file-info-form");
        this.element.append(form);

        const makeInputBox = (label: string, cssClass: string | undefined, initialValue: string, enabled: boolean): HTMLInputElement => {
            const labelElement = document.createElement("label");
            if (cssClass !== undefined) {
                labelElement.classList.add(cssClass);
            }
            labelElement.innerText = label;
            form.append(labelElement);

            const inputElement = document.createElement("input");
            inputElement.value = initialValue;
            inputElement.disabled = !enabled;
            labelElement.append(inputElement);

            return inputElement;
        };

        const nameInput = makeInputBox("Name", "name", file.name, true);
        const filenameInput = makeInputBox("Filename", "filename", file.filename, true);

        const noteLabel = document.createElement("label");
        noteLabel.classList.add("note");
        noteLabel.innerText = "Note";
        form.append(noteLabel);
        const noteInput = document.createElement("textarea");
        noteInput.rows = 10;
        noteInput.value = file.note;
        noteLabel.append(noteInput);

        const miscDiv = document.createElement("div");
        miscDiv.classList.add("misc");
        makeInputBox("Type", undefined, file.getType(), false);
        makeInputBox("Date added", undefined, formatDate(file.dateAdded), false);
        makeInputBox("Size", undefined, withCommas(file.binary.length) + " byte" + (file.binary.length === 1 ? "" : "s"), false);
        makeInputBox("Date last modified", undefined, formatDate(file.dateModified), false);
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
        const revertButton = makeButton("Revert", "undo", "revert-button", undefined);
        actionBar.append(revertButton);
        const saveButton = makeButton("Save", "save", "save-button", undefined);
        actionBar.append(saveButton);

        // Update the save/restore buttons' enabled status based on input fields.
        const updateButtonStatus = () => {
            const isSame = nameInput.value === file.name &&
                filenameInput.value === file.filename &&
                noteInput.value === file.note;

            revertButton.disabled = isSame;
            saveButton.disabled = isSame;
        };
        for (const input of [nameInput, filenameInput, noteInput]) {
            input.addEventListener("input", updateButtonStatus);
        }

        const setInterfaceFromFile = (file: File): void => {
            nameInput.value = file.name;
            filenameInput.value = file.filename;
            noteInput.value = file.note;
            updateButtonStatus();
        };

        revertButton.addEventListener("click", () => {
            setInterfaceFromFile(file);
            updateButtonStatus();
        });
        saveButton.addEventListener("click", () => {
            // TODO turn save button into progress.
            this.context.db.collection("files").doc(file.id).update({
                name: nameInput.value.trim(),
                filename: filenameInput.value.trim(),
                note: noteInput.value.trim(),
                dateModified: new Date(),
            })
                .then(() => {
                    // TODO turn save button into normal.
                    console.log("Document successfully updated!");
                })
                .catch(error => {
                    // TODO turn save button into normal.
                    // TODO show error.
                    // The document probably doesn't exist.
                    console.error("Error updating document: ", error);
                });
        });

        setInterfaceFromFile(file);
        updateButtonStatus();
    }
}
