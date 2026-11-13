import {findSystemDiskTemplate, PrefetchedTemplateSource} from "trs80-disk";
import type {TrsdosFormatDos} from "trs80-base";
import bootSectors from "trs80-disk/templates/data-disk-boot-sectors.json";
import ldos1Url from "trs80-disk/templates/ldos-5.3.1-model1.dmk.gz?url";
import ldos3Url from "trs80-disk/templates/ldos-5.3.1-model3.dmk.gz?url";
import lsdos4Url from "trs80-disk/templates/lsdos-6.3.1-model4.dmk.gz?url";
import trsdos13Url from "trs80-disk/templates/trsdos-1.3-model3.dmk.gz?url";
import trsdos23Url from "trs80-disk/templates/trsdos-2.3-model1.dmk.gz?url";
import trsdos62Url from "trs80-disk/templates/trsdos-6.2.1-model4.dmk.gz?url";

/**
 * Where to fetch each gzipped system disk, by template name. The build copies each file as an asset, and
 * these are the URLs it gives them.
 */
const SYSTEM_DISK_URLS: Readonly<Record<string, string>> = {
    "ldos-5.3.1-model1": ldos1Url,
    "ldos-5.3.1-model3": ldos3Url,
    "lsdos-6.3.1-model4": lsdos4Url,
    "trsdos-1.3-model3": trsdos13Url,
    "trsdos-2.3-model1": trsdos23Url,
    "trsdos-6.2.1-model4": trsdos62Url,
};

/**
 * The page's one template source. The boot sectors are in it already. The system disks are put in by
 * {@link ensureSystemDisk}, before a session needs one.
 */
export const TEMPLATES = new PrefetchedTemplateSource(bootSectors);

/**
 * Fetch one gzipped system disk from where the build put it. The browser may have unzipped it on the way in
 * (vite's dev server sends .gz files with "Content-Encoding: gzip"), which PrefetchedTemplateSource allows for.
 *
 * @param name the template's name.
 * @throws Error if the name is unknown or the fetch fails.
 */
async function fetchGzipped(name: string): Promise<Uint8Array> {
    const url = SYSTEM_DISK_URLS[name];
    if (url === undefined) {
        throw new Error("There's no system disk named " + name);
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Can't load the system disk " + name + ": " + response.status + " " + response.statusText);
    }
    return new Uint8Array(await response.arrayBuffer());
}

/**
 * Make sure that one system disk has been fetched into {@link TEMPLATES}. Does nothing if it has been.
 *
 * @param name the template's name, such as "ldos-5.3.1-model3".
 * @param loadGzipped gets the gzipped bytes for a name. The default fetches them from the app's assets; a test
 * can pass something else.
 * @throws Error if the disk can't be loaded.
 */
export async function ensureSystemDisk(name: string,
                                       loadGzipped: (name: string) => Promise<Uint8Array> = fetchGzipped): Promise<void> {

    await TEMPLATES.prefetchSystemDisk(name, loadGzipped);
}

/**
 * Make sure that the system disk that "create --system" would copy for a DOS has been fetched.
 *
 * @param dos the DOS.
 * @param model the TRS-80 model, or undefined for the DOS's default.
 * @throws Error if the disk can't be loaded.
 */
export async function ensureSystemDiskFor(dos: TrsdosFormatDos, model: 1 | 3 | 4 | undefined): Promise<void> {
    await ensureSystemDisk(findSystemDiskTemplate(dos, model).name);
}
