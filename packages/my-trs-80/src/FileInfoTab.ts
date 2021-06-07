import {Trs80File} from "trs80-base";
import {PageTab} from "./PageTab";
import {
    defer,
    formatDate,
    makeIcon,
    makeIconButton,
    makeTagCapsule,
    makeTextButton,
    TagCapsuleOptions,
    TRASH_TAG
} from "./Utils";
import {LibraryModifyEvent, LibraryRemoveEvent} from "./Library";
import {clearElement, withCommas} from "teamten-ts-utils";
import {CanvasScreen} from "trs80-emulator";
import isEmpty from "lodash/isEmpty";
import {File} from "./File";
import {IFilePanel} from "./IFilePanel";
import type firebase from "firebase";
import {TagSet} from "./TagSet";
type UpdateData = firebase.firestore.UpdateData;

const SCREENSHOT_ATTR = `data-screenshot`;

/**
 * Handles the file info tab in the file panel.
 */
export class FileInfoTab extends PageTab {
    private readonly filePanel: IFilePanel;
    private readonly trs80File: Trs80File;
    private readonly editable: boolean;
    private readonly nameInput: HTMLInputElement;
    private readonly filenameInput: HTMLInputElement;
    private readonly noteInput: HTMLTextAreaElement;
    private readonly authorInput: HTMLInputElement;
    private readonly releaseYearInput: HTMLInputElement;
    private readonly typeInput: HTMLInputElement;
    private readonly sizeInput: HTMLInputElement;
    private readonly addedAtInput: HTMLInputElement;
    private readonly modifiedAtInput: HTMLInputElement;
    private readonly tags = new TagSet();
    private readonly allTags = new TagSet();
    private readonly tagsInput: HTMLElement;
    private readonly sharedInput: HTMLInputElement;
    private readonly screenshotsDiv: HTMLElement;
    private readonly deleteButton: HTMLButtonElement;
    private readonly undeleteButton: HTMLButtonElement;
    private readonly revertButton: HTMLButtonElement;
    private readonly saveButton: HTMLButtonElement;
    private readonly cancelLibrarySubscription: () => void;

    constructor(filePanel: IFilePanel, trs80File: Trs80File) {
        super("File Info");

        this.filePanel = filePanel;
        this.trs80File = trs80File;
        this.editable = filePanel.context.user?.uid === filePanel.file.uid;

        // Make union of all tags in all files. Do this here once so that if the user deletes a tag
        // that only this file has, it'll stay in this set so it can be added again easily.
        for (const file of this.filePanel.context.library.getAllFiles()) {
            this.allTags.add(... file.tags);
        }
        // We have buttons for adding/removing the trash tag.
        this.allTags.remove(TRASH_TAG);

        // Make our own copy of tags that will reflect what's in the UI.
        this.tags.add(...filePanel.file.tags);

        this.element.classList.add("file-info-tab", this.editable ? "file-info-tab-editable" : "file-info-tab-readonly");

        // Container of form.
        const formContainer = document.createElement("div");
        formContainer.classList.add("file-panel-form-container");
        this.element.append(formContainer);

        // Form for editing file info.
        const form = document.createElement("div");
        form.classList.add("file-panel-form");
        formContainer.append(form);

        const makeInputBox = (label: string, cssClass: string | undefined, enabled: boolean): HTMLInputElement => {
            const labelElement = document.createElement("label");
            if (cssClass !== undefined) {
                labelElement.classList.add(cssClass);
            }
            labelElement.innerText = label;
            form.append(labelElement);

            const inputElement = document.createElement("input");
            inputElement.disabled = !enabled || !this.editable;
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
        this.noteInput.disabled = !this.editable;
        noteLabel.append(this.noteInput);

        this.authorInput = makeInputBox("Author", undefined, true);
        this.releaseYearInput = makeInputBox("Release year", undefined, true);
        this.typeInput = makeInputBox("Type", undefined, false);
        this.addedAtInput = makeInputBox("Added", undefined, false);
        this.sizeInput = makeInputBox("Size", undefined, false);
        this.modifiedAtInput = makeInputBox("Last modified", undefined, false);
        {
            // Tags editor.
            const labelElement = document.createElement("label");
            labelElement.innerText = "Tags";
            form.append(labelElement);

            this.tagsInput = document.createElement("div");
            this.tagsInput.classList.add("tags-editor");
            labelElement.append(this.tagsInput);
        }
        {
            // Shared editor.
            const labelElement = document.createElement("label");
            labelElement.classList.add("shared");
            labelElement.innerText = "Shared";
            form.append(labelElement);

            this.sharedInput = document.createElement("input");
            this.sharedInput.type = "checkbox";
            this.sharedInput.disabled = !this.editable;

            const offIcon = makeIcon("toggle_off");
            offIcon.classList.add("off-state");

            const onIcon = makeIcon("toggle_on");
            onIcon.classList.add("on-state");

            labelElement.append(this.sharedInput, offIcon, onIcon);
        }

        this.screenshotsDiv = document.createElement("div");
        this.screenshotsDiv.classList.add("screenshots");
        form.append(this.screenshotsDiv);

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        const exportButton = makeTextButton("Export", "get_app", "export-button", () => {
            // Download binary.
            const a = document.createElement("a");
            const contents = this.filePanel.file.binary;
            const blob = new Blob([contents], {type: "application/octet-stream"});
            a.href = window.URL.createObjectURL(blob);
            a.download = this.filePanel.file.filename;
            a.click();
        });
        actionBar.append(exportButton);
        if (this.trs80File.className === "Cassette") {
            const cassette = this.trs80File;
            const mountButton = makeTextButton("Mount", "input", "mount-button", () => {
                this.filePanel.context.mountCassette(this.filePanel.file, cassette);
                this.filePanel.context.panelManager.close();
            });
            actionBar.append(mountButton);
        }
        const runButton = makeTextButton("Run", "play_arrow", "play-button", () => {
            this.filePanel.context.runProgram(this.filePanel.file, this.trs80File);
            this.filePanel.context.panelManager.close();
        });
        actionBar.append(runButton);
        this.deleteButton = makeTextButton("Delete File", "delete", "delete-button", () => {
            const oldFile = this.filePanel.file;
            const tags = new TagSet();
            tags.add(...oldFile.tags, TRASH_TAG);
            const newFile = oldFile.builder()
                .withTags(tags.asArray())
                .withModifiedAt(new Date())
                .build();
            this.filePanel.context.db.updateFile(oldFile, newFile)
                .then(() => {
                    this.filePanel.context.library.modifyFile(newFile);
                    this.filePanel.context.panelManager.popPanel();
                })
                .catch(error => {
                    // TODO.
                    console.error(error);
                });
        });
        this.undeleteButton = makeTextButton("Undelete File", "restore_from_trash", "delete-button", () => {
            const oldFile = this.filePanel.file;
            const tags = new TagSet();
            tags.add(...oldFile.tags);
            tags.remove(TRASH_TAG);
            const newFile = oldFile.builder()
                .withTags(tags.asArray())
                .withModifiedAt(new Date())
                .build();
            this.filePanel.context.db.updateFile(oldFile, newFile)
                .then(() => {
                    this.filePanel.context.library.modifyFile(newFile);
                })
                .catch(error => {
                    // TODO.
                    console.error(error);
                });
        });
        this.revertButton = makeTextButton("Revert", "undo", "revert-button", undefined);
        this.saveButton = makeTextButton("Save",
            ["save", "cached", "check"], "save-button", undefined);
        this.saveButton.title = "Ctrl-Enter to save and close";
        if (this.editable) {
            actionBar.append(this.deleteButton, this.undeleteButton, this.revertButton, this.saveButton);
        }

        for (const input of [this.nameInput, this.filenameInput, this.noteInput, this.authorInput, this.releaseYearInput]) {
            input.addEventListener("input", () => this.updateButtonStatus());
        }
        this.sharedInput.addEventListener("change", () => this.updateButtonStatus());
        this.nameInput.addEventListener("input", () => this.filePanel.setHeaderText(this.fileFromUi().name));

        this.revertButton.addEventListener("click", () => this.updateUi());
        this.saveButton.addEventListener("click", () => this.save());

        this.cancelLibrarySubscription = this.filePanel.context.library.onEvent.subscribe(event => {
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

    onKeyDown(e: KeyboardEvent): boolean {
        // Ctrl-Enter to save and close the panel.
        if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.key === "Enter") {
            this.saveAndClose();
            return true;
        }

        return super.onKeyDown(e);
    }

    onDestroy(): void {
        this.cancelLibrarySubscription();
        super.onDestroy();
    }

    /**
     * Save if necessary, then close the panel.
     */
    private saveAndClose(): void {
        const isSame = isEmpty(this.fileFromUi().getUpdateDataComparedTo(this.filePanel.file));

        if (isSame) {
            this.filePanel.context.panelManager.popPanel();
        } else {
            this.save(() => {
                this.filePanel.context.panelManager.popPanel();
            });
        }
    }

    /**
     * Save the current changes to the file, then optionally call the callback.
     */
    private save(callback?: () => void): void {
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

                if (callback) {
                    callback();
                }
            })
            .catch(error => {
                this.saveButton.classList.remove("saving");
                // TODO show error.
                // The document probably doesn't exist.
                console.error("Error updating document: ", error);
                this.updateUi();
            });
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
        if (updateData === undefined || updateData.hasOwnProperty("author")) {
            this.authorInput.value = file.author;
        }
        if (updateData === undefined || updateData.hasOwnProperty("releaseYear")) {
            this.releaseYearInput.value = file.releaseYear;
        }
        this.typeInput.value = this.trs80File.getDescription();
        this.sizeInput.value = withCommas(file.binary.length) + " byte" + (file.binary.length === 1 ? "" : "s");
        this.addedAtInput.value = formatDate(file.addedAt);
        this.modifiedAtInput.value = formatDate(file.modifiedAt);
        if (updateData === undefined || updateData.hasOwnProperty("tags")) {
            this.tags.clear();
            this.tags.add(...file.tags);
            this.updateTagsInput();
        }
        this.sharedInput.checked = file.shared;
        if (updateData === undefined || updateData.hasOwnProperty("screenshots")) {
            this.populateScreenshots();
        }

        this.updateButtonStatus();
    }

    /**
     * Update the UI for showing and editing the tags on this file.
     *
     * @param newTagFocus whether to put the input focus on the new tag input field.
     */
    private updateTagsInput(newTagFocus?: boolean): void {
        clearElement(this.tagsInput);

        const tagListElement = document.createElement("div");
        tagListElement.classList.add("tag-list");
        this.tagsInput.append(tagListElement);

        let count = 0;
        for (const tag of this.allTags.asArray()) {
            if (this.tags.has(tag) || this.editable) {
                const tagOptions: TagCapsuleOptions = {
                    tag: tag,
                };

                // Add clear/add actions if editable.
                if (this.editable) {
                    if (this.tags.has(tag)) {
                        tagOptions.iconName = "clear";
                        tagOptions.clickCallback = () => {
                            this.tags.remove(tag);
                            this.updateTagsInput();
                            this.updateButtonStatus();
                        };
                    } else {
                        tagOptions.faint = true;
                        tagOptions.iconName = "add";
                        tagOptions.clickCallback = () => {
                            this.tags.add(tag);
                            this.updateTagsInput();
                            this.updateButtonStatus();
                        };
                    }
                }
                tagListElement.append(makeTagCapsule(tagOptions));
                count += 1;
            }
        }

        // Form to add a new tag.
        if (this.editable) {
            const newTagForm = document.createElement("form");
            newTagForm.classList.add("new-tag-form");
            newTagForm.addEventListener("submit", event => {
                const newTag = newTagInput.value.trim();
                if (newTag !== "" && newTag !== TRASH_TAG) {
                    this.tags.add(newTag);
                    this.allTags.add(newTag);
                    this.updateTagsInput(true);
                    this.updateButtonStatus();
                }
                event.preventDefault();
                event.stopPropagation();
            });
            tagListElement.append(newTagForm);

            const newTagInput = document.createElement("input");
            newTagInput.placeholder = "New tag";
            if (newTagFocus) {
                setTimeout(() => newTagInput.focus(), 0);
            }
            newTagForm.append(newTagInput);
        } else if (count === 0) {
            const instructions = document.createElement("div");
            instructions.classList.add("tags-instructions");
            instructions.innerText = "There are to tags for this file.";
            tagListElement.append(instructions);

        }
    }

    /**
     * Fill the screenshots UI with those from the file.
     */
    private populateScreenshots(): void {
        clearElement(this.screenshotsDiv);

        const labelElement = document.createElement("label");
        labelElement.innerText = "Screenshots";
        this.screenshotsDiv.append(labelElement);

        if (this.filePanel.file.screenshots.length === 0) {
            const instructions = document.createElement("div");
            instructions.classList.add("screenshots-instructions");
            if (this.editable) {
                instructions.innerText = "To take a screenshot, run the program and click the camera icon.";
            } else {
                instructions.innerText = "There are no screenshots for this file.";
            }
            this.screenshotsDiv.append(instructions);
        }

        for (const screenshot of this.filePanel.file.screenshots) {
            const screenshotDiv = document.createElement("div");
            screenshotDiv.setAttribute(SCREENSHOT_ATTR, screenshot);
            screenshotDiv.classList.add("screenshot");
            if (this.editable) {
                const deleteButton = makeIconButton(makeIcon("delete"), "Delete screenshot", () => {
                    screenshotDiv.remove();
                    this.updateButtonStatus();
                });
                screenshotDiv.append(deleteButton);
            }
            this.screenshotsDiv.append(screenshotDiv);

            // Defer this so that if we have a lot of screenshots it doesn't hang the browser when
            // creating this panel.
            defer(() => {
                const screen = new CanvasScreen();
                screen.displayScreenshot(screenshot);
                screen.asImageAsync().then(image => screenshotDiv.append(image));
            });
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

        this.revertButton.disabled = isSame;
        this.saveButton.disabled = isSame || !isValid;

        this.deleteButton.classList.toggle("hidden", file.isDeleted);
        this.undeleteButton.classList.toggle("hidden", !file.isDeleted);
    }

    /**
     * Make a new File object based on the user's inputs.
     */
    private fileFromUi(): File {
        // Collect screenshots from UI.
        const screenshots: string[] = [];
        for (const screenshotDiv of this.screenshotsDiv.children) {
            // Skip label and instructions.
            let screenshot = screenshotDiv.getAttribute(SCREENSHOT_ATTR);
            if (screenshot !== null) {
                screenshots.push(screenshot);
            }
        }

        return this.filePanel.file.builder()
            .withName(this.nameInput.value.trim())
            .withFilename(this.filenameInput.value.trim())
            .withNote(this.noteInput.value.trim())
            .withAuthor(this.authorInput.value.trim())
            .withReleaseYear(this.releaseYearInput.value.trim())
            .withShared(this.sharedInput.checked)
            .withTags(this.tags.asArray())
            .withScreenshots(screenshots)
            .build();
    }
}
