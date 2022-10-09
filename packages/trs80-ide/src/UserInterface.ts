import {
    Extension,
} from "@codemirror/state"
import {solarizedDark} from 'cm6-theme-solarized-dark'
import {solarizedLight} from 'cm6-theme-solarized-light'
import {basicDark} from 'cm6-theme-basic-dark'
import {basicLight} from 'cm6-theme-basic-light'
import {gruvboxDark} from 'cm6-theme-gruvbox-dark'
import {gruvboxLight} from 'cm6-theme-gruvbox-light'
import {materialDark} from 'cm6-theme-material-dark'
import {nord} from 'cm6-theme-nord'

import {breakdwn} from "./breakdwn";
import {scarfman} from "./scarfman";
import {createMenubar, getMenuEntryById, isMenuCommand, isMenuParent, Menu, MenuCommand} from "./Menubar";
import {downloadFromRetroStore, uploadToRetroStore} from "./RetroStore";
import {Emulator} from "./Emulator";
import {Editor} from "./Editor";
import {wolf} from "./wolf";
import { fileOpen, fileSave } from "browser-fs-access"

// So that if we later have different types of files (images, project files), the user agent
// can have a different default or current directory for each.
const ASSEMBLY_LANGUAGE_FILES_DIR_ID = "asm_files";

// File extensions for assembly language files.
const ASSEMBLY_LANGUAGE_EXTENSIONS = [".asm", ".s"];

const simpleExample = `        .org 0x9000

        ld a,191
        ld hl,15360
        ld b,10
        
loop:
        ld (hl),a
        inc hl
        djnz loop

stop:
        jp stop
`;

const screenshotExample = `        .org 0x9000
        
        ld hl,screenshot
        ld de,15360
draw:
        ld a,(hl)
        or a
        jr z,enddraw
        ld (de),a
        inc de
        inc hl
        jr draw

enddraw:

stop:
        jp stop

        ; Screenshot
screenshot:
        .byte 65, 66
        ; End screenshot
        .byte 0
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

// Available themes.
const THEMES = [
    {
        extension: basicLight,
        name: 'Basic Light'
    },
    {
        extension: basicDark,
        name: 'Basic Dark'
    },
    {
        extension: solarizedLight,
        name: 'Solarized Light'
    },
    {
        extension: solarizedDark,
        name: 'Solarized Dark'
    },
    {
        extension: materialDark,
        name: 'Material Dark'
    },
    {
        extension: nord,
        name: 'Nord'
    },
    {
        extension: gruvboxLight,
        name: 'Gruvbox Light'
    },
    {
        extension: gruvboxDark,
        name: 'Gruvbox Dark'
    },
];
const DEFAULT_THEME_INDEX = 3;

// Available examples.
const EXAMPLES = [
    { name: "Simple", code: simpleExample },
    { name: "Screenshot", code: screenshotExample },
    { name: "Space Invaders", code: spaceInvaders },
    { name: "Wolfenstein", code: wolf },
    { name: "Breakdown", code: breakdwn },
    { name: "Scarfman", code: scarfman },
];

// Get the color theme we should use initially.
export function getDefaultTheme(): Extension {
    return THEMES[DEFAULT_THEME_INDEX].extension;
}

// Get the code we should display initially.
export function getDefaultExample(): string {
    return simpleExample;
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
                        id: "examples-list",
                        text: "Examples",
                        menu: [],
                    },
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
                    },
                ],
            },
            {
                text: "View",
                menu: [
                    {
                        id: "theme-list",
                        text: "Editor Theme",
                        menu: [],
                    },
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
                    },
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
                    {
                        text: "Clear All Breakpoints",
                        action: () => {
                            editor.clearAllBreakpoints();
                        },
                    },
                ],
            }
        ];

        const body = document.body;
        body.classList.add("dark-mode", "work-mode");

        const content = document.createElement("div");
        content.classList.add("content");
        body.append(content);

        const leftPane = document.createElement("div");
        leftPane.classList.add("left-pane");
        const examplesMenu = getMenuEntryById(menu, "examples-list");
        if (examplesMenu !== undefined && isMenuParent(examplesMenu)) {
            for (const example of EXAMPLES) {
                examplesMenu.menu.push({
                    text: example.name,
                    action: () => {
                        emulator.closeScreenEditor();
                        editor.setCode(example.code);
                    },
                });
            }
        }
        const themeMenu = getMenuEntryById(menu, "theme-list");
        if (themeMenu !== undefined && isMenuParent(themeMenu)) {
            const menu = themeMenu.menu;

            function updateCheckmarks(index: number): void {
                for (let i = 0; i < THEMES.length; i++) {
                    const menuEntry = menu[i];
                    if (isMenuCommand(menuEntry)) {
                        menuEntry.setChecked?.(i === index);
                    }
                }
            }

            for (let i = 0; i < THEMES.length; i++) {
                const theme = THEMES[i];

                themeMenu.menu.push({
                    text: theme.name,
                    action: () => {
                        editor.setTheme(theme);
                        updateCheckmarks(i);
                    },
                    checked: i == DEFAULT_THEME_INDEX,
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
     * Prompt the user to open a new asm file.
     */
    private async openFile(editor: Editor) {
        const blob = await fileOpen({
            description: "Assembly Language files",
            extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
            id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
        });
        const text = await blob.text();
        editor.setCode(text, blob.handle);
    }

    /**
     * Prompt the user to save the current asm file.
     */
    private async saveFile(editor: Editor) {
        const text = editor.getCode();
        const blob = new Blob([text], {
            type: "text/plain",
        });
        const handle = editor.getFileHandle();
        await fileSave(blob, {
            id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
            extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
        }, handle);
    }
}
