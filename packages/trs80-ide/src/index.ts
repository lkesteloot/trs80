import "./style.css";
import {UserInterface} from "./UserInterface.js";
import {Emulator} from "./Emulator.js";
import {Editor} from "./Editor.js";
import { BUILD_DATE, BUILD_GIT_HASH } from './build';

console.log("Build hash: " + BUILD_GIT_HASH);
console.log("Build date: " + new Date(BUILD_DATE*1000));

const gEmulator = new Emulator();
const gEditor = new Editor(gEmulator);
const gUserInterface = new UserInterface(gEmulator, gEditor);
