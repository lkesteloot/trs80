# z80-inst

TypeScript database of Z80 instructions, indexed by mnemonic and opcode.

The `opcodes` directory has a set of `.dat` files that contain opcodes (like `0x5F`)
and their mnemonic (`LD E,A`). The `GenerateCode.ts` program takes these and
generates the `src/Opcodes.ts` file. To run it:

```sh
npm run generate
```

To build the library:

```sh
npm run build
```

# License

Copyright &copy; Lawrence Kesteloot, [MIT license](LICENSE).
