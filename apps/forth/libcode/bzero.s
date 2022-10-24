; void bzero(uint8_t *ptr, uint16_t len)
; - zero "len" bytes starting at address "ptr"
; - pass "ptr" in HL, "len" in BC
#local
bzero::
    push    bc
    push    de
    push    hl
    ld	    a, b
    or	    c
    jr	    z, done		; len == 0?
    ld	    (hl), 0		; ptr[0] = 0
    dec	    bc
    ld	    a, b
    or	    c
    jr	    z, done		; len == 1?
    ld	    e, l
    ld	    d, h
    inc	    de			; de = hl + 1
    ldir			; zero last len-1 bytes
done:
    pop	    hl
    pop	    de
    pop	    bc
    ret
#endlocal
