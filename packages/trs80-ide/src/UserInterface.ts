import {breakdwn} from "./breakdwn";
import {scarfman} from "./scarfman";
import {createMenubar, getMenuEntryById, isMenuCommand, isMenuParent, Menu, MenuCommand} from "./Menubar";
import {Emulator, SCREEN_SIZES} from "./Emulator";
import {Editor} from "./Editor";
import {wolf} from "./wolf";
import {fileOpen, fileSave} from "browser-fs-access"
import {binaryAsCasFile, casAsAudio, DEFAULT_SAMPLE_RATE, writeWavFile} from "trs80-cassette";
import {decodeTrs80File, isFloppy} from "trs80-base";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build";

// ID so that the user agent can have a different default or current directory for each.
const ASSEMBLY_LANGUAGE_FILES_DIR_ID = "asm_files";
const FLOPPY_FILES_DIR_ID = "floppy_files";

// File extensions for various file types.
const ASSEMBLY_LANGUAGE_EXTENSIONS = [".asm", ".s", ".z"];
const FLOPPY_FILES_EXTENSIONS = [".jv1", ".jv3", ".dmk", ".dsk"];

const minimalTemplate = `
        ; Where to load the program in memory.
        .org 5200h

main
        ; Disable interrupts.
        di

        ; Set up the stack. This will wrap around to FFFFh.
        ld sp,0

        ; Put your code here.
        ld hl,3C00h             ; Screen memory
        ld (hl),191             ; Graphics block

        ; Infinite loop.
        jr $

        ; Where to start the program.
        end main
`;

const screenshotExample = `
        ; Where to load the program in memory.
        .org 5200h

main
        ; Disable interrupts.
        di

        ; Set up the stack. This will wrap around to FFFFh.
        ld sp,0

        ; Copy the splash screen to the screen.
        ld hl,splash            ; Source of splash screen
        ld de,3C00h             ; Screen memory

draw
        ld a,(hl)               ; Load next byte of splash screen
        or a                    ; See if it's zero
        jr z,enddraw            ; If it is, we're done
        ld (de),a               ; Draw it to the screen
        inc de                  ; Next screen location
        inc hl                  ; Next splash screen location
        jr draw                 ; Handle the next byte
enddraw

        ; Infinite loop.
        jr $

        ; Click the "EDIT" button below to start
        ; the screenshot editor for this section
        ; of the program.
        ; Screenshot
splash
        .byte "Screenshot will go here..."
        ; End screenshot
        .byte 0

        ; Where to start the program.
        end main
`;

const spaceInvaders = `        .org 0x9000
        di
        ; Set up stack.
        ld hl,0
        ld sp,hl

top:
        ld hl,15360
        ld b,100
        
loop:
        ; Draw alien.
        push hl
        ld (hl),0x80
        inc hl
        ld (hl),0x89
        inc hl
        ld (hl),0xB7
        inc hl
        ld (hl),0x9D
        inc hl
        ld (hl),0x81
        inc hl

        pop hl
        inc hl

        ; Delay loop.
        push bc
        ld bc,1500
wait:
        dec bc
        ld a,b
        or a,c
        jr nz,wait
        pop bc

        djnz loop

        jp top
`;

/**
 * Make a function that, when run, takes the user to the link.
 */
function makeLink(link: string): () => void {
    return () => {
        const a = document.createElement("a");
        a.href = link;
        a.target = "_blank";
        a.click();
    };
}

// Available templates.
interface Template {
    label: string;
    filename: string;
    code: string;
    debugOnly: boolean;
}
const TEMPLATES: Template[] = [
    { label: "Minimal", filename: "minimal", code: minimalTemplate, debugOnly: false },
    { label: "Screenshot", filename: "screenshot", code: screenshotExample, debugOnly: false },
    { label: "Wolfenstein 3D", filename: "wolfenstein", code: wolf, debugOnly: false },
    { label: "Space Invaders", filename: "space", code: spaceInvaders, debugOnly: true },
    { label: "Breakdown", filename: "breakdwn", code: breakdwn, debugOnly: true },
    { label: "Scarfman", filename: "scarfman", code: scarfman, debugOnly: true },
];

// Get the code we should display initially.
export function getDefaultExample(): string {
    return minimalTemplate;
}

// Return the filename with the extension stripped (including the period).
function stripExtension(name: string): string {
    const i = name.lastIndexOf(".");
    if (i >= 0) {
        name = name.substring(0, i);
    }

    return name;
}

// Show the About dialog box.
function showAboutDialogBox() {
    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    dialog.classList.add("about-dialog");

    const title = document.createElement("div");
    title.textContent = "TRS-80 IDE";
    title.classList.add("about-dialog-title");

    const byline = document.createElement("div");
    byline.textContent = "Lawrence Kesteloot";
    byline.classList.add("about-dialog-byline");

    const version = document.createElement("div");
    version.textContent = "Version " + BUILD_GIT_HASH.substring(0, 7);
    version.classList.add("about-dialog-version");

    const date = document.createElement("div");
    const buildDate = new Date(BUILD_DATE*1000);
    date.textContent = buildDate.toLocaleDateString("en-US",
        {year: "numeric", month: "long", day: "numeric"});
    date.classList.add("about-dialog-date");

    const closeButton = document.createElement("button");
    closeButton.textContent = "OK";
    closeButton.classList.add("about-dialog-close-button");
    closeButton.addEventListener("click", () => dialog.close());

    dialog.append(title, byline, version, date, closeButton);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
}

// Everything related to the menus and the top-level UI.
export class UserInterface {
    public constructor(emulator: Emulator, editor: Editor) {
        // Pull-down menu.
        const menu: Menu = [
            {
                text: "File",
                menu: [
                    {
                        text: "New",
                        // Can't override Cmd-N in browsers.
                        // hotkey: "Cmd-N",
                        action: async () => {
                            await this.newFile(editor);
                        },
                    },
                    {
                        id: "template-list",
                        text: "New From Template",
                        menu: [],
                    },
                    {
                        text: "Open...",
                        hotkey: "Cmd-O",
                        action: async () => {
                            await this.openFile(editor);
                        },
                    },
                    {
                        text: "Save",
                        hotkey: "Cmd-S",
                        action: async () => {
                            await this.saveFile(editor, false);
                        },
                    },
                    {
                        text: "Save As...",
                        action: async () => {
                            await this.saveFile(editor, true);
                        },
                    },
                    {
                        text: "Export",
                        menu: [
                            {
                                text: "Diskette Program (.cmd)",
                                action: () => {
                                    const binary = editor.makeCmdFile();
                                    if (binary !== undefined) {
                                        this.exportFile(binary, editor.getName(), "cmd");
                                    }
                                },
                            },
                            {
                                text: "Cassette Program (.cas)",
                                action: () => {
                                    let binary = editor.makeSystemFile();
                                    if (binary !== undefined) {
                                        // Convert to CAS.
                                        binary = binaryAsCasFile(binary, 500);
                                        this.exportFile(binary, editor.getName(), "cas");
                                    }
                                },
                            },
                            {
                                text: "Raw Binary (.bin)",
                                action: () => {
                                    const binary = editor.makeRawBinaryFile();
                                    this.exportFile(binary, editor.getName(), "bin");
                                },
                            },
                            {
                                text: "Intel HEX (.hex)",
                                action: () => {
                                    const binary = editor.makeIntelHexFile();
                                    this.exportFile(binary, editor.getName(), "hex");
                                },
                            },
                            {
                                text: "Cassette Audio (.wav, low speed)",
                                action: () => {
                                    this.exportWav(editor, 500);
                                },
                            },
                            {
                                text: "Cassette Audio (.wav, high speed)",
                                action: () => {
                                    this.exportWav(editor, 1500);
                                },
                            },
                        ],
                    },
                    {
                        text: "Play Cassette Audio",
                        menu: [
                            {
                                text: "Low Speed",
                                action: () => {
                                    this.playWav(editor, 500);
                                },
                            },
                            {
                                text: "High Speed",
                                action: () => {
                                    this.playWav(editor, 1500);
                                },
                            },
                        ],
                    },
                    // Disable this, was only for demo.
                    /*
                    {
                        text: "Upload to RetroStore",
                        action: async () => {
                            const assemblyResults = editor.getAssemblyResults();
                            await uploadToRetroStore(assemblyResults);
                        },
                    },
                    {
                        text: "Download from RetroStore",
                        action: async () => {
                            const code = await downloadFromRetroStore();
                            if (code !== undefined) {
                                emulator.closeScreenEditor();
                                editor.setCode(code);
                            }
                        },
                    },*/
                ],
            },
            {
                text: "Edit",
                menu: [
                    {
                        text: "Undo",
                        hotkey: "Cmd-Z",
                        action: () => editor.undo(),
                    },
                    {
                        text: "Redo",
                        hotkey: "Cmd-Y",
                        macHotkey: "Shift-Cmd-Z",
                        action: () => editor.redo(),
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Find...",
                        hotkey: "Cmd-F",
                        action: () => editor.openSearchPanel(),
                    },
                    {
                        text: "Find Next",
                        hotkey: "F3",
                        macHotkey: "Cmd-G",
                        action: () => editor.findNext(),
                    },
                    {
                        text: "Find Previous",
                        hotkey: "Shift-F3",
                        macHotkey: "Shift-Cmd-G",
                        action: () => editor.findPrevious(),
                    },
                    {
                        text: "Select Next Occurrence",
                        hotkey: "Cmd-D",
                        action: () => editor.selectNextOccurrence(),
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Select All",
                        hotkey: "Cmd-A",
                        action: () => editor.selectAll(),
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Toggle Comment",
                        hotkey: "Cmd-/",
                        action: () => editor.toggleCommentAndMoveDown(),
                    },
                    {
                        text: "Move Line Up",
                        hotkey: "Alt-ArrowUp",
                        action: () => editor.moveLineUp(),
                    },
                    {
                        text: "Move Line Down",
                        hotkey: "Alt-ArrowDown",
                        action: () => editor.moveLineDown(),
                    },
                ],
            },
            {
                text: "View",
                menu: [
                    // Disable presentation mode, it's really only for demos.
                    /*
                    {
                        text: "Presentation Mode",
                        action: (menuCommand: MenuCommand) => {
                            // Toggle current mode.
                            const presentationMode = !(menuCommand.checked ?? false);
                            editor.setPresentationMode(presentationMode);
                            document.body.classList.toggle("presentation-mode", presentationMode);
                            document.body.classList.toggle("work-mode", !presentationMode);
                            menuCommand.setChecked?.(presentationMode);
                        },
                    },
                    {
                        separator: true,
                    },*/
                    {
                        text: "Show Line Numbers",
                        checked: true,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowLineNumbers(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        text: "Show Addresses",
                        checked: true,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowAddresses(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        text: "Show Bytecode",
                        checked: true,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowBytecode(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        text: "Show Timing",
                        checked: false,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowTiming(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Show Statistics",
                        checked: false,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowStats(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        separator: true,
                    },
                    {
                        id: "screen-size",
                        text: "Screen Size",
                        menu: [],
                    },
                ],
            },
            {
                text: "Navigate",
                menu: [
                    {
                        text: "Back",
                        action: () => editor.back(),
                        hotkey: "Cmd-[",
                    },
                    {
                        text: "Forward",
                        action: () => editor.forward(),
                        hotkey: "Cmd-]",
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Declaration or Usage",
                        action: () => editor.jumpToDefinition(false, true),
                        hotkey: "Cmd-B",
                    },
                    {
                        text: "Next Declaration or Usage",
                        action: () => editor.jumpToDefinition(true, true),
                        hotkey: "Shift-Cmd-B",
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Next Error",
                        action: () => editor.nextError(),
                        hotkey: "F2",
                    },
                    {
                        text: "Previous Error",
                        action: () => editor.prevError(),
                        hotkey: "Shift-F2",
                    },
                ],
            },
            {
                text: "Run",
                menu: [
                    {
                        text: "Run",
                        action: () => {
                            const assemblyResults = editor.getAssemblyResults();
                            emulator.runProgram(assemblyResults);
                        },
                        hotkey: "Cmd-R",
                    },
                    {
                        id: "auto-run",
                        text: "Auto-run",
                        checked: editor.autoRun,
                        action: (menuCommand: MenuCommand) => {
                            const autoRun = !menuCommand.checked;
                            menuCommand.setChecked?.(autoRun);
                            editor.autoRun = autoRun;
                        },
                    },
                ],
            },
            {
                text: "Debug",
                menu: [
                    {
                        text: "Toggle Breakpoint",
                        hotkey: "F9",
                        action: () => editor.toggleBreakpointAtCurrentLine(),
                    },
                    {
                        text: "Clear All Breakpoints",
                        action: () => editor.clearAllBreakpoints(),
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Break",
                        action: () => emulator.breakProgram(),
                    },
                    {
                        text: "Step",
                        hotkey: "Meta-Shift-S",
                        action: () => emulator.step(),
                    },
                    {
                        text: "Step Over",
                        hotkey: "Meta-Shift-O",
                        action: () => emulator.stepOver(),
                    },
                    {
                        text: "Continue",
                        hotkey: "Meta-Shift-C",
                        action: () => emulator.continue(),
                    },
                    {
                        text: "Run to Line",
                        hotkey: "Meta-Shift-L",
                        action: () => {
                            const address = editor.getCurrentLineAddress();
                            if (address !== undefined) {
                                emulator.trs80.setOneShotBreakpoint(address);
                                emulator.continue();
                            }
                        },
                    },
                    {
                        separator: true,
                    },
                    {
                        id: "cpu-speed",
                        text: "CPU Speed",
                        menu: [],
                    },
                ],
            },
            {
                text: "Mount",
                menu: [
                    {
                        text: "Insert Floppy...",
                        action: async () => {
                            await this.mountFloppy(emulator);
                        },
                    },
                    {
                        text: "Eject Floppy",
                        action: () => {
                            emulator.trs80.loadFloppyDisk(undefined, 0);
                        },
                    },
                ],
            },
            {
                text: "Help",
                menu: [
                    {
                        text: "About TRS-80 IDE",
                        action: () => {
                            showAboutDialogBox();
                        },
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "IDE Documentation",
                        action: makeLink("https://lkesteloot.github.io/trs80/ide/"),
                    },
                    {
                        text: "Emulator Documentation",
                        action: makeLink("https://lkesteloot.github.io/trs80/emulator/"),
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Z80 Instruction Summary",
                        action: makeLink("https://clrhome.org/table/"),
                    },
                    {
                        text: "16-bit Shifts",
                        action: makeLink("https://www.chilliant.com/z80shift.html"),
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Github",
                        action: makeLink("https://github.com/lkesteloot/trs80/tree/master/packages/trs80-ide"),
                    },
                    {
                        text: "Feedback",
                        action: makeLink("mailto:lk@teamten.com"),
                    },
                ],
            },
        ];

        const body = document.body;
        body.classList.add("dark-mode", "work-mode");

        const content = document.createElement("div");
        content.classList.add("content");
        body.append(content);

        const leftPane = document.createElement("div");
        leftPane.classList.add("left-pane");
        const newFromExamplesMenu = getMenuEntryById(menu, "template-list");
        if (isMenuParent(newFromExamplesMenu)) {
            const debugging = window.location.hostname === "localhost";
            for (const template of TEMPLATES) {
                if (!template.debugOnly || debugging) {
                    newFromExamplesMenu.menu.push({
                        text: template.label,
                        action: async () => {
                            const proceed = await this.promptIfFileModified(editor);
                            if (proceed) {
                                editor.setCode(template.code, template.filename);
                            }
                        },
                    });
                }
            }
        }
        const cpuSpeedMenu = getMenuEntryById(menu, "cpu-speed");
        if (isMenuParent(cpuSpeedMenu)) {
            const menu = cpuSpeedMenu.menu;
            const SPEEDS = [1, 10, 100, 1000];
            let currentSpeed = 100;
            const updateChecked = () => {
                for (let i = 0; i < menu.length; i++) {
                    const menuEntry = menu[i];
                    if (isMenuCommand(menuEntry)) {
                        menuEntry.setChecked?.(SPEEDS[i] === currentSpeed);
                    }
                }
            };
            for (const speed of SPEEDS) {
                menu.push({
                    text: speed + "%",
                    action: () => {
                        currentSpeed = speed;
                        emulator.trs80.setSpeedMultiplier(speed/100);
                        updateChecked();
                    },
                    checked: speed === currentSpeed,
                });
            }
        }
        const screenSizeMenu = getMenuEntryById(menu, "screen-size");
        if (isMenuParent(screenSizeMenu)) {
            const menu = screenSizeMenu.menu;
            let currentLabel = "large";
            const updateChecked = () => {
                for (let i = 0; i < menu.length; i++) {
                    const menuEntry = menu[i];
                    if (isMenuCommand(menuEntry)) {
                        menuEntry.setChecked?.(SCREEN_SIZES[i].label === currentLabel);
                    }
                }
            };
            for (const size of SCREEN_SIZES) {
                menu.push({
                    text: size.text,
                    action: () => {
                        currentLabel = size.label;
                        emulator.setScreenSize(size);
                        updateChecked();
                    },
                    checked: size.label === currentLabel,
                });
            }
        }
        const menubar = createMenubar(menu);
        const toolbar = document.createElement("div");
        toolbar.classList.add("toolbar");
        // Toolbar is currently empty.
        const editorContainer = document.createElement("div");
        editorContainer.classList.add("editor-container");
        const editorDiv = document.createElement("div");
        editorDiv.classList.add("editor");
        editorDiv.append(editor.getNode(), editor.pillNotice);
        editorContainer.append(editorDiv);
        leftPane.append(menubar, /*toolbar,*/ editorContainer);

        const rightPane = document.createElement("div");
        rightPane.classList.add("right-pane");
        const z80Inspector = emulator.createZ80Inspector();
        rightPane.append(emulator.getNode(), z80Inspector);

        content.append(leftPane, rightPane);
    }

    /**
     * If the user has modified the file, prompt to save it. Returns
     * true if the file was not modified, if the file was saved, or if
     * the user decided to abandon the changes. Returns false if the user
     * canceled the operation (the file was saved but they don't want
     * to proceed with the new operation).
     */
    private async promptIfFileModified(editor: Editor): Promise<boolean> {
        if (editor.fileHasBeenModified()) {
            return new Promise(resolve => {
                // Ask user if they want to save the file.
                const dialog = document.createElement("dialog");
                dialog.classList.add("modal-dialog");
                const promptNode = document.createElement("div");
                promptNode.classList.add("dialog-prompt");
                promptNode.textContent = "The file has been modified. Would you like to save it?";

                const buttonRow = document.createElement("form");
                buttonRow.classList.add("dialog-button-row");
                buttonRow.method = "dialog";

                const dontSaveButton = document.createElement("button");
                dontSaveButton.classList.add("dialog-dont-save-button");
                dontSaveButton.textContent = "Don’t Save";
                dontSaveButton.value = "dont-save";

                const spacer = document.createElement("div");
                spacer.classList.add("dialog-spacer");

                const saveButton = document.createElement("button");
                saveButton.classList.add("dialog-save-button");
                saveButton.textContent = "Save";
                saveButton.value = "save";

                const cancelButton = document.createElement("button");
                cancelButton.classList.add("dialog-cancel-button");
                cancelButton.textContent = "Cancel";
                cancelButton.value = "cancel";

                buttonRow.append(dontSaveButton, spacer, saveButton, cancelButton);
                dialog.append(promptNode, buttonRow);
                document.body.append(dialog);
                dialog.showModal();
                saveButton.focus();

                dialog.addEventListener("close", () => {
                    dialog.remove();

                    const action = dialog.returnValue;
                    if (action === "save") {
                        // Save.
                        this.saveFile(editor, false)
                            .then(saved => {
                                // Continue if we saved.
                                resolve(saved);
                            });
                    } else if (action === "dont-save") {
                        // Don't save.
                        resolve(true);
                    } else {
                        // Cancel or ESC was pressed.
                        resolve(false);
                    }
                });
            });
        } else {
            return true;
        }
    }

    /**
     * Create a new source file.
     */
    private async newFile(editor: Editor) {
        const proceed = await this.promptIfFileModified(editor);
        if (proceed) {
            editor.setCode("");
        }
    }

    /**
     * Prompt the user to open a new asm file.
     */
    private async openFile(editor: Editor) {
        const proceed = await this.promptIfFileModified(editor);
        if (proceed) {
            let blob;

            try {
                blob = await fileOpen({
                    description: "Assembly Language files",
                    extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
                    id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
                });
            } catch (e: any) {
                // Pressed Cancel.
                return;
            }

            const text = await blob.text();
            const name = stripExtension(blob.name);
            editor.setCode(text, name, blob.handle);
        }
    }

    /**
     * Prompt the user to save the current asm file.
     *
     * @param editor editor that has the file to save.
     * @param saveAs whether to always show the filename prompt.
     *
     * @return whether the file was saved.
     */
    private async saveFile(editor: Editor, saveAs: boolean): Promise<boolean> {
        const name = editor.getName();
        const fileName = name + ".asm";
        const text = editor.getCode();
        const blob = new Blob([text], {
            type: "text/plain",
        });
        const handle = saveAs ? null : editor.getFileHandle();
        let newHandle;

        try {
            newHandle = await fileSave(blob, {
                id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
                fileName: fileName,
                extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
            }, handle);
        } catch (e: any) {
            // Pressed Cancel.
            return false;
        }

        if (newHandle === null) {
            return false;
        } else {
            editor.setName(stripExtension(newHandle.name));
            editor.setHandle(newHandle);
            editor.fileWasSaved();
            return true;
        }
    }

    /**
     * Trigger download of a WAV file at the specified baud rate.
     */
    private exportWav(editor: Editor, baud: number) {
        let binary = editor.makeSystemFile();
        if (binary !== undefined) {
            // Convert to CAS.
            binary = binaryAsCasFile(binary, baud);

            // Convert to WAV.
            const audio = casAsAudio(binary, baud, DEFAULT_SAMPLE_RATE);
            binary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);

            this.exportFile(binary, editor.getName(), "wav");
        }
    }

    /**
     * Convert an array of bytes to a blob: URL that can be used in src or href attributes.
     *
     * @param contents the data to encode.
     * @param extension the file extension, not including the period.
     */
    private arrayToBlobUrl(contents: ArrayBuffer, extension: string): string {
        let type: string;
        switch (extension.toLowerCase()) {
            case "wav":
                type = "audio/wav";
                break;

            case "hex":
                type = "text/plain";
                break;

            default:
                type = "application/octet-stream";
                break;
        }

        const blob = new Blob([contents], {type});

        return window.URL.createObjectURL(blob);
    }

    /**
     * Trigger a download for the file.
     *
     * @param contents the contents of the file to download.
     * @param name name of the program (no extension).
     * @param extension the file extension, not including the period.
     */
    private exportFile(contents: ArrayBuffer, name: string, extension: string) {
        const a = document.createElement("a");
        a.href = this.arrayToBlobUrl(contents, extension);
        a.download = name + "." + extension.toLowerCase();
        a.click();
    }

    /**
     * Show dialog box for playing the WAV file at the specified baud rate.
     */
    private playWav(editor: Editor, baud: number) {
        let binary = editor.makeSystemFile();
        if (binary === undefined) {
            return;
        }

        // Convert to CAS.
        binary = binaryAsCasFile(binary, baud);

        // Convert to WAV.
        const audio = casAsAudio(binary, baud, DEFAULT_SAMPLE_RATE);
        binary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);

        // Dialog box contents.
        const cass = baud <= 1000 ? "L" : "H";
        const nameLetter = (editor.getName()[0] ?? "A").toUpperCase();
        const src = this.arrayToBlobUrl(binary, "wav");

        // Get the DOM nodes.
        const dialogBox = document.querySelector(".audio-playback-dialog-box") as HTMLDialogElement;
        const closeButton = document.querySelector(".audio-playback-close") as HTMLElement;
        const audioNode = document.querySelector(".audio-playback-player") as HTMLAudioElement;
        const cassNode = document.querySelector(".audio-playback-cass") as HTMLElement;
        const nameLetterNode = document.querySelector(".audio-playback-name-letter") as HTMLElement;
        if (dialogBox === null || closeButton === null || audioNode === null || cassNode === null || nameLetterNode === null) {
            return;
        }

        // Configure events once.
        if (dialogBox.dataset.configured !== "true") {
            dialogBox.dataset.configured = "true";
            dialogBox.addEventListener("close", () => audioNode.pause());
            closeButton.addEventListener("click", () => dialogBox.close());
        }

        cassNode.textContent = cass;
        nameLetterNode.textContent = nameLetter;
        audioNode.src = src;
        audioNode.volume = 0.5;

        dialogBox.showModal();
    }

    /**
     * Prompt the user to open a floppy, and mount it.
     */
    private async mountFloppy(emulator: Emulator) {
        let blob;

        try {
            blob = await fileOpen({
                description: "Floppy disk files",
                extensions: FLOPPY_FILES_EXTENSIONS,
                id: FLOPPY_FILES_DIR_ID,
            });
        } catch (e: any) {
            // Pressed Cancel.
            return;
        }

        const text = new Uint8Array(await blob.arrayBuffer());
        const floppy = decodeTrs80File(text, { filename: blob.name });
        if (isFloppy(floppy)) {
            emulator.trs80.loadFloppyDisk(floppy, 0);
        } else {
            await this.showDialogBox("Uploaded file is not a floppy.");
        }
    }

    /**
     * Show generic dialog box with a message and OK button.
     */
    private async showDialogBox(message: string): Promise<void> {
        return new Promise(resolve => {
            // Ask user if they want to save the file.
            const dialog = document.createElement("dialog");
            dialog.classList.add("modal-dialog");
            const promptNode = document.createElement("div");
            promptNode.classList.add("dialog-prompt");
            promptNode.textContent = message;

            const buttonRow = document.createElement("form");
            buttonRow.classList.add("dialog-button-row");
            buttonRow.method = "dialog";

            const spacer = document.createElement("div");
            spacer.classList.add("dialog-spacer");

            const okButton = document.createElement("button");
            okButton.classList.add("dialog-ok-button");
            okButton.textContent = "OK";
            okButton.value = "ok";

            buttonRow.append(spacer, okButton);
            dialog.append(promptNode, buttonRow);
            document.body.append(dialog);
            dialog.showModal();
            okButton.focus();

            dialog.addEventListener("close", () => {
                dialog.remove();
                resolve();
            });
        });
    }
}
