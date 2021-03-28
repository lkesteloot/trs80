# trs80-cassette-reader

Web app and command-line tool to read programs off of TRS-80 Model I and Model
III cassettes.

[Try it now in your browser](https://lkesteloot.github.io/trs80-cassette-reader-js/)

# Command-line usage

The program can also be run on the command line. It reads a WAV file
and generates various output files, which are placed in the same directory
as the input file.

You can try it without installing:

    % npx trs80-cassette-reader --help

Or, to install the version on npm:

    % npm install -g trs80-cassette-reader
    % trs80-cassette-reader --help

Or, to run from source:

    (clone repo)
    % npm install
    % npm run build-node
    % bin/trs80-cassette-reader --help

By default the program will generate the appropriate binary file for
each program on the cassette:

* `.BAS` files for Basic programs.
* `.3BN` files for system programs.
* `.BIN` files for unknown programs.

The `--wav` flag will also cause a clean (reconstructed) audio file
to be generated for each program. The `--cas` flag will generate a cassette
file for each program. (These are readable in most emulators.) The
`--all` flag will, instead of generating one file for each program,
generate one audio and/or cassette file for the whole input file.

For system programs, the `--asm` flag will generate a disassembly.
For Basic programs, the `--tokenize` flag will generate a detokenized
(text) version of the program.

If any output file exists, it will not be overwritten unless the
`--force` flag is given.

# Credits

[Cassette](https://thenounproject.com/term/cassette/13639/) by Jasmine Jones from the Noun Project.

# License

Copyright &copy; Lawrence Kesteloot, [MIT license](LICENSE).

