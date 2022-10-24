; void delay_ms(uint8_t ms)
; - delay for at least the specified number of milliseconds
; - 'ms' in L
#local
delay_ms::
    inc	    l
    dec	    l
    ret	    z		; delay of 0 returns immediately
    push    bc
    ld	    b, l
loop:
    call    delay_1ms
    djnz    loop
    pop	    bc
    ret
#endlocal
