export const wolf = `
SCREEN_WIDTH equ 64
SCREEN_HEIGHT equ 16
MAZE_SIZE equ 8

        .org 0x8000
entry:
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
        ret

; -------------------------------------------
; Update model from inputs.
; https://www.trs-80.com/wordpress/zaps-patches-pokes-tips/keyboard-map/
#local
update::
        ld a,(0x3800 + 0x40) ; keyboard
        bit 5,a ; left arrow
        jr z,not_left
        ld a,(dir)
        add 2
        and 63
        ld (dir),a
\tjp end_keyboard
not_left:
        bit 6,a ; right arrow
        jr z,not_right
        ld a,(dir)
\tsub 2
        and 63
        ld (dir),a
\tjp end_keyboard
not_right:
\tld a,(0x3800 + 0x04) ; keyboard
\tbit 7,a ; W
\tjr z,not_w
\tcall premove
\tld a,(posX)
\tld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_X)
\tld h,(hl)
\tsra h
\tadd h
\tld (posX),a
\tld a,(posY)
\tld h,hi(DIR_TABLE_Y)
\tld h,(hl)
\tsra h
\tadd h
\tld (posY),a
\tcall postmove
\tjp end_keyboard
not_w:
\tbit 3,a ; S
\tjr z,not_s
\tcall premove
\tld a,(posX)
\tld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_X)
\tld h,(hl)
\tsra h
\tsub h
\tld (posX),a
\tld a,(posY)
\tld h,hi(DIR_TABLE_Y)
\tld h,(hl)
\tsra h
\tsub h
\tld (posY),a
\tcall postmove
\tjp end_keyboard
not_s:
\tld a,(0x3800 + 0x01) ; keyboard
\tbit 1,a ; A
\tjr z,not_a
\tcall premove
\tld a,(posX)
\tld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_Y)
\tld h,(hl)
\tsra h
\tadd h
\tld (posX),a
\tld a,(posY)
\tld h,hi(DIR_TABLE_X)
\tld h,(hl)
\tsra h
\tsub h
\tld (posY),a
\tcall postmove
\tjp end_keyboard
not_a:
\tbit 4,a ; D
\tjr z,not_d
\tcall premove
\tld a,(posX)
\tld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_Y)
\tld h,(hl)
\tsra h
\tsub h
\tld (posX),a
\tld a,(posY)
\tld h,hi(DIR_TABLE_X)
\tld h,(hl)
\tsra h
\tadd h
\tld (posY),a
\tcall postmove
\tjp end_keyboard
not_d:
end_keyboard:
\tret

\t; Save the player position so that if we
\t; run into a wall, we can back off.
premove:
\tld a,(posX)
\tld (savePosX),a
\tld a,(posY)
\tld (savePosY),a
\tret
postmove:
\t; uint_8 mapX = posX >> 5;
        ld a,(posX)
        srl a
        srl a
        srl a
        srl a
        srl a
        ld l,a
        
\t; uint_8 mapY = (posY >> 5) << 3;
        ld a,(posY)
        srl a
        srl a
\tand 0x38 ; 3 bits

\t; if (MAZE[mapY][mapX] != ' ')
        or l
        ld h,hi(MAZE)
        ld l,a
        ld a,(hl)
        cp ' '
        ret z ; not in wall

\t; In wall, restore old position.
\tld a,(savePosX)
\tld (posX),a
\tld a,(savePosY)
\tld (posY),a

\tret

savePosX: .db 0
savePosY: .db 0
#endlocal

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

\t; Test top bit for texture.
\tbit 7, a
\tjp z,texture_2
texture_1:
\tld iyl,0x80+1+4+16
\tand 0x7F
        push af        
\tld h,hi(TOP_TEXTURE_1)
\tld l,a
\tld a,(hl)
\tld ixh,a
\tld h,hi(BOTTOM_TEXTURE_1)
\tld a,(hl)
\tld ixl,a
        pop af\t
\tjp end_texture
texture_2:
\tld iyl,0x80+4
\tand 0x7F
        push af        
\tld h,hi(TOP_TEXTURE_2)
\tld l,a
\tld a,(hl)
\tld ixh,a
\tld h,hi(BOTTOM_TEXTURE_2)
\tld a,(hl)
\tld ixl,a
        pop af\t
end_texture:

\t; See if we're too tall and should
\t; remove the top/bottom character.
\tcp 24
\tjr nz,not_too_tall
\tpush af
\tld a,iyl
\tld ixh,a
\tld ixl,a
\tpop af
\tdec a
not_too_tall:
\t; Divide A by 3.
\tld h,hi(DIV3)
\tld l,a
\tld a,(hl)
\t; Height is now in A.

        ; Top of column.
        ld hl, 15360
        add hl, bc

        ; Ceiling.
        ld b, 7
        jp toplooptest
toploop:
        ld (hl), 128
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
\tld c,iyl
        jp vlooptest
vloop:
        ld (hl), c
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
        ld (hl), 128
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
; Given 0 <= C <= 63 column, return 0 <= A <= 23 height.
; Set high bit of A to use different texture.
#local
get_height::
        push hl
        push bc

        ; int8_t cameraX = 2*x - SCREEN_WIDTH; // x-coordinate in camera space
        sla c ; c *= 2
        ld a,c
        sub SCREEN_WIDTH ; c -= SCREEN_WIDTH
        ld (cameraX),a

\t; int8_t dirX = DIR_TABLE_X[dir];
        ld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_X)
        ld a,(hl)
        ld (dirX),a
\t; int8_t planeY = dirX;
        ld (planeY),a
\t; int8_t dirY = DIR_TABLE_Y[dir];
        ld h,hi(DIR_TABLE_Y)
        ld a,(hl)
        ld (dirY),a
\t; int8_t planeX = -dirY;
        neg
        ld (planeX),a

        ; int8_t rayDirX = dirX + planeX * cameraX / SCREEN_WIDTH;
        ld a,(planeX)
        ld h,a
        ld a,(cameraX)
        ld e,a
        call signed_mult_8
        ; Divide by SCREEN_WIDTH (64) by shifting left and using high byte.
        add hl,hl
        add hl,hl
        ld a,(dirX)
        add h
        ld (rayDirX),a

\t; int8_t rayDirY = dirY + planeY * cameraX / SCREEN_WIDTH;
        ld a,(planeY)
        ld h,a
        ld a,(cameraX)
        ld e,a
        call signed_mult_8
        ; Divide by SCREEN_WIDTH (64) by shifting left and using high byte.
        add hl,hl
        add hl,hl
        ld a,(dirY)
        add h
        ld (rayDirY),a

        ; // which box of the map we're in
\t; uint_8 mapX = posX >> 5;
        ld a,(posX)
        srl a
        srl a
        srl a
        srl a
        srl a
        ld (mapX),a
        
\t; uint_8 mapY = posY >> 5; (pre-shifted 3)
        ld a,(posY)
        srl a
        srl a
\tand 0x38
        ld (mapY),a\t

\t; See if we're aligned with one of the
\t; axes, in which case we'll get a
\t; divide-by-zero error. Special case
\t; both of those.
\tld a,(rayDirX)
\tor a
\tjp nz,rayDirX_not_zero

#local ; ----------------------------------------
\t; uint8_t deltaDistY = SIGNED_DIV_TABLE[(uint8_t) rayDirY];
        ld h,hi(SIGNED_DIV_TABLE)
        ld a,(rayDirY)
        ld l,a
        ld a,(hl)
        ld (deltaDistY),a

        ; if (rayDirY < 0) {
        ld a,(rayDirY)
        bit 7,a
        jr z,rayDirYPos
        ; stepY = -1;
        ld a,-8
        ld (stepY),a
        ; sideDistY = (posY - mapY*32) * deltaDistY / 32;
        ld a,(posY)
\tand 0x1F ; keep fractional part.
        jp rayDirYEnd
rayDirYPos:
        ; } else {
        ; stepY = 1;
        ld a,8
        ld (stepY),a
        ; sideDistY = ((mapY + 1)*32 - posY) * deltaDistY / 32;
        ld a,(posY)
\tand 0x1F ; keep fractional part.
\txor 0x1F ; subtract from 32.
rayDirYEnd:
        ld h,a
        ld a,(deltaDistY)
        ld e,a
        call mult8
        ; /= 32
        xor a
        add hl,hl
        rla
        add hl,hl
        rla
        add hl,hl
        rla
        ld l,h
        ld h,a
        ld (sideDistY),hl

        ; perform DDA
loop:
        ; sideDistY += deltaDistY;
        ld de,(sideDistY)
        ld a,(deltaDistY)
        ld l,a
        ld h,0
        add hl,de
        ld (sideDistY),hl
        ; mapY += stepY;
        ld a,(mapY)
\tld hl,stepY
\tadd (hl)
        ld (mapY),a

\t; Check if ray has hit a wall
        ; if (MAZE[mapY][mapX] != ' ') hit = 1;
        ld a,(mapX)
\tld hl,mapY
\tor (hl)
        ld h,hi(MAZE)
        ld l,a
        ld a,(hl)
        cp ' '
        jp z,loop

        ; Calculate distance projected on camera direction (Euclidean
        ; distance would give fisheye effect!)
        ; perpWallDist = sideDistY - deltaDistY;
        ld hl,(sideDistY)
        ld a,(deltaDistY)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        ld (dist),hl

#endlocal ; rayDirX = 0 -------------------------
\t
\tld b,0x00 ; Hit Y side.
\tjp end_special_cases

rayDirX_not_zero:
\tld a,(rayDirY)
\tor a
\tjp nz,rayDirY_not_zero

#local ; ----------------------------------------
        ; uint8_t deltaDistX = SIGNED_DIV_TABLE[(uint8_t) rayDirX];
        ld h,hi(SIGNED_DIV_TABLE)
        ld a,(rayDirX)
        ld l,a
        ld a,(hl)
        ld (deltaDistX),a

        ; calculate step and initial sideDist
        ; if (rayDirX < 0) {
        ld a,(rayDirX)
        bit 7,a
        jr z,rayDirXPos
        ; stepX = -1;
        ld a,-1
        ld (stepX),a
        ; sideDistX = (posX - mapX*32) * deltaDistX / 32;
        ld a,(posX)
\tand 0x1F ; keep fractional part.
        jp rayDirXEnd
rayDirXPos:
        ; } else {
        ; stepX = 1;
        ld a,1
        ld (stepX),a
        ; sideDistX = ((mapX + 1)*32 - posX) * deltaDistX / 32;
        ld a,(posX)
\tand 0x1F ; keep fractional part.
\txor 0x1F ; subtract from 32.
rayDirXEnd:
        ld h,a
        ld a,(deltaDistX)
        ld e,a
        call mult8
        ; /= 32
        xor a
        add hl,hl
        rla
        add hl,hl
        rla
        add hl,hl
        rla
        ld l,h
        ld h,a
        ld (sideDistX),hl

        ; perform DDA
loop:
        ; sideDistX += deltaDistX;
        ld hl,(sideDistX)
        ld a,(deltaDistX)
        ld e,a
        ld d,0
        add hl,de
        ld (sideDistX),hl
        ; mapX += stepX;
        ld a,(mapX)
\tld hl,stepX
\tadd (hl)
        ld (mapX),a

        ; Check if ray has hit a wall
        ; if (MAZE[mapY][mapX] != ' ') hit = 1;
        ld a,(mapX)
\tld hl,mapY
\tor (hl)
        ld h,hi(MAZE)
        ld l,a
        ld a,(hl)
        cp ' '
        jp z,loop

        ; Calculate distance projected on camera direction (Euclidean
        ; distance would give fisheye effect!)
\t; perpWallDist = sideDistX - deltaDistX;
        ld hl,(sideDistX)
        ld a,(deltaDistX)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        ld (dist),hl
#endlocal ; rayDirY = zero -------------------------

\tld b,0x80 ; Hit X side.
\tjp end_special_cases

rayDirY_not_zero:
#local ; neither is zero -------------------------
        ; uint8_t deltaDistX = SIGNED_DIV_TABLE[(uint8_t) rayDirX];
        ld h,hi(SIGNED_DIV_TABLE)
        ld a,(rayDirX)
        ld l,a
        ld a,(hl)
        ld (deltaDistX),a
        
\t; uint8_t deltaDistY = SIGNED_DIV_TABLE[(uint8_t) rayDirY];
        ld a,(rayDirY)
        ld l,a
        ld a,(hl)
        ld (deltaDistY),a

        ; calculate step and initial sideDist
        ; if (rayDirX < 0) {
        ld a,(rayDirX)
        bit 7,a
        jr z,rayDirXPos
        ; stepX = -1;
\tld ixl,-1
        ; sideDistX = (posX - mapX*32) * deltaDistX / 32;
        ld a,(posX)
\tand 0x1F ; keep fractional part
        jp rayDirXEnd
rayDirXPos:
        ; } else {
        ; stepX = 1;
\tld ixl,1
        ; sideDistX = ((mapX + 1)*32 - posX) * deltaDistX / 32;
\tld a,(posX)
\tand 0x1F ; keep fractional part
\txor 0x1F ; subtract from 32
rayDirXEnd:
        ld h,a
        ld a,(deltaDistX)
        ld e,a
        call mult8
        ; /= 32
        xor a
        add hl,hl
        rla
        add hl,hl
        rla
        add hl,hl
        rla
        ld l,h
        ld h,a
        ld (sideDistX),hl

        ; if (rayDirY < 0) {
        ld a,(rayDirY)
        bit 7,a
        jr z,rayDirYPos
        ; stepY = -1;
\tld ixh,-8
        ; sideDistY = (posY - mapY*32) * deltaDistY / 32;
        ld a,(posY)
\tand 0x1F
        jp rayDirYEnd
rayDirYPos:
        ; } else {
        ; stepY = 1;
\tld ixh,8
        ; sideDistY = ((mapY + 1)*32 - posY) * deltaDistY / 32;
        ld a,(posY)
\tand 0x1F ; keep fractional part
\txor 0x1F ; subtract from 32
rayDirYEnd:
        ld h,a
        ld a,(deltaDistY)
        ld e,a
        call mult8
        ; /= 32
        xor a
        add hl,hl
        rla
        add hl,hl
        rla
        add hl,hl
        rla
        ld l,h
        ld h,a
        ld (sideDistY),hl

\t; BC is pointer into map.
\t; IXL = stepX.
\t; IXH = stepY.
\tld a,(mapX)
\tld hl,mapY
\tor (hl)
        ld b,hi(MAZE)
\tld c,a

        ; perform DDA
loop:
        ; jump to next map square, either in x-direction, or in y-direction
        ; if (sideDistX < sideDistY) {
        ld hl,(sideDistX)
        ld de,(sideDistY)
\tor a ; clear carry
\tsbc hl,de
\tadd hl,de
        jr nc,moveY ; jump if de <= hl (y < x)
        ; sideDistX += deltaDistX;
        ld a,(deltaDistX)
        ld e,a
        ld d,0
        add hl,de
        ld (sideDistX),hl
        ; mapX += stepX;
\tld a,c
\tadd a,ixl
\tld c,a
        ; side = 0;
        xor a
        ld (side),a
        jp moveEnd
moveY:
        ; } else {
        ; sideDistY += deltaDistY;
        ld a,(deltaDistY)
        ld l,a
        ld h,0
        add hl,de
        ld (sideDistY),hl
        ; mapY += stepY;
\tld a,c
\tadd a,ixh
\tld c,a
\t; side = 1;
        ld a,1
        ld (side),a
moveEnd:
        ; Check if ray has hit a wall
        ; if (MAZE[mapY][mapX] != ' ') hit = 1;
\tld a,(bc)
        cp ' '
        jp z,loop\t

        ; Calculate distance projected on camera direction (Euclidean
        ; distance would give fisheye effect!)
\t; if (side == 0) {
        ld a,(side)
        or a
        jp nz,hitYSide
\t; perpWallDist = sideDistX - deltaDistX;
        ld hl,(sideDistX)
        ld a,(deltaDistX)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        ld (dist),hl
\tld b,0x80 ; indicate hit X side.
        jp hitSideEnd
hitYSide:
        ; } else {
        ; perpWallDist = sideDistY - deltaDistY;
        ld hl,(sideDistY)
        ld a,(deltaDistY)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        ld (dist),hl
\tld b,0x00 ; indicate hit Y side.
hitSideEnd:
#endlocal ; neither is zero -------------------------

\t; End of the three special cases. By now
\t; the "dist" variable should be set and
\t; the "b" register should be 0x80 if we
\t; hit the X side and 0x00 if we hit the
\t; Y side.
end_special_cases:
\t; Calculate height of line to draw on screen
\t; uint8_t lineHeight = DIST_TO_HEIGHT[perpWallDist];
        ld a,(dist)
        ld h,hi(DIST_TO_HEIGHT)
        ld l,a
        ld a,(hl)

\t; Set high bit depending on side.
\tor b

        pop bc
        pop hl
        ret

cameraX:.db 0\t; int8_t
dirX: \t.db 0\t; int8_t
dirY: \t.db 0\t; int8_t
planeX:\t.db 0\t; int8_t
planeY: .db 0\t; int8_t
rayDirX:.db 0\t; int8_t
rayDirY:.db 0\t; int8_t
mapX:\t.db 0\t; uint8_t
mapY:\t.db 0\t; uint8_t, pre-shifted left 3
side:\t.db 0\t; uint8_t, was a NS or a EW wall hit?
dist:\t.db 0\t; uint8_t
deltaDistX:.db 0; uint8_t
deltaDistY:.db 0; uint8_t
; length of ray from current position to next x or y-side
sideDistX:.dw 0 ; uint16_t
sideDistY:.dw 0 ; uint16_t
; what direction to step in x or y-direction (either +1 or -1)
stepX:\t.db 0\t; int8_t
stepY:\t.db 0\t; int8_t, pre-shifted left 3
hit:\t.db 0\t; uint8_t
#endlocal

; -------------------------------------------
; Multiply 8-bit signed values.
; In:  Multiply H with E
; Out: HL = result
#local
signed_mult_8::
        push af
        push de
        ld l,0 ; sign counter
        ; Make H non-negative.
\tbit 7,h
        jp z,h_not_negative
        ld a,h
        neg
        ld h,a
\tinc l
h_not_negative:
        ; Make E non-negative.
\tbit 7,e
        jp z,e_not_negative
        ld a,e
        neg
        ld e,a
\tinc l
e_not_negative:
        bit 0,l
        jp z,hl_not_negative
        call mult8
        ; Negate HL.
        ld a,l
        cpl
        ld l,a
        ld a,h
        cpl
        ld h,a
        inc hl
        pop de
        pop af
\tret
hl_not_negative:
        call mult8
        pop de
        pop af
        ret
#endlocal
        
; -------------------------------------------
; Multiply 8-bit unsigned values.
; In:  Multiply H with E
; Out: HL = result, D = 0
#local
mult8::
\tld d,0\t\t; clear d
\tld l,d\t\t; clear l
\tld b,8\t\t; number of bits
loop:
\tadd hl,hl\t; shift left into carry
\tjr nc,no_add\t; top bit was zero, don't add
\tadd hl,de\t; add E
no_add:
\tdjnz loop
\tret
#endlocal

; Game state
posX:\t.db 100
posY:\t.db 128
dir:\t.db 4

        .org ($ + 255) & 0xFF00
DIV3: ; Divide 0 to 24 by 3, floored.
        .db 0,0,0, 1,1,1, 2,2,2
        .db 3,3,3, 4,4,4, 5,5,5
        .db 6,6,6, 7,7,7, 8

        .org ($ + 255) & 0xFF00
TOP_TEXTURE_1: ; Map 0 to 24 to top characater.
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16
        .db 128+16+32,128+4+8+16,128+1+2+4+16

\t.org ($ + 255) & 0xFF00
TOP_TEXTURE_2: ; Map 0 to 24 to top characater.
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4
        .db 128+16+32,128+4+8,128+1+2+4

\t.org ($ + 255) & 0xFF00
BOTTOM_TEXTURE_1:
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32
        .db 128+1+2,128+1+4+8,128+1+4+16+32

\t.org ($ + 255) & 0xFF00
BOTTOM_TEXTURE_2:
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32
        .db 128+1+2,128+4+8,128+4+16+32

BUFFER:
        .ds SCREEN_WIDTH

        .org ($ + 255) & 0xFF00
MAZE:
        ; https://en.wikipedia.org/wiki/Wolfenstein_3D#Development
\t.db "********"
\t.db "* *    *"
\t.db "*    * *"
\t.db "*    * *"
\t.db "*      *"
\t.db "*   ****"
\t.db "**     *"
\t.db "********"

        .org ($ + 255) & 0xFF00
DIR_TABLE_X:
\t.db 32,32,31,31,30,28,27,25
\t.db 23,20,18,15,12,9,6,3
\t.db 0,-3,-6,-9,-12,-15,-18,-20
\t.db -23,-25,-27,-28,-30,-31,-31,-32
\t.db -32,-32,-31,-31,-30,-28,-27,-25
\t.db -23,-20,-18,-15,-12,-9,-6,-3
\t.db 0,3,6,9,12,15,18,20
\t.db 23,25,27,28,30,31,31,32

        .org ($ + 255) & 0xFF00
DIR_TABLE_Y:
\t.db 0,-3,-6,-9,-12,-15,-18,-20
\t.db -23,-25,-27,-28,-30,-31,-31,-32
\t.db -32,-32,-31,-31,-30,-28,-27,-25
\t.db -23,-20,-18,-15,-12,-9,-6,-3
\t.db 0,3,6,9,12,15,18,20
\t.db 23,25,27,28,30,31,31,32
\t.db 32,32,31,31,30,28,27,25
\t.db 23,20,18,15,12,9,6,3

        .org ($ + 255) & 0xFF00
SIGNED_DIV_TABLE: ; abs(255/v)
\t.db 0,255,127,85,63,51,42,36
\t.db 31,28,25,23,21,19,18,17
\t.db 15,15,14,13,12,12,11,11
\t.db 10,10,9,9,9,8,8,8
\t.db 7,7,7,7,7,6,6,6
\t.db 6,6,6,5,5,5,5,5
\t.db 5,5,5,5,4,4,4,4
\t.db 4,4,4,4,4,4,4,4
\t.db 3,3,3,3,3,3,3,3
\t.db 3,3,3,3,3,3,3,3
\t.db 3,3,3,3,3,3,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 1,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,3,3,3,3,3
\t.db 3,3,3,3,3,3,3,3
\t.db 3,3,3,3,3,3,3,3
\t.db 3,4,4,4,4,4,4,4
\t.db 4,4,4,4,4,5,5,5
\t.db 5,5,5,5,5,5,6,6
\t.db 6,6,6,6,7,7,7,7
\t.db 7,8,8,8,9,9,9,10
\t.db 10,11,11,12,12,13,14,15
\t.db 15,17,18,19,21,23,25,28
\t.db 31,36,42,51,63,85,127,255

        .org ($ + 255) & 0xFF00
DIST_TO_HEIGHT:
\t.db 24,24,24,24,24,24,24,24
\t.db 24,24,23,22,20,18,17,16 ; Make one 24 -> 23.
\t.db 14,14,13,12,11,11,10,10
\t.db 9,9,8,8,8,7,7,7
\t.db 6,6,6,6,6,5,5,5
\t.db 5,5,5,4,4,4,4,4
\t.db 4,4,4,4,3,3,3,3
\t.db 3,3,3,3,3,3,3,3
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,2,2
\t.db 2,2,2,2,2,2,1,1
\t.db 1,1,1,1,1,1,1,1
\t.db 1,1,1,1,1,1,1,1
\t.db 1,1,1,1,1,1,1,1
\t.db 1,1,1,1,1,1,1,1
\t.db 1,1,1,1,1,1,1,1
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0
\t.db 0,0,0,0,0,0,0,0

\tend entry
`;
