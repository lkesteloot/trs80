; Macros and definitions related to the Z80 and its instruction set

M_deref_hl	macro
    ; hl = (hl)
    ; destroys A
    ld	    a, (hl)
    inc	    hl
    ld	    h, (hl)
    ld	    l, a
    endm

M_out		macro port, val
    ; destroys A
    ld	    a, &val
    out	    &port, a
    endm

M_out0		macro port
    ; destroys A
    xor	    a
    out	    &port, a
    endm
