/** Identifies one destination on the site. */
export type SiteAppId = "library" | "ide" | "cassette" | "disk" | "commander" | "tool";

/** One destination on the site: an app, or the tool page. */
export interface SiteApp {
    id: SiteAppId;
    name: string;
    path: string;
    description: string;
}

/** All destinations, in menu order. */
export const SITE_APPS: readonly SiteApp[] = [
    {
        id: "library",
        name: "library",
        path: "/library/",
        description: "Your TRS-80, with your programs and disks",
    },
    {
        id: "ide",
        name: "IDE",
        path: "/ide/",
        description: "Write Z80 assembly and watch it run",
    },
    {
        id: "cassette",
        name: "cassette",
        path: "/cassette/",
        description: "Recover programs from tape recordings",
    },
    {
        id: "disk",
        name: "disk",
        path: "/disk/",
        description: "Inspect and repair floppy images",
    },
    {
        id: "commander",
        name: "commander",
        path: "/commander/",
        description: "Copy files between disks, two-panel style",
    },
    {
        id: "tool",
        name: "tool",
        path: "/tool/",
        description: "Command-line tool for macOS, Linux, and Windows",
    },
];

/** Path of the landing page. */
export const SITE_HOME_PATH = "/";

/** Name of the site, shown as the first part of every header. */
export const SITE_NAME = "my-trs-80";

/**
 * Whether this destination is the tool (a manual and download, not an app), which menus
 * set off with a separator.
 */
export function isSiteTool(app: SiteApp): boolean {
    return app.id === "tool";
}
