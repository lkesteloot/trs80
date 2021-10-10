import {Instructions} from "./OpcodesTypes";

const opcodes: Instructions = {
  "mnemonics": {
    "nop": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            0
          ],
          "clr": {
            "opcodes": "00",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "No operation is performed.",
            "instruction": "nop"
          }
        }
      ]
    },
    "ld": {
      "variants": [
        {
          "tokens": [
            "bc",
            ",",
            "nnnn"
          ],
          "opcode": [
            1,
            "nnnn"
          ],
          "clr": {
            "opcodes": "01",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Loads ** into BC.",
            "instruction": "ld bc,**"
          }
        },
        {
          "tokens": [
            "(",
            "bc",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            2
          ],
          "clr": {
            "opcodes": "02",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Stores A into the memory location pointed to by BC.",
            "instruction": "ld (bc),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "nn"
          ],
          "opcode": [
            6,
            "nn"
          ],
          "clr": {
            "opcodes": "06",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into B.",
            "instruction": "ld b,*"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "bc",
            ")"
          ],
          "opcode": [
            10
          ],
          "clr": {
            "opcodes": "0A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads the value pointed to by BC into A.",
            "instruction": "ld a,(bc)"
          }
        },
        {
          "tokens": [
            "(",
            "bc",
            ")"
          ],
          "opcode": [
            10
          ],
          "clr": {
            "opcodes": "0A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads the value pointed to by BC into A.",
            "instruction": "ld a,(bc)"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "nn"
          ],
          "opcode": [
            14,
            "nn"
          ],
          "clr": {
            "opcodes": "0E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into C.",
            "instruction": "ld c,*"
          }
        },
        {
          "tokens": [
            "de",
            ",",
            "nnnn"
          ],
          "opcode": [
            17,
            "nnnn"
          ],
          "clr": {
            "opcodes": "11",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Loads ** into DE.",
            "instruction": "ld de,**"
          }
        },
        {
          "tokens": [
            "(",
            "de",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            18
          ],
          "clr": {
            "opcodes": "12",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Stores A into the memory location pointed to by DE.",
            "instruction": "ld (de),a"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "nn"
          ],
          "opcode": [
            22,
            "nn"
          ],
          "clr": {
            "opcodes": "16",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into D.",
            "instruction": "ld d,*"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "de",
            ")"
          ],
          "opcode": [
            26
          ],
          "clr": {
            "opcodes": "1A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads the value pointed to by DE into A.",
            "instruction": "ld a,(de)"
          }
        },
        {
          "tokens": [
            "(",
            "de",
            ")"
          ],
          "opcode": [
            26
          ],
          "clr": {
            "opcodes": "1A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads the value pointed to by DE into A.",
            "instruction": "ld a,(de)"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "nn"
          ],
          "opcode": [
            30,
            "nn"
          ],
          "clr": {
            "opcodes": "1E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into E.",
            "instruction": "ld e,*"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "nnnn"
          ],
          "opcode": [
            33,
            "nnnn"
          ],
          "clr": {
            "opcodes": "21",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Loads ** into HL.",
            "instruction": "ld hl,**"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "hl"
          ],
          "opcode": [
            34,
            "nnnn"
          ],
          "clr": {
            "opcodes": "22",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "Stores HL into the memory location pointed to by **.",
            "instruction": "ld (**),hl"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "nn"
          ],
          "opcode": [
            38,
            "nn"
          ],
          "clr": {
            "opcodes": "26",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into H.",
            "instruction": "ld h,*"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            42,
            "nnnn"
          ],
          "clr": {
            "opcodes": "2A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "Loads the value pointed to by ** into HL.",
            "instruction": "ld hl,(**)"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "nn"
          ],
          "opcode": [
            46,
            "nn"
          ],
          "clr": {
            "opcodes": "2E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into L.",
            "instruction": "ld l,*"
          }
        },
        {
          "tokens": [
            "sp",
            ",",
            "nnnn"
          ],
          "opcode": [
            49,
            "nnnn"
          ],
          "clr": {
            "opcodes": "31",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Loads ** into SP.",
            "instruction": "ld sp,**"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            50,
            "nnnn"
          ],
          "clr": {
            "opcodes": "32",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 13,
            "without_jump_clock_count": 13,
            "description": "Stores A into the memory location pointed to by **.",
            "instruction": "ld (**),a"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "nn"
          ],
          "opcode": [
            54,
            "nn"
          ],
          "clr": {
            "opcodes": "36",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Loads * into (HL).",
            "instruction": "ld (hl),*"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            58,
            "nnnn"
          ],
          "clr": {
            "opcodes": "3A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 13,
            "without_jump_clock_count": 13,
            "description": "Loads the value pointed to by ** into A.",
            "instruction": "ld a,(**)"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            58,
            "nnnn"
          ],
          "clr": {
            "opcodes": "3A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 13,
            "without_jump_clock_count": 13,
            "description": "Loads the value pointed to by ** into A.",
            "instruction": "ld a,(**)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "nn"
          ],
          "opcode": [
            62,
            "nn"
          ],
          "clr": {
            "opcodes": "3E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into A.",
            "instruction": "ld a,*"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            62,
            "nn"
          ],
          "clr": {
            "opcodes": "3E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Loads * into A.",
            "instruction": "ld a,*"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "b"
          ],
          "opcode": [
            64
          ],
          "clr": {
            "opcodes": "40",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into B.",
            "instruction": "ld b,b"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "c"
          ],
          "opcode": [
            65
          ],
          "clr": {
            "opcodes": "41",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into B.",
            "instruction": "ld b,c"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "d"
          ],
          "opcode": [
            66
          ],
          "clr": {
            "opcodes": "42",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into B.",
            "instruction": "ld b,d"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "e"
          ],
          "opcode": [
            67
          ],
          "clr": {
            "opcodes": "43",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into B.",
            "instruction": "ld b,e"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "h"
          ],
          "opcode": [
            68
          ],
          "clr": {
            "opcodes": "44",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into B.",
            "instruction": "ld b,h"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "l"
          ],
          "opcode": [
            69
          ],
          "clr": {
            "opcodes": "45",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into B.",
            "instruction": "ld b,l"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            70
          ],
          "clr": {
            "opcodes": "46",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into B.",
            "instruction": "ld b,(hl)"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "a"
          ],
          "opcode": [
            71
          ],
          "clr": {
            "opcodes": "47",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into B.",
            "instruction": "ld b,a"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "b"
          ],
          "opcode": [
            72
          ],
          "clr": {
            "opcodes": "48",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into C.",
            "instruction": "ld c,b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "c"
          ],
          "opcode": [
            73
          ],
          "clr": {
            "opcodes": "49",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into C.",
            "instruction": "ld c,c"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "d"
          ],
          "opcode": [
            74
          ],
          "clr": {
            "opcodes": "4A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into C.",
            "instruction": "ld c,d"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "e"
          ],
          "opcode": [
            75
          ],
          "clr": {
            "opcodes": "4B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into C.",
            "instruction": "ld c,e"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "h"
          ],
          "opcode": [
            76
          ],
          "clr": {
            "opcodes": "4C",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into C.",
            "instruction": "ld c,h"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "l"
          ],
          "opcode": [
            77
          ],
          "clr": {
            "opcodes": "4D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into C.",
            "instruction": "ld c,l"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            78
          ],
          "clr": {
            "opcodes": "4E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into C.",
            "instruction": "ld c,(hl)"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "a"
          ],
          "opcode": [
            79
          ],
          "clr": {
            "opcodes": "4F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into C.",
            "instruction": "ld c,a"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "b"
          ],
          "opcode": [
            80
          ],
          "clr": {
            "opcodes": "50",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into D.",
            "instruction": "ld d,b"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "c"
          ],
          "opcode": [
            81
          ],
          "clr": {
            "opcodes": "51",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into D.",
            "instruction": "ld d,c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "d"
          ],
          "opcode": [
            82
          ],
          "clr": {
            "opcodes": "52",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into D.",
            "instruction": "ld d,d"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "e"
          ],
          "opcode": [
            83
          ],
          "clr": {
            "opcodes": "53",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into D.",
            "instruction": "ld d,e"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "h"
          ],
          "opcode": [
            84
          ],
          "clr": {
            "opcodes": "54",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into D.",
            "instruction": "ld d,h"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "l"
          ],
          "opcode": [
            85
          ],
          "clr": {
            "opcodes": "55",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into D.",
            "instruction": "ld d,l"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            86
          ],
          "clr": {
            "opcodes": "56",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into D.",
            "instruction": "ld d,(hl)"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "a"
          ],
          "opcode": [
            87
          ],
          "clr": {
            "opcodes": "57",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into D.",
            "instruction": "ld d,a"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "b"
          ],
          "opcode": [
            88
          ],
          "clr": {
            "opcodes": "58",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into E.",
            "instruction": "ld e,b"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "c"
          ],
          "opcode": [
            89
          ],
          "clr": {
            "opcodes": "59",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into E.",
            "instruction": "ld e,c"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "d"
          ],
          "opcode": [
            90
          ],
          "clr": {
            "opcodes": "5A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into E.",
            "instruction": "ld e,d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "e"
          ],
          "opcode": [
            91
          ],
          "clr": {
            "opcodes": "5B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into E.",
            "instruction": "ld e,e"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "h"
          ],
          "opcode": [
            92
          ],
          "clr": {
            "opcodes": "5C",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into E.",
            "instruction": "ld e,h"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "l"
          ],
          "opcode": [
            93
          ],
          "clr": {
            "opcodes": "5D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into E.",
            "instruction": "ld e,l"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            94
          ],
          "clr": {
            "opcodes": "5E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into E.",
            "instruction": "ld e,(hl)"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "a"
          ],
          "opcode": [
            95
          ],
          "clr": {
            "opcodes": "5F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into E.",
            "instruction": "ld e,a"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "b"
          ],
          "opcode": [
            96
          ],
          "clr": {
            "opcodes": "60",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into H.",
            "instruction": "ld h,b"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "c"
          ],
          "opcode": [
            97
          ],
          "clr": {
            "opcodes": "61",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into H.",
            "instruction": "ld h,c"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "d"
          ],
          "opcode": [
            98
          ],
          "clr": {
            "opcodes": "62",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into H.",
            "instruction": "ld h,d"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "e"
          ],
          "opcode": [
            99
          ],
          "clr": {
            "opcodes": "63",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into H.",
            "instruction": "ld h,e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "h"
          ],
          "opcode": [
            100
          ],
          "clr": {
            "opcodes": "64",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into H.",
            "instruction": "ld h,h"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "l"
          ],
          "opcode": [
            101
          ],
          "clr": {
            "opcodes": "65",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into H.",
            "instruction": "ld h,l"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            102
          ],
          "clr": {
            "opcodes": "66",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into H.",
            "instruction": "ld h,(hl)"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "a"
          ],
          "opcode": [
            103
          ],
          "clr": {
            "opcodes": "67",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into H.",
            "instruction": "ld h,a"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "b"
          ],
          "opcode": [
            104
          ],
          "clr": {
            "opcodes": "68",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into L.",
            "instruction": "ld l,b"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "c"
          ],
          "opcode": [
            105
          ],
          "clr": {
            "opcodes": "69",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into L.",
            "instruction": "ld l,c"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "d"
          ],
          "opcode": [
            106
          ],
          "clr": {
            "opcodes": "6A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into L.",
            "instruction": "ld l,d"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "e"
          ],
          "opcode": [
            107
          ],
          "clr": {
            "opcodes": "6B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into L.",
            "instruction": "ld l,e"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "h"
          ],
          "opcode": [
            108
          ],
          "clr": {
            "opcodes": "6C",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into L.",
            "instruction": "ld l,h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "l"
          ],
          "opcode": [
            109
          ],
          "clr": {
            "opcodes": "6D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into L.",
            "instruction": "ld l,l"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            110
          ],
          "clr": {
            "opcodes": "6E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into L.",
            "instruction": "ld l,(hl)"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "a"
          ],
          "opcode": [
            111
          ],
          "clr": {
            "opcodes": "6F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into L.",
            "instruction": "ld l,a"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "b"
          ],
          "opcode": [
            112
          ],
          "clr": {
            "opcodes": "70",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of B are loaded into (HL).",
            "instruction": "ld (hl),b"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "c"
          ],
          "opcode": [
            113
          ],
          "clr": {
            "opcodes": "71",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of C are loaded into (HL).",
            "instruction": "ld (hl),c"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "d"
          ],
          "opcode": [
            114
          ],
          "clr": {
            "opcodes": "72",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of D are loaded into (HL).",
            "instruction": "ld (hl),d"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "e"
          ],
          "opcode": [
            115
          ],
          "clr": {
            "opcodes": "73",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of E are loaded into (HL).",
            "instruction": "ld (hl),e"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "h"
          ],
          "opcode": [
            116
          ],
          "clr": {
            "opcodes": "74",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of H are loaded into (HL).",
            "instruction": "ld (hl),h"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "l"
          ],
          "opcode": [
            117
          ],
          "clr": {
            "opcodes": "75",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of L are loaded into (HL).",
            "instruction": "ld (hl),l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            119
          ],
          "clr": {
            "opcodes": "77",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of A are loaded into (HL).",
            "instruction": "ld (hl),a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            120
          ],
          "clr": {
            "opcodes": "78",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into A.",
            "instruction": "ld a,b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            120
          ],
          "clr": {
            "opcodes": "78",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of B are loaded into A.",
            "instruction": "ld a,b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            121
          ],
          "clr": {
            "opcodes": "79",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into A.",
            "instruction": "ld a,c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            121
          ],
          "clr": {
            "opcodes": "79",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of C are loaded into A.",
            "instruction": "ld a,c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            122
          ],
          "clr": {
            "opcodes": "7A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into A.",
            "instruction": "ld a,d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            122
          ],
          "clr": {
            "opcodes": "7A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of D are loaded into A.",
            "instruction": "ld a,d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            123
          ],
          "clr": {
            "opcodes": "7B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into A.",
            "instruction": "ld a,e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            123
          ],
          "clr": {
            "opcodes": "7B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of E are loaded into A.",
            "instruction": "ld a,e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            124
          ],
          "clr": {
            "opcodes": "7C",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into A.",
            "instruction": "ld a,h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            124
          ],
          "clr": {
            "opcodes": "7C",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of H are loaded into A.",
            "instruction": "ld a,h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            125
          ],
          "clr": {
            "opcodes": "7D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into A.",
            "instruction": "ld a,l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            125
          ],
          "clr": {
            "opcodes": "7D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of L are loaded into A.",
            "instruction": "ld a,l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            126
          ],
          "clr": {
            "opcodes": "7E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into A.",
            "instruction": "ld a,(hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            126
          ],
          "clr": {
            "opcodes": "7E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "The contents of (HL) are loaded into A.",
            "instruction": "ld a,(hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            127
          ],
          "clr": {
            "opcodes": "7F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into A.",
            "instruction": "ld a,a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            127
          ],
          "clr": {
            "opcodes": "7F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are loaded into A.",
            "instruction": "ld a,a"
          }
        },
        {
          "tokens": [
            "ix",
            ",",
            "nnnn"
          ],
          "opcode": [
            221,
            33,
            "nnnn"
          ],
          "clr": {
            "opcodes": "DD21",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 14,
            "without_jump_clock_count": 14,
            "description": "Loads ** into register IX.",
            "instruction": "ld ix,**"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "ix"
          ],
          "opcode": [
            221,
            34,
            "nnnn"
          ],
          "clr": {
            "opcodes": "DD22",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Stores IX into the memory location pointed to by **.",
            "instruction": "ld (**),ix"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "nn"
          ],
          "opcode": [
            221,
            38,
            "nn"
          ],
          "clr": {
            "opcodes": "DD26",
            "undocumented": true,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "Loads * into IXH.",
            "instruction": "ld ixh,*"
          }
        },
        {
          "tokens": [
            "ix",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            221,
            42,
            "nnnn"
          ],
          "clr": {
            "opcodes": "DD2A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Loads the value pointed to by ** into IX.",
            "instruction": "ld ix,(**)"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "nn"
          ],
          "opcode": [
            221,
            46,
            "nn"
          ],
          "clr": {
            "opcodes": "DD2E",
            "undocumented": true,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "Loads * into IXL.",
            "instruction": "ld ixl,*"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "nn"
          ],
          "opcode": [
            221,
            54,
            "dd",
            "nn"
          ],
          "clr": {
            "opcodes": "DD36",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores * to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),*"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            68
          ],
          "clr": {
            "opcodes": "DD44",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into B.",
            "instruction": "ld b,ixh"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            69
          ],
          "clr": {
            "opcodes": "DD45",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into B.",
            "instruction": "ld b,ixl"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            70,
            "dd"
          ],
          "clr": {
            "opcodes": "DD46",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into B.",
            "instruction": "ld b,(ix+*)"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            76
          ],
          "clr": {
            "opcodes": "DD4C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into C.",
            "instruction": "ld c,ixh"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            77
          ],
          "clr": {
            "opcodes": "DD4D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into C.",
            "instruction": "ld c,ixl"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            78,
            "dd"
          ],
          "clr": {
            "opcodes": "DD4E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into C.",
            "instruction": "ld c,(ix+*)"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            84
          ],
          "clr": {
            "opcodes": "DD54",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into D.",
            "instruction": "ld d,ixh"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            85
          ],
          "clr": {
            "opcodes": "DD55",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into D.",
            "instruction": "ld d,ixl"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            86,
            "dd"
          ],
          "clr": {
            "opcodes": "DD56",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into D.",
            "instruction": "ld d,(ix+*)"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            92
          ],
          "clr": {
            "opcodes": "DD5C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into E.",
            "instruction": "ld e,ixh"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            93
          ],
          "clr": {
            "opcodes": "DD5D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into E.",
            "instruction": "ld e,ixl"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            94,
            "dd"
          ],
          "clr": {
            "opcodes": "DD5E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into E.",
            "instruction": "ld e,(ix+*)"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "b"
          ],
          "opcode": [
            221,
            96
          ],
          "clr": {
            "opcodes": "DD60",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are loaded into IXH.",
            "instruction": "ld ixh,b"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "c"
          ],
          "opcode": [
            221,
            97
          ],
          "clr": {
            "opcodes": "DD61",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are loaded into IXH.",
            "instruction": "ld ixh,c"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "d"
          ],
          "opcode": [
            221,
            98
          ],
          "clr": {
            "opcodes": "DD62",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are loaded into IXH.",
            "instruction": "ld ixh,d"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "e"
          ],
          "opcode": [
            221,
            99
          ],
          "clr": {
            "opcodes": "DD63",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are loaded into IXH.",
            "instruction": "ld ixh,e"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            100
          ],
          "clr": {
            "opcodes": "DD64",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into IXH.",
            "instruction": "ld ixh,ixh"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            101
          ],
          "clr": {
            "opcodes": "DD65",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into IXH.",
            "instruction": "ld ixh,ixl"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            102,
            "dd"
          ],
          "clr": {
            "opcodes": "DD66",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into H.",
            "instruction": "ld h,(ix+*)"
          }
        },
        {
          "tokens": [
            "ixh",
            ",",
            "a"
          ],
          "opcode": [
            221,
            103
          ],
          "clr": {
            "opcodes": "DD67",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are loaded into IXH.",
            "instruction": "ld ixh,a"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "b"
          ],
          "opcode": [
            221,
            104
          ],
          "clr": {
            "opcodes": "DD68",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are loaded into IXL.",
            "instruction": "ld ixl,b"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "c"
          ],
          "opcode": [
            221,
            105
          ],
          "clr": {
            "opcodes": "DD69",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are loaded into IXL.",
            "instruction": "ld ixl,c"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "d"
          ],
          "opcode": [
            221,
            106
          ],
          "clr": {
            "opcodes": "DD6A",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are loaded into IXL.",
            "instruction": "ld ixl,d"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "e"
          ],
          "opcode": [
            221,
            107
          ],
          "clr": {
            "opcodes": "DD6B",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are loaded into IXL.",
            "instruction": "ld ixl,e"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            108
          ],
          "clr": {
            "opcodes": "DD6C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into IXL.",
            "instruction": "ld ixl,ixh"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            109
          ],
          "clr": {
            "opcodes": "DD6D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into IXL.",
            "instruction": "ld ixl,ixl"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            110,
            "dd"
          ],
          "clr": {
            "opcodes": "DD6E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into L.",
            "instruction": "ld l,(ix+*)"
          }
        },
        {
          "tokens": [
            "ixl",
            ",",
            "a"
          ],
          "opcode": [
            221,
            111
          ],
          "clr": {
            "opcodes": "DD6F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are loaded into IXL.",
            "instruction": "ld ixl,a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "b"
          ],
          "opcode": [
            221,
            112,
            "dd"
          ],
          "clr": {
            "opcodes": "DD70",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores B to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),b"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "c"
          ],
          "opcode": [
            221,
            113,
            "dd"
          ],
          "clr": {
            "opcodes": "DD71",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores C to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),c"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "d"
          ],
          "opcode": [
            221,
            114,
            "dd"
          ],
          "clr": {
            "opcodes": "DD72",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores D to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),d"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "e"
          ],
          "opcode": [
            221,
            115,
            "dd"
          ],
          "clr": {
            "opcodes": "DD73",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores E to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),e"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "h"
          ],
          "opcode": [
            221,
            116,
            "dd"
          ],
          "clr": {
            "opcodes": "DD74",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores H to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),h"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "l"
          ],
          "opcode": [
            221,
            117,
            "dd"
          ],
          "clr": {
            "opcodes": "DD75",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores L to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),l"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            221,
            119,
            "dd"
          ],
          "clr": {
            "opcodes": "DD77",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores A to the memory location pointed to by IX plus *.",
            "instruction": "ld (ix+*),a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            124
          ],
          "clr": {
            "opcodes": "DD7C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into A.",
            "instruction": "ld a,ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            124
          ],
          "clr": {
            "opcodes": "DD7C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXH are loaded into A.",
            "instruction": "ld a,ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            125
          ],
          "clr": {
            "opcodes": "DD7D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into A.",
            "instruction": "ld a,ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            125
          ],
          "clr": {
            "opcodes": "DD7D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IXL are loaded into A.",
            "instruction": "ld a,ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            126,
            "dd"
          ],
          "clr": {
            "opcodes": "DD7E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into A.",
            "instruction": "ld a,(ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            126,
            "dd"
          ],
          "clr": {
            "opcodes": "DD7E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IX plus * into A.",
            "instruction": "ld a,(ix+*)"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            0
          ],
          "clr": {
            "opcodes": "DDCB**00",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in B.",
            "instruction": "rlc (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            1
          ],
          "clr": {
            "opcodes": "DDCB**01",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in C.",
            "instruction": "rlc (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            2
          ],
          "clr": {
            "opcodes": "DDCB**02",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in D.",
            "instruction": "rlc (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            3
          ],
          "clr": {
            "opcodes": "DDCB**03",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in E.",
            "instruction": "rlc (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            4
          ],
          "clr": {
            "opcodes": "DDCB**04",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in H.",
            "instruction": "rlc (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            5
          ],
          "clr": {
            "opcodes": "DDCB**05",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in L.",
            "instruction": "rlc (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            7
          ],
          "clr": {
            "opcodes": "DDCB**07",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in A.",
            "instruction": "rlc (ix+*),a"
          }
        },
        {
          "tokens": [
            "rlc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            7
          ],
          "clr": {
            "opcodes": "DDCB**07",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in A.",
            "instruction": "rlc (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            8
          ],
          "clr": {
            "opcodes": "DDCB**08",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in B.",
            "instruction": "rrc (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            9
          ],
          "clr": {
            "opcodes": "DDCB**09",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in C.",
            "instruction": "rrc (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            10
          ],
          "clr": {
            "opcodes": "DDCB**0A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in D.",
            "instruction": "rrc (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            11
          ],
          "clr": {
            "opcodes": "DDCB**0B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in E.",
            "instruction": "rrc (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            12
          ],
          "clr": {
            "opcodes": "DDCB**0C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in H.",
            "instruction": "rrc (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            13
          ],
          "clr": {
            "opcodes": "DDCB**0D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in L.",
            "instruction": "rrc (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            15
          ],
          "clr": {
            "opcodes": "DDCB**0F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in A.",
            "instruction": "rrc (ix+*),a"
          }
        },
        {
          "tokens": [
            "rrc",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            15
          ],
          "clr": {
            "opcodes": "DDCB**0F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in A.",
            "instruction": "rrc (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            16
          ],
          "clr": {
            "opcodes": "DDCB**10",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in B.",
            "instruction": "rl (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            17
          ],
          "clr": {
            "opcodes": "DDCB**11",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in C.",
            "instruction": "rl (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            18
          ],
          "clr": {
            "opcodes": "DDCB**12",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in D.",
            "instruction": "rl (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            19
          ],
          "clr": {
            "opcodes": "DDCB**13",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in E.",
            "instruction": "rl (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            20
          ],
          "clr": {
            "opcodes": "DDCB**14",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in H.",
            "instruction": "rl (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            21
          ],
          "clr": {
            "opcodes": "DDCB**15",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in L.",
            "instruction": "rl (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            23
          ],
          "clr": {
            "opcodes": "DDCB**17",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in A.",
            "instruction": "rl (ix+*),a"
          }
        },
        {
          "tokens": [
            "rl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            23
          ],
          "clr": {
            "opcodes": "DDCB**17",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in A.",
            "instruction": "rl (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            24
          ],
          "clr": {
            "opcodes": "DDCB**18",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in B.",
            "instruction": "rr (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            25
          ],
          "clr": {
            "opcodes": "DDCB**19",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in C.",
            "instruction": "rr (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            26
          ],
          "clr": {
            "opcodes": "DDCB**1A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in D.",
            "instruction": "rr (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            27
          ],
          "clr": {
            "opcodes": "DDCB**1B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in E.",
            "instruction": "rr (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            28
          ],
          "clr": {
            "opcodes": "DDCB**1C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in H.",
            "instruction": "rr (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            29
          ],
          "clr": {
            "opcodes": "DDCB**1D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in L.",
            "instruction": "rr (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            31
          ],
          "clr": {
            "opcodes": "DDCB**1F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in A.",
            "instruction": "rr (ix+*),a"
          }
        },
        {
          "tokens": [
            "rr",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            31
          ],
          "clr": {
            "opcodes": "DDCB**1F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in A.",
            "instruction": "rr (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            32
          ],
          "clr": {
            "opcodes": "DDCB**20",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in B.",
            "instruction": "sla (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            33
          ],
          "clr": {
            "opcodes": "DDCB**21",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in C.",
            "instruction": "sla (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            34
          ],
          "clr": {
            "opcodes": "DDCB**22",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in D.",
            "instruction": "sla (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            35
          ],
          "clr": {
            "opcodes": "DDCB**23",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in E.",
            "instruction": "sla (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            36
          ],
          "clr": {
            "opcodes": "DDCB**24",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in H.",
            "instruction": "sla (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            37
          ],
          "clr": {
            "opcodes": "DDCB**25",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in L.",
            "instruction": "sla (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            39
          ],
          "clr": {
            "opcodes": "DDCB**27",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in A.",
            "instruction": "sla (ix+*),a"
          }
        },
        {
          "tokens": [
            "sla",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            39
          ],
          "clr": {
            "opcodes": "DDCB**27",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in A.",
            "instruction": "sla (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            40
          ],
          "clr": {
            "opcodes": "DDCB**28",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in B.",
            "instruction": "sra (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            41
          ],
          "clr": {
            "opcodes": "DDCB**29",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in C.",
            "instruction": "sra (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            42
          ],
          "clr": {
            "opcodes": "DDCB**2A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in D.",
            "instruction": "sra (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            43
          ],
          "clr": {
            "opcodes": "DDCB**2B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in E.",
            "instruction": "sra (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            44
          ],
          "clr": {
            "opcodes": "DDCB**2C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in H.",
            "instruction": "sra (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            45
          ],
          "clr": {
            "opcodes": "DDCB**2D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in L.",
            "instruction": "sra (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            47
          ],
          "clr": {
            "opcodes": "DDCB**2F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in A.",
            "instruction": "sra (ix+*),a"
          }
        },
        {
          "tokens": [
            "sra",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            47
          ],
          "clr": {
            "opcodes": "DDCB**2F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in A.",
            "instruction": "sra (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            48
          ],
          "clr": {
            "opcodes": "DDCB**30",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in B.",
            "instruction": "sll (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            49
          ],
          "clr": {
            "opcodes": "DDCB**31",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in C.",
            "instruction": "sll (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            50
          ],
          "clr": {
            "opcodes": "DDCB**32",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in D.",
            "instruction": "sll (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            51
          ],
          "clr": {
            "opcodes": "DDCB**33",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in E.",
            "instruction": "sll (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            52
          ],
          "clr": {
            "opcodes": "DDCB**34",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in H.",
            "instruction": "sll (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            53
          ],
          "clr": {
            "opcodes": "DDCB**35",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in L.",
            "instruction": "sll (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            55
          ],
          "clr": {
            "opcodes": "DDCB**37",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in A.",
            "instruction": "sll (ix+*),a"
          }
        },
        {
          "tokens": [
            "sll",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            55
          ],
          "clr": {
            "opcodes": "DDCB**37",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in A.",
            "instruction": "sll (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            56
          ],
          "clr": {
            "opcodes": "DDCB**38",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in B.",
            "instruction": "srl (ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            57
          ],
          "clr": {
            "opcodes": "DDCB**39",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in C.",
            "instruction": "srl (ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            58
          ],
          "clr": {
            "opcodes": "DDCB**3A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in D.",
            "instruction": "srl (ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            59
          ],
          "clr": {
            "opcodes": "DDCB**3B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in E.",
            "instruction": "srl (ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            60
          ],
          "clr": {
            "opcodes": "DDCB**3C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in H.",
            "instruction": "srl (ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            61
          ],
          "clr": {
            "opcodes": "DDCB**3D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in L.",
            "instruction": "srl (ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            63
          ],
          "clr": {
            "opcodes": "DDCB**3F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in A.",
            "instruction": "srl (ix+*),a"
          }
        },
        {
          "tokens": [
            "srl",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            63
          ],
          "clr": {
            "opcodes": "DDCB**3F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in A.",
            "instruction": "srl (ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            128
          ],
          "clr": {
            "opcodes": "DDCB**80",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            129
          ],
          "clr": {
            "opcodes": "DDCB**81",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            130
          ],
          "clr": {
            "opcodes": "DDCB**82",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            131
          ],
          "clr": {
            "opcodes": "DDCB**83",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            132
          ],
          "clr": {
            "opcodes": "DDCB**84",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            133
          ],
          "clr": {
            "opcodes": "DDCB**85",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            135
          ],
          "clr": {
            "opcodes": "DDCB**87",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            135
          ],
          "clr": {
            "opcodes": "DDCB**87",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            136
          ],
          "clr": {
            "opcodes": "DDCB**88",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            137
          ],
          "clr": {
            "opcodes": "DDCB**89",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            138
          ],
          "clr": {
            "opcodes": "DDCB**8A",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            139
          ],
          "clr": {
            "opcodes": "DDCB**8B",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            140
          ],
          "clr": {
            "opcodes": "DDCB**8C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            141
          ],
          "clr": {
            "opcodes": "DDCB**8D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            143
          ],
          "clr": {
            "opcodes": "DDCB**8F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            143
          ],
          "clr": {
            "opcodes": "DDCB**8F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            144
          ],
          "clr": {
            "opcodes": "DDCB**90",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            145
          ],
          "clr": {
            "opcodes": "DDCB**91",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            146
          ],
          "clr": {
            "opcodes": "DDCB**92",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            147
          ],
          "clr": {
            "opcodes": "DDCB**93",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            148
          ],
          "clr": {
            "opcodes": "DDCB**94",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            149
          ],
          "clr": {
            "opcodes": "DDCB**95",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            151
          ],
          "clr": {
            "opcodes": "DDCB**97",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            151
          ],
          "clr": {
            "opcodes": "DDCB**97",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            152
          ],
          "clr": {
            "opcodes": "DDCB**98",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            153
          ],
          "clr": {
            "opcodes": "DDCB**99",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            154
          ],
          "clr": {
            "opcodes": "DDCB**9A",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            155
          ],
          "clr": {
            "opcodes": "DDCB**9B",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            156
          ],
          "clr": {
            "opcodes": "DDCB**9C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            157
          ],
          "clr": {
            "opcodes": "DDCB**9D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            159
          ],
          "clr": {
            "opcodes": "DDCB**9F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            159
          ],
          "clr": {
            "opcodes": "DDCB**9F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            160
          ],
          "clr": {
            "opcodes": "DDCB**A0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            161
          ],
          "clr": {
            "opcodes": "DDCB**A1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            162
          ],
          "clr": {
            "opcodes": "DDCB**A2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            163
          ],
          "clr": {
            "opcodes": "DDCB**A3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            164
          ],
          "clr": {
            "opcodes": "DDCB**A4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            165
          ],
          "clr": {
            "opcodes": "DDCB**A5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            167
          ],
          "clr": {
            "opcodes": "DDCB**A7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            167
          ],
          "clr": {
            "opcodes": "DDCB**A7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            168
          ],
          "clr": {
            "opcodes": "DDCB**A8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            169
          ],
          "clr": {
            "opcodes": "DDCB**A9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            170
          ],
          "clr": {
            "opcodes": "DDCB**AA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            171
          ],
          "clr": {
            "opcodes": "DDCB**AB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            172
          ],
          "clr": {
            "opcodes": "DDCB**AC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            173
          ],
          "clr": {
            "opcodes": "DDCB**AD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            175
          ],
          "clr": {
            "opcodes": "DDCB**AF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            175
          ],
          "clr": {
            "opcodes": "DDCB**AF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            176
          ],
          "clr": {
            "opcodes": "DDCB**B0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            177
          ],
          "clr": {
            "opcodes": "DDCB**B1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            178
          ],
          "clr": {
            "opcodes": "DDCB**B2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            179
          ],
          "clr": {
            "opcodes": "DDCB**B3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            180
          ],
          "clr": {
            "opcodes": "DDCB**B4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            181
          ],
          "clr": {
            "opcodes": "DDCB**B5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            183
          ],
          "clr": {
            "opcodes": "DDCB**B7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            183
          ],
          "clr": {
            "opcodes": "DDCB**B7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            184
          ],
          "clr": {
            "opcodes": "DDCB**B8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            185
          ],
          "clr": {
            "opcodes": "DDCB**B9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            186
          ],
          "clr": {
            "opcodes": "DDCB**BA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            187
          ],
          "clr": {
            "opcodes": "DDCB**BB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            188
          ],
          "clr": {
            "opcodes": "DDCB**BC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            189
          ],
          "clr": {
            "opcodes": "DDCB**BD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            191
          ],
          "clr": {
            "opcodes": "DDCB**BF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            191
          ],
          "clr": {
            "opcodes": "DDCB**BF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            192
          ],
          "clr": {
            "opcodes": "DDCB**C0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            193
          ],
          "clr": {
            "opcodes": "DDCB**C1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            194
          ],
          "clr": {
            "opcodes": "DDCB**C2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            195
          ],
          "clr": {
            "opcodes": "DDCB**C3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            196
          ],
          "clr": {
            "opcodes": "DDCB**C4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            197
          ],
          "clr": {
            "opcodes": "DDCB**C5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            199
          ],
          "clr": {
            "opcodes": "DDCB**C7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            199
          ],
          "clr": {
            "opcodes": "DDCB**C7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            200
          ],
          "clr": {
            "opcodes": "DDCB**C8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            201
          ],
          "clr": {
            "opcodes": "DDCB**C9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            202
          ],
          "clr": {
            "opcodes": "DDCB**CA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            203
          ],
          "clr": {
            "opcodes": "DDCB**CB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            204
          ],
          "clr": {
            "opcodes": "DDCB**CC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            205
          ],
          "clr": {
            "opcodes": "DDCB**CD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            207
          ],
          "clr": {
            "opcodes": "DDCB**CF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            207
          ],
          "clr": {
            "opcodes": "DDCB**CF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            208
          ],
          "clr": {
            "opcodes": "DDCB**D0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            209
          ],
          "clr": {
            "opcodes": "DDCB**D1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            210
          ],
          "clr": {
            "opcodes": "DDCB**D2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            211
          ],
          "clr": {
            "opcodes": "DDCB**D3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            212
          ],
          "clr": {
            "opcodes": "DDCB**D4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            213
          ],
          "clr": {
            "opcodes": "DDCB**D5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            215
          ],
          "clr": {
            "opcodes": "DDCB**D7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            215
          ],
          "clr": {
            "opcodes": "DDCB**D7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            216
          ],
          "clr": {
            "opcodes": "DDCB**D8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            217
          ],
          "clr": {
            "opcodes": "DDCB**D9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            218
          ],
          "clr": {
            "opcodes": "DDCB**DA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            219
          ],
          "clr": {
            "opcodes": "DDCB**DB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            220
          ],
          "clr": {
            "opcodes": "DDCB**DC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            221
          ],
          "clr": {
            "opcodes": "DDCB**DD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            223
          ],
          "clr": {
            "opcodes": "DDCB**DF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            223
          ],
          "clr": {
            "opcodes": "DDCB**DF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            224
          ],
          "clr": {
            "opcodes": "DDCB**E0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            225
          ],
          "clr": {
            "opcodes": "DDCB**E1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            226
          ],
          "clr": {
            "opcodes": "DDCB**E2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            227
          ],
          "clr": {
            "opcodes": "DDCB**E3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            228
          ],
          "clr": {
            "opcodes": "DDCB**E4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            229
          ],
          "clr": {
            "opcodes": "DDCB**E5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            231
          ],
          "clr": {
            "opcodes": "DDCB**E7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            231
          ],
          "clr": {
            "opcodes": "DDCB**E7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            232
          ],
          "clr": {
            "opcodes": "DDCB**E8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            233
          ],
          "clr": {
            "opcodes": "DDCB**E9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            234
          ],
          "clr": {
            "opcodes": "DDCB**EA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            235
          ],
          "clr": {
            "opcodes": "DDCB**EB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            236
          ],
          "clr": {
            "opcodes": "DDCB**EC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            237
          ],
          "clr": {
            "opcodes": "DDCB**ED",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            239
          ],
          "clr": {
            "opcodes": "DDCB**EF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            239
          ],
          "clr": {
            "opcodes": "DDCB**EF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            240
          ],
          "clr": {
            "opcodes": "DDCB**F0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            241
          ],
          "clr": {
            "opcodes": "DDCB**F1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            242
          ],
          "clr": {
            "opcodes": "DDCB**F2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            243
          ],
          "clr": {
            "opcodes": "DDCB**F3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            244
          ],
          "clr": {
            "opcodes": "DDCB**F4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            245
          ],
          "clr": {
            "opcodes": "DDCB**F5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            247
          ],
          "clr": {
            "opcodes": "DDCB**F7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            247
          ],
          "clr": {
            "opcodes": "DDCB**F7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            248
          ],
          "clr": {
            "opcodes": "DDCB**F8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            249
          ],
          "clr": {
            "opcodes": "DDCB**F9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            250
          ],
          "clr": {
            "opcodes": "DDCB**FA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            251
          ],
          "clr": {
            "opcodes": "DDCB**FB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            252
          ],
          "clr": {
            "opcodes": "DDCB**FC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            253
          ],
          "clr": {
            "opcodes": "DDCB**FD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            255
          ],
          "clr": {
            "opcodes": "DDCB**FF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            255
          ],
          "clr": {
            "opcodes": "DDCB**FF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*),a"
          }
        },
        {
          "tokens": [
            "sp",
            ",",
            "ix"
          ],
          "opcode": [
            221,
            249
          ],
          "clr": {
            "opcodes": "DDF9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Loads the value of IX into SP.",
            "instruction": "ld sp,ix"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "bc"
          ],
          "opcode": [
            237,
            67,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED43",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Stores BC into the memory location pointed to by **.",
            "instruction": "ld (**),bc"
          }
        },
        {
          "tokens": [
            "i",
            ",",
            "a"
          ],
          "opcode": [
            237,
            71
          ],
          "clr": {
            "opcodes": "ED47",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 9,
            "without_jump_clock_count": 9,
            "description": "Stores the value of A into register i or r.",
            "instruction": "ld i,a"
          }
        },
        {
          "tokens": [
            "bc",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            237,
            75,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED4B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Loads the value pointed to by ** into BC.",
            "instruction": "ld bc,(**)"
          }
        },
        {
          "tokens": [
            "r",
            ",",
            "a"
          ],
          "opcode": [
            237,
            79
          ],
          "clr": {
            "opcodes": "ED4F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 9,
            "without_jump_clock_count": 9,
            "description": "Stores the value of A into register i or r.",
            "instruction": "ld r,a"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "de"
          ],
          "opcode": [
            237,
            83,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED53",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Stores DE into the memory location pointed to by **.",
            "instruction": "ld (**),de"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "i"
          ],
          "opcode": [
            237,
            87
          ],
          "clr": {
            "opcodes": "ED57",
            "undocumented": false,
            "flags": "-0*0++",
            "byte_count": 2,
            "with_jump_clock_count": 9,
            "without_jump_clock_count": 9,
            "description": "Stores the value of register i or r into A.",
            "instruction": "ld a,i"
          }
        },
        {
          "tokens": [
            "i"
          ],
          "opcode": [
            237,
            87
          ],
          "clr": {
            "opcodes": "ED57",
            "undocumented": false,
            "flags": "-0*0++",
            "byte_count": 2,
            "with_jump_clock_count": 9,
            "without_jump_clock_count": 9,
            "description": "Stores the value of register i or r into A.",
            "instruction": "ld a,i"
          }
        },
        {
          "tokens": [
            "de",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            237,
            91,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED5B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Loads the value pointed to by ** into DE.",
            "instruction": "ld de,(**)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "r"
          ],
          "opcode": [
            237,
            95
          ],
          "clr": {
            "opcodes": "ED5F",
            "undocumented": false,
            "flags": "-0*0++",
            "byte_count": 2,
            "with_jump_clock_count": 9,
            "without_jump_clock_count": 9,
            "description": "Stores the value of register i or r into A.",
            "instruction": "ld a,r"
          }
        },
        {
          "tokens": [
            "r"
          ],
          "opcode": [
            237,
            95
          ],
          "clr": {
            "opcodes": "ED5F",
            "undocumented": false,
            "flags": "-0*0++",
            "byte_count": 2,
            "with_jump_clock_count": 9,
            "without_jump_clock_count": 9,
            "description": "Stores the value of register i or r into A.",
            "instruction": "ld a,r"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "hl"
          ],
          "opcode": [
            237,
            99,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED63",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Stores HL into the memory location pointed to by **.",
            "instruction": "ld (**),hl"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            237,
            107,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED6B",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Loads the value pointed to by ** into HL.",
            "instruction": "ld hl,(**)"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "sp"
          ],
          "opcode": [
            237,
            115,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED73",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Stores SP into the memory location pointed to by **.",
            "instruction": "ld (**),sp"
          }
        },
        {
          "tokens": [
            "sp",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            237,
            123,
            "nnnn"
          ],
          "clr": {
            "opcodes": "ED7B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Loads the value pointed to by ** into SP.",
            "instruction": "ld sp,(**)"
          }
        },
        {
          "tokens": [
            "sp",
            ",",
            "hl"
          ],
          "opcode": [
            249
          ],
          "clr": {
            "opcodes": "F9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Loads the value of HL into SP.",
            "instruction": "ld sp,hl"
          }
        },
        {
          "tokens": [
            "iy",
            ",",
            "nnnn"
          ],
          "opcode": [
            253,
            33,
            "nnnn"
          ],
          "clr": {
            "opcodes": "FD21",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 14,
            "without_jump_clock_count": 14,
            "description": "Loads ** into register IY.",
            "instruction": "ld iy,**"
          }
        },
        {
          "tokens": [
            "(",
            "nnnn",
            ")",
            ",",
            "iy"
          ],
          "opcode": [
            253,
            34,
            "nnnn"
          ],
          "clr": {
            "opcodes": "FD22",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Stores IY into the memory location pointed to by **.",
            "instruction": "ld (**),iy"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "nn"
          ],
          "opcode": [
            253,
            38,
            "nn"
          ],
          "clr": {
            "opcodes": "FD26",
            "undocumented": true,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "Loads * into IYH.",
            "instruction": "ld iyh,*"
          }
        },
        {
          "tokens": [
            "iy",
            ",",
            "(",
            "nnnn",
            ")"
          ],
          "opcode": [
            253,
            42,
            "nnnn"
          ],
          "clr": {
            "opcodes": "FD2A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Loads the value pointed to by ** into IY.",
            "instruction": "ld iy,(**)"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "nn"
          ],
          "opcode": [
            253,
            46,
            "nn"
          ],
          "clr": {
            "opcodes": "FD2E",
            "undocumented": true,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "Loads * into IYL.",
            "instruction": "ld iyl,*"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "nn"
          ],
          "opcode": [
            253,
            54,
            "dd",
            "nn"
          ],
          "clr": {
            "opcodes": "FD36",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores * to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),*"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            68
          ],
          "clr": {
            "opcodes": "FD44",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into B.",
            "instruction": "ld b,iyh"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            69
          ],
          "clr": {
            "opcodes": "FD45",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into B.",
            "instruction": "ld b,iyl"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            70,
            "dd"
          ],
          "clr": {
            "opcodes": "FD46",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into B.",
            "instruction": "ld b,(iy+*)"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            76
          ],
          "clr": {
            "opcodes": "FD4C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into C.",
            "instruction": "ld c,iyh"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            77
          ],
          "clr": {
            "opcodes": "FD4D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into C.",
            "instruction": "ld c,iyl"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            78,
            "dd"
          ],
          "clr": {
            "opcodes": "FD4E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into C.",
            "instruction": "ld c,(iy+*)"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            84
          ],
          "clr": {
            "opcodes": "FD54",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into D.",
            "instruction": "ld d,iyh"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            85
          ],
          "clr": {
            "opcodes": "FD55",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into D.",
            "instruction": "ld d,iyl"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            86,
            "dd"
          ],
          "clr": {
            "opcodes": "FD56",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into D.",
            "instruction": "ld d,(iy+*)"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            92
          ],
          "clr": {
            "opcodes": "FD5C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into E.",
            "instruction": "ld e,iyh"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            93
          ],
          "clr": {
            "opcodes": "FD5D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into E.",
            "instruction": "ld e,iyl"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            94,
            "dd"
          ],
          "clr": {
            "opcodes": "FD5E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into E.",
            "instruction": "ld e,(iy+*)"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "b"
          ],
          "opcode": [
            253,
            96
          ],
          "clr": {
            "opcodes": "FD60",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are loaded into IYH.",
            "instruction": "ld iyh,b"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "c"
          ],
          "opcode": [
            253,
            97
          ],
          "clr": {
            "opcodes": "FD61",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are loaded into IYH.",
            "instruction": "ld iyh,c"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "d"
          ],
          "opcode": [
            253,
            98
          ],
          "clr": {
            "opcodes": "FD62",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are loaded into IYH.",
            "instruction": "ld iyh,d"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "e"
          ],
          "opcode": [
            253,
            99
          ],
          "clr": {
            "opcodes": "FD63",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are loaded into IYH.",
            "instruction": "ld iyh,e"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            100
          ],
          "clr": {
            "opcodes": "FD64",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into IYH.",
            "instruction": "ld iyh,iyh"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            101
          ],
          "clr": {
            "opcodes": "FD65",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into IYH.",
            "instruction": "ld iyh,iyl"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            102,
            "dd"
          ],
          "clr": {
            "opcodes": "FD66",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into H.",
            "instruction": "ld h,(iy+*)"
          }
        },
        {
          "tokens": [
            "iyh",
            ",",
            "a"
          ],
          "opcode": [
            253,
            103
          ],
          "clr": {
            "opcodes": "FD67",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are loaded into IYH.",
            "instruction": "ld iyh,a"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "b"
          ],
          "opcode": [
            253,
            104
          ],
          "clr": {
            "opcodes": "FD68",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are loaded into IYL.",
            "instruction": "ld iyl,b"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "c"
          ],
          "opcode": [
            253,
            105
          ],
          "clr": {
            "opcodes": "FD69",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are loaded into IYL.",
            "instruction": "ld iyl,c"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "d"
          ],
          "opcode": [
            253,
            106
          ],
          "clr": {
            "opcodes": "FD6A",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are loaded into IYL.",
            "instruction": "ld iyl,d"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "e"
          ],
          "opcode": [
            253,
            107
          ],
          "clr": {
            "opcodes": "FD6B",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are loaded into IYL.",
            "instruction": "ld iyl,e"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            108
          ],
          "clr": {
            "opcodes": "FD6C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into IYL.",
            "instruction": "ld iyl,iyh"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            109
          ],
          "clr": {
            "opcodes": "FD6D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into IYL.",
            "instruction": "ld iyl,iyl"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            110,
            "dd"
          ],
          "clr": {
            "opcodes": "FD6E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into L.",
            "instruction": "ld l,(iy+*)"
          }
        },
        {
          "tokens": [
            "iyl",
            ",",
            "a"
          ],
          "opcode": [
            253,
            111
          ],
          "clr": {
            "opcodes": "FD6F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are loaded into IYL.",
            "instruction": "ld iyl,a"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "b"
          ],
          "opcode": [
            253,
            112,
            "dd"
          ],
          "clr": {
            "opcodes": "FD70",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores B to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),b"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "c"
          ],
          "opcode": [
            253,
            113,
            "dd"
          ],
          "clr": {
            "opcodes": "FD71",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores C to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),c"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "d"
          ],
          "opcode": [
            253,
            114,
            "dd"
          ],
          "clr": {
            "opcodes": "FD72",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores D to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),d"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "e"
          ],
          "opcode": [
            253,
            115,
            "dd"
          ],
          "clr": {
            "opcodes": "FD73",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores E to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),e"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "h"
          ],
          "opcode": [
            253,
            116,
            "dd"
          ],
          "clr": {
            "opcodes": "FD74",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores H to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),h"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "l"
          ],
          "opcode": [
            253,
            117,
            "dd"
          ],
          "clr": {
            "opcodes": "FD75",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores L to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),l"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            253,
            119,
            "dd"
          ],
          "clr": {
            "opcodes": "FD77",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Stores A to the memory location pointed to by IY plus *.",
            "instruction": "ld (iy+*),a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            124
          ],
          "clr": {
            "opcodes": "FD7C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into A.",
            "instruction": "ld a,iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            124
          ],
          "clr": {
            "opcodes": "FD7C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYH are loaded into A.",
            "instruction": "ld a,iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            125
          ],
          "clr": {
            "opcodes": "FD7D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into A.",
            "instruction": "ld a,iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            125
          ],
          "clr": {
            "opcodes": "FD7D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of IYL are loaded into A.",
            "instruction": "ld a,iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            126,
            "dd"
          ],
          "clr": {
            "opcodes": "FD7E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into A.",
            "instruction": "ld a,(iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            126,
            "dd"
          ],
          "clr": {
            "opcodes": "FD7E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Loads the value pointed to by IY plus * into A.",
            "instruction": "ld a,(iy+*)"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            0
          ],
          "clr": {
            "opcodes": "FDCB**00",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in B.",
            "instruction": "rlc (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            1
          ],
          "clr": {
            "opcodes": "FDCB**01",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in C.",
            "instruction": "rlc (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            2
          ],
          "clr": {
            "opcodes": "FDCB**02",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in D.",
            "instruction": "rlc (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            3
          ],
          "clr": {
            "opcodes": "FDCB**03",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in E.",
            "instruction": "rlc (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            4
          ],
          "clr": {
            "opcodes": "FDCB**04",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in H.",
            "instruction": "rlc (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            5
          ],
          "clr": {
            "opcodes": "FDCB**05",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in L.",
            "instruction": "rlc (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            7
          ],
          "clr": {
            "opcodes": "FDCB**07",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in A.",
            "instruction": "rlc (iy+*),a"
          }
        },
        {
          "tokens": [
            "rlc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            7
          ],
          "clr": {
            "opcodes": "FDCB**07",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0. The result is then stored in A.",
            "instruction": "rlc (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            8
          ],
          "clr": {
            "opcodes": "FDCB**08",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in B.",
            "instruction": "rrc (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            9
          ],
          "clr": {
            "opcodes": "FDCB**09",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in C.",
            "instruction": "rrc (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            10
          ],
          "clr": {
            "opcodes": "FDCB**0A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in D.",
            "instruction": "rrc (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            11
          ],
          "clr": {
            "opcodes": "FDCB**0B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in E.",
            "instruction": "rrc (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            12
          ],
          "clr": {
            "opcodes": "FDCB**0C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in H.",
            "instruction": "rrc (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            13
          ],
          "clr": {
            "opcodes": "FDCB**0D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in L.",
            "instruction": "rrc (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            15
          ],
          "clr": {
            "opcodes": "FDCB**0F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in A.",
            "instruction": "rrc (iy+*),a"
          }
        },
        {
          "tokens": [
            "rrc",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            15
          ],
          "clr": {
            "opcodes": "FDCB**0F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7. The result is then stored in A.",
            "instruction": "rrc (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            16
          ],
          "clr": {
            "opcodes": "FDCB**10",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in B.",
            "instruction": "rl (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            17
          ],
          "clr": {
            "opcodes": "FDCB**11",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in C.",
            "instruction": "rl (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            18
          ],
          "clr": {
            "opcodes": "FDCB**12",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in D.",
            "instruction": "rl (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            19
          ],
          "clr": {
            "opcodes": "FDCB**13",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in E.",
            "instruction": "rl (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            20
          ],
          "clr": {
            "opcodes": "FDCB**14",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in H.",
            "instruction": "rl (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            21
          ],
          "clr": {
            "opcodes": "FDCB**15",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in L.",
            "instruction": "rl (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            23
          ],
          "clr": {
            "opcodes": "FDCB**17",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in A.",
            "instruction": "rl (iy+*),a"
          }
        },
        {
          "tokens": [
            "rl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            23
          ],
          "clr": {
            "opcodes": "FDCB**17",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0. The result is then stored in A.",
            "instruction": "rl (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            24
          ],
          "clr": {
            "opcodes": "FDCB**18",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in B.",
            "instruction": "rr (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            25
          ],
          "clr": {
            "opcodes": "FDCB**19",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in C.",
            "instruction": "rr (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            26
          ],
          "clr": {
            "opcodes": "FDCB**1A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in D.",
            "instruction": "rr (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            27
          ],
          "clr": {
            "opcodes": "FDCB**1B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in E.",
            "instruction": "rr (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            28
          ],
          "clr": {
            "opcodes": "FDCB**1C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in H.",
            "instruction": "rr (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            29
          ],
          "clr": {
            "opcodes": "FDCB**1D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in L.",
            "instruction": "rr (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            31
          ],
          "clr": {
            "opcodes": "FDCB**1F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in A.",
            "instruction": "rr (iy+*),a"
          }
        },
        {
          "tokens": [
            "rr",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            31
          ],
          "clr": {
            "opcodes": "FDCB**1F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7. The result is then stored in A.",
            "instruction": "rr (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            32
          ],
          "clr": {
            "opcodes": "FDCB**20",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in B.",
            "instruction": "sla (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            33
          ],
          "clr": {
            "opcodes": "FDCB**21",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in C.",
            "instruction": "sla (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            34
          ],
          "clr": {
            "opcodes": "FDCB**22",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in D.",
            "instruction": "sla (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            35
          ],
          "clr": {
            "opcodes": "FDCB**23",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in E.",
            "instruction": "sla (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            36
          ],
          "clr": {
            "opcodes": "FDCB**24",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in H.",
            "instruction": "sla (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            37
          ],
          "clr": {
            "opcodes": "FDCB**25",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in L.",
            "instruction": "sla (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            39
          ],
          "clr": {
            "opcodes": "FDCB**27",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in A.",
            "instruction": "sla (iy+*),a"
          }
        },
        {
          "tokens": [
            "sla",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            39
          ],
          "clr": {
            "opcodes": "FDCB**27",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0. The result is then stored in A.",
            "instruction": "sla (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            40
          ],
          "clr": {
            "opcodes": "FDCB**28",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in B.",
            "instruction": "sra (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            41
          ],
          "clr": {
            "opcodes": "FDCB**29",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in C.",
            "instruction": "sra (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            42
          ],
          "clr": {
            "opcodes": "FDCB**2A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in D.",
            "instruction": "sra (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            43
          ],
          "clr": {
            "opcodes": "FDCB**2B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in E.",
            "instruction": "sra (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            44
          ],
          "clr": {
            "opcodes": "FDCB**2C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in H.",
            "instruction": "sra (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            45
          ],
          "clr": {
            "opcodes": "FDCB**2D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in L.",
            "instruction": "sra (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            47
          ],
          "clr": {
            "opcodes": "FDCB**2F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in A.",
            "instruction": "sra (iy+*),a"
          }
        },
        {
          "tokens": [
            "sra",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            47
          ],
          "clr": {
            "opcodes": "FDCB**2F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged. The result is then stored in A.",
            "instruction": "sra (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            48
          ],
          "clr": {
            "opcodes": "FDCB**30",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in B.",
            "instruction": "sll (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            49
          ],
          "clr": {
            "opcodes": "FDCB**31",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in C.",
            "instruction": "sll (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            50
          ],
          "clr": {
            "opcodes": "FDCB**32",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in D.",
            "instruction": "sll (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            51
          ],
          "clr": {
            "opcodes": "FDCB**33",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in E.",
            "instruction": "sll (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            52
          ],
          "clr": {
            "opcodes": "FDCB**34",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in H.",
            "instruction": "sll (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            53
          ],
          "clr": {
            "opcodes": "FDCB**35",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in L.",
            "instruction": "sll (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            55
          ],
          "clr": {
            "opcodes": "FDCB**37",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in A.",
            "instruction": "sll (iy+*),a"
          }
        },
        {
          "tokens": [
            "sll",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            55
          ],
          "clr": {
            "opcodes": "FDCB**37",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0. The result is then stored in A.",
            "instruction": "sll (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            56
          ],
          "clr": {
            "opcodes": "FDCB**38",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in B.",
            "instruction": "srl (iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            57
          ],
          "clr": {
            "opcodes": "FDCB**39",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in C.",
            "instruction": "srl (iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            58
          ],
          "clr": {
            "opcodes": "FDCB**3A",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in D.",
            "instruction": "srl (iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            59
          ],
          "clr": {
            "opcodes": "FDCB**3B",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in E.",
            "instruction": "srl (iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            60
          ],
          "clr": {
            "opcodes": "FDCB**3C",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in H.",
            "instruction": "srl (iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            61
          ],
          "clr": {
            "opcodes": "FDCB**3D",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in L.",
            "instruction": "srl (iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            63
          ],
          "clr": {
            "opcodes": "FDCB**3F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in A.",
            "instruction": "srl (iy+*),a"
          }
        },
        {
          "tokens": [
            "srl",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            63
          ],
          "clr": {
            "opcodes": "FDCB**3F",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7. The result is then stored in A.",
            "instruction": "srl (iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            128
          ],
          "clr": {
            "opcodes": "FDCB**80",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            129
          ],
          "clr": {
            "opcodes": "FDCB**81",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            130
          ],
          "clr": {
            "opcodes": "FDCB**82",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            131
          ],
          "clr": {
            "opcodes": "FDCB**83",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            132
          ],
          "clr": {
            "opcodes": "FDCB**84",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            133
          ],
          "clr": {
            "opcodes": "FDCB**85",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            135
          ],
          "clr": {
            "opcodes": "FDCB**87",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            135
          ],
          "clr": {
            "opcodes": "FDCB**87",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            136
          ],
          "clr": {
            "opcodes": "FDCB**88",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            137
          ],
          "clr": {
            "opcodes": "FDCB**89",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            138
          ],
          "clr": {
            "opcodes": "FDCB**8A",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            139
          ],
          "clr": {
            "opcodes": "FDCB**8B",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            140
          ],
          "clr": {
            "opcodes": "FDCB**8C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            141
          ],
          "clr": {
            "opcodes": "FDCB**8D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            143
          ],
          "clr": {
            "opcodes": "FDCB**8F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            143
          ],
          "clr": {
            "opcodes": "FDCB**8F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            144
          ],
          "clr": {
            "opcodes": "FDCB**90",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            145
          ],
          "clr": {
            "opcodes": "FDCB**91",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            146
          ],
          "clr": {
            "opcodes": "FDCB**92",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            147
          ],
          "clr": {
            "opcodes": "FDCB**93",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            148
          ],
          "clr": {
            "opcodes": "FDCB**94",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            149
          ],
          "clr": {
            "opcodes": "FDCB**95",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            151
          ],
          "clr": {
            "opcodes": "FDCB**97",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            151
          ],
          "clr": {
            "opcodes": "FDCB**97",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            152
          ],
          "clr": {
            "opcodes": "FDCB**98",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            153
          ],
          "clr": {
            "opcodes": "FDCB**99",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            154
          ],
          "clr": {
            "opcodes": "FDCB**9A",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            155
          ],
          "clr": {
            "opcodes": "FDCB**9B",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            156
          ],
          "clr": {
            "opcodes": "FDCB**9C",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            157
          ],
          "clr": {
            "opcodes": "FDCB**9D",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            159
          ],
          "clr": {
            "opcodes": "FDCB**9F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            159
          ],
          "clr": {
            "opcodes": "FDCB**9F",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            160
          ],
          "clr": {
            "opcodes": "FDCB**A0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            161
          ],
          "clr": {
            "opcodes": "FDCB**A1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            162
          ],
          "clr": {
            "opcodes": "FDCB**A2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            163
          ],
          "clr": {
            "opcodes": "FDCB**A3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            164
          ],
          "clr": {
            "opcodes": "FDCB**A4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            165
          ],
          "clr": {
            "opcodes": "FDCB**A5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            167
          ],
          "clr": {
            "opcodes": "FDCB**A7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            167
          ],
          "clr": {
            "opcodes": "FDCB**A7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            168
          ],
          "clr": {
            "opcodes": "FDCB**A8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            169
          ],
          "clr": {
            "opcodes": "FDCB**A9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            170
          ],
          "clr": {
            "opcodes": "FDCB**AA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            171
          ],
          "clr": {
            "opcodes": "FDCB**AB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            172
          ],
          "clr": {
            "opcodes": "FDCB**AC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            173
          ],
          "clr": {
            "opcodes": "FDCB**AD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            175
          ],
          "clr": {
            "opcodes": "FDCB**AF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            175
          ],
          "clr": {
            "opcodes": "FDCB**AF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            176
          ],
          "clr": {
            "opcodes": "FDCB**B0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            177
          ],
          "clr": {
            "opcodes": "FDCB**B1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            178
          ],
          "clr": {
            "opcodes": "FDCB**B2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            179
          ],
          "clr": {
            "opcodes": "FDCB**B3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            180
          ],
          "clr": {
            "opcodes": "FDCB**B4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            181
          ],
          "clr": {
            "opcodes": "FDCB**B5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            183
          ],
          "clr": {
            "opcodes": "FDCB**B7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            183
          ],
          "clr": {
            "opcodes": "FDCB**B7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            184
          ],
          "clr": {
            "opcodes": "FDCB**B8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            185
          ],
          "clr": {
            "opcodes": "FDCB**B9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            186
          ],
          "clr": {
            "opcodes": "FDCB**BA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            187
          ],
          "clr": {
            "opcodes": "FDCB**BB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            188
          ],
          "clr": {
            "opcodes": "FDCB**BC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            189
          ],
          "clr": {
            "opcodes": "FDCB**BD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            191
          ],
          "clr": {
            "opcodes": "FDCB**BF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),a"
          }
        },
        {
          "tokens": [
            "res",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            191
          ],
          "clr": {
            "opcodes": "FDCB**BF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            192
          ],
          "clr": {
            "opcodes": "FDCB**C0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            193
          ],
          "clr": {
            "opcodes": "FDCB**C1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            194
          ],
          "clr": {
            "opcodes": "FDCB**C2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            195
          ],
          "clr": {
            "opcodes": "FDCB**C3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            196
          ],
          "clr": {
            "opcodes": "FDCB**C4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            197
          ],
          "clr": {
            "opcodes": "FDCB**C5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            199
          ],
          "clr": {
            "opcodes": "FDCB**C7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            199
          ],
          "clr": {
            "opcodes": "FDCB**C7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            200
          ],
          "clr": {
            "opcodes": "FDCB**C8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            201
          ],
          "clr": {
            "opcodes": "FDCB**C9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            202
          ],
          "clr": {
            "opcodes": "FDCB**CA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            203
          ],
          "clr": {
            "opcodes": "FDCB**CB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            204
          ],
          "clr": {
            "opcodes": "FDCB**CC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            205
          ],
          "clr": {
            "opcodes": "FDCB**CD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            207
          ],
          "clr": {
            "opcodes": "FDCB**CF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            207
          ],
          "clr": {
            "opcodes": "FDCB**CF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            208
          ],
          "clr": {
            "opcodes": "FDCB**D0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            209
          ],
          "clr": {
            "opcodes": "FDCB**D1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            210
          ],
          "clr": {
            "opcodes": "FDCB**D2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            211
          ],
          "clr": {
            "opcodes": "FDCB**D3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            212
          ],
          "clr": {
            "opcodes": "FDCB**D4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            213
          ],
          "clr": {
            "opcodes": "FDCB**D5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            215
          ],
          "clr": {
            "opcodes": "FDCB**D7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            215
          ],
          "clr": {
            "opcodes": "FDCB**D7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            216
          ],
          "clr": {
            "opcodes": "FDCB**D8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            217
          ],
          "clr": {
            "opcodes": "FDCB**D9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            218
          ],
          "clr": {
            "opcodes": "FDCB**DA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            219
          ],
          "clr": {
            "opcodes": "FDCB**DB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            220
          ],
          "clr": {
            "opcodes": "FDCB**DC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            221
          ],
          "clr": {
            "opcodes": "FDCB**DD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            223
          ],
          "clr": {
            "opcodes": "FDCB**DF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            223
          ],
          "clr": {
            "opcodes": "FDCB**DF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            224
          ],
          "clr": {
            "opcodes": "FDCB**E0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            225
          ],
          "clr": {
            "opcodes": "FDCB**E1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            226
          ],
          "clr": {
            "opcodes": "FDCB**E2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            227
          ],
          "clr": {
            "opcodes": "FDCB**E3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            228
          ],
          "clr": {
            "opcodes": "FDCB**E4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            229
          ],
          "clr": {
            "opcodes": "FDCB**E5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            231
          ],
          "clr": {
            "opcodes": "FDCB**E7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            231
          ],
          "clr": {
            "opcodes": "FDCB**E7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            232
          ],
          "clr": {
            "opcodes": "FDCB**E8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            233
          ],
          "clr": {
            "opcodes": "FDCB**E9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            234
          ],
          "clr": {
            "opcodes": "FDCB**EA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            235
          ],
          "clr": {
            "opcodes": "FDCB**EB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            236
          ],
          "clr": {
            "opcodes": "FDCB**EC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            237
          ],
          "clr": {
            "opcodes": "FDCB**ED",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            239
          ],
          "clr": {
            "opcodes": "FDCB**EF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            239
          ],
          "clr": {
            "opcodes": "FDCB**EF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            240
          ],
          "clr": {
            "opcodes": "FDCB**F0",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            241
          ],
          "clr": {
            "opcodes": "FDCB**F1",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            242
          ],
          "clr": {
            "opcodes": "FDCB**F2",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            243
          ],
          "clr": {
            "opcodes": "FDCB**F3",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            244
          ],
          "clr": {
            "opcodes": "FDCB**F4",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            245
          ],
          "clr": {
            "opcodes": "FDCB**F5",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            247
          ],
          "clr": {
            "opcodes": "FDCB**F7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            247
          ],
          "clr": {
            "opcodes": "FDCB**F7",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*),a"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            248
          ],
          "clr": {
            "opcodes": "FDCB**F8",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),b"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            249
          ],
          "clr": {
            "opcodes": "FDCB**F9",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),c"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            250
          ],
          "clr": {
            "opcodes": "FDCB**FA",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),d"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            251
          ],
          "clr": {
            "opcodes": "FDCB**FB",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),e"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            252
          ],
          "clr": {
            "opcodes": "FDCB**FC",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),h"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            253
          ],
          "clr": {
            "opcodes": "FDCB**FD",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            255
          ],
          "clr": {
            "opcodes": "FDCB**FF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),a"
          }
        },
        {
          "tokens": [
            "set",
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            255
          ],
          "clr": {
            "opcodes": "FDCB**FF",
            "undocumented": true,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*),a"
          }
        },
        {
          "tokens": [
            "sp",
            ",",
            "iy"
          ],
          "opcode": [
            253,
            249
          ],
          "clr": {
            "opcodes": "FDF9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Loads the value of IY into SP.",
            "instruction": "ld sp,iy"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "bc"
          ],
          "opcode": [
            96,
            105
          ],
          "clr": null
        },
        {
          "tokens": [
            "bc",
            ",",
            "hl"
          ],
          "opcode": [
            68,
            77
          ],
          "clr": null
        },
        {
          "tokens": [
            "de",
            ",",
            "hl"
          ],
          "opcode": [
            84,
            93
          ],
          "clr": null
        },
        {
          "tokens": [
            "hl",
            ",",
            "de"
          ],
          "opcode": [
            98,
            107
          ],
          "clr": null
        }
      ]
    },
    "inc": {
      "variants": [
        {
          "tokens": [
            "bc"
          ],
          "opcode": [
            3
          ],
          "clr": {
            "opcodes": "03",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Adds one to BC.",
            "instruction": "inc bc"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            4
          ],
          "clr": {
            "opcodes": "04",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds one to B.",
            "instruction": "inc b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            12
          ],
          "clr": {
            "opcodes": "0C",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds one to C.",
            "instruction": "inc c"
          }
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            19
          ],
          "clr": {
            "opcodes": "13",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Adds one to DE.",
            "instruction": "inc de"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            20
          ],
          "clr": {
            "opcodes": "14",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds one to D.",
            "instruction": "inc d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            28
          ],
          "clr": {
            "opcodes": "1C",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds one to E.",
            "instruction": "inc e"
          }
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            35
          ],
          "clr": {
            "opcodes": "23",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Adds one to HL.",
            "instruction": "inc hl"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            36
          ],
          "clr": {
            "opcodes": "24",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds one to H.",
            "instruction": "inc h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            44
          ],
          "clr": {
            "opcodes": "2C",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds one to L.",
            "instruction": "inc l"
          }
        },
        {
          "tokens": [
            "sp"
          ],
          "opcode": [
            51
          ],
          "clr": {
            "opcodes": "33",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Adds one to SP.",
            "instruction": "inc sp"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            52
          ],
          "clr": {
            "opcodes": "34",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "Adds one to (HL).",
            "instruction": "inc (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            60
          ],
          "clr": {
            "opcodes": "3C",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds one to A.",
            "instruction": "inc a"
          }
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            35
          ],
          "clr": {
            "opcodes": "DD23",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Adds one to IX.",
            "instruction": "inc ix"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            36
          ],
          "clr": {
            "opcodes": "DD24",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds one to IXH.",
            "instruction": "inc ixh"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            44
          ],
          "clr": {
            "opcodes": "DD2C",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds one to IXL.",
            "instruction": "inc ixl"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            52,
            "dd"
          ],
          "clr": {
            "opcodes": "DD34",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 3,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Adds one to the memory location pointed to by IX plus *.",
            "instruction": "inc (ix+*)"
          }
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            35
          ],
          "clr": {
            "opcodes": "FD23",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Adds one to IY.",
            "instruction": "inc iy"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            36
          ],
          "clr": {
            "opcodes": "FD24",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds one to IYH.",
            "instruction": "inc iyh"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            44
          ],
          "clr": {
            "opcodes": "FD2C",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds one to IYL.",
            "instruction": "inc iyl"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            52,
            "dd"
          ],
          "clr": {
            "opcodes": "FD34",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 3,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Adds one to the memory location pointed to by IY plus *.",
            "instruction": "inc (iy+*)"
          }
        }
      ]
    },
    "dec": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            5
          ],
          "clr": {
            "opcodes": "05",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts one from B.",
            "instruction": "dec b"
          }
        },
        {
          "tokens": [
            "bc"
          ],
          "opcode": [
            11
          ],
          "clr": {
            "opcodes": "0B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Subtracts one from BC.",
            "instruction": "dec bc"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            13
          ],
          "clr": {
            "opcodes": "0D",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts one from C.",
            "instruction": "dec c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            21
          ],
          "clr": {
            "opcodes": "15",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts one from D.",
            "instruction": "dec d"
          }
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            27
          ],
          "clr": {
            "opcodes": "1B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Subtracts one from DE.",
            "instruction": "dec de"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            29
          ],
          "clr": {
            "opcodes": "1D",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts one from E.",
            "instruction": "dec e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            37
          ],
          "clr": {
            "opcodes": "25",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts one from H.",
            "instruction": "dec h"
          }
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            43
          ],
          "clr": {
            "opcodes": "2B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Subtracts one from HL.",
            "instruction": "dec hl"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            45
          ],
          "clr": {
            "opcodes": "2D",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts one from L.",
            "instruction": "dec l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            53
          ],
          "clr": {
            "opcodes": "35",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "Subtracts one from (HL).",
            "instruction": "dec (hl)"
          }
        },
        {
          "tokens": [
            "sp"
          ],
          "opcode": [
            59
          ],
          "clr": {
            "opcodes": "3B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 6,
            "without_jump_clock_count": 6,
            "description": "Subtracts one from SP.",
            "instruction": "dec sp"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            61
          ],
          "clr": {
            "opcodes": "3D",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts one from A.",
            "instruction": "dec a"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            37
          ],
          "clr": {
            "opcodes": "DD25",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts one from IXH.",
            "instruction": "dec ixh"
          }
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            43
          ],
          "clr": {
            "opcodes": "DD2B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Subtracts one from IX.",
            "instruction": "dec ix"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            45
          ],
          "clr": {
            "opcodes": "DD2D",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts one from IXL.",
            "instruction": "dec ixl"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            53,
            "dd"
          ],
          "clr": {
            "opcodes": "DD35",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 3,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Subtracts one from the memory location pointed to by IX plus *.",
            "instruction": "dec (ix+*)"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            37
          ],
          "clr": {
            "opcodes": "FD25",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts one from IYH.",
            "instruction": "dec iyh"
          }
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            43
          ],
          "clr": {
            "opcodes": "FD2B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "Subtracts one from IY.",
            "instruction": "dec iy"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            45
          ],
          "clr": {
            "opcodes": "FD2D",
            "undocumented": true,
            "flags": "-+V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts one from IYL.",
            "instruction": "dec iyl"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            53,
            "dd"
          ],
          "clr": {
            "opcodes": "FD35",
            "undocumented": false,
            "flags": "-+V+++",
            "byte_count": 3,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Subtracts one from the memory location pointed to by IY plus *.",
            "instruction": "dec (iy+*)"
          }
        }
      ]
    },
    "rlca": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            7
          ],
          "clr": {
            "opcodes": "07",
            "undocumented": false,
            "flags": "+0-0--",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlca"
          }
        }
      ]
    },
    "ex": {
      "variants": [
        {
          "tokens": [
            "af",
            ",",
            "af'"
          ],
          "opcode": [
            8
          ],
          "clr": {
            "opcodes": "08",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Exchanges the 16-bit contents of AF and AF'.",
            "instruction": "ex af,af'"
          }
        },
        {
          "tokens": [
            "(",
            "sp",
            ")",
            ",",
            "ix"
          ],
          "opcode": [
            221,
            227
          ],
          "clr": {
            "opcodes": "DDE3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Exchanges (SP) with the IXL, and (SP+1) with the IXH.",
            "instruction": "ex (sp),ix"
          }
        },
        {
          "tokens": [
            "(",
            "sp",
            ")",
            ",",
            "hl"
          ],
          "opcode": [
            227
          ],
          "clr": {
            "opcodes": "E3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Exchanges (SP) with L, and (SP+1) with H.",
            "instruction": "ex (sp),hl"
          }
        },
        {
          "tokens": [
            "de",
            ",",
            "hl"
          ],
          "opcode": [
            235
          ],
          "clr": {
            "opcodes": "EB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Exchanges the 16-bit contents of DE and HL.",
            "instruction": "ex de,hl"
          }
        },
        {
          "tokens": [
            "(",
            "sp",
            ")",
            ",",
            "iy"
          ],
          "opcode": [
            253,
            227
          ],
          "clr": {
            "opcodes": "FDE3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Exchanges (SP) with the IYL, and (SP+1) with the IYH.",
            "instruction": "ex (sp),iy"
          }
        }
      ]
    },
    "add": {
      "variants": [
        {
          "tokens": [
            "hl",
            ",",
            "bc"
          ],
          "opcode": [
            9
          ],
          "clr": {
            "opcodes": "09",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The value of BC is added to HL.",
            "instruction": "add hl,bc"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "de"
          ],
          "opcode": [
            25
          ],
          "clr": {
            "opcodes": "19",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The value of DE is added to HL.",
            "instruction": "add hl,de"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "hl"
          ],
          "opcode": [
            41
          ],
          "clr": {
            "opcodes": "29",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The value of HL is added to HL.",
            "instruction": "add hl,hl"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "sp"
          ],
          "opcode": [
            57
          ],
          "clr": {
            "opcodes": "39",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The value of HL is added to HL.",
            "instruction": "add hl,sp"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            128
          ],
          "clr": {
            "opcodes": "80",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds B to A.",
            "instruction": "add a,b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            128
          ],
          "clr": {
            "opcodes": "80",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds B to A.",
            "instruction": "add a,b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            129
          ],
          "clr": {
            "opcodes": "81",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds C to A.",
            "instruction": "add a,c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            129
          ],
          "clr": {
            "opcodes": "81",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds C to A.",
            "instruction": "add a,c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            130
          ],
          "clr": {
            "opcodes": "82",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds D to A.",
            "instruction": "add a,d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            130
          ],
          "clr": {
            "opcodes": "82",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds D to A.",
            "instruction": "add a,d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            131
          ],
          "clr": {
            "opcodes": "83",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds E to A.",
            "instruction": "add a,e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            131
          ],
          "clr": {
            "opcodes": "83",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds E to A.",
            "instruction": "add a,e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            132
          ],
          "clr": {
            "opcodes": "84",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds H to A.",
            "instruction": "add a,h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            132
          ],
          "clr": {
            "opcodes": "84",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds H to A.",
            "instruction": "add a,h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            133
          ],
          "clr": {
            "opcodes": "85",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds L to A.",
            "instruction": "add a,l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            133
          ],
          "clr": {
            "opcodes": "85",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds L to A.",
            "instruction": "add a,l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            134
          ],
          "clr": {
            "opcodes": "86",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds (HL) to A.",
            "instruction": "add a,(hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            134
          ],
          "clr": {
            "opcodes": "86",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds (HL) to A.",
            "instruction": "add a,(hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            135
          ],
          "clr": {
            "opcodes": "87",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds A to A.",
            "instruction": "add a,a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            135
          ],
          "clr": {
            "opcodes": "87",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds A to A.",
            "instruction": "add a,a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "nn"
          ],
          "opcode": [
            198,
            "nn"
          ],
          "clr": {
            "opcodes": "C6",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds * to A.",
            "instruction": "add a,*"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            198,
            "nn"
          ],
          "clr": {
            "opcodes": "C6",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds * to A.",
            "instruction": "add a,*"
          }
        },
        {
          "tokens": [
            "ix",
            ",",
            "bc"
          ],
          "opcode": [
            221,
            9
          ],
          "clr": {
            "opcodes": "DD09",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of BC is added to IX.",
            "instruction": "add ix,bc"
          }
        },
        {
          "tokens": [
            "ix",
            ",",
            "de"
          ],
          "opcode": [
            221,
            25
          ],
          "clr": {
            "opcodes": "DD19",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of DE is added to IX.",
            "instruction": "add ix,de"
          }
        },
        {
          "tokens": [
            "ix",
            ",",
            "ix"
          ],
          "opcode": [
            221,
            41
          ],
          "clr": {
            "opcodes": "DD29",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of IX is added to IX.",
            "instruction": "add ix,ix"
          }
        },
        {
          "tokens": [
            "ix",
            ",",
            "sp"
          ],
          "opcode": [
            221,
            57
          ],
          "clr": {
            "opcodes": "DD39",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of SP is added to IX.",
            "instruction": "add ix,sp"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            132
          ],
          "clr": {
            "opcodes": "DD84",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXH to A.",
            "instruction": "add a,ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            132
          ],
          "clr": {
            "opcodes": "DD84",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXH to A.",
            "instruction": "add a,ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            133
          ],
          "clr": {
            "opcodes": "DD85",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXL to A.",
            "instruction": "add a,ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            133
          ],
          "clr": {
            "opcodes": "DD85",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXL to A.",
            "instruction": "add a,ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            134,
            "dd"
          ],
          "clr": {
            "opcodes": "DD86",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IX plus * to A.",
            "instruction": "add a,(ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            134,
            "dd"
          ],
          "clr": {
            "opcodes": "DD86",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IX plus * to A.",
            "instruction": "add a,(ix+*)"
          }
        },
        {
          "tokens": [
            "iy",
            ",",
            "bc"
          ],
          "opcode": [
            253,
            9
          ],
          "clr": {
            "opcodes": "FD09",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of BC is added to IY.",
            "instruction": "add iy,bc"
          }
        },
        {
          "tokens": [
            "iy",
            ",",
            "de"
          ],
          "opcode": [
            253,
            25
          ],
          "clr": {
            "opcodes": "FD19",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of DE is added to IY.",
            "instruction": "add iy,de"
          }
        },
        {
          "tokens": [
            "iy",
            ",",
            "iy"
          ],
          "opcode": [
            253,
            41
          ],
          "clr": {
            "opcodes": "FD29",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of IX is added to IY.",
            "instruction": "add iy,iy"
          }
        },
        {
          "tokens": [
            "iy",
            ",",
            "sp"
          ],
          "opcode": [
            253,
            57
          ],
          "clr": {
            "opcodes": "FD39",
            "undocumented": false,
            "flags": "++-+--",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The value of SP is added to IY.",
            "instruction": "add iy,sp"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            132
          ],
          "clr": {
            "opcodes": "FD84",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYH to A.",
            "instruction": "add a,iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            132
          ],
          "clr": {
            "opcodes": "FD84",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYH to A.",
            "instruction": "add a,iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            133
          ],
          "clr": {
            "opcodes": "FD85",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYL to A.",
            "instruction": "add a,iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            133
          ],
          "clr": {
            "opcodes": "FD85",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYL to A.",
            "instruction": "add a,iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            134,
            "dd"
          ],
          "clr": {
            "opcodes": "FD86",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IY plus * to A.",
            "instruction": "add a,(iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            134,
            "dd"
          ],
          "clr": {
            "opcodes": "FD86",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IY plus * to A.",
            "instruction": "add a,(iy+*)"
          }
        }
      ]
    },
    "rrca": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            15
          ],
          "clr": {
            "opcodes": "0F",
            "undocumented": false,
            "flags": "+0-0--",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrca"
          }
        }
      ]
    },
    "djnz": {
      "variants": [
        {
          "tokens": [
            "offset"
          ],
          "opcode": [
            16,
            "offset"
          ],
          "clr": {
            "opcodes": "10",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 13,
            "without_jump_clock_count": 8,
            "description": "The B register is decremented, and if not zero, the signed value * is added to PC. The jump is measured from the start of the instruction opcode.",
            "instruction": "djnz *"
          }
        }
      ]
    },
    "rla": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            23
          ],
          "clr": {
            "opcodes": "17",
            "undocumented": false,
            "flags": "+0-0--",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rla"
          }
        }
      ]
    },
    "jr": {
      "variants": [
        {
          "tokens": [
            "offset"
          ],
          "opcode": [
            24,
            "offset"
          ],
          "clr": {
            "opcodes": "18",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The signed value * is added to PC. The jump is measured from the start of the instruction opcode.",
            "instruction": "jr *"
          }
        },
        {
          "tokens": [
            "nz",
            ",",
            "offset"
          ],
          "opcode": [
            32,
            "offset"
          ],
          "clr": {
            "opcodes": "20",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 7,
            "description": "If condition CC is true, the signed value * is added to PC. The jump is measured from the start of the instruction opcode.",
            "instruction": "jr nz,*"
          }
        },
        {
          "tokens": [
            "z",
            ",",
            "offset"
          ],
          "opcode": [
            40,
            "offset"
          ],
          "clr": {
            "opcodes": "28",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 7,
            "description": "If condition CC is true, the signed value * is added to PC. The jump is measured from the start of the instruction opcode.",
            "instruction": "jr z,*"
          }
        },
        {
          "tokens": [
            "nc",
            ",",
            "offset"
          ],
          "opcode": [
            48,
            "offset"
          ],
          "clr": {
            "opcodes": "30",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 7,
            "description": "If condition CC is true, the signed value * is added to PC. The jump is measured from the start of the instruction opcode.",
            "instruction": "jr nc,*"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "offset"
          ],
          "opcode": [
            56,
            "offset"
          ],
          "clr": {
            "opcodes": "38",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 7,
            "description": "If condition CC is true, the signed value * is added to PC. The jump is measured from the start of the instruction opcode.",
            "instruction": "jr c,*"
          }
        }
      ]
    },
    "rra": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            31
          ],
          "clr": {
            "opcodes": "1F",
            "undocumented": false,
            "flags": "+0-0--",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rra"
          }
        }
      ]
    },
    "daa": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            39
          ],
          "clr": {
            "opcodes": "27",
            "undocumented": false,
            "flags": "*-P*++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adjusts A for BCD addition and subtraction operations.",
            "instruction": "daa"
          }
        }
      ]
    },
    "cpl": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            47
          ],
          "clr": {
            "opcodes": "2F",
            "undocumented": false,
            "flags": "-1-1--",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "The contents of A are inverted (one's complement).",
            "instruction": "cpl"
          }
        }
      ]
    },
    "scf": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            55
          ],
          "clr": {
            "opcodes": "37",
            "undocumented": false,
            "flags": "10-0--",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Sets the carry flag.",
            "instruction": "scf"
          }
        }
      ]
    },
    "ccf": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            63
          ],
          "clr": {
            "opcodes": "3F",
            "undocumented": false,
            "flags": "*0-*--",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Inverts the carry flag.",
            "instruction": "ccf"
          }
        }
      ]
    },
    "halt": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            118
          ],
          "clr": {
            "opcodes": "76",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Suspends CPU operation until an interrupt or reset occurs.",
            "instruction": "halt"
          }
        }
      ]
    },
    "adc": {
      "variants": [
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            136
          ],
          "clr": {
            "opcodes": "88",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds B and the carry flag to A.",
            "instruction": "adc a,b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            136
          ],
          "clr": {
            "opcodes": "88",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds B and the carry flag to A.",
            "instruction": "adc a,b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            137
          ],
          "clr": {
            "opcodes": "89",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds C and the carry flag to A.",
            "instruction": "adc a,c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            137
          ],
          "clr": {
            "opcodes": "89",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds C and the carry flag to A.",
            "instruction": "adc a,c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            138
          ],
          "clr": {
            "opcodes": "8A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds D and the carry flag to A.",
            "instruction": "adc a,d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            138
          ],
          "clr": {
            "opcodes": "8A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds D and the carry flag to A.",
            "instruction": "adc a,d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            139
          ],
          "clr": {
            "opcodes": "8B",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds E and the carry flag to A.",
            "instruction": "adc a,e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            139
          ],
          "clr": {
            "opcodes": "8B",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds E and the carry flag to A.",
            "instruction": "adc a,e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            140
          ],
          "clr": {
            "opcodes": "8C",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds H and the carry flag to A.",
            "instruction": "adc a,h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            140
          ],
          "clr": {
            "opcodes": "8C",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds H and the carry flag to A.",
            "instruction": "adc a,h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            141
          ],
          "clr": {
            "opcodes": "8D",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds L and the carry flag to A.",
            "instruction": "adc a,l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            141
          ],
          "clr": {
            "opcodes": "8D",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds L and the carry flag to A.",
            "instruction": "adc a,l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            142
          ],
          "clr": {
            "opcodes": "8E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds (HL) and the carry flag to A.",
            "instruction": "adc a,(hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            142
          ],
          "clr": {
            "opcodes": "8E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds (HL) and the carry flag to A.",
            "instruction": "adc a,(hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            143
          ],
          "clr": {
            "opcodes": "8F",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds A and the carry flag to A.",
            "instruction": "adc a,a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            143
          ],
          "clr": {
            "opcodes": "8F",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Adds A and the carry flag to A.",
            "instruction": "adc a,a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "nn"
          ],
          "opcode": [
            206,
            "nn"
          ],
          "clr": {
            "opcodes": "CE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds * and the carry flag to A.",
            "instruction": "adc a,*"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            206,
            "nn"
          ],
          "clr": {
            "opcodes": "CE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Adds * and the carry flag to A.",
            "instruction": "adc a,*"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            140
          ],
          "clr": {
            "opcodes": "DD8C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXH and the carry flag to A.",
            "instruction": "adc a,ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            140
          ],
          "clr": {
            "opcodes": "DD8C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXH and the carry flag to A.",
            "instruction": "adc a,ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            141
          ],
          "clr": {
            "opcodes": "DD8D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXL and the carry flag to A.",
            "instruction": "adc a,ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            141
          ],
          "clr": {
            "opcodes": "DD8D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IXL and the carry flag to A.",
            "instruction": "adc a,ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            142,
            "dd"
          ],
          "clr": {
            "opcodes": "DD8E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IX plus * and the carry flag to A.",
            "instruction": "adc a,(ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            142,
            "dd"
          ],
          "clr": {
            "opcodes": "DD8E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IX plus * and the carry flag to A.",
            "instruction": "adc a,(ix+*)"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "bc"
          ],
          "opcode": [
            237,
            74
          ],
          "clr": {
            "opcodes": "ED4A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Adds BC and the carry flag to HL.",
            "instruction": "adc hl,bc"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "de"
          ],
          "opcode": [
            237,
            90
          ],
          "clr": {
            "opcodes": "ED5A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Adds DE and the carry flag to HL.",
            "instruction": "adc hl,de"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "hl"
          ],
          "opcode": [
            237,
            106
          ],
          "clr": {
            "opcodes": "ED6A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Adds HL and the carry flag to HL.",
            "instruction": "adc hl,hl"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "sp"
          ],
          "opcode": [
            237,
            122
          ],
          "clr": {
            "opcodes": "ED7A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Adds HL and the carry flag to HL.",
            "instruction": "adc hl,sp"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            140
          ],
          "clr": {
            "opcodes": "FD8C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYH and the carry flag to A.",
            "instruction": "adc a,iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            140
          ],
          "clr": {
            "opcodes": "FD8C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYH and the carry flag to A.",
            "instruction": "adc a,iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            141
          ],
          "clr": {
            "opcodes": "FD8D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYL and the carry flag to A.",
            "instruction": "adc a,iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            141
          ],
          "clr": {
            "opcodes": "FD8D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Adds IYL and the carry flag to A.",
            "instruction": "adc a,iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            142,
            "dd"
          ],
          "clr": {
            "opcodes": "FD8E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IY plus * and the carry flag to A.",
            "instruction": "adc a,(iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            142,
            "dd"
          ],
          "clr": {
            "opcodes": "FD8E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Adds the value pointed to by IY plus * and the carry flag to A.",
            "instruction": "adc a,(iy+*)"
          }
        }
      ]
    },
    "sub": {
      "variants": [
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            144
          ],
          "clr": {
            "opcodes": "90",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts B from A.",
            "instruction": "sub b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            144
          ],
          "clr": {
            "opcodes": "90",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts B from A.",
            "instruction": "sub b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            145
          ],
          "clr": {
            "opcodes": "91",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts C from A.",
            "instruction": "sub c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            145
          ],
          "clr": {
            "opcodes": "91",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts C from A.",
            "instruction": "sub c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            146
          ],
          "clr": {
            "opcodes": "92",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts D from A.",
            "instruction": "sub d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            146
          ],
          "clr": {
            "opcodes": "92",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts D from A.",
            "instruction": "sub d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            147
          ],
          "clr": {
            "opcodes": "93",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts E from A.",
            "instruction": "sub e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            147
          ],
          "clr": {
            "opcodes": "93",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts E from A.",
            "instruction": "sub e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            148
          ],
          "clr": {
            "opcodes": "94",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts H from A.",
            "instruction": "sub h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            148
          ],
          "clr": {
            "opcodes": "94",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts H from A.",
            "instruction": "sub h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            149
          ],
          "clr": {
            "opcodes": "95",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts L from A.",
            "instruction": "sub l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            149
          ],
          "clr": {
            "opcodes": "95",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts L from A.",
            "instruction": "sub l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            150
          ],
          "clr": {
            "opcodes": "96",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts (HL) from A.",
            "instruction": "sub (hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            150
          ],
          "clr": {
            "opcodes": "96",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts (HL) from A.",
            "instruction": "sub (hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            151
          ],
          "clr": {
            "opcodes": "97",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts A from A.",
            "instruction": "sub a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            151
          ],
          "clr": {
            "opcodes": "97",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts A from A.",
            "instruction": "sub a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "nn"
          ],
          "opcode": [
            214,
            "nn"
          ],
          "clr": {
            "opcodes": "D6",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts * from A.",
            "instruction": "sub *"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            214,
            "nn"
          ],
          "clr": {
            "opcodes": "D6",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts * from A.",
            "instruction": "sub *"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            148
          ],
          "clr": {
            "opcodes": "DD94",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXH from A.",
            "instruction": "sub ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            148
          ],
          "clr": {
            "opcodes": "DD94",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXH from A.",
            "instruction": "sub ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            149
          ],
          "clr": {
            "opcodes": "DD95",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXL from A.",
            "instruction": "sub ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            149
          ],
          "clr": {
            "opcodes": "DD95",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXL from A.",
            "instruction": "sub ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            150,
            "dd"
          ],
          "clr": {
            "opcodes": "DD96",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IX plus * from A.",
            "instruction": "sub (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            150,
            "dd"
          ],
          "clr": {
            "opcodes": "DD96",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IX plus * from A.",
            "instruction": "sub (ix+*)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            148
          ],
          "clr": {
            "opcodes": "FD94",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYH from A.",
            "instruction": "sub iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            148
          ],
          "clr": {
            "opcodes": "FD94",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYH from A.",
            "instruction": "sub iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            149
          ],
          "clr": {
            "opcodes": "FD95",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYL from A.",
            "instruction": "sub iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            149
          ],
          "clr": {
            "opcodes": "FD95",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYL from A.",
            "instruction": "sub iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            150,
            "dd"
          ],
          "clr": {
            "opcodes": "FD96",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IY plus * from A.",
            "instruction": "sub (iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            150,
            "dd"
          ],
          "clr": {
            "opcodes": "FD96",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IY plus * from A.",
            "instruction": "sub (iy+*)"
          }
        }
      ]
    },
    "sbc": {
      "variants": [
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            152
          ],
          "clr": {
            "opcodes": "98",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts B and the carry flag from A.",
            "instruction": "sbc a,b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            152
          ],
          "clr": {
            "opcodes": "98",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts B and the carry flag from A.",
            "instruction": "sbc a,b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            153
          ],
          "clr": {
            "opcodes": "99",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts C and the carry flag from A.",
            "instruction": "sbc a,c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            153
          ],
          "clr": {
            "opcodes": "99",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts C and the carry flag from A.",
            "instruction": "sbc a,c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            154
          ],
          "clr": {
            "opcodes": "9A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts D and the carry flag from A.",
            "instruction": "sbc a,d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            154
          ],
          "clr": {
            "opcodes": "9A",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts D and the carry flag from A.",
            "instruction": "sbc a,d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            155
          ],
          "clr": {
            "opcodes": "9B",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts E and the carry flag from A.",
            "instruction": "sbc a,e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            155
          ],
          "clr": {
            "opcodes": "9B",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts E and the carry flag from A.",
            "instruction": "sbc a,e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            156
          ],
          "clr": {
            "opcodes": "9C",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts H and the carry flag from A.",
            "instruction": "sbc a,h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            156
          ],
          "clr": {
            "opcodes": "9C",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts H and the carry flag from A.",
            "instruction": "sbc a,h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            157
          ],
          "clr": {
            "opcodes": "9D",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts L and the carry flag from A.",
            "instruction": "sbc a,l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            157
          ],
          "clr": {
            "opcodes": "9D",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts L and the carry flag from A.",
            "instruction": "sbc a,l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            158
          ],
          "clr": {
            "opcodes": "9E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts (HL) and the carry flag from A.",
            "instruction": "sbc a,(hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            158
          ],
          "clr": {
            "opcodes": "9E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts (HL) and the carry flag from A.",
            "instruction": "sbc a,(hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            159
          ],
          "clr": {
            "opcodes": "9F",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts A and the carry flag from A.",
            "instruction": "sbc a,a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            159
          ],
          "clr": {
            "opcodes": "9F",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts A and the carry flag from A.",
            "instruction": "sbc a,a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            156
          ],
          "clr": {
            "opcodes": "DD9C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXH and the carry flag from A.",
            "instruction": "sbc a,ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            156
          ],
          "clr": {
            "opcodes": "DD9C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXH and the carry flag from A.",
            "instruction": "sbc a,ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            157
          ],
          "clr": {
            "opcodes": "DD9D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXL and the carry flag from A.",
            "instruction": "sbc a,ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            157
          ],
          "clr": {
            "opcodes": "DD9D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXL and the carry flag from A.",
            "instruction": "sbc a,ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            158,
            "dd"
          ],
          "clr": {
            "opcodes": "DD9E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IX plus * and the carry flag from A.",
            "instruction": "sbc a,(ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            158,
            "dd"
          ],
          "clr": {
            "opcodes": "DD9E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IX plus * and the carry flag from A.",
            "instruction": "sbc a,(ix+*)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "nn"
          ],
          "opcode": [
            222,
            "nn"
          ],
          "clr": {
            "opcodes": "DE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts * and the carry flag from A.",
            "instruction": "sbc a,*"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            222,
            "nn"
          ],
          "clr": {
            "opcodes": "DE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts * and the carry flag from A.",
            "instruction": "sbc a,*"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "bc"
          ],
          "opcode": [
            237,
            66
          ],
          "clr": {
            "opcodes": "ED42",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Subtracts BC and the carry flag from HL.",
            "instruction": "sbc hl,bc"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "de"
          ],
          "opcode": [
            237,
            82
          ],
          "clr": {
            "opcodes": "ED52",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Subtracts DE and the carry flag from HL.",
            "instruction": "sbc hl,de"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "hl"
          ],
          "opcode": [
            237,
            98
          ],
          "clr": {
            "opcodes": "ED62",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Subtracts HL and the carry flag from HL.",
            "instruction": "sbc hl,hl"
          }
        },
        {
          "tokens": [
            "hl",
            ",",
            "sp"
          ],
          "opcode": [
            237,
            114
          ],
          "clr": {
            "opcodes": "ED72",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Subtracts HL and the carry flag from HL.",
            "instruction": "sbc hl,sp"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            156
          ],
          "clr": {
            "opcodes": "FD9C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYH and the carry flag from A.",
            "instruction": "sbc a,iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            156
          ],
          "clr": {
            "opcodes": "FD9C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYH and the carry flag from A.",
            "instruction": "sbc a,iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            157
          ],
          "clr": {
            "opcodes": "FD9D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYL and the carry flag from A.",
            "instruction": "sbc a,iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            157
          ],
          "clr": {
            "opcodes": "FD9D",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYL and the carry flag from A.",
            "instruction": "sbc a,iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            158,
            "dd"
          ],
          "clr": {
            "opcodes": "FD9E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IY plus * and the carry flag from A.",
            "instruction": "sbc a,(iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            158,
            "dd"
          ],
          "clr": {
            "opcodes": "FD9E",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IY plus * and the carry flag from A.",
            "instruction": "sbc a,(iy+*)"
          }
        }
      ]
    },
    "and": {
      "variants": [
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            160
          ],
          "clr": {
            "opcodes": "A0",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with B.",
            "instruction": "and b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            160
          ],
          "clr": {
            "opcodes": "A0",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with B.",
            "instruction": "and b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            161
          ],
          "clr": {
            "opcodes": "A1",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with C.",
            "instruction": "and c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            161
          ],
          "clr": {
            "opcodes": "A1",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with C.",
            "instruction": "and c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            162
          ],
          "clr": {
            "opcodes": "A2",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with D.",
            "instruction": "and d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            162
          ],
          "clr": {
            "opcodes": "A2",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with D.",
            "instruction": "and d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            163
          ],
          "clr": {
            "opcodes": "A3",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with E.",
            "instruction": "and e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            163
          ],
          "clr": {
            "opcodes": "A3",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with E.",
            "instruction": "and e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            164
          ],
          "clr": {
            "opcodes": "A4",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with H.",
            "instruction": "and h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            164
          ],
          "clr": {
            "opcodes": "A4",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with H.",
            "instruction": "and h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            165
          ],
          "clr": {
            "opcodes": "A5",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with L.",
            "instruction": "and l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            165
          ],
          "clr": {
            "opcodes": "A5",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with L.",
            "instruction": "and l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            166
          ],
          "clr": {
            "opcodes": "A6",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise AND on A with (HL).",
            "instruction": "and (hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            166
          ],
          "clr": {
            "opcodes": "A6",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise AND on A with (HL).",
            "instruction": "and (hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            167
          ],
          "clr": {
            "opcodes": "A7",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with A.",
            "instruction": "and a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            167
          ],
          "clr": {
            "opcodes": "A7",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise AND on A with A.",
            "instruction": "and a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            164
          ],
          "clr": {
            "opcodes": "DDA4",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IXH.",
            "instruction": "and ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            164
          ],
          "clr": {
            "opcodes": "DDA4",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IXH.",
            "instruction": "and ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            165
          ],
          "clr": {
            "opcodes": "DDA5",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IXL.",
            "instruction": "and ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            165
          ],
          "clr": {
            "opcodes": "DDA5",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IXL.",
            "instruction": "and ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            166,
            "dd"
          ],
          "clr": {
            "opcodes": "DDA6",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise AND on A with the value pointed to by IX plus *.",
            "instruction": "and (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            166,
            "dd"
          ],
          "clr": {
            "opcodes": "DDA6",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise AND on A with the value pointed to by IX plus *.",
            "instruction": "and (ix+*)"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            230,
            "nn"
          ],
          "clr": {
            "opcodes": "E6",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise AND on A with *.",
            "instruction": "and *"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            164
          ],
          "clr": {
            "opcodes": "FDA4",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IYH.",
            "instruction": "and iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            164
          ],
          "clr": {
            "opcodes": "FDA4",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IYH.",
            "instruction": "and iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            165
          ],
          "clr": {
            "opcodes": "FDA5",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IYL.",
            "instruction": "and iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            165
          ],
          "clr": {
            "opcodes": "FDA5",
            "undocumented": true,
            "flags": "00P1++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise AND on A with IYL.",
            "instruction": "and iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            166,
            "dd"
          ],
          "clr": {
            "opcodes": "FDA6",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise AND on A with the value pointed to by IY plus *.",
            "instruction": "and (iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            166,
            "dd"
          ],
          "clr": {
            "opcodes": "FDA6",
            "undocumented": false,
            "flags": "00P1++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise AND on A with the value pointed to by IY plus *.",
            "instruction": "and (iy+*)"
          }
        }
      ]
    },
    "xor": {
      "variants": [
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            168
          ],
          "clr": {
            "opcodes": "A8",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with B.",
            "instruction": "xor b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            168
          ],
          "clr": {
            "opcodes": "A8",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with B.",
            "instruction": "xor b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            169
          ],
          "clr": {
            "opcodes": "A9",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with C.",
            "instruction": "xor c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            169
          ],
          "clr": {
            "opcodes": "A9",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with C.",
            "instruction": "xor c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            170
          ],
          "clr": {
            "opcodes": "AA",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with D.",
            "instruction": "xor d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            170
          ],
          "clr": {
            "opcodes": "AA",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with D.",
            "instruction": "xor d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            171
          ],
          "clr": {
            "opcodes": "AB",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with E.",
            "instruction": "xor e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            171
          ],
          "clr": {
            "opcodes": "AB",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with E.",
            "instruction": "xor e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            172
          ],
          "clr": {
            "opcodes": "AC",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with H.",
            "instruction": "xor h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            172
          ],
          "clr": {
            "opcodes": "AC",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with H.",
            "instruction": "xor h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            173
          ],
          "clr": {
            "opcodes": "AD",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with L.",
            "instruction": "xor l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            173
          ],
          "clr": {
            "opcodes": "AD",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with L.",
            "instruction": "xor l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            174
          ],
          "clr": {
            "opcodes": "AE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise XOR on A with (HL).",
            "instruction": "xor (hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            174
          ],
          "clr": {
            "opcodes": "AE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise XOR on A with (HL).",
            "instruction": "xor (hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            175
          ],
          "clr": {
            "opcodes": "AF",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with A.",
            "instruction": "xor a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            175
          ],
          "clr": {
            "opcodes": "AF",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise XOR on A with A.",
            "instruction": "xor a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            172
          ],
          "clr": {
            "opcodes": "DDAC",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IXH.",
            "instruction": "xor ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            172
          ],
          "clr": {
            "opcodes": "DDAC",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IXH.",
            "instruction": "xor ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            173
          ],
          "clr": {
            "opcodes": "DDAD",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IXL.",
            "instruction": "xor ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            173
          ],
          "clr": {
            "opcodes": "DDAD",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IXL.",
            "instruction": "xor ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            174,
            "dd"
          ],
          "clr": {
            "opcodes": "DDAE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise XOR on A with the value pointed to by IX plus *.",
            "instruction": "xor (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            174,
            "dd"
          ],
          "clr": {
            "opcodes": "DDAE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise XOR on A with the value pointed to by IX plus *.",
            "instruction": "xor (ix+*)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "nn"
          ],
          "opcode": [
            238,
            "nn"
          ],
          "clr": {
            "opcodes": "EE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise XOR on A with *.",
            "instruction": "xor *"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            238,
            "nn"
          ],
          "clr": {
            "opcodes": "EE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise XOR on A with *.",
            "instruction": "xor *"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            172
          ],
          "clr": {
            "opcodes": "FDAC",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IYH.",
            "instruction": "xor iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            172
          ],
          "clr": {
            "opcodes": "FDAC",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IYH.",
            "instruction": "xor iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            173
          ],
          "clr": {
            "opcodes": "FDAD",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IYL.",
            "instruction": "xor iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            173
          ],
          "clr": {
            "opcodes": "FDAD",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise XOR on A with IYL.",
            "instruction": "xor iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            174,
            "dd"
          ],
          "clr": {
            "opcodes": "FDAE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise XOR on A with the value pointed to by IY plus *.",
            "instruction": "xor (iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            174,
            "dd"
          ],
          "clr": {
            "opcodes": "FDAE",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise XOR on A with the value pointed to by IY plus *.",
            "instruction": "xor (iy+*)"
          }
        }
      ]
    },
    "or": {
      "variants": [
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            176
          ],
          "clr": {
            "opcodes": "B0",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with B.",
            "instruction": "or b"
          }
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            176
          ],
          "clr": {
            "opcodes": "B0",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with B.",
            "instruction": "or b"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            177
          ],
          "clr": {
            "opcodes": "B1",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with C.",
            "instruction": "or c"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            177
          ],
          "clr": {
            "opcodes": "B1",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with C.",
            "instruction": "or c"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            178
          ],
          "clr": {
            "opcodes": "B2",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with D.",
            "instruction": "or d"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            178
          ],
          "clr": {
            "opcodes": "B2",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with D.",
            "instruction": "or d"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            179
          ],
          "clr": {
            "opcodes": "B3",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with E.",
            "instruction": "or e"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            179
          ],
          "clr": {
            "opcodes": "B3",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with E.",
            "instruction": "or e"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            180
          ],
          "clr": {
            "opcodes": "B4",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with H.",
            "instruction": "or h"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            180
          ],
          "clr": {
            "opcodes": "B4",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with H.",
            "instruction": "or h"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            181
          ],
          "clr": {
            "opcodes": "B5",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with L.",
            "instruction": "or l"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            181
          ],
          "clr": {
            "opcodes": "B5",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with L.",
            "instruction": "or l"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            182
          ],
          "clr": {
            "opcodes": "B6",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise OR on A with (HL).",
            "instruction": "or (hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            182
          ],
          "clr": {
            "opcodes": "B6",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise OR on A with (HL).",
            "instruction": "or (hl)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            183
          ],
          "clr": {
            "opcodes": "B7",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with A.",
            "instruction": "or a"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            183
          ],
          "clr": {
            "opcodes": "B7",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Bitwise OR on A with A.",
            "instruction": "or a"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixh"
          ],
          "opcode": [
            221,
            180
          ],
          "clr": {
            "opcodes": "DDB4",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IXH.",
            "instruction": "or ixh"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            180
          ],
          "clr": {
            "opcodes": "DDB4",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IXH.",
            "instruction": "or ixh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "ixl"
          ],
          "opcode": [
            221,
            181
          ],
          "clr": {
            "opcodes": "DDB5",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IXL.",
            "instruction": "or ixl"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            181
          ],
          "clr": {
            "opcodes": "DDB5",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IXL.",
            "instruction": "or ixl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            182,
            "dd"
          ],
          "clr": {
            "opcodes": "DDB6",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise OR on A with the value pointed to by IX plus *.",
            "instruction": "or (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            182,
            "dd"
          ],
          "clr": {
            "opcodes": "DDB6",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise OR on A with the value pointed to by IX plus *.",
            "instruction": "or (ix+*)"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            246,
            "nn"
          ],
          "clr": {
            "opcodes": "F6",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Bitwise OR on A with *.",
            "instruction": "or *"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyh"
          ],
          "opcode": [
            253,
            180
          ],
          "clr": {
            "opcodes": "FDB4",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IYH.",
            "instruction": "or iyh"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            180
          ],
          "clr": {
            "opcodes": "FDB4",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IYH.",
            "instruction": "or iyh"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "iyl"
          ],
          "opcode": [
            253,
            181
          ],
          "clr": {
            "opcodes": "FDB5",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IYL.",
            "instruction": "or iyl"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            181
          ],
          "clr": {
            "opcodes": "FDB5",
            "undocumented": true,
            "flags": "00P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Bitwise OR on A with IYL.",
            "instruction": "or iyl"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            182,
            "dd"
          ],
          "clr": {
            "opcodes": "FDB6",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise OR on A with the value pointed to by IY plus *.",
            "instruction": "or (iy+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            182,
            "dd"
          ],
          "clr": {
            "opcodes": "FDB6",
            "undocumented": false,
            "flags": "00P0++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Bitwise OR on A with the value pointed to by IY plus *.",
            "instruction": "or (iy+*)"
          }
        }
      ]
    },
    "cp": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            184
          ],
          "clr": {
            "opcodes": "B8",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts B from A and affects flags according to the result. A is not modified.",
            "instruction": "cp b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            185
          ],
          "clr": {
            "opcodes": "B9",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts C from A and affects flags according to the result. A is not modified.",
            "instruction": "cp c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            186
          ],
          "clr": {
            "opcodes": "BA",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts D from A and affects flags according to the result. A is not modified.",
            "instruction": "cp d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            187
          ],
          "clr": {
            "opcodes": "BB",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts E from A and affects flags according to the result. A is not modified.",
            "instruction": "cp e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            188
          ],
          "clr": {
            "opcodes": "BC",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts H from A and affects flags according to the result. A is not modified.",
            "instruction": "cp h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            189
          ],
          "clr": {
            "opcodes": "BD",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts L from A and affects flags according to the result. A is not modified.",
            "instruction": "cp l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            190
          ],
          "clr": {
            "opcodes": "BE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts (HL) from A and affects flags according to the result. A is not modified.",
            "instruction": "cp (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            191
          ],
          "clr": {
            "opcodes": "BF",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Subtracts A from A and affects flags according to the result. A is not modified.",
            "instruction": "cp a"
          }
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            188
          ],
          "clr": {
            "opcodes": "DDBC",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXH from A and affects flags according to the result. A is not modified.",
            "instruction": "cp ixh"
          }
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            189
          ],
          "clr": {
            "opcodes": "DDBD",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IXL from A and affects flags according to the result. A is not modified.",
            "instruction": "cp ixl"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            190,
            "dd"
          ],
          "clr": {
            "opcodes": "DDBE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IX plus * from A and affects flags according to the result. A is not modified.",
            "instruction": "cp (ix+*)"
          }
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            188
          ],
          "clr": {
            "opcodes": "FDBC",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYH from A and affects flags according to the result. A is not modified.",
            "instruction": "cp iyh"
          }
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            189
          ],
          "clr": {
            "opcodes": "FDBD",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Subtracts IYL from A and affects flags according to the result. A is not modified.",
            "instruction": "cp iyl"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            190,
            "dd"
          ],
          "clr": {
            "opcodes": "FDBE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 3,
            "with_jump_clock_count": 19,
            "without_jump_clock_count": 19,
            "description": "Subtracts the value pointed to by IY plus * from A and affects flags according to the result. A is not modified.",
            "instruction": "cp (iy+*)"
          }
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            254,
            "nn"
          ],
          "clr": {
            "opcodes": "FE",
            "undocumented": false,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 7,
            "without_jump_clock_count": 7,
            "description": "Subtracts * from A and affects flags according to the result. A is not modified.",
            "instruction": "cp *"
          }
        }
      ]
    },
    "ret": {
      "variants": [
        {
          "tokens": [
            "nz"
          ],
          "opcode": [
            192
          ],
          "clr": {
            "opcodes": "C0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret nz"
          }
        },
        {
          "tokens": [
            "z"
          ],
          "opcode": [
            200
          ],
          "clr": {
            "opcodes": "C8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret z"
          }
        },
        {
          "tokens": [],
          "opcode": [
            201
          ],
          "clr": {
            "opcodes": "C9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "The top stack entry is popped into PC.",
            "instruction": "ret"
          }
        },
        {
          "tokens": [
            "nc"
          ],
          "opcode": [
            208
          ],
          "clr": {
            "opcodes": "D0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret nc"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            216
          ],
          "clr": {
            "opcodes": "D8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret c"
          }
        },
        {
          "tokens": [
            "po"
          ],
          "opcode": [
            224
          ],
          "clr": {
            "opcodes": "E0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret po"
          }
        },
        {
          "tokens": [
            "pe"
          ],
          "opcode": [
            232
          ],
          "clr": {
            "opcodes": "E8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret pe"
          }
        },
        {
          "tokens": [
            "p"
          ],
          "opcode": [
            240
          ],
          "clr": {
            "opcodes": "F0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret p"
          }
        },
        {
          "tokens": [
            "m"
          ],
          "opcode": [
            248
          ],
          "clr": {
            "opcodes": "F8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 5,
            "description": "If condition CC is true, the top stack entry is popped into PC.",
            "instruction": "ret m"
          }
        }
      ]
    },
    "pop": {
      "variants": [
        {
          "tokens": [
            "bc"
          ],
          "opcode": [
            193
          ],
          "clr": {
            "opcodes": "C1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "The memory location pointed to by SP is stored into C and SP is incremented. The memory location pointed to by SP is stored into B and SP is incremented again.",
            "instruction": "pop bc"
          }
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            209
          ],
          "clr": {
            "opcodes": "D1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "The memory location pointed to by SP is stored into E and SP is incremented. The memory location pointed to by SP is stored into D and SP is incremented again.",
            "instruction": "pop de"
          }
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            225
          ],
          "clr": {
            "opcodes": "DDE1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 14,
            "without_jump_clock_count": 14,
            "description": "The memory location pointed to by SP is stored into IXL and SP is incremented. The memory location pointed to by SP is stored into IXH and SP is incremented again.",
            "instruction": "pop ix"
          }
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            225
          ],
          "clr": {
            "opcodes": "E1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "The memory location pointed to by SP is stored into L and SP is incremented. The memory location pointed to by SP is stored into H and SP is incremented again.",
            "instruction": "pop hl"
          }
        },
        {
          "tokens": [
            "af"
          ],
          "opcode": [
            241
          ],
          "clr": {
            "opcodes": "F1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "The memory location pointed to by SP is stored into F and SP is incremented. The memory location pointed to by SP is stored into A and SP is incremented again.",
            "instruction": "pop af"
          }
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            225
          ],
          "clr": {
            "opcodes": "FDE1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 14,
            "without_jump_clock_count": 14,
            "description": "The memory location pointed to by SP is stored into IYL and SP is incremented. The memory location pointed to by SP is stored into IYH and SP is incremented again.",
            "instruction": "pop iy"
          }
        }
      ]
    },
    "jp": {
      "variants": [
        {
          "tokens": [
            "nz",
            ",",
            "nnnn"
          ],
          "opcode": [
            194,
            "nnnn"
          ],
          "clr": {
            "opcodes": "C2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp nz,**"
          }
        },
        {
          "tokens": [
            "nnnn"
          ],
          "opcode": [
            195,
            "nnnn"
          ],
          "clr": {
            "opcodes": "C3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "** is copied to PC.",
            "instruction": "jp **"
          }
        },
        {
          "tokens": [
            "z",
            ",",
            "nnnn"
          ],
          "opcode": [
            202,
            "nnnn"
          ],
          "clr": {
            "opcodes": "CA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp z,**"
          }
        },
        {
          "tokens": [
            "nc",
            ",",
            "nnnn"
          ],
          "opcode": [
            210,
            "nnnn"
          ],
          "clr": {
            "opcodes": "D2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp nc,**"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "nnnn"
          ],
          "opcode": [
            218,
            "nnnn"
          ],
          "clr": {
            "opcodes": "DA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp c,**"
          }
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            233
          ],
          "clr": {
            "opcodes": "DDE9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Loads the value of IX into PC.",
            "instruction": "jp (ix)"
          }
        },
        {
          "tokens": [
            "po",
            ",",
            "nnnn"
          ],
          "opcode": [
            226,
            "nnnn"
          ],
          "clr": {
            "opcodes": "E2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp po,**"
          }
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            233
          ],
          "clr": {
            "opcodes": "E9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Loads the value of HL into PC.",
            "instruction": "jp (hl)"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            233
          ],
          "clr": {
            "opcodes": "E9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Loads the value of HL into PC.",
            "instruction": "jp (hl)"
          }
        },
        {
          "tokens": [
            "pe",
            ",",
            "nnnn"
          ],
          "opcode": [
            234,
            "nnnn"
          ],
          "clr": {
            "opcodes": "EA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp pe,**"
          }
        },
        {
          "tokens": [
            "p",
            ",",
            "nnnn"
          ],
          "opcode": [
            242,
            "nnnn"
          ],
          "clr": {
            "opcodes": "F2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp p,**"
          }
        },
        {
          "tokens": [
            "m",
            ",",
            "nnnn"
          ],
          "opcode": [
            250,
            "nnnn"
          ],
          "clr": {
            "opcodes": "FA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 10,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, ** is copied to PC.",
            "instruction": "jp m,**"
          }
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            233
          ],
          "clr": {
            "opcodes": "FDE9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Loads the value of IY into PC.",
            "instruction": "jp (iy)"
          }
        }
      ]
    },
    "call": {
      "variants": [
        {
          "tokens": [
            "nz",
            ",",
            "nnnn"
          ],
          "opcode": [
            196,
            "nnnn"
          ],
          "clr": {
            "opcodes": "C4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call nz,**"
          }
        },
        {
          "tokens": [
            "z",
            ",",
            "nnnn"
          ],
          "opcode": [
            204,
            "nnnn"
          ],
          "clr": {
            "opcodes": "CC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call z,**"
          }
        },
        {
          "tokens": [
            "nnnn"
          ],
          "opcode": [
            205,
            "nnnn"
          ],
          "clr": {
            "opcodes": "CD",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 17,
            "description": "The current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call **"
          }
        },
        {
          "tokens": [
            "nc",
            ",",
            "nnnn"
          ],
          "opcode": [
            212,
            "nnnn"
          ],
          "clr": {
            "opcodes": "D4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call nc,**"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "nnnn"
          ],
          "opcode": [
            220,
            "nnnn"
          ],
          "clr": {
            "opcodes": "DC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call c,**"
          }
        },
        {
          "tokens": [
            "po",
            ",",
            "nnnn"
          ],
          "opcode": [
            228,
            "nnnn"
          ],
          "clr": {
            "opcodes": "E4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call po,**"
          }
        },
        {
          "tokens": [
            "pe",
            ",",
            "nnnn"
          ],
          "opcode": [
            236,
            "nnnn"
          ],
          "clr": {
            "opcodes": "EC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call pe,**"
          }
        },
        {
          "tokens": [
            "p",
            ",",
            "nnnn"
          ],
          "opcode": [
            244,
            "nnnn"
          ],
          "clr": {
            "opcodes": "F4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call p,**"
          }
        },
        {
          "tokens": [
            "m",
            ",",
            "nnnn"
          ],
          "opcode": [
            252,
            "nnnn"
          ],
          "clr": {
            "opcodes": "FC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 3,
            "with_jump_clock_count": 17,
            "without_jump_clock_count": 10,
            "description": "If condition CC is true, the current PC value plus three is pushed onto the stack, then is loaded with **.",
            "instruction": "call m,**"
          }
        }
      ]
    },
    "push": {
      "variants": [
        {
          "tokens": [
            "bc"
          ],
          "opcode": [
            197
          ],
          "clr": {
            "opcodes": "C5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "SP is decremented and B is stored into the memory location pointed to by SP. SP is decremented again and C is stored into the memory location pointed to by SP.",
            "instruction": "push bc"
          }
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            213
          ],
          "clr": {
            "opcodes": "D5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "SP is decremented and D is stored into the memory location pointed to by SP. SP is decremented again and E is stored into the memory location pointed to by SP.",
            "instruction": "push de"
          }
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            229
          ],
          "clr": {
            "opcodes": "DDE5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "SP is decremented and IXH is stored into the memory location pointed to by SP. SP is decremented again and IXL is stored into the memory location pointed to by SP.",
            "instruction": "push ix"
          }
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            229
          ],
          "clr": {
            "opcodes": "E5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "SP is decremented and H is stored into the memory location pointed to by SP. SP is decremented again and L is stored into the memory location pointed to by SP.",
            "instruction": "push hl"
          }
        },
        {
          "tokens": [
            "af"
          ],
          "opcode": [
            245
          ],
          "clr": {
            "opcodes": "F5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "SP is decremented and A is stored into the memory location pointed to by SP. SP is decremented again and F is stored into the memory location pointed to by SP.",
            "instruction": "push af"
          }
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            229
          ],
          "clr": {
            "opcodes": "FDE5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "SP is decremented and IYH is stored into the memory location pointed to by SP. SP is decremented again and IYL is stored into the memory location pointed to by SP.",
            "instruction": "push iy"
          }
        }
      ]
    },
    "rst": {
      "variants": [
        {
          "tokens": [
            "0"
          ],
          "opcode": [
            199
          ],
          "clr": {
            "opcodes": "C7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 00h.",
            "instruction": "rst 00h"
          }
        },
        {
          "tokens": [
            "8"
          ],
          "opcode": [
            207
          ],
          "clr": {
            "opcodes": "CF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 08h.",
            "instruction": "rst 08h"
          }
        },
        {
          "tokens": [
            "16"
          ],
          "opcode": [
            215
          ],
          "clr": {
            "opcodes": "D7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 10h.",
            "instruction": "rst 10h"
          }
        },
        {
          "tokens": [
            "24"
          ],
          "opcode": [
            223
          ],
          "clr": {
            "opcodes": "DF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 18h.",
            "instruction": "rst 18h"
          }
        },
        {
          "tokens": [
            "32"
          ],
          "opcode": [
            231
          ],
          "clr": {
            "opcodes": "E7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 20h.",
            "instruction": "rst 20h"
          }
        },
        {
          "tokens": [
            "40"
          ],
          "opcode": [
            239
          ],
          "clr": {
            "opcodes": "EF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 28h.",
            "instruction": "rst 28h"
          }
        },
        {
          "tokens": [
            "48"
          ],
          "opcode": [
            247
          ],
          "clr": {
            "opcodes": "F7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 30h.",
            "instruction": "rst 30h"
          }
        },
        {
          "tokens": [
            "56"
          ],
          "opcode": [
            255
          ],
          "clr": {
            "opcodes": "FF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The current PC value plus one is pushed onto the stack, then is loaded with 38h.",
            "instruction": "rst 38h"
          }
        }
      ]
    },
    "rlc": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            0
          ],
          "clr": {
            "opcodes": "CB00",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            1
          ],
          "clr": {
            "opcodes": "CB01",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            2
          ],
          "clr": {
            "opcodes": "CB02",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            3
          ],
          "clr": {
            "opcodes": "CB03",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            4
          ],
          "clr": {
            "opcodes": "CB04",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            5
          ],
          "clr": {
            "opcodes": "CB05",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            6
          ],
          "clr": {
            "opcodes": "CB06",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            7
          ],
          "clr": {
            "opcodes": "CB07",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            6
          ],
          "clr": {
            "opcodes": "DDCB**06",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            6
          ],
          "clr": {
            "opcodes": "FDCB**06",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and bit 0.",
            "instruction": "rlc (iy+*)"
          }
        }
      ]
    },
    "rrc": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            8
          ],
          "clr": {
            "opcodes": "CB08",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            9
          ],
          "clr": {
            "opcodes": "CB09",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            10
          ],
          "clr": {
            "opcodes": "CB0A",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            11
          ],
          "clr": {
            "opcodes": "CB0B",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            12
          ],
          "clr": {
            "opcodes": "CB0C",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            13
          ],
          "clr": {
            "opcodes": "CB0D",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            14
          ],
          "clr": {
            "opcodes": "CB0E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            15
          ],
          "clr": {
            "opcodes": "CB0F",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            14
          ],
          "clr": {
            "opcodes": "DDCB**0E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            14
          ],
          "clr": {
            "opcodes": "FDCB**0E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and bit 7.",
            "instruction": "rrc (iy+*)"
          }
        }
      ]
    },
    "rl": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            16
          ],
          "clr": {
            "opcodes": "CB10",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            17
          ],
          "clr": {
            "opcodes": "CB11",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            18
          ],
          "clr": {
            "opcodes": "CB12",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            19
          ],
          "clr": {
            "opcodes": "CB13",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            20
          ],
          "clr": {
            "opcodes": "CB14",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            21
          ],
          "clr": {
            "opcodes": "CB15",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            22
          ],
          "clr": {
            "opcodes": "CB16",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            23
          ],
          "clr": {
            "opcodes": "CB17",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            22
          ],
          "clr": {
            "opcodes": "DDCB**16",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            22
          ],
          "clr": {
            "opcodes": "FDCB**16",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated left one bit position. The contents of bit 7 are copied to the carry flag and the previous contents of the carry flag are copied to bit 0.",
            "instruction": "rl (iy+*)"
          }
        }
      ]
    },
    "rr": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            24
          ],
          "clr": {
            "opcodes": "CB18",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            25
          ],
          "clr": {
            "opcodes": "CB19",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            26
          ],
          "clr": {
            "opcodes": "CB1A",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            27
          ],
          "clr": {
            "opcodes": "CB1B",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            28
          ],
          "clr": {
            "opcodes": "CB1C",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            29
          ],
          "clr": {
            "opcodes": "CB1D",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            30
          ],
          "clr": {
            "opcodes": "CB1E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            31
          ],
          "clr": {
            "opcodes": "CB1F",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            30
          ],
          "clr": {
            "opcodes": "DDCB**1E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            30
          ],
          "clr": {
            "opcodes": "FDCB**1E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are rotated right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of the carry flag are copied to bit 7.",
            "instruction": "rr (iy+*)"
          }
        }
      ]
    },
    "sla": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            32
          ],
          "clr": {
            "opcodes": "CB20",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            33
          ],
          "clr": {
            "opcodes": "CB21",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            34
          ],
          "clr": {
            "opcodes": "CB22",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            35
          ],
          "clr": {
            "opcodes": "CB23",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            36
          ],
          "clr": {
            "opcodes": "CB24",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            37
          ],
          "clr": {
            "opcodes": "CB25",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            38
          ],
          "clr": {
            "opcodes": "CB26",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            39
          ],
          "clr": {
            "opcodes": "CB27",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            38
          ],
          "clr": {
            "opcodes": "DDCB**26",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            38
          ],
          "clr": {
            "opcodes": "FDCB**26",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are copied to the carry flag and a zero is put into bit 0.",
            "instruction": "sla (iy+*)"
          }
        }
      ]
    },
    "sra": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            40
          ],
          "clr": {
            "opcodes": "CB28",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            41
          ],
          "clr": {
            "opcodes": "CB29",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            42
          ],
          "clr": {
            "opcodes": "CB2A",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            43
          ],
          "clr": {
            "opcodes": "CB2B",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            44
          ],
          "clr": {
            "opcodes": "CB2C",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            45
          ],
          "clr": {
            "opcodes": "CB2D",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            46
          ],
          "clr": {
            "opcodes": "CB2E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            47
          ],
          "clr": {
            "opcodes": "CB2F",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            46
          ],
          "clr": {
            "opcodes": "DDCB**2E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            46
          ],
          "clr": {
            "opcodes": "FDCB**2E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and the previous contents of bit 7 are unchanged.",
            "instruction": "sra (iy+*)"
          }
        }
      ]
    },
    "sll": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            48
          ],
          "clr": {
            "opcodes": "CB30",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            49
          ],
          "clr": {
            "opcodes": "CB31",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            50
          ],
          "clr": {
            "opcodes": "CB32",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            51
          ],
          "clr": {
            "opcodes": "CB33",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            52
          ],
          "clr": {
            "opcodes": "CB34",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            53
          ],
          "clr": {
            "opcodes": "CB35",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            54
          ],
          "clr": {
            "opcodes": "CB36",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            55
          ],
          "clr": {
            "opcodes": "CB37",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            54
          ],
          "clr": {
            "opcodes": "DDCB**36",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            54
          ],
          "clr": {
            "opcodes": "FDCB**36",
            "undocumented": true,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted left one bit position. The contents of bit 7 are put into the carry flag and a one is put into bit 0.",
            "instruction": "sll (iy+*)"
          }
        }
      ]
    },
    "srl": {
      "variants": [
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            203,
            56
          ],
          "clr": {
            "opcodes": "CB38",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of B are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl b"
          }
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            57
          ],
          "clr": {
            "opcodes": "CB39",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of C are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl c"
          }
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            58
          ],
          "clr": {
            "opcodes": "CB3A",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of D are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl d"
          }
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            59
          ],
          "clr": {
            "opcodes": "CB3B",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of E are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl e"
          }
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            60
          ],
          "clr": {
            "opcodes": "CB3C",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of H are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl h"
          }
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            61
          ],
          "clr": {
            "opcodes": "CB3D",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of L are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl l"
          }
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            62
          ],
          "clr": {
            "opcodes": "CB3E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "The contents of (HL) are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl (hl)"
          }
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            63
          ],
          "clr": {
            "opcodes": "CB3F",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl a"
          }
        },
        {
          "tokens": [
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            62
          ],
          "clr": {
            "opcodes": "DDCB**3E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IX plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl (ix+*)"
          }
        },
        {
          "tokens": [
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            62
          ],
          "clr": {
            "opcodes": "FDCB**3E",
            "undocumented": false,
            "flags": "+0P0++",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "The contents of the memory location pointed to by IY plus * are shifted right one bit position. The contents of bit 0 are copied to the carry flag and a zero is put into bit 7.",
            "instruction": "srl (iy+*)"
          }
        }
      ]
    },
    "bit": {
      "variants": [
        {
          "tokens": [
            "0",
            ",",
            "b"
          ],
          "opcode": [
            203,
            64
          ],
          "clr": {
            "opcodes": "CB40",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 0 of B.",
            "instruction": "bit 0,b"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "c"
          ],
          "opcode": [
            203,
            65
          ],
          "clr": {
            "opcodes": "CB41",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 0 of C.",
            "instruction": "bit 0,c"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "d"
          ],
          "opcode": [
            203,
            66
          ],
          "clr": {
            "opcodes": "CB42",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 0 of D.",
            "instruction": "bit 0,d"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "e"
          ],
          "opcode": [
            203,
            67
          ],
          "clr": {
            "opcodes": "CB43",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 0 of E.",
            "instruction": "bit 0,e"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "h"
          ],
          "opcode": [
            203,
            68
          ],
          "clr": {
            "opcodes": "CB44",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 0 of H.",
            "instruction": "bit 0,h"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "l"
          ],
          "opcode": [
            203,
            69
          ],
          "clr": {
            "opcodes": "CB45",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 0 of L.",
            "instruction": "bit 0,l"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            70
          ],
          "clr": {
            "opcodes": "CB46",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 0 of (HL).",
            "instruction": "bit 0,(hl)"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "a"
          ],
          "opcode": [
            203,
            71
          ],
          "clr": {
            "opcodes": "CB47",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 0 of A.",
            "instruction": "bit 0,a"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "b"
          ],
          "opcode": [
            203,
            72
          ],
          "clr": {
            "opcodes": "CB48",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 1 of B.",
            "instruction": "bit 1,b"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "c"
          ],
          "opcode": [
            203,
            73
          ],
          "clr": {
            "opcodes": "CB49",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 1 of C.",
            "instruction": "bit 1,c"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "d"
          ],
          "opcode": [
            203,
            74
          ],
          "clr": {
            "opcodes": "CB4A",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 1 of D.",
            "instruction": "bit 1,d"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "e"
          ],
          "opcode": [
            203,
            75
          ],
          "clr": {
            "opcodes": "CB4B",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 1 of E.",
            "instruction": "bit 1,e"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "h"
          ],
          "opcode": [
            203,
            76
          ],
          "clr": {
            "opcodes": "CB4C",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 1 of H.",
            "instruction": "bit 1,h"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "l"
          ],
          "opcode": [
            203,
            77
          ],
          "clr": {
            "opcodes": "CB4D",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 1 of L.",
            "instruction": "bit 1,l"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            78
          ],
          "clr": {
            "opcodes": "CB4E",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 1 of (HL).",
            "instruction": "bit 1,(hl)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "a"
          ],
          "opcode": [
            203,
            79
          ],
          "clr": {
            "opcodes": "CB4F",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 1 of A.",
            "instruction": "bit 1,a"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "b"
          ],
          "opcode": [
            203,
            80
          ],
          "clr": {
            "opcodes": "CB50",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 2 of B.",
            "instruction": "bit 2,b"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "c"
          ],
          "opcode": [
            203,
            81
          ],
          "clr": {
            "opcodes": "CB51",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 2 of C.",
            "instruction": "bit 2,c"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "d"
          ],
          "opcode": [
            203,
            82
          ],
          "clr": {
            "opcodes": "CB52",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 2 of D.",
            "instruction": "bit 2,d"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "e"
          ],
          "opcode": [
            203,
            83
          ],
          "clr": {
            "opcodes": "CB53",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 2 of E.",
            "instruction": "bit 2,e"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "h"
          ],
          "opcode": [
            203,
            84
          ],
          "clr": {
            "opcodes": "CB54",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 2 of H.",
            "instruction": "bit 2,h"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "l"
          ],
          "opcode": [
            203,
            85
          ],
          "clr": {
            "opcodes": "CB55",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 2 of L.",
            "instruction": "bit 2,l"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            86
          ],
          "clr": {
            "opcodes": "CB56",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 2 of (HL).",
            "instruction": "bit 2,(hl)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "a"
          ],
          "opcode": [
            203,
            87
          ],
          "clr": {
            "opcodes": "CB57",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 2 of A.",
            "instruction": "bit 2,a"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "b"
          ],
          "opcode": [
            203,
            88
          ],
          "clr": {
            "opcodes": "CB58",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 3 of B.",
            "instruction": "bit 3,b"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "c"
          ],
          "opcode": [
            203,
            89
          ],
          "clr": {
            "opcodes": "CB59",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 3 of C.",
            "instruction": "bit 3,c"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "d"
          ],
          "opcode": [
            203,
            90
          ],
          "clr": {
            "opcodes": "CB5A",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 3 of D.",
            "instruction": "bit 3,d"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "e"
          ],
          "opcode": [
            203,
            91
          ],
          "clr": {
            "opcodes": "CB5B",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 3 of E.",
            "instruction": "bit 3,e"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "h"
          ],
          "opcode": [
            203,
            92
          ],
          "clr": {
            "opcodes": "CB5C",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 3 of H.",
            "instruction": "bit 3,h"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "l"
          ],
          "opcode": [
            203,
            93
          ],
          "clr": {
            "opcodes": "CB5D",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 3 of L.",
            "instruction": "bit 3,l"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            94
          ],
          "clr": {
            "opcodes": "CB5E",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 3 of (HL).",
            "instruction": "bit 3,(hl)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "a"
          ],
          "opcode": [
            203,
            95
          ],
          "clr": {
            "opcodes": "CB5F",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 3 of A.",
            "instruction": "bit 3,a"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "b"
          ],
          "opcode": [
            203,
            96
          ],
          "clr": {
            "opcodes": "CB60",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 4 of B.",
            "instruction": "bit 4,b"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "c"
          ],
          "opcode": [
            203,
            97
          ],
          "clr": {
            "opcodes": "CB61",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 4 of C.",
            "instruction": "bit 4,c"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "d"
          ],
          "opcode": [
            203,
            98
          ],
          "clr": {
            "opcodes": "CB62",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 4 of D.",
            "instruction": "bit 4,d"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "e"
          ],
          "opcode": [
            203,
            99
          ],
          "clr": {
            "opcodes": "CB63",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 4 of E.",
            "instruction": "bit 4,e"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "h"
          ],
          "opcode": [
            203,
            100
          ],
          "clr": {
            "opcodes": "CB64",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 4 of H.",
            "instruction": "bit 4,h"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "l"
          ],
          "opcode": [
            203,
            101
          ],
          "clr": {
            "opcodes": "CB65",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 4 of L.",
            "instruction": "bit 4,l"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            102
          ],
          "clr": {
            "opcodes": "CB66",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 4 of (HL).",
            "instruction": "bit 4,(hl)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "a"
          ],
          "opcode": [
            203,
            103
          ],
          "clr": {
            "opcodes": "CB67",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 4 of A.",
            "instruction": "bit 4,a"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "b"
          ],
          "opcode": [
            203,
            104
          ],
          "clr": {
            "opcodes": "CB68",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 5 of B.",
            "instruction": "bit 5,b"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "c"
          ],
          "opcode": [
            203,
            105
          ],
          "clr": {
            "opcodes": "CB69",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 5 of C.",
            "instruction": "bit 5,c"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "d"
          ],
          "opcode": [
            203,
            106
          ],
          "clr": {
            "opcodes": "CB6A",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 5 of D.",
            "instruction": "bit 5,d"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "e"
          ],
          "opcode": [
            203,
            107
          ],
          "clr": {
            "opcodes": "CB6B",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 5 of E.",
            "instruction": "bit 5,e"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "h"
          ],
          "opcode": [
            203,
            108
          ],
          "clr": {
            "opcodes": "CB6C",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 5 of H.",
            "instruction": "bit 5,h"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "l"
          ],
          "opcode": [
            203,
            109
          ],
          "clr": {
            "opcodes": "CB6D",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 5 of L.",
            "instruction": "bit 5,l"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            110
          ],
          "clr": {
            "opcodes": "CB6E",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 5 of (HL).",
            "instruction": "bit 5,(hl)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "a"
          ],
          "opcode": [
            203,
            111
          ],
          "clr": {
            "opcodes": "CB6F",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 5 of A.",
            "instruction": "bit 5,a"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "b"
          ],
          "opcode": [
            203,
            112
          ],
          "clr": {
            "opcodes": "CB70",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 6 of B.",
            "instruction": "bit 6,b"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "c"
          ],
          "opcode": [
            203,
            113
          ],
          "clr": {
            "opcodes": "CB71",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 6 of C.",
            "instruction": "bit 6,c"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "d"
          ],
          "opcode": [
            203,
            114
          ],
          "clr": {
            "opcodes": "CB72",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 6 of D.",
            "instruction": "bit 6,d"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "e"
          ],
          "opcode": [
            203,
            115
          ],
          "clr": {
            "opcodes": "CB73",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 6 of E.",
            "instruction": "bit 6,e"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "h"
          ],
          "opcode": [
            203,
            116
          ],
          "clr": {
            "opcodes": "CB74",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 6 of H.",
            "instruction": "bit 6,h"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "l"
          ],
          "opcode": [
            203,
            117
          ],
          "clr": {
            "opcodes": "CB75",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 6 of L.",
            "instruction": "bit 6,l"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            118
          ],
          "clr": {
            "opcodes": "CB76",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 6 of (HL).",
            "instruction": "bit 6,(hl)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "a"
          ],
          "opcode": [
            203,
            119
          ],
          "clr": {
            "opcodes": "CB77",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 6 of A.",
            "instruction": "bit 6,a"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "b"
          ],
          "opcode": [
            203,
            120
          ],
          "clr": {
            "opcodes": "CB78",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 7 of B.",
            "instruction": "bit 7,b"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "c"
          ],
          "opcode": [
            203,
            121
          ],
          "clr": {
            "opcodes": "CB79",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 7 of C.",
            "instruction": "bit 7,c"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "d"
          ],
          "opcode": [
            203,
            122
          ],
          "clr": {
            "opcodes": "CB7A",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 7 of D.",
            "instruction": "bit 7,d"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "e"
          ],
          "opcode": [
            203,
            123
          ],
          "clr": {
            "opcodes": "CB7B",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 7 of E.",
            "instruction": "bit 7,e"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "h"
          ],
          "opcode": [
            203,
            124
          ],
          "clr": {
            "opcodes": "CB7C",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 7 of H.",
            "instruction": "bit 7,h"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "l"
          ],
          "opcode": [
            203,
            125
          ],
          "clr": {
            "opcodes": "CB7D",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 7 of L.",
            "instruction": "bit 7,l"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            126
          ],
          "clr": {
            "opcodes": "CB7E",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Tests bit 7 of (HL).",
            "instruction": "bit 7,(hl)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "a"
          ],
          "opcode": [
            203,
            127
          ],
          "clr": {
            "opcodes": "CB7F",
            "undocumented": false,
            "flags": "-0 1+ ",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Tests bit 7 of A.",
            "instruction": "bit 7,a"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            71
          ],
          "clr": {
            "opcodes": "DDCB**47",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "bit 0,(ix+*)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            79
          ],
          "clr": {
            "opcodes": "DDCB**4F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "bit 1,(ix+*)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            87
          ],
          "clr": {
            "opcodes": "DDCB**57",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "bit 2,(ix+*)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            95
          ],
          "clr": {
            "opcodes": "DDCB**5F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "bit 3,(ix+*)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            103
          ],
          "clr": {
            "opcodes": "DDCB**67",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "bit 4,(ix+*)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            111
          ],
          "clr": {
            "opcodes": "DDCB**6F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "bit 5,(ix+*)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            119
          ],
          "clr": {
            "opcodes": "DDCB**77",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "bit 6,(ix+*)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            127
          ],
          "clr": {
            "opcodes": "DDCB**7F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "bit 7,(ix+*)"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            71
          ],
          "clr": {
            "opcodes": "FDCB**47",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "bit 0,(iy+*)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            79
          ],
          "clr": {
            "opcodes": "FDCB**4F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "bit 1,(iy+*)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            87
          ],
          "clr": {
            "opcodes": "FDCB**57",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "bit 2,(iy+*)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            95
          ],
          "clr": {
            "opcodes": "FDCB**5F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "bit 3,(iy+*)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            103
          ],
          "clr": {
            "opcodes": "FDCB**67",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "bit 4,(iy+*)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            111
          ],
          "clr": {
            "opcodes": "FDCB**6F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "bit 5,(iy+*)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            119
          ],
          "clr": {
            "opcodes": "FDCB**77",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "bit 6,(iy+*)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            127
          ],
          "clr": {
            "opcodes": "FDCB**7F",
            "undocumented": true,
            "flags": "-0 1+ ",
            "byte_count": 4,
            "with_jump_clock_count": 20,
            "without_jump_clock_count": 20,
            "description": "Tests bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "bit 7,(iy+*)"
          }
        }
      ]
    },
    "res": {
      "variants": [
        {
          "tokens": [
            "0",
            ",",
            "b"
          ],
          "opcode": [
            203,
            128
          ],
          "clr": {
            "opcodes": "CB80",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 0 of B.",
            "instruction": "res 0,b"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "c"
          ],
          "opcode": [
            203,
            129
          ],
          "clr": {
            "opcodes": "CB81",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 0 of C.",
            "instruction": "res 0,c"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "d"
          ],
          "opcode": [
            203,
            130
          ],
          "clr": {
            "opcodes": "CB82",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 0 of D.",
            "instruction": "res 0,d"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "e"
          ],
          "opcode": [
            203,
            131
          ],
          "clr": {
            "opcodes": "CB83",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 0 of E.",
            "instruction": "res 0,e"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "h"
          ],
          "opcode": [
            203,
            132
          ],
          "clr": {
            "opcodes": "CB84",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 0 of H.",
            "instruction": "res 0,h"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "l"
          ],
          "opcode": [
            203,
            133
          ],
          "clr": {
            "opcodes": "CB85",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 0 of L.",
            "instruction": "res 0,l"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            134
          ],
          "clr": {
            "opcodes": "CB86",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 0 of (HL).",
            "instruction": "res 0,(hl)"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "a"
          ],
          "opcode": [
            203,
            135
          ],
          "clr": {
            "opcodes": "CB87",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 0 of A.",
            "instruction": "res 0,a"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "b"
          ],
          "opcode": [
            203,
            136
          ],
          "clr": {
            "opcodes": "CB88",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 1 of B.",
            "instruction": "res 1,b"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "c"
          ],
          "opcode": [
            203,
            137
          ],
          "clr": {
            "opcodes": "CB89",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 1 of C.",
            "instruction": "res 1,c"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "d"
          ],
          "opcode": [
            203,
            138
          ],
          "clr": {
            "opcodes": "CB8A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 1 of D.",
            "instruction": "res 1,d"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "e"
          ],
          "opcode": [
            203,
            139
          ],
          "clr": {
            "opcodes": "CB8B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 1 of E.",
            "instruction": "res 1,e"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "h"
          ],
          "opcode": [
            203,
            140
          ],
          "clr": {
            "opcodes": "CB8C",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 1 of H.",
            "instruction": "res 1,h"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "l"
          ],
          "opcode": [
            203,
            141
          ],
          "clr": {
            "opcodes": "CB8D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 1 of L.",
            "instruction": "res 1,l"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            142
          ],
          "clr": {
            "opcodes": "CB8E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 1 of (HL).",
            "instruction": "res 1,(hl)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "a"
          ],
          "opcode": [
            203,
            143
          ],
          "clr": {
            "opcodes": "CB8F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 1 of A.",
            "instruction": "res 1,a"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "b"
          ],
          "opcode": [
            203,
            144
          ],
          "clr": {
            "opcodes": "CB90",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 2 of B.",
            "instruction": "res 2,b"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "c"
          ],
          "opcode": [
            203,
            145
          ],
          "clr": {
            "opcodes": "CB91",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 2 of C.",
            "instruction": "res 2,c"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "d"
          ],
          "opcode": [
            203,
            146
          ],
          "clr": {
            "opcodes": "CB92",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 2 of D.",
            "instruction": "res 2,d"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "e"
          ],
          "opcode": [
            203,
            147
          ],
          "clr": {
            "opcodes": "CB93",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 2 of E.",
            "instruction": "res 2,e"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "h"
          ],
          "opcode": [
            203,
            148
          ],
          "clr": {
            "opcodes": "CB94",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 2 of H.",
            "instruction": "res 2,h"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "l"
          ],
          "opcode": [
            203,
            149
          ],
          "clr": {
            "opcodes": "CB95",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 2 of L.",
            "instruction": "res 2,l"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            150
          ],
          "clr": {
            "opcodes": "CB96",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 2 of (HL).",
            "instruction": "res 2,(hl)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "a"
          ],
          "opcode": [
            203,
            151
          ],
          "clr": {
            "opcodes": "CB97",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 2 of A.",
            "instruction": "res 2,a"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "b"
          ],
          "opcode": [
            203,
            152
          ],
          "clr": {
            "opcodes": "CB98",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 3 of B.",
            "instruction": "res 3,b"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "c"
          ],
          "opcode": [
            203,
            153
          ],
          "clr": {
            "opcodes": "CB99",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 3 of C.",
            "instruction": "res 3,c"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "d"
          ],
          "opcode": [
            203,
            154
          ],
          "clr": {
            "opcodes": "CB9A",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 3 of D.",
            "instruction": "res 3,d"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "e"
          ],
          "opcode": [
            203,
            155
          ],
          "clr": {
            "opcodes": "CB9B",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 3 of E.",
            "instruction": "res 3,e"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "h"
          ],
          "opcode": [
            203,
            156
          ],
          "clr": {
            "opcodes": "CB9C",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 3 of H.",
            "instruction": "res 3,h"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "l"
          ],
          "opcode": [
            203,
            157
          ],
          "clr": {
            "opcodes": "CB9D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 3 of L.",
            "instruction": "res 3,l"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            158
          ],
          "clr": {
            "opcodes": "CB9E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 3 of (HL).",
            "instruction": "res 3,(hl)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "a"
          ],
          "opcode": [
            203,
            159
          ],
          "clr": {
            "opcodes": "CB9F",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 3 of A.",
            "instruction": "res 3,a"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "b"
          ],
          "opcode": [
            203,
            160
          ],
          "clr": {
            "opcodes": "CBA0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 4 of B.",
            "instruction": "res 4,b"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "c"
          ],
          "opcode": [
            203,
            161
          ],
          "clr": {
            "opcodes": "CBA1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 4 of C.",
            "instruction": "res 4,c"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "d"
          ],
          "opcode": [
            203,
            162
          ],
          "clr": {
            "opcodes": "CBA2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 4 of D.",
            "instruction": "res 4,d"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "e"
          ],
          "opcode": [
            203,
            163
          ],
          "clr": {
            "opcodes": "CBA3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 4 of E.",
            "instruction": "res 4,e"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "h"
          ],
          "opcode": [
            203,
            164
          ],
          "clr": {
            "opcodes": "CBA4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 4 of H.",
            "instruction": "res 4,h"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "l"
          ],
          "opcode": [
            203,
            165
          ],
          "clr": {
            "opcodes": "CBA5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 4 of L.",
            "instruction": "res 4,l"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            166
          ],
          "clr": {
            "opcodes": "CBA6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 4 of (HL).",
            "instruction": "res 4,(hl)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "a"
          ],
          "opcode": [
            203,
            167
          ],
          "clr": {
            "opcodes": "CBA7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 4 of A.",
            "instruction": "res 4,a"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "b"
          ],
          "opcode": [
            203,
            168
          ],
          "clr": {
            "opcodes": "CBA8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 5 of B.",
            "instruction": "res 5,b"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "c"
          ],
          "opcode": [
            203,
            169
          ],
          "clr": {
            "opcodes": "CBA9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 5 of C.",
            "instruction": "res 5,c"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "d"
          ],
          "opcode": [
            203,
            170
          ],
          "clr": {
            "opcodes": "CBAA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 5 of D.",
            "instruction": "res 5,d"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "e"
          ],
          "opcode": [
            203,
            171
          ],
          "clr": {
            "opcodes": "CBAB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 5 of E.",
            "instruction": "res 5,e"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "h"
          ],
          "opcode": [
            203,
            172
          ],
          "clr": {
            "opcodes": "CBAC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 5 of H.",
            "instruction": "res 5,h"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "l"
          ],
          "opcode": [
            203,
            173
          ],
          "clr": {
            "opcodes": "CBAD",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 5 of L.",
            "instruction": "res 5,l"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            174
          ],
          "clr": {
            "opcodes": "CBAE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 5 of (HL).",
            "instruction": "res 5,(hl)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "a"
          ],
          "opcode": [
            203,
            175
          ],
          "clr": {
            "opcodes": "CBAF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 5 of A.",
            "instruction": "res 5,a"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "b"
          ],
          "opcode": [
            203,
            176
          ],
          "clr": {
            "opcodes": "CBB0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 6 of B.",
            "instruction": "res 6,b"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "c"
          ],
          "opcode": [
            203,
            177
          ],
          "clr": {
            "opcodes": "CBB1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 6 of C.",
            "instruction": "res 6,c"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "d"
          ],
          "opcode": [
            203,
            178
          ],
          "clr": {
            "opcodes": "CBB2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 6 of D.",
            "instruction": "res 6,d"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "e"
          ],
          "opcode": [
            203,
            179
          ],
          "clr": {
            "opcodes": "CBB3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 6 of E.",
            "instruction": "res 6,e"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "h"
          ],
          "opcode": [
            203,
            180
          ],
          "clr": {
            "opcodes": "CBB4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 6 of H.",
            "instruction": "res 6,h"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "l"
          ],
          "opcode": [
            203,
            181
          ],
          "clr": {
            "opcodes": "CBB5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 6 of L.",
            "instruction": "res 6,l"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            182
          ],
          "clr": {
            "opcodes": "CBB6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 6 of (HL).",
            "instruction": "res 6,(hl)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "a"
          ],
          "opcode": [
            203,
            183
          ],
          "clr": {
            "opcodes": "CBB7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 6 of A.",
            "instruction": "res 6,a"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "b"
          ],
          "opcode": [
            203,
            184
          ],
          "clr": {
            "opcodes": "CBB8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 7 of B.",
            "instruction": "res 7,b"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "c"
          ],
          "opcode": [
            203,
            185
          ],
          "clr": {
            "opcodes": "CBB9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 7 of C.",
            "instruction": "res 7,c"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "d"
          ],
          "opcode": [
            203,
            186
          ],
          "clr": {
            "opcodes": "CBBA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 7 of D.",
            "instruction": "res 7,d"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "e"
          ],
          "opcode": [
            203,
            187
          ],
          "clr": {
            "opcodes": "CBBB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 7 of E.",
            "instruction": "res 7,e"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "h"
          ],
          "opcode": [
            203,
            188
          ],
          "clr": {
            "opcodes": "CBBC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 7 of H.",
            "instruction": "res 7,h"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "l"
          ],
          "opcode": [
            203,
            189
          ],
          "clr": {
            "opcodes": "CBBD",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 7 of L.",
            "instruction": "res 7,l"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            190
          ],
          "clr": {
            "opcodes": "CBBE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Resets bit 7 of (HL).",
            "instruction": "res 7,(hl)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "a"
          ],
          "opcode": [
            203,
            191
          ],
          "clr": {
            "opcodes": "CBBF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Resets bit 7 of A.",
            "instruction": "res 7,a"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            134
          ],
          "clr": {
            "opcodes": "DDCB**86",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "res 0,(ix+*)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            142
          ],
          "clr": {
            "opcodes": "DDCB**8E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "res 1,(ix+*)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            150
          ],
          "clr": {
            "opcodes": "DDCB**96",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "res 2,(ix+*)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            158
          ],
          "clr": {
            "opcodes": "DDCB**9E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "res 3,(ix+*)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            166
          ],
          "clr": {
            "opcodes": "DDCB**A6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "res 4,(ix+*)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            174
          ],
          "clr": {
            "opcodes": "DDCB**AE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "res 5,(ix+*)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            182
          ],
          "clr": {
            "opcodes": "DDCB**B6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "res 6,(ix+*)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            190
          ],
          "clr": {
            "opcodes": "DDCB**BE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "res 7,(ix+*)"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            134
          ],
          "clr": {
            "opcodes": "FDCB**86",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "res 0,(iy+*)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            142
          ],
          "clr": {
            "opcodes": "FDCB**8E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "res 1,(iy+*)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            150
          ],
          "clr": {
            "opcodes": "FDCB**96",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "res 2,(iy+*)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            158
          ],
          "clr": {
            "opcodes": "FDCB**9E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "res 3,(iy+*)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            166
          ],
          "clr": {
            "opcodes": "FDCB**A6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "res 4,(iy+*)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            174
          ],
          "clr": {
            "opcodes": "FDCB**AE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "res 5,(iy+*)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            182
          ],
          "clr": {
            "opcodes": "FDCB**B6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "res 6,(iy+*)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            190
          ],
          "clr": {
            "opcodes": "FDCB**BE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Resets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "res 7,(iy+*)"
          }
        }
      ]
    },
    "set": {
      "variants": [
        {
          "tokens": [
            "0",
            ",",
            "b"
          ],
          "opcode": [
            203,
            192
          ],
          "clr": {
            "opcodes": "CBC0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 0 of B.",
            "instruction": "set 0,b"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "c"
          ],
          "opcode": [
            203,
            193
          ],
          "clr": {
            "opcodes": "CBC1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 0 of C.",
            "instruction": "set 0,c"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "d"
          ],
          "opcode": [
            203,
            194
          ],
          "clr": {
            "opcodes": "CBC2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 0 of D.",
            "instruction": "set 0,d"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "e"
          ],
          "opcode": [
            203,
            195
          ],
          "clr": {
            "opcodes": "CBC3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 0 of E.",
            "instruction": "set 0,e"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "h"
          ],
          "opcode": [
            203,
            196
          ],
          "clr": {
            "opcodes": "CBC4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 0 of H.",
            "instruction": "set 0,h"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "l"
          ],
          "opcode": [
            203,
            197
          ],
          "clr": {
            "opcodes": "CBC5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 0 of L.",
            "instruction": "set 0,l"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            198
          ],
          "clr": {
            "opcodes": "CBC6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 0 of (HL).",
            "instruction": "set 0,(hl)"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "a"
          ],
          "opcode": [
            203,
            199
          ],
          "clr": {
            "opcodes": "CBC7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 0 of A.",
            "instruction": "set 0,a"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "b"
          ],
          "opcode": [
            203,
            200
          ],
          "clr": {
            "opcodes": "CBC8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 1 of B.",
            "instruction": "set 1,b"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "c"
          ],
          "opcode": [
            203,
            201
          ],
          "clr": {
            "opcodes": "CBC9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 1 of C.",
            "instruction": "set 1,c"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "d"
          ],
          "opcode": [
            203,
            202
          ],
          "clr": {
            "opcodes": "CBCA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 1 of D.",
            "instruction": "set 1,d"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "e"
          ],
          "opcode": [
            203,
            203
          ],
          "clr": {
            "opcodes": "CBCB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 1 of E.",
            "instruction": "set 1,e"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "h"
          ],
          "opcode": [
            203,
            204
          ],
          "clr": {
            "opcodes": "CBCC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 1 of H.",
            "instruction": "set 1,h"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "l"
          ],
          "opcode": [
            203,
            205
          ],
          "clr": {
            "opcodes": "CBCD",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 1 of L.",
            "instruction": "set 1,l"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            206
          ],
          "clr": {
            "opcodes": "CBCE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 1 of (HL).",
            "instruction": "set 1,(hl)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "a"
          ],
          "opcode": [
            203,
            207
          ],
          "clr": {
            "opcodes": "CBCF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 1 of A.",
            "instruction": "set 1,a"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "b"
          ],
          "opcode": [
            203,
            208
          ],
          "clr": {
            "opcodes": "CBD0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 2 of B.",
            "instruction": "set 2,b"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "c"
          ],
          "opcode": [
            203,
            209
          ],
          "clr": {
            "opcodes": "CBD1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 2 of C.",
            "instruction": "set 2,c"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "d"
          ],
          "opcode": [
            203,
            210
          ],
          "clr": {
            "opcodes": "CBD2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 2 of D.",
            "instruction": "set 2,d"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "e"
          ],
          "opcode": [
            203,
            211
          ],
          "clr": {
            "opcodes": "CBD3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 2 of E.",
            "instruction": "set 2,e"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "h"
          ],
          "opcode": [
            203,
            212
          ],
          "clr": {
            "opcodes": "CBD4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 2 of H.",
            "instruction": "set 2,h"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "l"
          ],
          "opcode": [
            203,
            213
          ],
          "clr": {
            "opcodes": "CBD5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 2 of L.",
            "instruction": "set 2,l"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            214
          ],
          "clr": {
            "opcodes": "CBD6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 2 of (HL).",
            "instruction": "set 2,(hl)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "a"
          ],
          "opcode": [
            203,
            215
          ],
          "clr": {
            "opcodes": "CBD7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 2 of A.",
            "instruction": "set 2,a"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "b"
          ],
          "opcode": [
            203,
            216
          ],
          "clr": {
            "opcodes": "CBD8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 3 of B.",
            "instruction": "set 3,b"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "c"
          ],
          "opcode": [
            203,
            217
          ],
          "clr": {
            "opcodes": "CBD9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 3 of C.",
            "instruction": "set 3,c"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "d"
          ],
          "opcode": [
            203,
            218
          ],
          "clr": {
            "opcodes": "CBDA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 3 of D.",
            "instruction": "set 3,d"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "e"
          ],
          "opcode": [
            203,
            219
          ],
          "clr": {
            "opcodes": "CBDB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 3 of E.",
            "instruction": "set 3,e"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "h"
          ],
          "opcode": [
            203,
            220
          ],
          "clr": {
            "opcodes": "CBDC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 3 of H.",
            "instruction": "set 3,h"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "l"
          ],
          "opcode": [
            203,
            221
          ],
          "clr": {
            "opcodes": "CBDD",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 3 of L.",
            "instruction": "set 3,l"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            222
          ],
          "clr": {
            "opcodes": "CBDE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 3 of (HL).",
            "instruction": "set 3,(hl)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "a"
          ],
          "opcode": [
            203,
            223
          ],
          "clr": {
            "opcodes": "CBDF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 3 of A.",
            "instruction": "set 3,a"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "b"
          ],
          "opcode": [
            203,
            224
          ],
          "clr": {
            "opcodes": "CBE0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 4 of B.",
            "instruction": "set 4,b"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "c"
          ],
          "opcode": [
            203,
            225
          ],
          "clr": {
            "opcodes": "CBE1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 4 of C.",
            "instruction": "set 4,c"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "d"
          ],
          "opcode": [
            203,
            226
          ],
          "clr": {
            "opcodes": "CBE2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 4 of D.",
            "instruction": "set 4,d"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "e"
          ],
          "opcode": [
            203,
            227
          ],
          "clr": {
            "opcodes": "CBE3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 4 of E.",
            "instruction": "set 4,e"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "h"
          ],
          "opcode": [
            203,
            228
          ],
          "clr": {
            "opcodes": "CBE4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 4 of H.",
            "instruction": "set 4,h"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "l"
          ],
          "opcode": [
            203,
            229
          ],
          "clr": {
            "opcodes": "CBE5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 4 of L.",
            "instruction": "set 4,l"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            230
          ],
          "clr": {
            "opcodes": "CBE6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 4 of (HL).",
            "instruction": "set 4,(hl)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "a"
          ],
          "opcode": [
            203,
            231
          ],
          "clr": {
            "opcodes": "CBE7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 4 of A.",
            "instruction": "set 4,a"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "b"
          ],
          "opcode": [
            203,
            232
          ],
          "clr": {
            "opcodes": "CBE8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 5 of B.",
            "instruction": "set 5,b"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "c"
          ],
          "opcode": [
            203,
            233
          ],
          "clr": {
            "opcodes": "CBE9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 5 of C.",
            "instruction": "set 5,c"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "d"
          ],
          "opcode": [
            203,
            234
          ],
          "clr": {
            "opcodes": "CBEA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 5 of D.",
            "instruction": "set 5,d"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "e"
          ],
          "opcode": [
            203,
            235
          ],
          "clr": {
            "opcodes": "CBEB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 5 of E.",
            "instruction": "set 5,e"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "h"
          ],
          "opcode": [
            203,
            236
          ],
          "clr": {
            "opcodes": "CBEC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 5 of H.",
            "instruction": "set 5,h"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "l"
          ],
          "opcode": [
            203,
            237
          ],
          "clr": {
            "opcodes": "CBED",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 5 of L.",
            "instruction": "set 5,l"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            238
          ],
          "clr": {
            "opcodes": "CBEE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 5 of (HL).",
            "instruction": "set 5,(hl)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "a"
          ],
          "opcode": [
            203,
            239
          ],
          "clr": {
            "opcodes": "CBEF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 5 of A.",
            "instruction": "set 5,a"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "b"
          ],
          "opcode": [
            203,
            240
          ],
          "clr": {
            "opcodes": "CBF0",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 6 of B.",
            "instruction": "set 6,b"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "c"
          ],
          "opcode": [
            203,
            241
          ],
          "clr": {
            "opcodes": "CBF1",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 6 of C.",
            "instruction": "set 6,c"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "d"
          ],
          "opcode": [
            203,
            242
          ],
          "clr": {
            "opcodes": "CBF2",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 6 of D.",
            "instruction": "set 6,d"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "e"
          ],
          "opcode": [
            203,
            243
          ],
          "clr": {
            "opcodes": "CBF3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 6 of E.",
            "instruction": "set 6,e"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "h"
          ],
          "opcode": [
            203,
            244
          ],
          "clr": {
            "opcodes": "CBF4",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 6 of H.",
            "instruction": "set 6,h"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "l"
          ],
          "opcode": [
            203,
            245
          ],
          "clr": {
            "opcodes": "CBF5",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 6 of L.",
            "instruction": "set 6,l"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            246
          ],
          "clr": {
            "opcodes": "CBF6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 6 of (HL).",
            "instruction": "set 6,(hl)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "a"
          ],
          "opcode": [
            203,
            247
          ],
          "clr": {
            "opcodes": "CBF7",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 6 of A.",
            "instruction": "set 6,a"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "b"
          ],
          "opcode": [
            203,
            248
          ],
          "clr": {
            "opcodes": "CBF8",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 7 of B.",
            "instruction": "set 7,b"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "c"
          ],
          "opcode": [
            203,
            249
          ],
          "clr": {
            "opcodes": "CBF9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 7 of C.",
            "instruction": "set 7,c"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "d"
          ],
          "opcode": [
            203,
            250
          ],
          "clr": {
            "opcodes": "CBFA",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 7 of D.",
            "instruction": "set 7,d"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "e"
          ],
          "opcode": [
            203,
            251
          ],
          "clr": {
            "opcodes": "CBFB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 7 of E.",
            "instruction": "set 7,e"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "h"
          ],
          "opcode": [
            203,
            252
          ],
          "clr": {
            "opcodes": "CBFC",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 7 of H.",
            "instruction": "set 7,h"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "l"
          ],
          "opcode": [
            203,
            253
          ],
          "clr": {
            "opcodes": "CBFD",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 7 of L.",
            "instruction": "set 7,l"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            203,
            254
          ],
          "clr": {
            "opcodes": "CBFE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 15,
            "without_jump_clock_count": 15,
            "description": "Sets bit 7 of (HL).",
            "instruction": "set 7,(hl)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "a"
          ],
          "opcode": [
            203,
            255
          ],
          "clr": {
            "opcodes": "CBFF",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets bit 7 of A.",
            "instruction": "set 7,a"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            198
          ],
          "clr": {
            "opcodes": "DDCB**C6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IX plus *.",
            "instruction": "set 0,(ix+*)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            206
          ],
          "clr": {
            "opcodes": "DDCB**CE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IX plus *.",
            "instruction": "set 1,(ix+*)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            214
          ],
          "clr": {
            "opcodes": "DDCB**D6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IX plus *.",
            "instruction": "set 2,(ix+*)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            222
          ],
          "clr": {
            "opcodes": "DDCB**DE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IX plus *.",
            "instruction": "set 3,(ix+*)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            230
          ],
          "clr": {
            "opcodes": "DDCB**E6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IX plus *.",
            "instruction": "set 4,(ix+*)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            238
          ],
          "clr": {
            "opcodes": "DDCB**EE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IX plus *.",
            "instruction": "set 5,(ix+*)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            246
          ],
          "clr": {
            "opcodes": "DDCB**F6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IX plus *.",
            "instruction": "set 6,(ix+*)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "ix",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            221,
            203,
            "dd",
            254
          ],
          "clr": {
            "opcodes": "DDCB**FE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IX plus *.",
            "instruction": "set 7,(ix+*)"
          }
        },
        {
          "tokens": [
            "0",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            198
          ],
          "clr": {
            "opcodes": "FDCB**C6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 0 of the memory location pointed to by IY plus *.",
            "instruction": "set 0,(iy+*)"
          }
        },
        {
          "tokens": [
            "1",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            206
          ],
          "clr": {
            "opcodes": "FDCB**CE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 1 of the memory location pointed to by IY plus *.",
            "instruction": "set 1,(iy+*)"
          }
        },
        {
          "tokens": [
            "2",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            214
          ],
          "clr": {
            "opcodes": "FDCB**D6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 2 of the memory location pointed to by IY plus *.",
            "instruction": "set 2,(iy+*)"
          }
        },
        {
          "tokens": [
            "3",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            222
          ],
          "clr": {
            "opcodes": "FDCB**DE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 3 of the memory location pointed to by IY plus *.",
            "instruction": "set 3,(iy+*)"
          }
        },
        {
          "tokens": [
            "4",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            230
          ],
          "clr": {
            "opcodes": "FDCB**E6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 4 of the memory location pointed to by IY plus *.",
            "instruction": "set 4,(iy+*)"
          }
        },
        {
          "tokens": [
            "5",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            238
          ],
          "clr": {
            "opcodes": "FDCB**EE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 5 of the memory location pointed to by IY plus *.",
            "instruction": "set 5,(iy+*)"
          }
        },
        {
          "tokens": [
            "6",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            246
          ],
          "clr": {
            "opcodes": "FDCB**F6",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 6 of the memory location pointed to by IY plus *.",
            "instruction": "set 6,(iy+*)"
          }
        },
        {
          "tokens": [
            "7",
            ",",
            "(",
            "iy",
            "+",
            "dd",
            ")"
          ],
          "opcode": [
            253,
            203,
            "dd",
            254
          ],
          "clr": {
            "opcodes": "FDCB**FE",
            "undocumented": false,
            "flags": "------",
            "byte_count": 4,
            "with_jump_clock_count": 23,
            "without_jump_clock_count": 23,
            "description": "Sets bit 7 of the memory location pointed to by IY plus *.",
            "instruction": "set 7,(iy+*)"
          }
        }
      ]
    },
    "out": {
      "variants": [
        {
          "tokens": [
            "(",
            "nn",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            211,
            "nn"
          ],
          "clr": {
            "opcodes": "D3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "The value of A is written to port *.",
            "instruction": "out (*),a"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "b"
          ],
          "opcode": [
            237,
            65
          ],
          "clr": {
            "opcodes": "ED41",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The value of B is written to port C.",
            "instruction": "out (c),b"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "c"
          ],
          "opcode": [
            237,
            73
          ],
          "clr": {
            "opcodes": "ED49",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The value of C is written to port C.",
            "instruction": "out (c),c"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "d"
          ],
          "opcode": [
            237,
            81
          ],
          "clr": {
            "opcodes": "ED51",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The value of C is written to port C.",
            "instruction": "out (c),d"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "e"
          ],
          "opcode": [
            237,
            89
          ],
          "clr": {
            "opcodes": "ED59",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The value of E is written to port C.",
            "instruction": "out (c),e"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "h"
          ],
          "opcode": [
            237,
            97
          ],
          "clr": {
            "opcodes": "ED61",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The value of H is written to port C.",
            "instruction": "out (c),h"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "l"
          ],
          "opcode": [
            237,
            105
          ],
          "clr": {
            "opcodes": "ED69",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The value of L is written to port C.",
            "instruction": "out (c),l"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "0"
          ],
          "opcode": [
            237,
            113
          ],
          "clr": {
            "opcodes": "ED71",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Outputs a zero to port C.",
            "instruction": "out (c),0"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")",
            ",",
            "a"
          ],
          "opcode": [
            237,
            121
          ],
          "clr": {
            "opcodes": "ED79",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "The value of A is written to port C.",
            "instruction": "out (c),a"
          }
        }
      ]
    },
    "exx": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            217
          ],
          "clr": {
            "opcodes": "D9",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Exchanges the 16-bit contents of BC, DE, and HL with BC', DE', and HL'.",
            "instruction": "exx"
          }
        }
      ]
    },
    "in": {
      "variants": [
        {
          "tokens": [
            "a",
            ",",
            "(",
            "nn",
            ")"
          ],
          "opcode": [
            219,
            "nn"
          ],
          "clr": {
            "opcodes": "DB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "a byte from port * is written to A.",
            "instruction": "in a,(*)"
          }
        },
        {
          "tokens": [
            "(",
            "nn",
            ")"
          ],
          "opcode": [
            219,
            "nn"
          ],
          "clr": {
            "opcodes": "DB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 11,
            "without_jump_clock_count": 11,
            "description": "a byte from port * is written to A.",
            "instruction": "in a,(*)"
          }
        },
        {
          "tokens": [
            "b",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            64
          ],
          "clr": {
            "opcodes": "ED40",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to B.",
            "instruction": "in b,(c)"
          }
        },
        {
          "tokens": [
            "c",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            72
          ],
          "clr": {
            "opcodes": "ED48",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to C.",
            "instruction": "in c,(c)"
          }
        },
        {
          "tokens": [
            "d",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            80
          ],
          "clr": {
            "opcodes": "ED50",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to C.",
            "instruction": "in d,(c)"
          }
        },
        {
          "tokens": [
            "e",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            88
          ],
          "clr": {
            "opcodes": "ED58",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to E.",
            "instruction": "in e,(c)"
          }
        },
        {
          "tokens": [
            "h",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            96
          ],
          "clr": {
            "opcodes": "ED60",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to H.",
            "instruction": "in h,(c)"
          }
        },
        {
          "tokens": [
            "l",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            104
          ],
          "clr": {
            "opcodes": "ED68",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to L.",
            "instruction": "in l,(c)"
          }
        },
        {
          "tokens": [
            "f",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            112
          ],
          "clr": {
            "opcodes": "ED70",
            "undocumented": true,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "Inputs a byte from port C and affects flags only.",
            "instruction": "in (c)"
          }
        },
        {
          "tokens": [
            "a",
            ",",
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            120
          ],
          "clr": {
            "opcodes": "ED78",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to A.",
            "instruction": "in a,(c)"
          }
        },
        {
          "tokens": [
            "(",
            "c",
            ")"
          ],
          "opcode": [
            237,
            120
          ],
          "clr": {
            "opcodes": "ED78",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 12,
            "without_jump_clock_count": 12,
            "description": "a byte from port C is written to A.",
            "instruction": "in a,(c)"
          }
        }
      ]
    },
    "neg": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            124
          ],
          "clr": {
            "opcodes": "ED7C",
            "undocumented": true,
            "flags": "++V+++",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "The contents of A are negated (two's complement). Operation is the same as subtracting A from zero.",
            "instruction": "neg"
          }
        }
      ]
    },
    "retn": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            125
          ],
          "clr": {
            "opcodes": "ED7D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 14,
            "without_jump_clock_count": 14,
            "description": "Used at the end of a non-maskable interrupt service routine (located at $0066) to pop the top stack entry into PC. The value of IFF2 is copied to IFF1 so that maskable interrupts are allowed to continue as before. NMIs are not enabled on the TI.",
            "instruction": "retn"
          }
        }
      ]
    },
    "im": {
      "variants": [
        {
          "tokens": [
            "0"
          ],
          "opcode": [
            237,
            110
          ],
          "clr": {
            "opcodes": "ED6E",
            "undocumented": true,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets undefined interrupt mode 0/1.",
            "instruction": "im 0/1"
          }
        },
        {
          "tokens": [
            "1"
          ],
          "opcode": [
            237,
            118
          ],
          "clr": {
            "opcodes": "ED76",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets interrupt mode 1.",
            "instruction": "im 1"
          }
        },
        {
          "tokens": [
            "2"
          ],
          "opcode": [
            237,
            126
          ],
          "clr": {
            "opcodes": "ED7E",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 8,
            "without_jump_clock_count": 8,
            "description": "Sets interrupt mode 2.",
            "instruction": "im 2"
          }
        }
      ]
    },
    "reti": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            77
          ],
          "clr": {
            "opcodes": "ED4D",
            "undocumented": false,
            "flags": "------",
            "byte_count": 2,
            "with_jump_clock_count": 14,
            "without_jump_clock_count": 14,
            "description": "Used at the end of A maskable interrupt service routine. The top stack entry is popped into PC, and signals an I/O device that the interrupt has finished, allowing nested interrupts (not A consideration on the TI).",
            "instruction": "reti"
          }
        }
      ]
    },
    "rrd": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            103
          ],
          "clr": {
            "opcodes": "ED67",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 18,
            "without_jump_clock_count": 18,
            "description": "The contents of the low-order nibble of (HL) are copied to the low-order nibble of A. The previous contents are copied to the high-order nibble of (HL). The previous contents are copied to the low-order nibble of (HL).",
            "instruction": "rrd"
          }
        }
      ]
    },
    "rld": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            111
          ],
          "clr": {
            "opcodes": "ED6F",
            "undocumented": false,
            "flags": "-0P0++",
            "byte_count": 2,
            "with_jump_clock_count": 18,
            "without_jump_clock_count": 18,
            "description": "The contents of the low-order nibble of (HL) are copied to the high-order nibble of (HL). The previous contents are copied to the low-order nibble of A. The previous contents are copied to the low-order nibble of (HL).",
            "instruction": "rld"
          }
        }
      ]
    },
    "ldi": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            160
          ],
          "clr": {
            "opcodes": "EDA0",
            "undocumented": false,
            "flags": "-0*0--",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "Transfers a byte of data from the memory location pointed to by HL to the memory location pointed to by DE. Then HL and DE are incremented and BC is decremented.",
            "instruction": "ldi"
          }
        }
      ]
    },
    "cpi": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            161
          ],
          "clr": {
            "opcodes": "EDA1",
            "undocumented": false,
            "flags": "-1*+++",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "Compares the value of the memory location pointed to by HL with A. Then HL is incremented and BC is decremented.",
            "instruction": "cpi"
          }
        }
      ]
    },
    "ini": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            162
          ],
          "clr": {
            "opcodes": "EDA2",
            "undocumented": false,
            "flags": "-1  * ",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "a byte from port C is written to the memory location pointed to by HL. Then HL is incremented and B is decremented.",
            "instruction": "ini"
          }
        }
      ]
    },
    "outi": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            163
          ],
          "clr": {
            "opcodes": "EDA3",
            "undocumented": false,
            "flags": "-1  * ",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "a byte from the memory location pointed to by HL is written to port C. Then HL is incremented and B is decremented.",
            "instruction": "outi"
          }
        }
      ]
    },
    "ldd": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            168
          ],
          "clr": {
            "opcodes": "EDA8",
            "undocumented": false,
            "flags": "-0*0--",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "Transfers a byte of data from the memory location pointed to by HL to the memory location pointed to by DE. Then HL, DE, and BC are decremented.",
            "instruction": "ldd"
          }
        }
      ]
    },
    "cpd": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            169
          ],
          "clr": {
            "opcodes": "EDA9",
            "undocumented": false,
            "flags": "-1*+++",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "Compares the value of the memory location pointed to by HL with A. Then HL and BC are decremented.",
            "instruction": "cpd"
          }
        }
      ]
    },
    "ind": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            170
          ],
          "clr": {
            "opcodes": "EDAA",
            "undocumented": false,
            "flags": "-1  * ",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "a byte from port C is written to the memory location pointed to by HL. Then HL and B are decremented.",
            "instruction": "ind"
          }
        }
      ]
    },
    "outd": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            171
          ],
          "clr": {
            "opcodes": "EDAB",
            "undocumented": false,
            "flags": "-1  * ",
            "byte_count": 2,
            "with_jump_clock_count": 16,
            "without_jump_clock_count": 16,
            "description": "a byte from the memory location pointed to by HL is written to port C. Then HL and B are decremented.",
            "instruction": "outd"
          }
        }
      ]
    },
    "ldir": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            176
          ],
          "clr": {
            "opcodes": "EDB0",
            "undocumented": false,
            "flags": "-000--",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "Transfers a byte of data from the memory location pointed to by HL to the memory location pointed to by DE. Then HL and DE are incremented and BC is decremented. If BC is not zero, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "ldir"
          }
        }
      ]
    },
    "cpir": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            177
          ],
          "clr": {
            "opcodes": "EDB1",
            "undocumented": false,
            "flags": "-10+++",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "Compares the value of the memory location pointed to by HL with A. Then HL is incremented and BC is decremented. If BC is not zero and Z is not set, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "cpir"
          }
        }
      ]
    },
    "inir": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            178
          ],
          "clr": {
            "opcodes": "EDB2",
            "undocumented": false,
            "flags": "-1  1 ",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "a byte from port C is written to the memory location pointed to by HL. Then HL is incremented and B is decremented. If B is not zero, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "inir"
          }
        }
      ]
    },
    "otir": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            179
          ],
          "clr": {
            "opcodes": "EDB3",
            "undocumented": false,
            "flags": "-1  1 ",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "a byte from the memory location pointed to by HL is written to port C. Then HL is incremented and B is decremented. If B is not zero, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "otir"
          }
        }
      ]
    },
    "lddr": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            184
          ],
          "clr": {
            "opcodes": "EDB8",
            "undocumented": false,
            "flags": "-000--",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "Transfers a byte of data from the memory location pointed to by HL to the memory location pointed to by DE. Then HL, DE, and BC are decremented. If BC is not zero, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "lddr"
          }
        }
      ]
    },
    "cpdr": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            185
          ],
          "clr": {
            "opcodes": "EDB9",
            "undocumented": false,
            "flags": "-10+++",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "Compares the value of the memory location pointed to by HL with A. Then HL and BC are decremented. If BC is not zero and Z is not set, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "cpdr"
          }
        }
      ]
    },
    "indr": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            186
          ],
          "clr": {
            "opcodes": "EDBA",
            "undocumented": false,
            "flags": "-1  1 ",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "a byte from port C is written to the memory location pointed to by HL. Then HL and B are decremented. If B is not zero, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "indr"
          }
        }
      ]
    },
    "otdr": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            237,
            187
          ],
          "clr": {
            "opcodes": "EDBB",
            "undocumented": false,
            "flags": "-1  1 ",
            "byte_count": 2,
            "with_jump_clock_count": 21,
            "without_jump_clock_count": 16,
            "description": "a byte from the memory location pointed to by HL is written to port C. Then HL and B are decremented. If B is not zero, this operation is repeated. Interrupts can trigger while this instruction is processing.",
            "instruction": "otdr"
          }
        }
      ]
    },
    "di": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            243
          ],
          "clr": {
            "opcodes": "F3",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Resets both interrupt flip-flops, thus prenting maskable interrupts from triggering.",
            "instruction": "di"
          }
        }
      ]
    },
    "ei": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            251
          ],
          "clr": {
            "opcodes": "FB",
            "undocumented": false,
            "flags": "------",
            "byte_count": 1,
            "with_jump_clock_count": 4,
            "without_jump_clock_count": 4,
            "description": "Sets both interrupt flip-flops, thus allowing maskable interrupts to occur. An interrupt will not occur until after the immediatedly following instruction.",
            "instruction": "ei"
          }
        }
      ]
    }
  }
};

export default opcodes;
