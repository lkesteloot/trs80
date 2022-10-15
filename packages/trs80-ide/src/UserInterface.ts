import {breakdwn} from "./breakdwn";
import {scarfman} from "./scarfman";
import {createMenubar, getMenuEntryById, isMenuCommand, isMenuParent, Menu, MenuCommand} from "./Menubar";
import {downloadFromRetroStore, uploadToRetroStore} from "./RetroStore";
import {Emulator} from "./Emulator";
import {Editor} from "./Editor";
import {wolf} from "./wolf";
import { fileOpen, fileSave } from "browser-fs-access"
import { binaryAsCasFile, casAsAudio, DEFAULT_SAMPLE_RATE, writeWavFile } from "trs80-cassette";

// So that if we later have different types of files (images, project files), the user agent
// can have a different default or current directory for each.
const ASSEMBLY_LANGUAGE_FILES_DIR_ID = "asm_files";

// File extensions for assembly language files.
const ASSEMBLY_LANGUAGE_EXTENSIONS = [".asm", ".s", ".z"];

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
const TEMPLATES = [
    { name: "Minimal", code: minimalTemplate, debugOnly: false },
    { name: "Screenshot", code: screenshotExample, debugOnly: false },
    { name: "Space Invaders", code: spaceInvaders, debugOnly: true },
    { name: "Wolfenstein", code: wolf, debugOnly: true },
    { name: "Breakdown", code: breakdwn, debugOnly: true },
    { name: "Scarfman", code: scarfman, debugOnly: true },
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
                            await this.saveFile(editor);
                        },
                    },
                    {
                        text: "Export",
                        menu: [
                            {
                                text: "Diskette program (.cmd)",
                                action: () => {
                                    const binary = editor.makeCmdFile();
                                    if (binary !== undefined) {
                                        this.exportFile(binary, editor.getName(), "cmd");
                                    }
                                },
                            },
                            {
                                text: "Cassette program (.cas)",
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
                                text: "Cassette audio (.wav, low speed)",
                                action: () => {
                                    this.exportWav(editor, 500);
                                },
                            },
                            {
                                text: "Cassette audio (.wav, high speed)",
                                action: () => {
                                    this.exportWav(editor, 1500);
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
                        action: () => editor.toggleComment(),
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
                ],
            },
            {
                text: "Navigate",
                menu: [
                    {
                        text: "Declaration or Usages",
                        action: () => {
                            editor.jumpToDefinition(false);
                        },
                        hotkey: "Cmd-B",
                    },
                    {
                        text: "Next Declaration or Usages",
                        action: () => {
                            editor.jumpToDefinition(true);
                        },
                        hotkey: "Shift-Cmd-B",
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Next Error",
                        action: () => {
                            editor.nextError();
                        },
                        hotkey: "F2",
                    },
                    {
                        text: "Previous Error",
                        action: () => {
                            editor.prevError();
                        },
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
                        action: () => {
                            editor.toggleBreakpointAtCurrentLine();
                        },
                    },
                    {
                        text: "Clear All Breakpoints",
                        action: () => {
                            editor.clearAllBreakpoints();
                        },
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Step",
                        hotkey: "Meta-Shift-S",
                        action: () => {
                            emulator.step();
                        },
                    },
                    {
                        text: "Continue",
                        hotkey: "Meta-Shift-C",
                        action: () => {
                            emulator.continue();
                        },
                    },
                ],
            },
            {
                text: "Help",
                menu: [
                    {
                        text: "IDE Documentation",
                        action: makeLink("https://lkesteloot.github.io/trs80/"),
                    },
                    {
                        text: "Z80 Instruction Summary",
                        action: makeLink("https://clrhome.org/table/"),
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
        if (newFromExamplesMenu !== undefined && isMenuParent(newFromExamplesMenu)) {
            const debugging = window.location.hostname === "localhost";
            for (const template of TEMPLATES) {
                if (!template.debugOnly || debugging) {
                    newFromExamplesMenu.menu.push({
                        text: template.name,
                        action: async () => {
                            const proceed = await this.promptIfFileModified(editor);
                            if (proceed) {
                                editor.setCode(template.code);
                            }
                        },
                    });
                }
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
        editorDiv.append(editor.getNode(), editor.errorPill);
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
                        this.saveFile(editor)
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
            const blob = await fileOpen({
                description: "Assembly Language files",
                extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
                id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
            });
            const text = await blob.text();
            const name = stripExtension(blob.name);
            editor.setCode(text, name, blob.handle);
        }
    }

    /**
     * Prompt the user to save the current asm file.
     *
     * @return whether the file was saved.
     */
    private async saveFile(editor: Editor): Promise<boolean> {
        const name = editor.getName();
        const fileName = name + ".asm";
        const text = editor.getCode();
        const blob = new Blob([text], {
            type: "text/plain",
        });
        const handle = editor.getFileHandle();
        const newHandle = await fileSave(blob, {
            id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
            fileName: fileName,
            extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
        }, handle);
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
     * Trigger a download for the file.
     *
     * @param contents the contents of the file to download.
     * @param name name of the program (no extension).
     * @param extension the file extension, not including the period.
     */
    private exportFile(contents: ArrayBuffer, name: string, extension: string) {
        extension = extension.toLowerCase();
        const type = extension === "wav" ? "audio/wav" : "application/octet-stream";
        const blob = new Blob([contents], {type: type});

        const a = document.createElement("a");
        a.href = window.URL.createObjectURL(blob);
        a.download = name + "." + extension;
        a.click();
    }
}
