import firebase from "firebase";
import {makeCloseIconButton, makeIcon, makeIconButton} from "./Utils";
import {CmdProgram} from "trs80-base";
import {Panel} from "./Panel";
import {File} from "./File";
import {FilePanel} from "./FilePanel";
import {Context} from "./Context";

/**
 * Panel showing the library of user's files.
 */
export class LibraryPanel extends Panel {
    private readonly db: firebase.firestore.Firestore;

    constructor(context: Context, db: firebase.firestore.Firestore) {
        super(context);

        this.db = db;

        this.element.classList.add("library");

        const header = document.createElement("h1");
        header.innerText = "Library";
        header.append(makeCloseIconButton(() => this.context.panelManager.close()));
        this.element.append(header);

        const programsDiv = document.createElement("div");
        programsDiv.classList.add("programs");
        this.element.append(programsDiv);

        db.collection("files").get().then((querySnapshot) => {
            const files = querySnapshot.docs.map(d => new File(d));
            files.sort(File.compare);
            for (const file of files) {
                this.addFile(programsDiv, file);
            }
        });
    }

    private addFile(parent: HTMLElement, file: File): void {
        const programDiv = document.createElement("div");
        programDiv.classList.add("program");
        parent.append(programDiv);

        const infoButton = makeIconButton(makeIcon("arrow_forward"), "File information", () => {
            const filePanel = new FilePanel(this.context, file);
            this.context.panelManager.pushPanel(filePanel);
        });
        infoButton.classList.add("info-button");
        programDiv.append(infoButton);

        const playButton = makeIconButton(makeIcon("play_arrow"), "Run program", () => {
            this.runProgram(file);
        });
        playButton.classList.add("play-button");
        programDiv.append(playButton);

        const nameDiv = document.createElement("div");
        nameDiv.classList.add("name");
        nameDiv.innerText = file.name;
        programDiv.append(nameDiv);

        const filenameDiv = document.createElement("div");
        filenameDiv.classList.add("filename");
        filenameDiv.innerText = file.filename;
        programDiv.append(filenameDiv);

        const noteDiv = document.createElement("div");
        noteDiv.classList.add("note");
        noteDiv.innerText = file.note;
        programDiv.append(noteDiv);
    }
}
