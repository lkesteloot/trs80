; uint8_t bin2hex(uint8_t val)
; - converts the lower 4 bits of the 8-bit value "val" to hexadecimal (0-9,A-F)
; - pass "val" in A
; - returns in A
#local
bin2hex::
    and	    0xF
    cp	    0xA
    jr	    c, decimal
    add	    'A'-10
    ret
decimal:
    add	    '0'
    ret
#endlocal
