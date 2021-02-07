# trs80-disasm

A small TypeScript library that connects [z80-disasm](https://github.com/lkesteloot/z80-disasm)
(a Z80 disassembler) with [trs80-base](https://github.com/lkesteloot/trs80-base)
(a library that parses TRS-80 files). The main function is `disasmForTrs80Program()`,
which creates and configures a disassembler object given a TRS-80 binary
file.

This library also provides the addresses of a small set of known ROM routines,
to aid disassembly code that calls them.

# License

Copyright &copy; Lawrence Kesteloot, [MIT license](LICENSE).
