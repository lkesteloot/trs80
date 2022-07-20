; uint16_t rand16_modn(uint16_t n)
; - returns a 16-bit pseudo-random number on the interval [0, n) in HL
rand16_modn::
    push    bc
    push    de
    ex	    de, hl	; DE = n
    call    rand16	; HL = rand16()
    ld	    a, h
    ld	    c, l	; AC = HL (i.e. random value)
    call    divmod16	; (AC, HL) = divmod16(AC, DE)
    pop	    de
    pop	    bc
    ret
