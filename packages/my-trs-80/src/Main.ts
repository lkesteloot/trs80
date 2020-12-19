import Navigo from "navigo";
import {createHome} from "./Home";
import {CanvasScreen, CassettePlayer, ControlPanel, PanelType, ProgressBar, SettingsPanel, Trs80} from "trs80-emulator";
import firebase from 'firebase/app';
// These imports load individual services into the firebase namespace.
import 'firebase/auth';
import 'firebase/firestore';
import 'firebase/analytics';
import * as firebaseui from "firebaseui";
import {makeButton, makeIcon, makeIconButton} from "./Utils";
import {PanelManager} from "./PanelManager";
import {LibraryPanel} from "./LibraryPanel";
import {Context} from "./Context";
import {Library} from "./Library";
import {FileBuilder} from "./File";
import {DialogBox} from "./DialogBox";
import {AuthUser, User} from "./User";
import {Database} from "./Database";

function configureRoutes() {
    const body = document.querySelector("body") as HTMLElement;
    const router = new Navigo(null, true, "#!");
    const s = createHome(router);
    body.append(s);
    router.resolve();
}

class EmptyCassette extends CassettePlayer {
    // Nothing to do.
}

function createNavbar(openLibrary: () => void, signIn: () => void, signOut: () => void): HTMLElement {
    const body = document.querySelector("body") as HTMLElement;

    const navbar = document.createElement("div");
    navbar.classList.add("navbar", "button-set");

    const title = document.createElement("span");
    title.textContent = "My TRS-80";
    navbar.append(title);

    const libraryButton = makeIconButton(makeIcon("folder_open"), "Open library (Ctrl-L)", openLibrary);
    navbar.append(libraryButton);

    const themeButton = makeIconButton(makeIcon("brightness_medium"), "Toggle theme", () => {
        body.classList.toggle("light-mode");
        body.classList.toggle("dark-mode");
    });
    navbar.append(themeButton);

    const signInButton = makeButton("Sign In", undefined, "sign-in-button", signIn);
    const signOutButton = makeButton("Sign Out", undefined, "sign-out-button", signOut);
    navbar.append(signInButton, signOutButton);

    return navbar;
}

function showSignInScreen() {

}

export function main() {
    const body = document.querySelector("body") as HTMLElement;
    body.classList.add("signed-out");

    // Configuration for Firebase.
    firebase.initializeApp({
        apiKey: "AIzaSyAfGZY9BaDUmy4qNtg11JHd_kLd1JmgdBI",
        authDomain: "my-trs-80.firebaseapp.com",
        projectId: "my-trs-80",
        storageBucket: "my-trs-80.appspot.com",
        messagingSenderId: "438103442091",
        appId: "1:438103442091:web:0fe42c43917ba1add52dee"
    });
    firebase.analytics();

    // Configuration for Firebase sign-in screen.
    const uiConfig = {
        signInSuccessUrl: '/',
        signInOptions: [
            // Leave the lines as is for the providers you want to offer your users.
            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
            firebase.auth.FacebookAuthProvider.PROVIDER_ID,
            firebase.auth.TwitterAuthProvider.PROVIDER_ID,
            firebase.auth.GithubAuthProvider.PROVIDER_ID,
            // firebase.auth.EmailAuthProvider.PROVIDER_ID,
            // firebase.auth.PhoneAuthProvider.PROVIDER_ID,
            // firebaseui.auth.AnonymousAuthProvider.PROVIDER_ID
        ],
        // Pop up a browser window for the actual sign-in page:
        signInFlow: "popup",
        callbacks: {
            signInSuccessWithAuthResult: (authResult: any): boolean => {
                // Don't use stuff here, the user will get passed to onAuthStateChanged().
                // I don't see much else useful in authResult.
                // console.log(authResult);

                // Don't redirect, we've taken care of it.
                return false;
            },
        },
    };

    let firebaseAuth = firebase.auth();
    const firebaseAuthUi = new firebaseui.auth.AuthUI(firebaseAuth);

    const signInDiv = document.createElement("div");
    let signInDialog: DialogBox | undefined = undefined;

    const db = new Database(firebase.firestore());

    firebaseAuth.onAuthStateChanged(firebaseUser => {
        if (firebaseUser !== null) {
            //console.log(firebaseUser);

            const authUser = AuthUser.fromFirebaseUser(firebaseUser);

            db.userFromAuthUser(authUser)
                .then(user => {
                    context.user = user;
                })
                .catch(error => {
                    // TODO.
                });

            if (signInDialog !== undefined) {
                signInDialog.close();
                signInDialog = undefined;
            }
        } else {
            // No user signed in, render sign-in UI.
            firebaseAuthUi.reset();
            firebaseAuthUi.start(signInDiv, uiConfig);

            context.user = undefined;
        }
    });

    const panelManager = new PanelManager();
    const library = new Library();

    const navbar = createNavbar(
        () => panelManager.open(),
        () => {
            if (signInDialog !== undefined) {
                signInDialog.close();
            }
            signInDialog = new DialogBox("Sign In", signInDiv);
        },
        () => firebase.auth().signOut());
    const screenDiv = document.createElement("div");
    screenDiv.classList.add("main-computer-screen");

    const screen = new CanvasScreen(1.5);
    screenDiv.append(screen.getNode());
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
    controlPanel.addSettingsButton(hardwareSettingsPanel);
    controlPanel.addSettingsButton(viewPanel);
    // const progressBar = new ProgressBar(screen.getNode());
    // cassette.setProgressBar(progressBar);

    body.append(navbar);
    body.append(screenDiv);

    let wasTrs80Started = false;
    panelManager.onOpenClose.subscribe(isOpen => {
        if (isOpen) {
            wasTrs80Started = trs80.stop();
        } else {
            if (wasTrs80Started) {
                trs80.start();
            }
        }
    });

    document.addEventListener("keydown", event => {
        if (event.ctrlKey && event.key === "l") {
            panelManager.toggle();
        }
    });

    reboot();

    const context = new Context(library, trs80, db, panelManager);

    context.onUser.subscribe(user => {
        body.classList.toggle("signed-in", user !== undefined);
        body.classList.toggle("signed-out", user === undefined);
    });

    // TODO make this button appear and disappear as we have/not have a program.
    controlPanel.addScreenshotButton(() => {
        if (context.runningFile !== undefined) {
            let file = context.runningFile;
            const screenshot = trs80.getScreenshot();
            const screenshots = [...file.screenshots, screenshot];
            file = file.builder()
                .withScreenshots(screenshots)
                .withModifiedAt(new Date())
                .build();
            context.db.updateFile(context.runningFile, file)
                .then(() => context.library.modifyFile(file))
                .catch(() => {
                    // TODO.
                });
        }
    });

    const libraryPanel = new LibraryPanel(context);
    panelManager.pushPanel(libraryPanel);

    context.onUser.subscribe(user => {
        library.removeAll();
        if (user !== undefined) {
            // Fetch all files.
            context.db.getAllFiles(user.uid)
                .then((querySnapshot) => {
                    for (const doc of querySnapshot.docs) {
                        const file = FileBuilder.fromDoc(doc).build();
                        library.addFile(file);
                    }
                });
        }
    })
}
