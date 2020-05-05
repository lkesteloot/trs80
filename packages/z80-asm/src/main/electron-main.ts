import {app, BrowserWindow, dialog, ipcMain, IpcMainEvent, Menu, TouchBar} from 'electron';

const { TouchBarButton } = TouchBar;

function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: `${__dirname}/electron-preload.js`,
            nodeIntegration: true
        }
    });

    // and load the index.html of the app.
    win.loadFile('index.html');

    // Open the DevTools.
    /// win.webContents.openDevTools()
}

// Default value for future Electron versions. Setting this avoids a warning.
app.allowRendererProcessReuse = true;

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    createWindow();
    setupMenus();
    setupTouchBar();
    setupMessageListeners();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
});

function openFile(win: BrowserWindow | null, pathname: string) {
    if (!win) {
        win = BrowserWindow.getFocusedWindow();
    }
    if (!win) {
        return;
    }

    win.webContents.send("set-pathname", pathname);
    app.addRecentDocument(pathname);
}

app.on('open-file', (event, pathname) => {
    event.preventDefault();
    openFile(null, pathname);
});

const isMac = process.platform === 'darwin';

const template = [
    ...(isMac ? [{
        label: app.name,
        submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
        ]
    }] : []),
    {
        label: 'File',
        submenu: [
            {
                label: "New",
                click: (event: any, focusedWindow: BrowserWindow, focusedWebContents: any) => {
                    focusedWindow.webContents.send("set-pathname", "");
                },
                accelerator: "CmdOrCtrl+N",
                registerAccelerator: true,
            },
            {
                label: 'Open',
                click: (event: any, focusedWindow: BrowserWindow, focusedWebContents: any) => {
                    dialog.showOpenDialog(focusedWindow, {
                        defaultPath: "/Users/lk/mine/ZED-80/src/zed-80",
                        filters: [
                            { name: 'Assembly', extensions: ['asm', 'inc', 's'] },
                            { name: 'All Files', extensions: ['*'] }
                        ],
                        properties: [
                            'openFile',             // Can open individual files.
                        ]
                    }).then(result => {
                        if (result.filePaths.length > 0) {
                            openFile(focusedWindow, result.filePaths[0]);
                        }
                    }).catch(err => {
                        console.log(err)
                    });
                },
                accelerator: "CmdOrCtrl+O",
                registerAccelerator: true,

            },
            // Doesn't seem to work:
            // { role: 'recentDocuments' },
            {
                label: "Save",
                click: (event: any, focusedWindow: BrowserWindow, focusedWebContents: any) => {
                    focusedWindow.webContents.send("save");
                },
                accelerator: "CmdOrCtrl+S",
            },
            isMac ? { role: 'close' } : { role: 'quit' }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            ...(isMac ? [
                { role: 'pasteAndMatchStyle' },
                { role: 'delete' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                    label: 'Speech',
                    submenu: [
                        { role: 'startspeaking' },
                        { role: 'stopspeaking' }
                    ]
                }
            ] : [
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' }
            ])
        ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forcereload' },
            { role: 'toggledevtools' },
            { type: 'separator' },
            { role: 'resetzoom' },
            { role: 'zoomin' },
            { role: 'zoomout' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    {
        label: "Navigate",
        submenu: [
            {
                label: "Declaration or Usages",
                accelerator: "CmdOrCtrl+B",
                registerAccelerator: true,
                click: (event: any, focusedWindow: BrowserWindow, focusedWebContents: any) => {
                    focusedWindow.webContents.send("declaration-or-usages");
                },
            },
            {
                label: "Next Usage",
                accelerator: "Shift+CmdOrCtrl+B",
                registerAccelerator: true,
                click: (event: any, focusedWindow: BrowserWindow, focusedWebContents: any) => {
                    focusedWindow.webContents.send("next-usage");
                },
            },
        ],
    },
    {
        label: "Code",
        submenu: [
            {
                label: "Fold All",
                accelerator: "Shift+CmdOrCtrl+-",
                registerAccelerator: true,
                click: (event: any, focusedWindow: BrowserWindow, focusedWebContents: any) => {
                    focusedWindow.webContents.send("fold-all");
                },
            },
            {
                label: "Unfold All",
                accelerator: "Shift+CmdOrCtrl+Plus",
                registerAccelerator: true,
                click: (event: any, focusedWindow: BrowserWindow, focusedWebContents: any) => {
                    focusedWindow.webContents.send("unfold-all");
                },
            },
        ],
    },
    {
        label: 'Window',
        submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            ...(isMac ? [
                { type: 'separator' },
                { role: 'front' },
                { type: 'separator' },
                { role: 'window' }
            ] : [
            { role: 'close' }
            ])
        ]
    },
    {
        role: 'help',
        submenu: [
            {
            label: 'Learn More',
            click: async () => {
                const { shell } = require('electron');
                await shell.openExternal('https://electronjs.org');
            }
        }
        ]
    }
];

function setupMenus() {
    const menu = Menu.buildFromTemplate(template as any);
    Menu.setApplicationMenu(menu)
}

function setupTouchBar() {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
        return;
    }

    const nextErrorButton = new TouchBarButton({
        label: 'Next Error',
        click: () => {
            win.webContents.send("next-error");
        },
    });
    const touchBar = new TouchBar({
        items: [
            nextErrorButton,
        ],
    });
    win.setTouchBar(touchBar);
}

function setupMessageListeners() {
    ipcMain.on("ask-for-filename", () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) {
            return;
        }

        dialog.showSaveDialog(win, {
            defaultPath: "/Users/lk/mine/ZED-80/src/zed-80",
            filters: [
                { name: 'Assembly', extensions: ['asm', 'inc', 's'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: [
                "createDirectory",      // Allow creation of directory.
                "showOverwriteConfirmation"
            ]
        }).then(result => {
            win.webContents.send("asked-for-filename", result.filePath);
        }).catch(err => {
            console.log(err);
            win.webContents.send("asked-for-filename", undefined);
        });
    });
    ipcMain.on("set-window-title", (event: IpcMainEvent, title: string) => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) {
            return;
        }

        win.setTitle(title);
    });
}
