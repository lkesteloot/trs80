import Navigo from "navigo";
import {createHome} from "./Home";
import {CanvasScreen, Cassette, ControlPanel, PanelType, ProgressBar, SettingsPanel, Trs80} from "trs80-emulator";
import {CmdProgram, isCmdProgram} from "trs80-base";
import firebase from 'firebase/app';
// These imports load individual services into the firebase namespace.
import 'firebase/auth';
import 'firebase/firestore';
import 'firebase/analytics';
import QueryDocumentSnapshot = firebase.firestore.QueryDocumentSnapshot;
import DocumentData = firebase.firestore.DocumentData;
import {withCommas} from "teamten-ts-utils";

const MATERIAL_ICONS_CLASS = "material-icons-round";

function configureRoutes() {
    const body = document.querySelector("body") as HTMLElement;
    const router = new Navigo(null, true, "#!");
    const s = createHome(router);
    s.classList.add("screen");
    body.append(s);
    router.resolve();
}

class EmptyCassette extends Cassette {
    // Nothing to do.
}

// Fresh IDs for inputs so that we can point labels at them. TODO delete?
let inputIdCounter = 1;
function makeId(): string {
    return "_input" + inputIdCounter++;
}

/**
 * Format a long date without a time.
 */
function formatDate(date: Date): string {
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };

    return date.toLocaleDateString(undefined, options);
}

/**
 * Make a material design icon with the given name.
 *
 * https://google.github.io/material-design-icons/
 * https://material.io/resources/icons/?style=round
 */
function makeIcon(name: string): HTMLElement {
    const icon = document.createElement("i");

    icon.classList.add(MATERIAL_ICONS_CLASS);
    icon.classList.add("material-icons-override");
    icon.innerText = name;

    return icon;
}

/**
 * Make a generic round button.
 */
function makeIconButton(icon: HTMLElement, title: string, clickCallback: () => void) {
    const button = document.createElement("div");
    button.classList.add("button");
    button.title = title;
    button.append(icon);
    button.addEventListener("click", clickCallback);

    return button;
}

/**
 * Make a float-right close button for dialog boxes.
 */
function makeCloseIconButton(closeCallback: () => void) {
    const button = makeIconButton(makeIcon("close"), "Close window", closeCallback);
    button.classList.add("close-button");

    return button;
}

function makeButton(label: string, iconName: string | undefined, cssClass: string, clickCallback: () => void) {
    const button = document.createElement("button");
    button.innerText = label;
    button.classList.add(cssClass);

    if (iconName !== undefined) {
        const icon = document.createElement("i");
        icon.classList.add(MATERIAL_ICONS_CLASS);
        icon.innerText = iconName;
        button.append(icon);
    }

    button.addEventListener("click", clickCallback);

    return button;
}

/**
 * Represents a file that the user owns.
 */
class File {
    public readonly id: string;
    public readonly uid: string;
    public readonly name: string;
    public readonly filename: string;
    public readonly note: string;
    public readonly shared: boolean;
    public readonly hash: string;
    public readonly binary: Uint8Array;
    public readonly dateAdded: Date;
    public readonly dateModified: Date;

    constructor(doc: QueryDocumentSnapshot<DocumentData>) {
        this.id = doc.id;

        const data = doc.data();
        this.uid = data.uid;
        this.name = data.name;
        this.filename = data.filename;
        this.note = data.note;
        this.shared = data.shared ?? false;
        this.hash = data.hash;
        this.binary = (data.binary as firebase.firestore.Blob).toUint8Array();
        this.dateAdded = (data.dateAdded as firebase.firestore.Timestamp).toDate();
        this.dateModified = (data.dateModified as firebase.firestore.Timestamp).toDate();
    }

    /**
     * Get the type of the file as a string.
     */
    public getType(): string {
        if (isCmdProgram(this.binary)) {
            return "CMD program";
        } else {
            return "Unknown type";
        }
    }

    public static compare(a: File, b: File): number {
        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        }

        if (a.id < b.id) {
            return -1;
        } else if (a.id > b.id) {
            return 1;
        } else {
            // Shouldn't happen.
            return 0;
        }
    }
}

/**
 * The library of user's files.
 */
class Library {
    private readonly backgroundNode: HTMLElement;
    private readonly trs80: Trs80;
    private readonly positioningNode: HTMLElement;
    private readonly libraryNode: HTMLElement;
    private readonly escListener: (e: KeyboardEvent) => void;
    private readonly screens: HTMLElement[] = [];
    private isOpen = false;
    private trs80WasStarted = false;

    constructor(parent: HTMLElement, trs80: Trs80, db: firebase.firestore.Firestore) {
        this.backgroundNode = document.createElement("div");
        this.trs80 = trs80;

        // Handler for the ESC key.
        this.escListener = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            }
        };

        this.backgroundNode.classList.add("popup-background");
        this.backgroundNode.addEventListener("click", e => {
            if (e.target === this.backgroundNode) {
                this.close();
                e.preventDefault();
                e.stopPropagation();
            }
        });
        parent.append(this.backgroundNode);

        this.positioningNode = document.createElement("div");
        this.positioningNode.classList.add("popup-positioning");
        this.backgroundNode.append(this.positioningNode);

        this.libraryNode = document.createElement("div");
        this.libraryNode.classList.add("popup-content");
        this.libraryNode.classList.add("library");
        this.positioningNode.append(this.libraryNode);

        const header = document.createElement("h1");
        header.innerText = "Library";
        header.append(makeCloseIconButton(() => this.close()));
        this.libraryNode.append(header);

        const programsDiv = document.createElement("div");
        programsDiv.classList.add("programs");
        this.libraryNode.append(programsDiv);

        db.collection("files").get().then((querySnapshot) => {
            const files = querySnapshot.docs.map(d => new File(d));
            files.sort(File.compare);
            for (const file of files) {
                this.addFile(programsDiv, file);
            }
        });

        this.pushScreen(this.libraryNode);
    }

    private showFileInfo(file: File): void {
        const fileInfoDiv = document.createElement("div");
        fileInfoDiv.classList.add("popup-content");
        fileInfoDiv.classList.add("file-info");
        this.positioningNode.append(fileInfoDiv);

        const header = document.createElement("h1");
        const backButton = makeIconButton(makeIcon("arrow_back"), "Back", () => this.popScreen());
        backButton.classList.add("back-button");
        header.append(backButton);
        header.append(makeCloseIconButton(() => this.close()));
        header.append(document.createTextNode(file.name));
        fileInfoDiv.append(header);

        // Form for editing file info.
        const form = document.createElement("form");
        form.classList.add("file-info-form");
        fileInfoDiv.append(form);

        const nameLabel = document.createElement("label");
        nameLabel.classList.add("name");
        nameLabel.innerText = "Name";
        form.append(nameLabel);
        const nameInput = document.createElement("input");
        nameInput.value = file.name;
        nameLabel.append(nameInput);

        const filenameLabel = document.createElement("label");
        filenameLabel.classList.add("filename");
        filenameLabel.innerText = "Filename";
        form.append(filenameLabel);
        const filenameInput = document.createElement("input");
        filenameInput.value = file.filename;
        filenameLabel.append(filenameInput);

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
        {
            // Misc pane.
            const table = document.createElement("table");
            miscDiv.append(table);

            const entries = [
                ["Size:", withCommas(file.binary.length) + " byte" + (file.binary.length === 1 ? "" : "s")],
                ["Type:", file.getType()],
                ["Date added:", formatDate(file.dateAdded)],
                ["Date last modified:", formatDate(file.dateModified)],
            ];

            for (const [key, value] of entries) {
                const tr = document.createElement("tr");
                table.append(tr);

                const th = document.createElement("th");
                th.innerText = key;

                const td = document.createElement("td");
                td.innerText = value;

                tr.append(th, td);
            }
        }
        form.append(miscDiv);

        const screenshotsDiv = document.createElement("div");
        screenshotsDiv.classList.add("screenshots");
        screenshotsDiv.innerText = "screenshots";
        form.append(screenshotsDiv);

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        fileInfoDiv.append(actionBar);

        const runButton = makeButton("Run", "play_arrow", "play-button", () => {
            this.runProgram(file);
        });
        actionBar.append(runButton);
        const deleteButton = makeButton("Delete File", "delete", "delete-button", () => {
            // TODO.
        });
        actionBar.append(deleteButton);
        const revertButton = makeButton("Revert", "undo", "revert-button", () => {
            // TODO.
        });
        revertButton.disabled = true;
        actionBar.append(revertButton);
        const saveButton = makeButton("Save", "save", "save-button", () => {
            // TODO.
        });
        saveButton.disabled = true;
        actionBar.append(saveButton);

        this.pushScreen(fileInfoDiv);
    }

    private pushScreen(screen: HTMLElement): void {
        this.screens.push(screen);
        this.positionScreens(this.screens, this.screens.length - 2);
        setTimeout(() => {
            this.positionScreens(this.screens, this.screens.length - 1);
        }, 0);
    }

    private popScreen(): void {
        this.positionScreens(this.screens, this.screens.length - 2);
        const screen = this.screens.pop();
        setTimeout(() => {
            if (screen !== undefined) {
                screen.remove();
            }
        }, 1000);
    }

    private positionScreens(screens: HTMLElement[], active: number): void {
        for (let i = 0; i < screens.length; i++) {
            const screen = screens[i];
            const offset = (i - active)*100;

            screen.style.left = offset + "vw";
            screen.style.right = -offset + "vw";
        }
    }

    public open(): void {
        if (!this.isOpen) {
            this.isOpen = true;
            document.addEventListener("keydown", this.escListener);
            this.trs80WasStarted = this.trs80.stop();
            this.backgroundNode.classList.add("popup-shown");
        }
    }

    public close(): void {
        if (this.isOpen) {
            this.isOpen = false;
            document.removeEventListener("keydown", this.escListener);
            if (this.trs80WasStarted) {
                this.trs80.start();
            }
            this.backgroundNode.classList.remove("popup-shown");
        }
    }

    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    private addFile(parent: HTMLElement, file: File): void {
        const programDiv = document.createElement("div");
        programDiv.classList.add("program");
        parent.append(programDiv);

        const infoButton = makeIconButton(makeIcon("arrow_forward"), "File information", () => {
            if (this.screens.length === 1) {
                this.showFileInfo(file);
            }
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

    private runProgram(file: File): void {
        const cmdProgram = new CmdProgram(file.binary);
        if (cmdProgram.error !== undefined) {
            // TODO
        } else {
            this.trs80.runCmdProgram(cmdProgram);
            this.close();
        }
    }
}

function addProgramToFirestore(db: firebase.firestore.Firestore, name: string, url: string, note: string) {
    fetch(url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer =>
            db.collection("files").add({
                uid: "",
                name: name,
                filename: url.split("/").pop(),
                note: note,
                public: false,
                hash: "",
                binary: firebase.firestore.Blob.fromUint8Array(new Uint8Array(arrayBuffer)),
                dateAdded: firebase.firestore.Timestamp.fromDate(new Date()),
                dateModified: firebase.firestore.Timestamp.fromDate(new Date()),
            }))
        .then(function (docRef) {
            console.log("Document written with ID: ", docRef.id);
        })
        .catch(function (error) {
            console.error("Error adding document: ", error);
        });
}

function createNavbar(openLibrary: () => void): HTMLElement {
    const navbar = document.createElement("div");
    navbar.classList.add("navbar");

    const libraryButton = makeIconButton(makeIcon("folder_open"), "Open library (Ctrl-L)", openLibrary);
    navbar.append(libraryButton);

    const themeButton = makeIconButton(makeIcon("brightness_medium"), "Toggle theme", () => {
        const body = document.querySelector("body") as HTMLElement;

        body.classList.toggle("light-mode");
        body.classList.toggle("dark-mode");
    });
    navbar.append(themeButton);

    return navbar;
}

export function main() {
    const app = firebase.initializeApp({
        apiKey: "AIzaSyAfGZY9BaDUmy4qNtg11JHd_kLd1JmgdBI",
        authDomain: "my-trs-80.firebaseapp.com",
        projectId: "my-trs-80",
        storageBucket: "my-trs-80.appspot.com",
        messagingSenderId: "438103442091",
        appId: "1:438103442091:web:0fe42c43917ba1add52dee"
    });
    firebase.analytics();

    const db = firebase.firestore();

    if (false) {
        addProgramToFirestore(db, "Breakdown", "tmp/BREAKDWN.CMD", "Breakout-like game from pski.");
        addProgramToFirestore(db, "Memtest", "tmp/MEMTEST.CMD", "Standard MEMTEST program from TRS-DOS.");
        addProgramToFirestore(db, "Armored Patrol", "tmp/ARMOR.CMD", "Space shoot-em-up.");
        addProgramToFirestore(db, "Ghosts", "tmp/GHOSTS.CMD", "Doesn't seem to work.");
    }

    const body = document.querySelector("body") as HTMLElement;

    let library: Library | undefined = undefined;

    const navbar = createNavbar(() => library?.open());
    body.append(navbar);

    const screenDiv = document.createElement("div");
    screenDiv.classList.add("main-computer-screen");
    body.append(screenDiv);

    const screen = new CanvasScreen(screenDiv, false);
    let cassette = new EmptyCassette();
    const trs80 = new Trs80(screen, cassette);

    const reboot = () => {
        trs80.reset();
        trs80.start();
    };

    const hardwareSettingsPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.HARDWARE);
    const viewPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.VIEW);
    const controlPanel = new ControlPanel(screen.getNode());
    controlPanel.addResetButton(reboot);
    controlPanel.addTapeRewindButton(() => {
        // cassette.rewind();
    });
    /*
    if (program !== undefined) {
        controlPanel.addScreenshotButton(() => {
            const screenshot = trs80.getScreenshot();
            program.setScreenshot(screenshot);
            this.tape.saveUserData();
        });
    }*/
    controlPanel.addSettingsButton(hardwareSettingsPanel);
    controlPanel.addSettingsButton(viewPanel);
    const progressBar = new ProgressBar(screen.getNode());
    // cassette.setProgressBar(progressBar);

    library = new Library(body, trs80, db);

    document.addEventListener("keydown", event => {
        if (event.ctrlKey && event.key === "l") {
            library?.toggle();
        }
    });

    reboot();
}
