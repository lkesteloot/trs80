# TRS-80

This monorepo is a set of TRS-80-related libraries, tools, and web apps written
in TypeScript. The subprojects are:

* [z80-base](packages/z80-base): Utility functions and data structures for dealing with Z80 code.
* [z80-inst](packages/z80-inst): Database of Z80 instructions, their parameters, and other metadata.
* [z80-emulator](packages/z80-emulator): Z80 emulator.
* [z80-test](packages/z80-test): Tests for Z80 emulators. Any Z80 emulator can be plugged in here, in case you want to test your own emulator.
* [z80-disasm](packages/z80-disasm): Z80 disassembler.
* [z80-asm](packages/z80-asm): Z80 assembler.
* [trs80-logger](packages/trs80-logger): Logging functions for other TRS-80 libraries and tools.
* [trs80-asm](packages/trs80-asm): Small library to help z80-asm and trs80-base work together.
* [trs80-base](packages/trs80-base): Classes for reading and writing a variety of TRS-80 file formats.
* [trs80-disasm](packages/trs80-disasm): Wrapper around z80-disasm that adds knowledge about the TRS-80, such as the location of ROM routines.
* [trs80-emulator](packages/trs80-emulator): TRS-80 hardware emulator. Can emulate a Model I and Model III, read-only cassette, and floppy disk.
* [trs80-emulator-web](packages/trs80-emulator-web): Classes for embedding the emulator in a web page.
* [trs80-cassette](packages/trs80-cassette): Library for reading and writing cassette WAV files. Does a good job with cassettes that have been partially damaged and can't be read by other converter tools.
* [trs80-cassette-player](packages/trs80-cassette-player): Tiny library for letting the TRS-80 emulator mount WAV and CAS files.
* [trs80-cassette-webapp](packages/trs80-cassette-webapp): Web utility for reading cassette WAV files and converting them to CAS files.
* [my-trs-80](packages/my-trs-80): Web app for hosting a virtual TRS-80 and its library of cassettes and floppy disks.
* [trs80-tool](packages/trs80-tool): Command-line tool for manipulating TRS-80 files.
* [trs80-ide](packages/trs80-ide): Web app for developing assembly language TRS-80 programs.
* [forth](apps/forth): Interpreter for the Forth programming language.
* [wolf](apps/wolf): A demo inspired by Wolfenstein 3D.

# Build

This has been tested with `node` version 20 and `npm` version 10. You can
get the latest version from [the node.js website](https://nodejs.org/).

To install dependencies (do this once per clone or pull):

```sh
npm install
```

To do a sequential build:

```sh
npm run build --workspaces
```

Or to do a parallel build:

```sh
npm run build
```

If you're getting build errors, try getting a fresh clone, or clean
up your local installations with:

```sh
rm -rf node_modules packages/*/node_modules
npm install
npm run clean --workspaces
```

# License

Copyright &copy; Lawrence Kesteloot, [MIT license](LICENSE).

