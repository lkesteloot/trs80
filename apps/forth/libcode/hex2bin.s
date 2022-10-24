; uint8_t hex2bin(uint8_t ch)
; - converts the hexadecimal character (0-9,A-F,a-f) in "ch" to a 4-bit value
; - assumes that the character is a valid hex digit, upper or lower case
; - pass "ch" in A
; - returns in A
hex2bin::
    sub     a, '0'
    cp      10
    ret     c		    ; If we borrowed, then it's less than 10 and we're done
    sub     a, 'A'-'0'-10   ; Adjust for A-F
    and     0x0F	    ; Handle lower case (has 0x20 OR'ed in)
    ret
