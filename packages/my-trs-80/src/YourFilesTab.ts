import {PageTabs} from "./PageTabs";
import {LibraryAddEvent, LibraryEvent, LibraryModifyEvent, LibraryRemoveEvent} from "./Library";
import {File, FileBuilder} from "./File";
import {CanvasScreen} from "trs80-emulator";
import {makeTextButton, makeIcon, makeIconButton} from "./Utils";
import {clearElement} from "teamten-ts-utils";
import {Context} from "./Context";

const FILE_ID_ATTR = "data-file-id";
const IMPORT_FILE_LABEL = "Import File";

/**
 * Tap for the Your Files UI.
 */
export class YourFilesTab {
    private readonly context: Context;
    private readonly filesDiv: HTMLElement;
    private readonly emptyLibrary: HTMLElement;
    private libraryInSync = false;

    constructor(pageTabs: PageTabs, context: Context) {
        this.context = context;

        const tab = pageTabs.newTab("Your Files", context.user !== undefined);
        tab.element.classList.add("your-files-tab");
        context.onUser.subscribe(user => pageTabs.setVisible(tab, user !== undefined));

        this.filesDiv = document.createElement("div");
        this.filesDiv.classList.add("files");
        tab.element.append(this.filesDiv);

        this.emptyLibrary = document.createElement("div");
        this.emptyLibrary.classList.add("empty-library");
        tab.element.append(this.emptyLibrary);

        const emptyTitle = document.createElement("h2");
        emptyTitle.innerText = "You have no files in your library!";
        const emptyBody = document.createElement("article");
        emptyBody.innerHTML= `Upload a <code>CAS</code> or <code>CMD</code> file from your computer using the “${IMPORT_FILE_LABEL.replace(/ /g, "&nbsp;")}” button below, or import it from the RetroStore tab.`;
        const demon = document.createElement("img");
        demon.src = "/demon.png";
        this.emptyLibrary.append(emptyTitle, emptyBody, demon);

        this.context.library.onEvent.subscribe(e => this.onLibraryEvent(e));
        this.context.library.onInSync.subscribe(inSync => this.onLibraryInSync(inSync));

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        tab.element.append(actionBar);

        const uploadButton = makeTextButton(IMPORT_FILE_LABEL, "publish", "import-file-button",
            () => this.uploadFile());
        actionBar.append(uploadButton);

        this.updateSplashScreen();
    }

    /**
     * Handle change to library files.
     */
    private onLibraryEvent(event: LibraryEvent): void {
        if (event instanceof LibraryAddEvent) {
            this.addFile(event.newFile);
            this.sortFiles();
        }
        if (event instanceof LibraryModifyEvent) {
            // Probably not worth modifying in-place.
            this.removeFile(event.oldFile.id);
            this.addFile(event.newFile);
            this.sortFiles();
        }
        if (event instanceof LibraryRemoveEvent) {
            this.removeFile(event.oldFile.id);
        }

        this.updateSplashScreen();
    }

    /**
     * React to whether library is now fully in sync.
     */
    private onLibraryInSync(inSync: boolean): void {
        this.libraryInSync = inSync;
        this.updateSplashScreen();
    }

    /**
     * Update whether the splash screen is shown.
     */
    private updateSplashScreen(): void {
        const displaySplashScreen = this.libraryInSync && this.filesDiv.children.length === 0;

        this.filesDiv.classList.toggle("hidden", displaySplashScreen);
        this.emptyLibrary.classList.toggle("hidden", !displaySplashScreen);
    }

    /**
     * Configure and open the "open file" dialog for importing files.
     */
    private uploadFile(): void {
        const uploadElement = document.createElement("input");
        uploadElement.type = "file";
        uploadElement.accept = ".cas, .bas, .cmd";
        uploadElement.multiple = true;
        uploadElement.addEventListener("change", () => {
            const user = this.context.user;
            if (user === undefined) {
                console.error("Can't import with signed-out user");
                return;
            }
            const files = uploadElement.files ?? [];
            const openFilePanel = files.length === 1;
            for (const f of files) {
                f.arrayBuffer()
                    .then(arrayBuffer => {
                        const bytes = new Uint8Array(arrayBuffer);
                        this.importFile(user.uid, f.name, bytes, openFilePanel);
                    })
                    .catch(error => {
                        // TODO
                        console.error(error);
                    });
            }
        });
        uploadElement.click();
    }

    /**
     * Add an uploaded file to our library.
     * @param uid user ID.
     * @param filename original filename from the user.
     * @param binary raw binary of the file.
     * @param openFilePanel whether to open the file panel for this file after importing it.
     */
    private importFile(uid: string, filename: string, binary: Uint8Array, openFilePanel: boolean): void {
        let name = filename;

        // Remove extension.
        const i = name.lastIndexOf(".");
        if (i > 0) {
            name = name.substr(0, i);
        }

        // Capitalize.
        name = name.substr(0, 1).toUpperCase() + name.substr(1).toLowerCase();

        // All-caps for filename.
        filename = filename.toUpperCase();

        let file = new FileBuilder()
            .withUid(uid)
            .withName(name)
            .withFilename(filename)
            .withBinary(binary)
            .build();

        this.context.db.addFile(file)
            .then(docRef => {
                file = file.builder().withId(docRef.id).build();
                this.context.library.addFile(file);
                if (openFilePanel) {
                    this.context.openFilePanel(file);
                }
            })
            .catch(error => {
                // TODO
                console.error("Error adding document: ", error);
            });
    }

    /**
     * Add a file to the list of files in the library.
     */
    private addFile(file: File): void {
        const fileDiv = document.createElement("div");
        fileDiv.classList.add("file");
        fileDiv.setAttribute(FILE_ID_ATTR, file.id);
        this.filesDiv.append(fileDiv);

        const infoDiv = document.createElement("div");
        fileDiv.append(infoDiv);

        const nameDiv = document.createElement("div");
        nameDiv.classList.add("name");
        nameDiv.innerText = file.name;
        infoDiv.append(nameDiv);

        const filenameDiv = document.createElement("div");
        filenameDiv.classList.add("filename");
        filenameDiv.innerText = file.filename;
        infoDiv.append(filenameDiv);

        const noteDiv = document.createElement("div");
        noteDiv.classList.add("note");
        noteDiv.innerText = file.note;
        infoDiv.append(noteDiv);

        const screenshotsDiv = document.createElement("div");
        screenshotsDiv.classList.add("screenshots");
        fileDiv.append(screenshotsDiv);
        for (const screenshot of file.screenshots) {
            const screen = new CanvasScreen();
            screen.displayScreenshot(screenshot);
            const image = screen.asImage();
            screenshotsDiv.append(image);
        }

        const playButton = makeIconButton(makeIcon("play_arrow"), "Run program", () => {
            this.context.runProgram(file);
            this.context.panelManager.close();
        });
        playButton.classList.add("play-button");
        fileDiv.append(playButton);

        const infoButton = makeIconButton(makeIcon("arrow_forward"), "File information", () => {
            this.context.openFilePanel(file);
        });
        infoButton.classList.add("info-button");
        fileDiv.append(infoButton);
    }

    /**
     * Remove a file from the UI by its ID.
     */
    private removeFile(fileId: string): void {
        const element = this.getFileElementById(fileId);
        if (element !== undefined) {
            element.remove();
        } else {
            console.error("removeFile(): No element with file ID " + fileId);
        }
    }

    /**
     * Return an element for a file given its ID, or undefined if not found.
     */
    private getFileElementById(fileId: string): Element | undefined {
        let selectors = ":scope > [" + FILE_ID_ATTR + "=\"" + fileId + "\"]";
        const element = this.filesDiv.querySelector(selectors);
        return element === null ? undefined : element;
    }

    /**
     * Sort files already displayed.
     */
    private sortFiles(): void {
        // Sort existing files.
        const fileElements: {file: File, element: Element}[] = [];
        for (const element of this.filesDiv.children) {
            const fileId = element.getAttribute(FILE_ID_ATTR);
            if (fileId !== null) {
                const file = this.context.library.getFile(fileId);
                if (file !== undefined) {
                    fileElements.push({file: file, element: element});
                }
            }
        }
        fileElements.sort((a, b) => File.compare(a.file, b.file));

        // Repopulate the UI in the right order.
        clearElement(this.filesDiv);
        this.filesDiv.append(... fileElements.map(e => e.element));
    }
}
