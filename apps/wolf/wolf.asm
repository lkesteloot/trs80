SCREEN_WIDTH equ 64
SCREEN_HEIGHT equ 16
MAZE_SIZE equ 8

        .org 0x9000

        ; Set up
        di
        ld sp,0

        call init

next_frame:
        call update
        call fill_buffer
        call draw_screen
        jp next_frame

; -------------------------------------------
; Initialize game state.
init:
        ld hl,dir
        ld (hl),0
        ret

; -------------------------------------------
; Update model from inputs.
; https://www.trs-80.com/wordpress/zaps-patches-pokes-tips/keyboard-map/
update:
        ld hl,dir
        ld a,(0x3800 + 0x40)
        bit 5,a
        jr z,not_left
        dec (hl)
not_left:
        bit 6,a
        jr z,not_right
        inc (hl)
not_right:
        ret

; -------------------------------------------
fill_buffer:
        ld hl, BUFFER
        ld c, 0
        ld b, SCREEN_WIDTH
fill_loop:
        call get_height
        ld (hl), a
        inc hl
        inc c
        djnz fill_loop
        ret

; -------------------------------------------
draw_screen:
        ld de, 64 ; Stride
        ld bc, 0 ; Column

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

        ret

; -------------------------------------------
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

; -------------------------------------------
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

; -------------------------------------------
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

; -------------------------------------------
; Given 0 <= C <= 63 column, return 0 <= A <= 24 height.
get_height:
        push hl
        ld a,c
        ld hl,dir
        add (hl)
        and 0x0f
        pop hl
        ret

; Game state
dir	.db 0

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
        .ds SCREEN_WIDTH

MAZE:
        ; https://en.wikipedia.org/wiki/Wolfenstein_3D#Development
	.db "********"
	.db "* *    *"
	.db "*    * *"
	.db "*    * *"
	.db "*      *"
	.db "*   ****"
	.db "**     *"
	.db "********"

DIR_TABLE_X:
	.db 32,32,31,31,30,28,27,25
	.db 23,20,18,15,12,9,6,3
	.db 0,-3,-6,-9,-12,-15,-18,-20
	.db -23,-25,-27,-28,-30,-31,-31,-32
	.db -32,-32,-31,-31,-30,-28,-27,-25
	.db -23,-20,-18,-15,-12,-9,-6,-3
	.db 0,3,6,9,12,15,18,20
	.db 23,25,27,28,30,31,31,32
DIR_TABLE_Y:
	.db 0,-3,-6,-9,-12,-15,-18,-20
	.db -23,-25,-27,-28,-30,-31,-31,-32
	.db -32,-32,-31,-31,-30,-28,-27,-25
	.db -23,-20,-18,-15,-12,-9,-6,-3
	.db 0,3,6,9,12,15,18,20
	.db 23,25,27,28,30,31,31,32
	.db 32,32,31,31,30,28,27,25
	.db 23,20,18,15,12,9,6,3
SIGNED_DIV_TABLE: ; abs(255/v)
	.db 0,255,127,85,63,51,42,36
	.db 31,28,25,23,21,19,18,17
	.db 15,15,14,13,12,12,11,11
	.db 10,10,9,9,9,8,8,8
	.db 7,7,7,7,7,6,6,6
	.db 6,6,6,5,5,5,5,5
	.db 5,5,5,5,4,4,4,4
	.db 4,4,4,4,4,4,4,4
	.db 3,3,3,3,3,3,3,3
	.db 3,3,3,3,3,3,3,3
	.db 3,3,3,3,3,3,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 1,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,3,3,3,3,3
	.db 3,3,3,3,3,3,3,3
	.db 3,3,3,3,3,3,3,3
	.db 3,4,4,4,4,4,4,4
	.db 4,4,4,4,4,5,5,5
	.db 5,5,5,5,5,5,6,6
	.db 6,6,6,6,7,7,7,7
	.db 7,8,8,8,9,9,9,10
	.db 10,11,11,12,12,13,14,15
	.db 15,17,18,19,21,23,25,28
	.db 31,36,42,51,63,85,127,255
DIST_TO_HEIGHT:
	.db 24,24,24,24,24,24,24,24
	.db 24,24,24,23,21,19,18,17
	.db 15,15,14,13,12,12,11,11
	.db 10,10,9,9,9,8,8,8
	.db 7,7,7,7,7,6,6,6
	.db 6,6,6,5,5,5,5,5
	.db 5,5,5,5,4,4,4,4
	.db 4,4,4,4,4,4,4,4
	.db 3,3,3,3,3,3,3,3
	.db 3,3,3,3,3,3,3,3
	.db 3,3,3,3,3,3,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1


        