import "./style.css";
import {UserInterface} from "./UserInterface.js";
import {Emulator} from "./Emulator.js";
import {Editor} from "./Editor.js";
import { BUILD_DATE, BUILD_GIT_HASH } from './build';
import {loadSettings} from "./Settings";

console.log("Build hash: " + BUILD_GIT_HASH);
console.log("Build date: " + new Date(BUILD_DATE*1000));

const gSettings = loadSettings();
const gEmulator = new Emulator(gSettings);
const gEditor = new Editor(gSettings, gEmulator);
const gUserInterface = new UserInterface(gSettings, gEmulator, gEditor);
