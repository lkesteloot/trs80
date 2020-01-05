# z80-test

This is a TypeScript-based test suite for Z80 emulators. It runs the
emulator through 1356 tests from the Fuse project. To test your emulator,
implement the `Delegate` interface and call the `Runner`. See the `Test.ts`
file for an example.

    % npm install
    % npm run test

See the [z80-emulator](https://github.com/lkesteloot/z80-emulator)
project for a CPU that passes all the tests.

# License

Copyright &copy; Lawrence Kesteloot, [MIT license](LICENSE).
