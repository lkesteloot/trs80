# trs80-tool

Command-line tool for manipulating TRS-80 files.

# Installation

If you have Node installed, you can install `trs80-tool` using `npm`:

    % npm install -g trs80-tool

and update it later to new versions:

    % npm update -g trs80-tool

You can also download binaries of the latest version:

* [trs80-tool for Linux](https://www.my-trs-80.com/trs80-tool/trs80-tool)
* [trs80-tool for macOS](https://www.my-trs-80.com/trs80-tool/trs80-tool)
* [trs80-tool for Windows](https://www.my-trs-80.com/trs80-tool/trs80-tool.exe)

# File formats

The `trs80-tool` program supports these file formats:

* **`.BAS`**: This is a Basic program. It's typically tokenized (token words like
  `PRINT` are stored as a single byte), but the tool supports reading Basic programs
  that are in text (non-tokenized) format. When writing a file with a `.BAS` extension,
  the file is always tokenized.
* **`.ASC`**: This is also a Basic program, but always in text (non-tokenized) format. The
  extension is mostly useful when writing a Basic file, because it tells the converter
  to use the non-tokenized format.
* **`.WAV`**: This is a cassette's audio stream. It can be at any sampling rate, either
  8 or 16 bits per sample, and either mono or stereo.
* **`.CAS`**: This is a cassette stored in a compact form where each bit on the cassette
  is stored as a bit in the file. It includes synchronization headers and bytes, as well
  as start bits (for high-speed cassettes). This is a decent archival format for
  cassettes.
* **`.CMD`**: This is a machine language program as stored on a floppy disk.
* **`.3BN`**: This is a machine language program as stored on a cassette. The name comes
  from "Model 3 BiNary". This is typically not used, and instead these files are
  stored within `.CAS` files.
* **`.JV1`**: This is a floppy disk format for the Model I. It's very simple, capturing
  the basic sector data. It does not capture enough information for copy-protected
  floppies. It's named after Jeff Vavasour.
* **`.JV3`**: This is a floppy disk format for the Model III. It's very simple, capturing
  the basic sector data and IDAM structure. It does not capture enough
  information for copy-protected floppies. It's slightly more capable than
  `.JV1` because it can encode a mix of FM and MFM signals on the same track.
* **`.DMK`**: Another floppy disk format, capturing more information from the floppy,
  such as some bits between sectors. Named after David M. Keil.

# Usage

The tool takes a command as its first argument:

    % trs80-tool COMMAND args ...

Global flags are:

    --version         Show the tool's version number.
    --help            Show the usage message.

## `dir`

The `dir` command shows the contents of an archive file. Archives
files are files that can contain other files. These are cassette files
(in WAV or CAS format) and floppy disks (in JV1, JV3, or DMK format).

    % trs80-tool dir FILE

The output format depends on the type of archive. Cassette files show
baud rates, whereas floppy disks show creation date and type of file.

## `convert`

The `convert` command converts a list of input files to an output file or
directory. There are several different ways to use this command.

A single file can be converted to another format:

    % trs80-tool convert in.cmd out.3bn    (diskette to cassette format)
    % trs80-tool convert in.bas out.asc    (de-tokenize Basic program)

Several files can be put into an archive:

    % trs80-tool convert in1.bas in2.3bn in3.cmd out.wav

This creates a cassette audio file containing the three files. Note that the
`.CMD` file will be converted to `.3BN` format.

Archive files can be extracted if the destination is a directory:

    % mkdir out
    % trs80-tool convert in.wav out    (decode cassette and extract files)
    % trs80-tool convert in.cas out
    % trs80-tool convert in.dmk out

Archive files can be converted to other archive formats:

    % trs80-tool convert in.dmk out.wav

This converts a floppy to a cassette, converting `.CMD` to `.3BN` files
in the process.

When writing a cassette format, the baud rate of the input file will
be used, if it's known:

    % trs80-tool convert in1.cas in2.cas in3.cas out.wav

(The baud rate can be guessed from the `.CAS` file contents.) If the
baud rate can't be guessed, 500 baud (low-speed) will be used:

    % trs80-tool convert in1.bas in2.3bn out.wav

This can be overwritten using the `--baud` command-line flag:

    % trs80-tool convert --baud 1500 in1.cas in2.cas in3.cas out.wav
    % trs80-tool convert --baud 1500 in1.bas in2.3bn out.wav

## `help`

The `help` command shows more specific information about other commands:

    % trs80-tool help dir
    % trs80-tool help convert

# Change log

## 2.0.3

Initial release.

# License

Copyright &copy; Lawrence Kesteloot, [MIT license](LICENSE).
