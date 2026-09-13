# Notes for Claude

The README lists the packages. `apps/` is standalone Z80 assembly (Forth, a
BASIC, demos) and isn't part of the npm build. `docs/` is the GitHub Pages site,
linked from the IDE's Help menu.

## How the build works

The packages are npm workspaces, set up as internal packages. Each one keeps its
own folder and package name, but none is built on its own:

- Each library's `package.json` has `"exports": "./src/index.ts"`, and depends on
  our other packages with the version `"*"`. To add one, edit `dependencies` by
  hand, then run `npm install`.
- vite 8 builds the three web apps (`my-trs-80`, `trs80-cassette-webapp`,
  `trs80-ide`) and serves fp-215's test page. esbuild bundles trs80-tool into
  `packages/trs80-tool/dist/trs80-tool.cjs`. tsx runs the tests and the code
  generators. All of them compile the other packages straight from source.
- Type checking happens only in the root `tsconfig.json`, which covers every
  package and emits nothing. There are no per-package tsconfigs; don't add any.
- Nothing outside this repo uses these packages. The old npm releases are
  deprecated; don't publish.

## Commands (from the repo root)

    npm install
    npm run build        # Every package's build, then the type check.
    npm run typecheck    # Only tsc: fast, and the main correctness check.
    npm test             # z80-asm, z80-disasm, z80-emulator, z80-test. Nothing else has tests.
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

## Generated files

- `src/build.ts` in trs80-tool and the three apps is written by `printBuildInfo`
  on every build and is gitignored.
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

## CI, releases, and deploys

- **CI** (`.github/workflows/build.yml`) runs on pushes to master and on pull
  requests. It builds, tests, and uploads the apps, the tool's site, and the tool
  binaries as artifacts. A macOS job builds the binaries, and Linux and Windows
  jobs smoke-test them.
- **Deploys:** `~/mine/hitch-config/my-trs-80/Makefile` downloads the artifacts
  of the newest successful master run. Every public build comes from CI.
- **trs80-tool releases:** bump `version` in its `package.json`, and add a
  change log entry in `site/index.html`.

## Conventions

- **Code:** 4-space indentation, double quotes, and JSDoc comments on functions
  and classes. There's no Prettier or linter; match the surrounding code.
- **Commits:** short imperative subjects ending in a period, prefixed with the
  package when there's one, e.g. `trs80-tool: Add load_basic MCP tool.` Only
  commit when asked.
