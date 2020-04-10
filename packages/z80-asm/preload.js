
// This script is automatically run in the renderer context because
// it's specified in the "preload" option when launching a new
// BrowserWindow instance.

const { ipcRenderer } = require("electron");

// Expose ipcRenderer to the renderer process so it can communicate
// with the main process.
window.ipcRenderer = ipcRenderer;

