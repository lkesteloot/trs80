    ; Scans keyboard. Z is set if there's no key, otherwise it's in A.
#local
inkey::
    push de
    call 0x002b
    pop de
    ret
#endlocal
