export const wolf = `
        .org 0x9000

        ; Set up
        di
        ld hl,0
        ld sp,hl

        ld de, 0 ; Time
next_frame:
        call update
        call fill_buffer
        call draw_screen
        ;inc de
        jp next_frame

; -------------------------------------------

fill_buffer:
        ld hl, BUFFER
        ld c, 0
        ld b, 64
fill_loop:
        call get_height
        ld (hl), a
        inc hl
        inc c
        dec b
        jp nz, fill_loop
        ret

; -------------------------------------------
; Update model from inputs.
; https://www.trs-80.com/wordpress/zaps-patches-pokes-tips/keyboard-map/
update:
        ld a,(14400)
        and 32
        jr z,not_left
        dec de
not_left:
        ld a,(14400)
        and 64
        jr z,not_right
        inc de
not_right:
        ret

; -------------------------------------------

draw_screen:
        push de

        ld de, 64 ; Stride
        ld bc, 0 ; column

hloop:
        push bc

        ; Load height from buffer.
        ld hl, BUFFER
        add hl, bc
        ld a, (hl)

        push af        
        call get_top_char
        ld ixh,a
        pop af

        push af        
        call get_bottom_char
        ld ixl,a
        pop af

        call div3

        ; Top of column.
        ld hl, 15360
        add hl, bc

        ; Ceiling.
        ld b, 7
        jp toplooptest
toploop:
        ld (hl), 128+4
        add hl, de
        dec b
toplooptest:
        cp b ; Stop at a
        jp nz, toploop

        ; Border between ceiling and wall.
        ld b,ixh
        ld (hl),b
        add hl, de

        ; Wall.
        ld b, a
        sla b
        jp vlooptest
vloop:
        ld (hl), 128+1+4+16
        add hl, de
        dec b
vlooptest:
        jp nz, vloop

        ; Border between wall and floor.
        ld b,ixl
        ld (hl), b
        add hl, de

        ; Floor.
        ld b, 7
        jp bottomlooptest
bottomloop:
        ld (hl), 128+4
        add hl, de
        dec b
bottomlooptest:
        cp b ; Stop at a
        jp nz, bottomloop

        pop bc

        inc bc
        ld a, c
        cp 64
        jp nz, hloop

        pop de
        

        ret

        ; Given 0 <= C <= 63 column, return 0 <= A <= 24 height.
get_height:
        ld a, c
        add e
        and 0x0e
        ret

get_top_char:
        push hl
        push bc
        ld hl,TOP
        ld b,0
        ld c,a
        add hl,bc
        ld a,(hl)
        pop bc
        pop hl
        ret
        ;pop deez nutz into your mouth

get_bottom_char:
        push hl
        push bc
        ld hl,BOTTOM
        ld b,0
        ld c,a
        add hl,bc
        ld a,(hl)
        pop bc
        pop hl
        ret

        ; Divides A by 3, floored.
div3:
        push hl
        push bc
        ld hl,DIV3
        ld b,0
        ld c,a
        add hl,bc
        ld a,(hl)
        pop bc
        pop hl
        ret

DIV3: ; Divide 0 to 24 by 3, floored.
        .db 0,0,0, 1,1,1, 2,2,2
        .db 3,3,3, 4,4,4, 5,5,5
        .db 6,6,6, 7,7,7, 8

TOP: ; Map 0 to 24 to top characater.
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16
        .db 128+4+16+32,128+4+8+16, 128+1+2+4+16

BOTTOM:
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32
        .db 128+4+1+2,128+1+4+8,128+1+4+16+32

BUFFER:
        .ds 64
`;
