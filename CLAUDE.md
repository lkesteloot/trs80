# Notes for Claude

The README lists the packages. `apps/` is standalone Z80 assembly (Forth, a
BASIC, demos) and isn't part of the npm build, except for `apps/basic/basic.asm`,
which trs80-emulator assembles into its compiled-Basic ROMs. `docs/` is the
GitHub Pages site, linked from the IDE's Help menu.

## How the build works

The packages are npm workspaces, set up as internal packages. Each one keeps its
own folder and package name, but none is built on its own:

- Each library's `package.json` has `"exports": "./src/index.ts"`, and depends on
  our other packages with the version `"*"`. To add one, edit `dependencies` by
  hand, then run `npm install`.
- vite 8 builds the three web apps (`my-trs-80`, `trs80-cassette-webapp`,
  `trs80-ide`) and serves fp-215's test page. esbuild bundles trs80-tool into
  `packages/trs80-tool/dist/trs80-tool.cjs`. Vitest runs the tests, and tsx runs
  the code generators. All of them compile the other packages straight from source.
- Type checking happens only in the root `tsconfig.json`, which covers every
  package and emits nothing. There are no per-package tsconfigs; don't add any.
- Nothing outside this repo uses these packages. The old npm releases are
  deprecated; don't publish.

## Commands (from the repo root)

Install with `npm ci`, not `npm install`, which rewrites `package-lock.json` as
a side effect. Use `npm install` only when changing the lock file is the point,
such as after adding a dependency.

    npm ci               # Install exactly what package-lock.json says.
    npm run build        # The type check, then every package's build.
    npm run typecheck    # Only tsc: fast, and the main correctness check.
    npm test             # Every package's tests, with Vitest.
    npm test -w packages/z80-asm             # One package's tests.
    npx vitest run -t "some test name"       # Tests whose name matches.
    npm start -w packages/trs80-ide          # Dev server (also my-trs-80, trs80-cassette-webapp, fp-215).
    npm run build -w packages/trs80-tool     # Bundle the tool; needed before running it.
    node packages/trs80-tool/bin/trs80-tool.js ...

`bin/trs80-tool.js` runs the bundle in `dist`, not the source, so rebuild
trs80-tool after changing it or any library it uses. The user's MCP config runs
that same file. `npm run buildBinaries -w packages/trs80-tool` makes the Node SEA
binaries for linux-x64, macos-x64, macos-arm64, and win-x64. It needs macOS,
because the Mac binaries are codesigned.

## TypeScript rules that bite

We use TypeScript 7 with `strict`, `exactOptionalPropertyTypes`,
`isolatedModules`, and `useDefineForClassFields: false`.

- A re-exported type must be marked, as in `export {type Foo, Bar} from "./X.js"`.
  Without the marker, the type check passes but vite's Rolldown fails the build
  with MISSING_EXPORT.
- An optional property that may be assigned `undefined` needs `?: T | undefined`.
- Imports use `.js` extensions (`from "./Trsdos.js"`). Import other packages only
  by bare name (`from "trs80-base"`). Never reach into another package's `src/`
  or `dist/`.
- `z80-emulator/src/Decode.template.ts` is excluded from the type check. It's
  input to the code generator.

## Tests

- Vitest runs them, configured by the root `vitest.config.mts`. Tests are
  `src/*.spec.ts` or `tests/*.test.ts`, and import `describe`, `it`, and `expect`
  from `"vitest"`. Its `expect` takes chai-style assertions (`.to.eql()`), which
  the existing tests use.
- Only z80-asm, z80-disasm, z80-emulator, z80-logger, z80-test, trs80-base,
  trs80-cassette, and trs80-emulator have tests. z80-emulator's run the FUSE Z80
  test cases from z80-test, one Vitest test each.

## Generated files

- `src/build.ts` in trs80-tool and the three apps is written by `printBuildInfo`
  on every build and is gitignored. The root `pretypecheck` script writes them
  too, since `tsc` needs them and a fresh checkout or worktree has none.
- trs80-emulator's `src/CompiledRoms.ts` holds a compiled-Basic ROM per model,
  assembled from `apps/basic/basic.asm` by `tools/GenerateCompiledRoms.ts`
  (`npm run generateRoms -w packages/trs80-emulator`). It's gitignored and
  regenerated before type checks, tests, and every app and trs80-tool build or
  dev start.
- `trs80-tool/src/version.ts` comes from the tool's `package.json` version and
  is committed.
- z80-inst's generator (`npm run generate`) writes `src/Opcodes.ts`, which is committed.
- z80-emulator's generator (`npm run generate`) writes `src/Decode.ts` from
  z80-inst's table, and the result is committed. After regenerating z80-inst,
  regenerate z80-emulator too.
- z80-inst only covers the Z80: its generator drops the Z180 instructions in
  `clr.json`, and adds the undocumented ED mirrors of NEG, RETN, and IM, which
  `clr.json` lacks.
- retrostore-api's `copy-proto` script copies from a hard-coded path on the
  user's machine.

## trs80-tool specifics

- **MCP server:** it's in `src/mcp.ts`, and the comment at the top explains how
  to add a tool. When tools change, update the "mcp" section and the change log
  in `site/index.html`.
- **Floppy regression suite:** `info --json` (`src/report.ts`) feeds the suite
  in `~/mine/trs80-floppy-regress`, a separate private repo that holds the disk
  images. Its `regress.ts` has a copy of the report types; keep the two in sync,
  and bump `REPORT_VERSION` in both for incompatible changes.
- **Decoder changes:** after changing floppy decoding (mostly
  `trs80-base/src/Trsdos.ts`), run `node regress.ts run` in that repo. It builds
  this tree first. Accept improvements with `--update`, and commit the snapshots
  there.

## Floppy decoding

- **Format reference:** `packages/trs80-base/FLOPPY_FORMATS.md` holds verified
  notes on the image formats (JV1, JV3, DMK, SCP), the DOS layouts (TRSDOS 2.3
  family, TRSDOS 1.3, NEWDOS/80 lumps), the HIT hash and its index layout,
  cylinder/side conventions, and the quirky disks in the collection. It records
  what was measured against real disks, so trust it over guesswork.
- **Manuals:** the user's library of TRS-80 books, with searchable text
  sidecars, is described in `~/Dropbox/Personal/Books/CLAUDE.md`; read it before
  searching. The DOS manuals are in `~/Dropbox/Personal/Books/TRS-80/disk/`. Keep
  their text out of this repo: cite the book and PDF page, and paraphrase.
- **Known gaps:** `packages/trs80-base/FLOPPY_TODO.md` lists what we've learned
  that the code doesn't do yet, with evidence disks. When you learn something,
  put format facts in `FLOPPY_FORMATS.md` and code gaps in `FLOPPY_TODO.md`; when
  asked what's been learned but isn't in the code, start there.
- **Positions:** physical sectors are `SectorPosition` (cylinder, side, sector).
  `FloppyDiskGeometry` describes every sector, plus per-track `TrackGeometry`
  and modal values taken from side 0 only. It doesn't throw on odd disks:
  mixed density and garbage address marks are data, not errors. The decoders
  reject an image with no sectors at all, so every floppy has a geometry. Its
  `bootTrack` (cylinder 0 side 0) can be undefined: some disks were imaged with
  an unreadable track 0 but readable files. Each reader takes a required
  `FloppyDecodeOptions` whose `requireBootTrack` the caller always sets;
  `decodeTrs80File()` clears it only when the extension names the format,
  since when guessing (no extension, or `.dsk`), having a boot track is part
  of telling a disk image from other data.
- **The lump model.** Every DOS family addresses the disk as (lump, granule,
  sector), which `Trsdos.logicalToPhysical()` maps to a linear sector index and
  then to a physical position, as described in `FLOPPY_FORMATS.md`. Outside
  NEWDOS/80 a lump is a whole cylinder (both allocated sides); `lumpTerm` says
  which word to show. Only NEWDOS-style lumps skip an odd cylinder 0
  (`firstDataCylinder`). Allocation sides are the DOS's, not the image's, so
  never derive them from `geometry.sideCount` alone. `FLOPPY_TODO.md` lists
  what's left, and how to re-run the verification.
- **Decoding by score:** `decodeTrsdos()` generates candidate interpretations
  (layout × directory location) and picks the best score rather than taking the
  first that parses. The score is mainly HIT hash hits minus misses; negative
  means "not this". Keep a floor so that unrecognized disks stay undecoded
  instead of getting a garbage directory: at least one hash hit, or a strict GAT
  pass for disks with no entries.
- **Verify structural changes by content, not only by snapshot diffs.** Every
  disk has a snapshot, but most (all of `disks/peter/`) only record what the
  decoder produced when they were taken, not what's right, and that's where the
  exceptions turned up. Judge changes by internal consistency, as described at
  the end of `FLOPPY_TODO.md`.
- **Hard disks** are `HardDisk`s (`HdvHardDisk` reads the HDV format), not
  `FloppyDisk`s. Each LDOS, LS-DOS or DOSPLUS 3 partition is a `HardDiskPartition`, a
  `DiskVolume` that `Trsdos` reads like a floppy; `findLdosPartitions()` finds
  them. `FLOPPY_FORMATS.md` ("Hard disk images") has the facts, and
  `FLOPPY_TODO.md` ("Hard disks") the gaps.
- **CP/M** has its own decoder, `trs80-base/src/Cpm.ts`, with a table of known
  formats, because CP/M disks don't record their layout. `decodeFloppyFileSystem()`
  tries TRSDOS, then CP/M; call it rather than `decodeTrsdos()` wherever any
  file system will do, and use the `FloppyFileSystem` interface.
- **SCP is untested.** There are no SCP images in the suite, so that reader
  compiles but nothing exercises it.
- **JV1 deleted marks are synthesized** by our reader for track 17, so they must
  never count as evidence for locating a directory.

## CI, releases, and deploys

- **CI** (`.github/workflows/build.yml`) runs on pushes to master and on pull
  requests. It builds, tests, and uploads the apps, the tool's site, and the tool
  binaries as artifacts. A macOS job builds the binaries, and Linux and Windows
  jobs smoke-test them.
- **Deploys:** `~/mine/hitch-config/my-trs-80/Makefile` downloads the artifacts
  of the newest successful master run. Every public build comes from CI.
- **trs80-tool releases:** bump `version` in its `package.json`, and add a
  change log entry in `site/index.html`. The `/changelog` skill
  (`.claude/skills/changelog`) does both.

## Starting a session in a worktree

The desktop app may make a session's worktree ahead of time, or from a stale
fetch, so a brand-new branch can start behind the local master. At the start
of a session whose branch or worktree was just created, check before doing
anything else: `git rev-list --count HEAD..master` should print 0. If it
doesn't, bring the branch up to date first. The app's sync-with-base-branch
tool merges from `origin`, so it misses unpushed commits on the local master;
in that case run `git merge master`.

## Delegating to agents

- **Plan, then delegate to Sonnet.** For a change beyond a few lines, write the
  plan yourself, then hand it to an agent running Sonnet 5.5 (`model: "sonnet"`),
  and review its diff when it's done. Its context starts with only the plan, so it
  costs far less than doing the work in a long session. The plan must stand
  alone: the working directory, the files to read, each change and the reason
  for it, what not to do (don't commit), how to verify, and what to report.
  Review the result for judgment calls, not only for whether it builds; the
  agent tends to copy the nearest existing code even where it doesn't fit.
  Do small fixes yourself, since writing a plan for them costs as much as the
  fix.
- The Agent tool's `isolation: "worktree"` branches from `origin/HEAD` (the
  remote's master), not from the current branch or the local master. When the
  work builds on unpushed commits, make the worktrees yourself:
  `git worktree add -b claude/fix-foo .claude/worktrees/fix-foo <commit>` from
  the repo, then `npm ci` there (not `npm install`, which rewrites
  `package-lock.json`). Start the agent without isolation and tell it to work
  only in that directory, with absolute paths.

## Conventions

- **Code:** 4-space indentation and double quotes. There's no Prettier or
  linter; match the surrounding code.
- **Comment every class, method, and function** with JSDoc, including overrides
  (say what this version does differently) and test helpers. Skip only the
  extremely trivial, like a one-line getter.
- **Enum names:** to show an enum value, write a `fooToString()` right after the
  enum (like `trsdosVersionToString()` in `Trsdos.ts`), rather than spelling out
  the names wherever it's displayed.
- **Exhaustive enums:** branch on an enum with a `switch` that has a case for
  every value and ends with `default: assertNever(value);` (from z80-base), so
  that adding a value is a compile error everywhere it needs handling. Don't
  write `if (x === A) ... else ...`, which quietly sends a new value to the
  `else`.
- **Conditions don't act:** don't put a call with side effects in an `if`
  condition. Store its result in a well-named variable, then test that:
  `const geometryValid = disk.computeGeometry(); if (!geometryValid) ...`.
  Readers skim `if`s when looking for what the code does.
- **Commits:** short imperative subjects ending in a period, prefixed with the
  package when there's one, e.g. `trs80-tool: Add load_basic MCP tool.` Only
  commit when asked. Don't add a `Co-Authored-By` line for Claude. If the work
  is done for a Github issue, add "For #123" (with the issue number). If it
  fixes an issue, instead add "Fixes #123". (It doesn't have to 100% fix an issue
  to be marked as fixed -- deferred features or fixes don't count and will be
  done in a separate issue.)
- **GitHub comments:** when commenting on an issue or pull request, start with a
  note saying that Claude wrote it, since it's posted under the user's account.
