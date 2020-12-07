import Navigo from "navigo";
import {showScreen} from "./Router";

export function createHome(router: Navigo): HTMLElement {
    const screen = document.createElement("div");

    screen.innerHTML = "home";

    router.on("/home", function () {
        showScreen(screen);
    });

    return screen;
}
