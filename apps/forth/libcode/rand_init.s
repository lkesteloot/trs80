rand_init::
    push    hl
    ld	    hl, 0x2019
    ld	    (Rand16_seed1), hl
    ld	    hl, 0xA05F
    ld	    (Rand16_seed2), hl
    pop	    hl
    ret
