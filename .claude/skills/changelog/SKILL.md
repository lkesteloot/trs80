---
name: changelog
description: Add today's entry to the change log in packages/trs80-tool/site/index.html, covering user-visible changes since the last entry, and bump trs80-tool's version if it changed. Use when asked to update the change log or prepare a trs80-tool release.
---

# Update the change log

The change log is the "Change log" section of `packages/trs80-tool/site/index.html`.
It covers trs80-tool and the web apps (My TRS-80, the IDE, the cassette reader). The
HTML comment above the first entry gives the format; follow it.

## 1. Find what's new

- The newest entry's version (e.g. `v4.0.0`) marks where the last entry left off.
  Find the commit that set that version:
  `git log --format='%h %ad %s' --date=short -S'"version": "X.Y.Z"' -- packages/trs80-tool/package.json`
- List the commits since then: `git log --format='%h %ad %s' --date=short --no-merges <commit>..HEAD`,
  and read the bodies of the ones that look user-visible (`git log -1 <commit>`).
- `git diff <commit>..HEAD --stat` shows which packages changed. Check the web apps
  (`packages/my-trs-80`, `packages/trs80-ide`, `packages/trs80-cassette-webapp`)
  too, since their commits are often named after a library.
- Also read `git diff <commit>..HEAD -- packages/trs80-tool/site/index.html`: the
  documentation added there usually names each new command, flag, and format.

## 2. Decide what's worth saying

Write for users of the tool and the web apps, not for developers of this repo.

- **Include:** new commands, flags, file formats, DOSes, and machines; changes in
  behavior or output; anything that breaks old usage; web app features.
- **Summarize, don't list:** decoder fixes for particular damaged or quirky disks
  become one phrase, like "More robust reading of damaged disk images."
- **Leave out:** refactors, tests, docs-only changes, `FLOPPY_FORMATS.md` and
  `FLOPPY_TODO.md`, the regression suite and `info --json` report internals,
  `AUDIT.md`, `CLAUDE.md`, and `apps/` (standalone Z80 programs, not part of the
  site). Never mention particular disks, collections, or people's disk images.
- If nothing is user-visible, say so and stop.

## 3. Bump the version, if trs80-tool changed

If trs80-tool's behavior changed (including through a library it uses, like
trs80-base), bump `version` in `packages/trs80-tool/package.json`, using semver:

- **Major** when old command lines stop working or do something different.
- **Minor** for new commands, flags, formats, or DOSes.
- **Patch** for fixes and robustness only.

Then regenerate `src/version.ts`, which is committed:

    npm run updateVersion -w packages/trs80-tool

Don't touch `package-lock.json`; its copy of the version isn't kept in step.

If the top entry is already today's, add to it rather than starting a new one, and
fold the changes into its existing trs80-tool line if that version hasn't been
released yet. Ask if you can't tell.

## 4. Write the entry

New entries go at the top, just below the HTML comment:

```html
            <h3 id="2026-10-14">October 14, 2026</h3>
            <ul>
                <li><code>trs80-tool</code> v4.1.0: Can read ImageDisk (IMD) floppy images.
                    <a href="#extract"><code>extract</code></a> has a new
                    <code>--lowercase</code> flag.</li>
                <li>My TRS-80: Can open IMD floppy images.</li>
            </ul>
```

- The `id` is the date as YYYY-MM-DD; the heading spells it out.
- One `<li>` per trs80-tool version, starting with `<code>trs80-tool</code> vX.Y.Z:`.
  Web app items start with the app's name ("My TRS-80:", "IDE:", "Cassette reader:").
  Changes to shared parts, like the emulator or assembler, are a plain sentence
  ("Emulator: ...").
- Use `<code>` for commands and flags, and link a command to its section
  (`<a href="#extract">`) when it's new or changed a lot.
- Use curly apostrophes (’), like the rest of the page. Keep each item short;
  match the tone of the entries below.

## 5. Finish

Show the user the entry and the version bump. Don't commit unless asked; if asked,
use a subject like `trs80-tool: Step to 4.1.0.`
