; (uint16_t quo (AC), uint16_t rem (HL)) divmod16(uint16_t n (AC), uint16_t d (DE))
; - divides AC by DE and places the quotient in AC and the remainder in HL.
#local
divmod16::
    ld	    hl, 0
    ld	    b, 16
loop:
    sll	    c
    rla
    adc	    hl, hl
    sbc	    hl, de
    jr	    nc, skip
    add	    hl, de
    dec	    c
skip:    
    djnz    loop
    ret
#endlocal
