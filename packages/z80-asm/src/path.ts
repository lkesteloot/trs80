/**
 * Replacements for the node "path" module, so we can run these in the browser.
 */

const SLASH = 47;

// Replace the Node "path.dirname()" function.
export function dirname(path: string): string {
    if (path.length === 0) {
        return ".";
    }
    const hasRoot = path.charCodeAt(0) === SLASH;
    let end = -1;

    // Skip trailing slashes.
    let matchedSlash = true;
    for (let i = path.length - 1; i > 0; --i) {
        if (path.charCodeAt(i) === SLASH) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }

    if (end === -1) {
        return hasRoot ? "/" : ".";
    }
    if (hasRoot && end === 1) {
        return "//";
    }
    return path.slice(0, end);
}

// Replace the Node "path.resolve()" function.
export function resolve(...paths: string[]): string {
    let resolvedPath = "";

    for (const path of paths) {
        if (path === "") {
            // Skip it.
        } else if (path.startsWith("/")) {
            // Absolute path starts over.
            resolvedPath = path;
        } else {
            if (resolvedPath !== "" && !resolvedPath.endsWith("/")) {
                resolvedPath += "/";
            }
            resolvedPath += path;
        }
    }

    return resolvedPath;
}

// Replace the Node "path.parse()" function, but only the "name" and "ext".
export function parse(path: string): { name: string, ext: string } {
    // Find filename.
    let i = path.lastIndexOf("/");
    if (i >= 0) {
        path = path.substring(i + 1);
    }

    // Find extension.
    i = path.lastIndexOf(".");
    if (i > 0) {
        return {
            name: path.substring(0, i),
            ext: path.substring(i),
        };
    } else {
        return {
            name: path,
            ext: "",
        };
    }
}
