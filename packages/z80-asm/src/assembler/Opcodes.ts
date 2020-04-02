export default {
  "mnemonics": {
    "nop": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            0
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "bc",
            ")"
          ],
          "opcode": [
            10
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "de",
            ")"
          ],
          "opcode": [
            26
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            62,
            "nn"
          ]
        },
        {
          "tokens": [
            "b",
            ",",
            "b"
          ],
          "opcode": [
            64
          ]
        },
        {
          "tokens": [
            "b",
            ",",
            "c"
          ],
          "opcode": [
            65
          ]
        },
        {
          "tokens": [
            "b",
            ",",
            "d"
          ],
          "opcode": [
            66
          ]
        },
        {
          "tokens": [
            "b",
            ",",
            "e"
          ],
          "opcode": [
            67
          ]
        },
        {
          "tokens": [
            "b",
            ",",
            "h"
          ],
          "opcode": [
            68
          ]
        },
        {
          "tokens": [
            "b",
            ",",
            "l"
          ],
          "opcode": [
            69
          ]
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
          ]
        },
        {
          "tokens": [
            "b",
            ",",
            "a"
          ],
          "opcode": [
            71
          ]
        },
        {
          "tokens": [
            "c",
            ",",
            "b"
          ],
          "opcode": [
            72
          ]
        },
        {
          "tokens": [
            "c",
            ",",
            "c"
          ],
          "opcode": [
            73
          ]
        },
        {
          "tokens": [
            "c",
            ",",
            "d"
          ],
          "opcode": [
            74
          ]
        },
        {
          "tokens": [
            "c",
            ",",
            "e"
          ],
          "opcode": [
            75
          ]
        },
        {
          "tokens": [
            "c",
            ",",
            "h"
          ],
          "opcode": [
            76
          ]
        },
        {
          "tokens": [
            "c",
            ",",
            "l"
          ],
          "opcode": [
            77
          ]
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
          ]
        },
        {
          "tokens": [
            "c",
            ",",
            "a"
          ],
          "opcode": [
            79
          ]
        },
        {
          "tokens": [
            "d",
            ",",
            "b"
          ],
          "opcode": [
            80
          ]
        },
        {
          "tokens": [
            "d",
            ",",
            "c"
          ],
          "opcode": [
            81
          ]
        },
        {
          "tokens": [
            "d",
            ",",
            "d"
          ],
          "opcode": [
            82
          ]
        },
        {
          "tokens": [
            "d",
            ",",
            "e"
          ],
          "opcode": [
            83
          ]
        },
        {
          "tokens": [
            "d",
            ",",
            "h"
          ],
          "opcode": [
            84
          ]
        },
        {
          "tokens": [
            "d",
            ",",
            "l"
          ],
          "opcode": [
            85
          ]
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
          ]
        },
        {
          "tokens": [
            "d",
            ",",
            "a"
          ],
          "opcode": [
            87
          ]
        },
        {
          "tokens": [
            "e",
            ",",
            "b"
          ],
          "opcode": [
            88
          ]
        },
        {
          "tokens": [
            "e",
            ",",
            "c"
          ],
          "opcode": [
            89
          ]
        },
        {
          "tokens": [
            "e",
            ",",
            "d"
          ],
          "opcode": [
            90
          ]
        },
        {
          "tokens": [
            "e",
            ",",
            "e"
          ],
          "opcode": [
            91
          ]
        },
        {
          "tokens": [
            "e",
            ",",
            "h"
          ],
          "opcode": [
            92
          ]
        },
        {
          "tokens": [
            "e",
            ",",
            "l"
          ],
          "opcode": [
            93
          ]
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
          ]
        },
        {
          "tokens": [
            "e",
            ",",
            "a"
          ],
          "opcode": [
            95
          ]
        },
        {
          "tokens": [
            "h",
            ",",
            "b"
          ],
          "opcode": [
            96
          ]
        },
        {
          "tokens": [
            "h",
            ",",
            "c"
          ],
          "opcode": [
            97
          ]
        },
        {
          "tokens": [
            "h",
            ",",
            "d"
          ],
          "opcode": [
            98
          ]
        },
        {
          "tokens": [
            "h",
            ",",
            "e"
          ],
          "opcode": [
            99
          ]
        },
        {
          "tokens": [
            "h",
            ",",
            "h"
          ],
          "opcode": [
            100
          ]
        },
        {
          "tokens": [
            "h",
            ",",
            "l"
          ],
          "opcode": [
            101
          ]
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
          ]
        },
        {
          "tokens": [
            "h",
            ",",
            "a"
          ],
          "opcode": [
            103
          ]
        },
        {
          "tokens": [
            "l",
            ",",
            "b"
          ],
          "opcode": [
            104
          ]
        },
        {
          "tokens": [
            "l",
            ",",
            "c"
          ],
          "opcode": [
            105
          ]
        },
        {
          "tokens": [
            "l",
            ",",
            "d"
          ],
          "opcode": [
            106
          ]
        },
        {
          "tokens": [
            "l",
            ",",
            "e"
          ],
          "opcode": [
            107
          ]
        },
        {
          "tokens": [
            "l",
            ",",
            "h"
          ],
          "opcode": [
            108
          ]
        },
        {
          "tokens": [
            "l",
            ",",
            "l"
          ],
          "opcode": [
            109
          ]
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
          ]
        },
        {
          "tokens": [
            "l",
            ",",
            "a"
          ],
          "opcode": [
            111
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            120
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            120
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            121
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            121
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            122
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            122
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            123
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            123
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            124
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            124
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            125
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            125
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            126
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            127
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            127
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            124
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            125
          ]
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
          ]
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
          ]
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
            0,
            "dd"
          ]
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
            1,
            "dd"
          ]
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
            2,
            "dd"
          ]
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
            3,
            "dd"
          ]
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
            4,
            "dd"
          ]
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
            5,
            "dd"
          ]
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
            7,
            "dd"
          ]
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
            7,
            "dd"
          ]
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
            8,
            "dd"
          ]
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
            9,
            "dd"
          ]
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
            10,
            "dd"
          ]
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
            11,
            "dd"
          ]
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
            12,
            "dd"
          ]
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
            13,
            "dd"
          ]
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
            15,
            "dd"
          ]
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
            15,
            "dd"
          ]
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
            16,
            "dd"
          ]
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
            17,
            "dd"
          ]
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
            18,
            "dd"
          ]
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
            19,
            "dd"
          ]
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
            20,
            "dd"
          ]
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
            21,
            "dd"
          ]
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
            23,
            "dd"
          ]
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
            23,
            "dd"
          ]
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
            24,
            "dd"
          ]
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
            25,
            "dd"
          ]
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
            26,
            "dd"
          ]
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
            27,
            "dd"
          ]
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
            28,
            "dd"
          ]
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
            29,
            "dd"
          ]
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
            31,
            "dd"
          ]
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
            31,
            "dd"
          ]
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
            32,
            "dd"
          ]
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
            33,
            "dd"
          ]
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
            34,
            "dd"
          ]
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
            35,
            "dd"
          ]
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
            36,
            "dd"
          ]
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
            37,
            "dd"
          ]
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
            39,
            "dd"
          ]
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
            39,
            "dd"
          ]
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
            40,
            "dd"
          ]
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
            41,
            "dd"
          ]
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
            42,
            "dd"
          ]
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
            43,
            "dd"
          ]
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
            44,
            "dd"
          ]
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
            45,
            "dd"
          ]
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
            47,
            "dd"
          ]
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
            47,
            "dd"
          ]
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
            48,
            "dd"
          ]
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
            49,
            "dd"
          ]
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
            50,
            "dd"
          ]
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
            51,
            "dd"
          ]
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
            52,
            "dd"
          ]
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
            53,
            "dd"
          ]
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
            55,
            "dd"
          ]
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
            55,
            "dd"
          ]
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
            56,
            "dd"
          ]
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
            57,
            "dd"
          ]
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
            58,
            "dd"
          ]
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
            59,
            "dd"
          ]
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
            60,
            "dd"
          ]
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
            61,
            "dd"
          ]
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
            63,
            "dd"
          ]
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
            63,
            "dd"
          ]
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
            128,
            "dd"
          ]
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
            129,
            "dd"
          ]
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
            130,
            "dd"
          ]
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
            131,
            "dd"
          ]
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
            132,
            "dd"
          ]
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
            133,
            "dd"
          ]
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
            135,
            "dd"
          ]
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
            135,
            "dd"
          ]
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
            136,
            "dd"
          ]
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
            137,
            "dd"
          ]
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
            138,
            "dd"
          ]
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
            139,
            "dd"
          ]
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
            140,
            "dd"
          ]
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
            141,
            "dd"
          ]
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
            143,
            "dd"
          ]
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
            143,
            "dd"
          ]
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
            144,
            "dd"
          ]
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
            145,
            "dd"
          ]
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
            146,
            "dd"
          ]
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
            147,
            "dd"
          ]
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
            148,
            "dd"
          ]
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
            149,
            "dd"
          ]
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
            151,
            "dd"
          ]
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
            151,
            "dd"
          ]
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
            152,
            "dd"
          ]
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
            153,
            "dd"
          ]
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
            154,
            "dd"
          ]
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
            155,
            "dd"
          ]
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
            156,
            "dd"
          ]
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
            157,
            "dd"
          ]
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
            159,
            "dd"
          ]
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
            159,
            "dd"
          ]
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
            160,
            "dd"
          ]
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
            161,
            "dd"
          ]
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
            162,
            "dd"
          ]
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
            163,
            "dd"
          ]
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
            164,
            "dd"
          ]
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
            165,
            "dd"
          ]
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
            167,
            "dd"
          ]
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
            167,
            "dd"
          ]
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
            168,
            "dd"
          ]
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
            169,
            "dd"
          ]
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
            170,
            "dd"
          ]
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
            171,
            "dd"
          ]
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
            172,
            "dd"
          ]
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
            173,
            "dd"
          ]
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
            175,
            "dd"
          ]
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
            175,
            "dd"
          ]
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
            176,
            "dd"
          ]
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
            177,
            "dd"
          ]
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
            178,
            "dd"
          ]
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
            179,
            "dd"
          ]
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
            180,
            "dd"
          ]
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
            181,
            "dd"
          ]
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
            183,
            "dd"
          ]
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
            183,
            "dd"
          ]
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
            184,
            "dd"
          ]
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
            185,
            "dd"
          ]
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
            186,
            "dd"
          ]
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
            187,
            "dd"
          ]
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
            188,
            "dd"
          ]
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
            189,
            "dd"
          ]
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
            191,
            "dd"
          ]
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
            191,
            "dd"
          ]
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
            192,
            "dd"
          ]
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
            193,
            "dd"
          ]
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
            194,
            "dd"
          ]
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
            195,
            "dd"
          ]
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
            196,
            "dd"
          ]
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
            197,
            "dd"
          ]
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
            199,
            "dd"
          ]
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
            199,
            "dd"
          ]
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
            200,
            "dd"
          ]
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
            201,
            "dd"
          ]
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
            202,
            "dd"
          ]
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
            203,
            "dd"
          ]
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
            204,
            "dd"
          ]
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
            205,
            "dd"
          ]
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
            207,
            "dd"
          ]
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
            207,
            "dd"
          ]
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
            208,
            "dd"
          ]
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
            209,
            "dd"
          ]
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
            210,
            "dd"
          ]
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
            211,
            "dd"
          ]
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
            212,
            "dd"
          ]
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
            213,
            "dd"
          ]
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
            215,
            "dd"
          ]
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
            215,
            "dd"
          ]
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
            216,
            "dd"
          ]
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
            217,
            "dd"
          ]
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
            218,
            "dd"
          ]
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
            219,
            "dd"
          ]
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
            220,
            "dd"
          ]
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
            221,
            "dd"
          ]
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
            223,
            "dd"
          ]
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
            223,
            "dd"
          ]
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
            224,
            "dd"
          ]
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
            225,
            "dd"
          ]
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
            226,
            "dd"
          ]
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
            227,
            "dd"
          ]
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
            228,
            "dd"
          ]
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
            229,
            "dd"
          ]
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
            231,
            "dd"
          ]
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
            231,
            "dd"
          ]
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
            232,
            "dd"
          ]
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
            233,
            "dd"
          ]
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
            234,
            "dd"
          ]
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
            235,
            "dd"
          ]
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
            236,
            "dd"
          ]
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
            237,
            "dd"
          ]
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
            239,
            "dd"
          ]
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
            239,
            "dd"
          ]
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
            240,
            "dd"
          ]
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
            241,
            "dd"
          ]
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
            242,
            "dd"
          ]
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
            243,
            "dd"
          ]
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
            244,
            "dd"
          ]
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
            245,
            "dd"
          ]
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
            247,
            "dd"
          ]
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
            247,
            "dd"
          ]
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
            248,
            "dd"
          ]
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
            249,
            "dd"
          ]
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
            250,
            "dd"
          ]
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
            251,
            "dd"
          ]
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
            252,
            "dd"
          ]
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
            253,
            "dd"
          ]
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
            255,
            "dd"
          ]
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
            255,
            "dd"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "i"
          ],
          "opcode": [
            237,
            87
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "r"
          ],
          "opcode": [
            237,
            95
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "sp",
            ",",
            "hl"
          ],
          "opcode": [
            249
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            124
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            125
          ]
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
          ]
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
          ]
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
            0,
            "dd"
          ]
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
            1,
            "dd"
          ]
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
            2,
            "dd"
          ]
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
            3,
            "dd"
          ]
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
            4,
            "dd"
          ]
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
            5,
            "dd"
          ]
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
            7,
            "dd"
          ]
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
            7,
            "dd"
          ]
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
            8,
            "dd"
          ]
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
            9,
            "dd"
          ]
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
            10,
            "dd"
          ]
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
            11,
            "dd"
          ]
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
            12,
            "dd"
          ]
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
            13,
            "dd"
          ]
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
            15,
            "dd"
          ]
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
            15,
            "dd"
          ]
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
            16,
            "dd"
          ]
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
            17,
            "dd"
          ]
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
            18,
            "dd"
          ]
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
            19,
            "dd"
          ]
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
            20,
            "dd"
          ]
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
            21,
            "dd"
          ]
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
            23,
            "dd"
          ]
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
            23,
            "dd"
          ]
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
            24,
            "dd"
          ]
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
            25,
            "dd"
          ]
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
            26,
            "dd"
          ]
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
            27,
            "dd"
          ]
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
            28,
            "dd"
          ]
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
            29,
            "dd"
          ]
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
            31,
            "dd"
          ]
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
            31,
            "dd"
          ]
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
            32,
            "dd"
          ]
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
            33,
            "dd"
          ]
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
            34,
            "dd"
          ]
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
            35,
            "dd"
          ]
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
            36,
            "dd"
          ]
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
            37,
            "dd"
          ]
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
            39,
            "dd"
          ]
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
            39,
            "dd"
          ]
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
            40,
            "dd"
          ]
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
            41,
            "dd"
          ]
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
            42,
            "dd"
          ]
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
            43,
            "dd"
          ]
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
            44,
            "dd"
          ]
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
            45,
            "dd"
          ]
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
            47,
            "dd"
          ]
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
            47,
            "dd"
          ]
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
            48,
            "dd"
          ]
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
            49,
            "dd"
          ]
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
            50,
            "dd"
          ]
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
            51,
            "dd"
          ]
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
            52,
            "dd"
          ]
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
            53,
            "dd"
          ]
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
            55,
            "dd"
          ]
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
            55,
            "dd"
          ]
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
            56,
            "dd"
          ]
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
            57,
            "dd"
          ]
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
            58,
            "dd"
          ]
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
            59,
            "dd"
          ]
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
            60,
            "dd"
          ]
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
            61,
            "dd"
          ]
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
            63,
            "dd"
          ]
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
            63,
            "dd"
          ]
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
            128,
            "dd"
          ]
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
            129,
            "dd"
          ]
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
            130,
            "dd"
          ]
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
            131,
            "dd"
          ]
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
            132,
            "dd"
          ]
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
            133,
            "dd"
          ]
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
            135,
            "dd"
          ]
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
            135,
            "dd"
          ]
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
            136,
            "dd"
          ]
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
            137,
            "dd"
          ]
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
            138,
            "dd"
          ]
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
            139,
            "dd"
          ]
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
            140,
            "dd"
          ]
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
            141,
            "dd"
          ]
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
            143,
            "dd"
          ]
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
            143,
            "dd"
          ]
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
            144,
            "dd"
          ]
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
            145,
            "dd"
          ]
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
            146,
            "dd"
          ]
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
            147,
            "dd"
          ]
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
            148,
            "dd"
          ]
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
            149,
            "dd"
          ]
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
            151,
            "dd"
          ]
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
            151,
            "dd"
          ]
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
            152,
            "dd"
          ]
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
            153,
            "dd"
          ]
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
            154,
            "dd"
          ]
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
            155,
            "dd"
          ]
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
            156,
            "dd"
          ]
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
            157,
            "dd"
          ]
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
            159,
            "dd"
          ]
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
            159,
            "dd"
          ]
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
            160,
            "dd"
          ]
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
            161,
            "dd"
          ]
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
            162,
            "dd"
          ]
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
            163,
            "dd"
          ]
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
            164,
            "dd"
          ]
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
            165,
            "dd"
          ]
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
            167,
            "dd"
          ]
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
            167,
            "dd"
          ]
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
            168,
            "dd"
          ]
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
            169,
            "dd"
          ]
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
            170,
            "dd"
          ]
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
            171,
            "dd"
          ]
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
            172,
            "dd"
          ]
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
            173,
            "dd"
          ]
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
            175,
            "dd"
          ]
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
            175,
            "dd"
          ]
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
            176,
            "dd"
          ]
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
            177,
            "dd"
          ]
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
            178,
            "dd"
          ]
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
            179,
            "dd"
          ]
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
            180,
            "dd"
          ]
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
            181,
            "dd"
          ]
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
            183,
            "dd"
          ]
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
            183,
            "dd"
          ]
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
            184,
            "dd"
          ]
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
            185,
            "dd"
          ]
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
            186,
            "dd"
          ]
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
            187,
            "dd"
          ]
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
            188,
            "dd"
          ]
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
            189,
            "dd"
          ]
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
            191,
            "dd"
          ]
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
            191,
            "dd"
          ]
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
            192,
            "dd"
          ]
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
            193,
            "dd"
          ]
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
            194,
            "dd"
          ]
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
            195,
            "dd"
          ]
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
            196,
            "dd"
          ]
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
            197,
            "dd"
          ]
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
            199,
            "dd"
          ]
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
            199,
            "dd"
          ]
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
            200,
            "dd"
          ]
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
            201,
            "dd"
          ]
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
            202,
            "dd"
          ]
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
            203,
            "dd"
          ]
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
            204,
            "dd"
          ]
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
            205,
            "dd"
          ]
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
            207,
            "dd"
          ]
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
            207,
            "dd"
          ]
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
            208,
            "dd"
          ]
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
            209,
            "dd"
          ]
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
            210,
            "dd"
          ]
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
            211,
            "dd"
          ]
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
            212,
            "dd"
          ]
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
            213,
            "dd"
          ]
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
            215,
            "dd"
          ]
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
            215,
            "dd"
          ]
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
            216,
            "dd"
          ]
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
            217,
            "dd"
          ]
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
            218,
            "dd"
          ]
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
            219,
            "dd"
          ]
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
            220,
            "dd"
          ]
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
            221,
            "dd"
          ]
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
            223,
            "dd"
          ]
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
            223,
            "dd"
          ]
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
            224,
            "dd"
          ]
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
            225,
            "dd"
          ]
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
            226,
            "dd"
          ]
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
            227,
            "dd"
          ]
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
            228,
            "dd"
          ]
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
            229,
            "dd"
          ]
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
            231,
            "dd"
          ]
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
            231,
            "dd"
          ]
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
            232,
            "dd"
          ]
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
            233,
            "dd"
          ]
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
            234,
            "dd"
          ]
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
            235,
            "dd"
          ]
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
            236,
            "dd"
          ]
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
            237,
            "dd"
          ]
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
            239,
            "dd"
          ]
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
            239,
            "dd"
          ]
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
            240,
            "dd"
          ]
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
            241,
            "dd"
          ]
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
            242,
            "dd"
          ]
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
            243,
            "dd"
          ]
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
            244,
            "dd"
          ]
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
            245,
            "dd"
          ]
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
            247,
            "dd"
          ]
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
            247,
            "dd"
          ]
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
            248,
            "dd"
          ]
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
            249,
            "dd"
          ]
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
            250,
            "dd"
          ]
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
            251,
            "dd"
          ]
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
            252,
            "dd"
          ]
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
            253,
            "dd"
          ]
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
            255,
            "dd"
          ]
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
            255,
            "dd"
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            4
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            12
          ]
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            19
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            20
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            28
          ]
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            35
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            36
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            44
          ]
        },
        {
          "tokens": [
            "sp"
          ],
          "opcode": [
            51
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            52
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            60
          ]
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            35
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            36
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            44
          ]
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
          ]
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            35
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            36
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            44
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "bc"
          ],
          "opcode": [
            11
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            13
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            21
          ]
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            27
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            29
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            37
          ]
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            43
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            45
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            53
          ]
        },
        {
          "tokens": [
            "sp"
          ],
          "opcode": [
            59
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            61
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            37
          ]
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            43
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            45
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            37
          ]
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            43
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            45
          ]
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
          ]
        }
      ]
    },
    "rlca": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            7
          ]
        }
      ]
    },
    "ex": {
      "variants": [
        {
          "tokens": [
            "af",
            ",",
            "af"
          ],
          "opcode": [
            8
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "de",
            ",",
            "hl"
          ],
          "opcode": [
            235
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "hl",
            ",",
            "de"
          ],
          "opcode": [
            25
          ]
        },
        {
          "tokens": [
            "hl",
            ",",
            "hl"
          ],
          "opcode": [
            41
          ]
        },
        {
          "tokens": [
            "hl",
            ",",
            "sp"
          ],
          "opcode": [
            57
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "b"
          ],
          "opcode": [
            128
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            128
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            129
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            129
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            130
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            130
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            131
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            131
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            132
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            132
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            133
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            133
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            134
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            135
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            135
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            198,
            "nn"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            132
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            133
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            132
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            133
          ]
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
          ]
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
          ]
        }
      ]
    },
    "rrca": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            15
          ]
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
          ]
        }
      ]
    },
    "rla": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            23
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        }
      ]
    },
    "rra": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            31
          ]
        }
      ]
    },
    "daa": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            39
          ]
        }
      ]
    },
    "cpl": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            47
          ]
        }
      ]
    },
    "scf": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            55
          ]
        }
      ]
    },
    "ccf": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            63
          ]
        }
      ]
    },
    "halt": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            118
          ]
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
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            136
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            137
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            137
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            138
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            138
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            139
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            139
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            140
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            140
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            141
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            141
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            142
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            143
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            143
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            206,
            "nn"
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            140
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            141
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            140
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            141
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            144
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            145
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            145
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            146
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            146
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            147
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            147
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            148
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            148
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            149
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            149
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            150
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            151
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            151
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            214,
            "nn"
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            148
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            149
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            148
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            149
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            152
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            153
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            153
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            154
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            154
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            155
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            155
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            156
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            156
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            157
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            157
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            158
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            159
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            159
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            156
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            157
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            222,
            "nn"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            156
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            157
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            160
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            161
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            161
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            162
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            162
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            163
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            163
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            164
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            164
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            165
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            165
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            166
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            167
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            167
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            164
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            165
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            230,
            "nn"
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            164
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            165
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            168
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            169
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            169
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            170
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            170
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            171
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            171
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            172
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            172
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            173
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            173
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            174
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            175
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            175
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            172
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            173
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            238,
            "nn"
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            172
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            173
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "b"
          ],
          "opcode": [
            176
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "c"
          ],
          "opcode": [
            177
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            177
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "d"
          ],
          "opcode": [
            178
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            178
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "e"
          ],
          "opcode": [
            179
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            179
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "h"
          ],
          "opcode": [
            180
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            180
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "l"
          ],
          "opcode": [
            181
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            181
          ]
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
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            182
          ]
        },
        {
          "tokens": [
            "a",
            ",",
            "a"
          ],
          "opcode": [
            183
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            183
          ]
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
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            180
          ]
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
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            181
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            246,
            "nn"
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            180
          ]
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
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            181
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            185
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            186
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            187
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            188
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            189
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            190
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            191
          ]
        },
        {
          "tokens": [
            "ixh"
          ],
          "opcode": [
            221,
            188
          ]
        },
        {
          "tokens": [
            "ixl"
          ],
          "opcode": [
            221,
            189
          ]
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
          ]
        },
        {
          "tokens": [
            "iyh"
          ],
          "opcode": [
            253,
            188
          ]
        },
        {
          "tokens": [
            "iyl"
          ],
          "opcode": [
            253,
            189
          ]
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
          ]
        },
        {
          "tokens": [
            "nn"
          ],
          "opcode": [
            254,
            "nn"
          ]
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
          ]
        },
        {
          "tokens": [
            "z"
          ],
          "opcode": [
            200
          ]
        },
        {
          "tokens": [],
          "opcode": [
            201
          ]
        },
        {
          "tokens": [
            "nc"
          ],
          "opcode": [
            208
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            216
          ]
        },
        {
          "tokens": [
            "po"
          ],
          "opcode": [
            224
          ]
        },
        {
          "tokens": [
            "pe"
          ],
          "opcode": [
            232
          ]
        },
        {
          "tokens": [
            "p"
          ],
          "opcode": [
            240
          ]
        },
        {
          "tokens": [
            "m"
          ],
          "opcode": [
            248
          ]
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
          ]
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            209
          ]
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            225
          ]
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            225
          ]
        },
        {
          "tokens": [
            "af"
          ],
          "opcode": [
            241
          ]
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            225
          ]
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
          ]
        },
        {
          "tokens": [
            "nnnn"
          ],
          "opcode": [
            195,
            "nnnn"
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            233
          ]
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
          ]
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            233
          ]
        },
        {
          "tokens": [
            "(",
            "hl",
            ")"
          ],
          "opcode": [
            233
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            233
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "nnnn"
          ],
          "opcode": [
            205,
            "nnnn"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "de"
          ],
          "opcode": [
            213
          ]
        },
        {
          "tokens": [
            "ix"
          ],
          "opcode": [
            221,
            229
          ]
        },
        {
          "tokens": [
            "hl"
          ],
          "opcode": [
            229
          ]
        },
        {
          "tokens": [
            "af"
          ],
          "opcode": [
            245
          ]
        },
        {
          "tokens": [
            "iy"
          ],
          "opcode": [
            253,
            229
          ]
        }
      ]
    },
    "rst": {
      "variants": [
        {
          "tokens": [
            "00"
          ],
          "opcode": [
            199
          ]
        },
        {
          "tokens": [
            "8"
          ],
          "opcode": [
            207
          ]
        },
        {
          "tokens": [
            "10"
          ],
          "opcode": [
            215
          ]
        },
        {
          "tokens": [
            "18"
          ],
          "opcode": [
            223
          ]
        },
        {
          "tokens": [
            "20"
          ],
          "opcode": [
            231
          ]
        },
        {
          "tokens": [
            "28"
          ],
          "opcode": [
            239
          ]
        },
        {
          "tokens": [
            "30"
          ],
          "opcode": [
            247
          ]
        },
        {
          "tokens": [
            "38"
          ],
          "opcode": [
            255
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            1
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            2
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            3
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            4
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            5
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            7
          ]
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
            6,
            "dd"
          ]
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
            6,
            "dd"
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            9
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            10
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            11
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            12
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            13
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            15
          ]
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
            14,
            "dd"
          ]
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
            14,
            "dd"
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            17
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            18
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            19
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            20
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            21
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            23
          ]
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
            22,
            "dd"
          ]
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
            22,
            "dd"
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            25
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            26
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            27
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            28
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            29
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            31
          ]
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
            30,
            "dd"
          ]
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
            30,
            "dd"
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            33
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            34
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            35
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            36
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            37
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            39
          ]
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
            38,
            "dd"
          ]
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
            38,
            "dd"
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            41
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            42
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            43
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            44
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            45
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            47
          ]
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
            46,
            "dd"
          ]
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
            46,
            "dd"
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            49
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            50
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            51
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            52
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            53
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            55
          ]
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
            54,
            "dd"
          ]
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
            54,
            "dd"
          ]
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
          ]
        },
        {
          "tokens": [
            "c"
          ],
          "opcode": [
            203,
            57
          ]
        },
        {
          "tokens": [
            "d"
          ],
          "opcode": [
            203,
            58
          ]
        },
        {
          "tokens": [
            "e"
          ],
          "opcode": [
            203,
            59
          ]
        },
        {
          "tokens": [
            "h"
          ],
          "opcode": [
            203,
            60
          ]
        },
        {
          "tokens": [
            "l"
          ],
          "opcode": [
            203,
            61
          ]
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
          ]
        },
        {
          "tokens": [
            "a"
          ],
          "opcode": [
            203,
            63
          ]
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
            62,
            "dd"
          ]
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
            62,
            "dd"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
            71,
            "dd"
          ]
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
            79,
            "dd"
          ]
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
            87,
            "dd"
          ]
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
            95,
            "dd"
          ]
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
            103,
            "dd"
          ]
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
            111,
            "dd"
          ]
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
            119,
            "dd"
          ]
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
            127,
            "dd"
          ]
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
            71,
            "dd"
          ]
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
            79,
            "dd"
          ]
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
            87,
            "dd"
          ]
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
            95,
            "dd"
          ]
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
            103,
            "dd"
          ]
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
            111,
            "dd"
          ]
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
            119,
            "dd"
          ]
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
            127,
            "dd"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
            134,
            "dd"
          ]
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
            142,
            "dd"
          ]
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
            150,
            "dd"
          ]
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
            158,
            "dd"
          ]
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
            166,
            "dd"
          ]
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
            174,
            "dd"
          ]
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
            182,
            "dd"
          ]
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
            190,
            "dd"
          ]
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
            134,
            "dd"
          ]
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
            142,
            "dd"
          ]
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
            150,
            "dd"
          ]
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
            158,
            "dd"
          ]
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
            166,
            "dd"
          ]
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
            174,
            "dd"
          ]
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
            182,
            "dd"
          ]
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
            190,
            "dd"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
            198,
            "dd"
          ]
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
            206,
            "dd"
          ]
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
            214,
            "dd"
          ]
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
            222,
            "dd"
          ]
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
            230,
            "dd"
          ]
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
            238,
            "dd"
          ]
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
            246,
            "dd"
          ]
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
            254,
            "dd"
          ]
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
            198,
            "dd"
          ]
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
            206,
            "dd"
          ]
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
            214,
            "dd"
          ]
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
            222,
            "dd"
          ]
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
            230,
            "dd"
          ]
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
            238,
            "dd"
          ]
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
            246,
            "dd"
          ]
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
            254,
            "dd"
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        }
      ]
    },
    "exx": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            217
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        },
        {
          "tokens": [
            "1"
          ],
          "opcode": [
            237,
            118
          ]
        },
        {
          "tokens": [
            "2"
          ],
          "opcode": [
            237,
            126
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
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
          ]
        }
      ]
    },
    "di": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            243
          ]
        }
      ]
    },
    "ei": {
      "variants": [
        {
          "tokens": [],
          "opcode": [
            251
          ]
        }
      ]
    }
  }
};