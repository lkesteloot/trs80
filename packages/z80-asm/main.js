const fs = require("fs");
const { app, BrowserWindow, Menu, dialog, TouchBar } = require('electron');
const { TouchBarButton } = TouchBar;

function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: `${__dirname}/preload.js`,
            nodeIntegration: true
        }
    });

    // and load the index.html of the app.
    win.loadFile('docs/index.html');

    // Open the DevTools.
    /// win.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    createWindow();
    setupMenus();
    setupTouchBar();
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

function openFile(win, pathname) {
    if (!win) {
        win = BrowserWindow.getFocusedWindow();
    }
    if (!win) {
        return;
    }

    // TODO: handle exception in this call:
    const text = fs.readFileSync(pathname, "utf-8");
    win.webContents.send("set-text", pathname, text);
    app.addRecentDocument(pathname);
}

app.on('open-file', (event, pathname) => {
    event.preventDefault();
    openFile(null, pathname);
});

const isMac = process.platform === 'darwin';

const template = [
    // { role: 'appMenu' }
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
    // { role: 'fileMenu' }
    {
        label: 'File',
        submenu: [
            {
                label: 'Open',
                click: (event, focusedWindow, focusedWebContents) => {
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
            isMac ? { role: 'close' } : { role: 'quit' }
        ]
    },
    // { role: 'editMenu' }
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
    // { role: 'viewMenu' }
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
    // { role: 'windowMenu' }
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
    const menu = Menu.buildFromTemplate(template);
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
