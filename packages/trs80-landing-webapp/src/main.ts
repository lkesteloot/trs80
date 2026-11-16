import {SITE_APPS, SITE_NAME, type SiteApp, type SiteAppId, isSiteTool} from "trs80-site";
import {assertNever} from "z80-base";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build.js";
import "./landing.css";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * One shape in an icon: an SVG tag and its attributes.
 */
type IconShape = [tag: string, attributes: Record<string, string>];

/**
 * How an app looks on this page: its Solarized accent color, its icon, and whether its card is
 * twice as wide as the others.
 */
interface AppLook {
    color: string;
    icon: IconShape[];
    featured: boolean;
}

/**
 * Get the accent color and the icon for an app. The icons are drawn on a 24×24 grid with
 * strokes, so the CSS sets their color and line width.
 */
function getAppLook(id: SiteAppId): AppLook {
    switch (id) {
        case "library":
            // Books on a shelf.
            return {
                color: "var(--blue)",
                featured: true,
                icon: [
                    ["rect", {x: "3.5", y: "4", width: "3.5", height: "15", rx: "0.5"}],
                    ["rect", {x: "8.5", y: "6", width: "3.5", height: "13", rx: "0.5"}],
                    ["path", {d: "M14 6.2l3.3-.9 3.3 12.6-3.3.9z"}],
                    ["path", {d: "M2 21h20"}],
                ],
            };

        case "ide":
            // Angle brackets around a slash.
            return {
                color: "var(--violet)",
                featured: false,
                icon: [
                    ["path", {d: "M8 7l-5 5 5 5"}],
                    ["path", {d: "M16 7l5 5-5 5"}],
                    ["path", {d: "M13.5 4.5l-3 15"}],
                ],
            };

        case "cassette":
            // A cassette tape.
            return {
                color: "var(--orange)",
                featured: false,
                icon: [
                    ["rect", {x: "2", y: "5", width: "20", height: "14", rx: "2"}],
                    ["circle", {cx: "8", cy: "11", r: "2"}],
                    ["circle", {cx: "16", cy: "11", r: "2"}],
                    ["path", {d: "M10 11h4"}],
                    ["path", {d: "M6.5 19l1.5-3h8l1.5 3"}],
                ],
            };

        case "disk":
            // A 5¼-inch floppy disk.
            return {
                color: "var(--green)",
                featured: false,
                icon: [
                    ["rect", {x: "3", y: "3", width: "18", height: "18", rx: "1.5"}],
                    ["circle", {cx: "12", cy: "11", r: "3"}],
                    ["rect", {x: "10.5", y: "16", width: "3", height: "5", rx: "1.5"}],
                    ["circle", {cx: "6.5", cy: "11", r: "0.6"}],
                ],
            };

        case "commander":
            // Two file panels side by side.
            return {
                color: "var(--cyan)",
                featured: false,
                icon: [
                    ["rect", {x: "2", y: "4", width: "20", height: "16", rx: "1.5"}],
                    ["path", {d: "M12 4v16"}],
                    ["path", {d: "M5 8.5h4M5 11.5h4M5 14.5h3"}],
                    ["path", {d: "M15 8.5h4M15 11.5h3M15 14.5h4"}],
                ],
            };

        case "tool":
            // A terminal prompt.
            return {
                color: "var(--yellow)",
                featured: false,
                icon: [
                    ["rect", {x: "2", y: "4", width: "20", height: "16", rx: "2"}],
                    ["path", {d: "M6 9l3 3-3 3"}],
                    ["path", {d: "M12 15h5"}],
                ],
            };

        default:
            assertNever(id);
    }
}

/**
 * Make an element with a class name and optional text.
 */
function makeElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

/**
 * Make an SVG icon from its shapes.
 */
function makeIcon(shapes: IconShape[]): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attributes] of shapes) {
        const shape = document.createElementNS(SVG_NS, tag);
        for (const [name, value] of Object.entries(attributes)) {
            shape.setAttribute(name, value);
        }
        svg.append(shape);
    }
    return svg;
}

/**
 * Make the link that shows one app: its icon, name, path, and description.
 */
function makeAppLink(app: SiteApp, className: string): HTMLAnchorElement {
    const look = getAppLook(app.id);

    const link = makeElement("a", className);
    link.classList.toggle("featured", look.featured);
    link.href = app.path;
    link.style.setProperty("--app-color", look.color);

    const icon = makeElement("span", "app-icon");
    icon.append(makeIcon(look.icon));

    const text = makeElement("span", "app-text");
    const heading = makeElement("span", "app-heading");
    heading.append(makeElement("span", "app-name", app.name), makeElement("span", "app-path", app.path));
    text.append(heading, makeElement("span", "app-description", app.description));

    link.append(icon, text);
    return link;
}

/**
 * Make the wide link to the tool, with a few example commands in a terminal.
 */
function makeToolLink(app: SiteApp): HTMLAnchorElement {
    const link = makeAppLink(app, "tool");

    const terminal = makeElement("span", "terminal");
    terminal.setAttribute("aria-hidden", "true");
    for (const command of ["dir game.dsk", "convert in.wav out.cas", "run frogger.cmd"]) {
        const line = makeElement("span", "terminal-line");
        line.append(makeElement("span", "terminal-prompt", "% "), "trs80-tool " + command);
        terminal.append(line);
    }
    link.append(terminal);

    return link;
}

/**
 * Build the whole page: a header, a card per app, the tool, and a footer.
 */
function main(): void {
    console.log("Build hash: " + BUILD_GIT_HASH);
    console.log("Build date: " + new Date(BUILD_DATE*1000));

    const header = makeElement("header", "hero");
    const heroInner = makeElement("div", "hero-inner");
    const title = makeElement("h1", "wordmark");
    title.append(SITE_NAME, makeElement("span", "cursor"));
    heroInner.append(
        makeElement("p", "kicker", "TRS-80 Model I, III, and 4"),
        title,
        makeElement("p", "tagline",
            "Free tools for the TRS-80: run it, write for it, and rescue its tapes and disks. " +
            "Five apps in your browser, and one for your terminal."));
    header.append(heroInner);

    const page = makeElement("main", "page");
    const apps = makeElement("div", "apps");
    let tool: HTMLAnchorElement | undefined;
    for (const app of SITE_APPS) {
        if (isSiteTool(app)) {
            tool = makeToolLink(app);
        } else {
            apps.append(makeAppLink(app, "card"));
        }
    }
    page.append(apps);
    if (tool !== undefined) {
        page.append(tool);
    }

    const footer = makeElement("footer", "footer");
    const source = makeElement("a", "", "Source on GitHub");
    source.href = "https://github.com/lkesteloot/trs80";
    const author = makeElement("a", "", "Lawrence Kesteloot");
    author.href = "https://www.teamten.com/lawrence/";
    footer.append(source, " · MIT license · ", author);

    document.body.append(header, page, footer);
}

main();
