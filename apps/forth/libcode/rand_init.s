rand_init::
    push    hl
    ld	    hl, 0x2019
    ld	    (rand16_seed1), hl
    ld	    hl, 0xA05F
    ld	    (rand16_seed2), hl
    pop	    hl
    ret
