NUL	equ 0x00
SOH	equ 0x01
EOT	equ 0x04
ACK	equ 0x06
BEL	equ 0x07
; Unfortunately, the BASIC interpreter uses "BS" to mean "Bad subscript", and it has value $10, so
; we need to use something different here.
ASC_BS	equ 0x08
HT	equ 0x09
LF	equ 0x0A
CR	equ 0x0D
NAK	equ 0x15
ESC	equ 0x1B
