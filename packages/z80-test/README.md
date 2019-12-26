# z80-test

This is a TypeScript-based test suite for Z80 emulators. It runs the
emulator through 1356 tests from the Fuse project. To test your emulator,
implement the `Delegate` interface and call the `Runner`. See the `Main.ts`
file for an example.

    % npx tsc && node dist/Main.js

See the [z80-emulator](https://github.com/lkesteloot/z80-emulator)
project for a CPU that passes all the tests.

# License

MIT

