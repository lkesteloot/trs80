# trs80-cassette-reader-js

Processes TRS-80 Model I and Model III cassettes and cleans them up.
[Try it in your browser](https://lkesteloot.github.io/trs80-cassette-reader-js/).

    (clone repo)
    % npm install
    % npm start

Open http://127.0.0.1:8080 in your browser.

# Command-line usage

The program can also be run on the command line. It reads a WAV file
and generates various output files (WAV, CAS, BAS, or BIN).
Output files are placed in the same directory as the input file.

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

# Credits

[Cassette](https://thenounproject.com/term/cassette/13639/) by Jasmine Jones from the Noun Project.

# License

Copyright (c) Lawrence Kesteloot, [MIT license](LICENSE).

