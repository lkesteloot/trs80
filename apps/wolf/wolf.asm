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
        inc a
        and 63
        ld (dir),a
	jp end_keyboard
not_left:
        bit 6,a ; right arrow
        jr z,not_right
        ld a,(dir)
        dec a
        and 63
        ld (dir),a
	jp end_keyboard
not_right:
	ld a,(0x3800 + 0x04) ; keyboard
	bit 7,a ; W
	jr z,not_w
	call premove
	ld a,(posX)
	ld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_X)
	add (hl)
	ld (posX),a
	ld a,(posY)
	ld h,hi(DIR_TABLE_Y)
	add (hl)
	ld (posY),a
	call postmove
	jp end_keyboard
not_w:
	bit 3,a ; S
	jr z,not_s
	call premove
	ld a,(posX)
	ld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_X)
	sub (hl)
	ld (posX),a
	ld a,(posY)
	ld h,hi(DIR_TABLE_Y)
	sub (hl)
	ld (posY),a
	call postmove
	jp end_keyboard
not_s:
	ld a,(0x3800 + 0x01) ; keyboard
	bit 1,a ; A
	jr z,not_a
	call premove
	ld a,(posX)
	ld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_Y)
	add (hl)
	ld (posX),a
	ld a,(posY)
	ld h,hi(DIR_TABLE_X)
	sub (hl)
	ld (posY),a
	call postmove
	jp end_keyboard
not_a:
	bit 4,a ; D
	jr z,not_d
	call premove
	ld a,(posX)
	ld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_Y)
	sub (hl)
	ld (posX),a
	ld a,(posY)
	ld h,hi(DIR_TABLE_X)
	add (hl)
	ld (posY),a
	call postmove
	jp end_keyboard
not_d:
end_keyboard:
	ret

	; Save the player position so that if we
	; run into a wall, we can back off.
premove:
	ld a,(posX)
	ld (savePosX),a
	ld a,(posY)
	ld (savePosY),a
	ret
postmove:
	; uint_8 mapX = posX >> 5;
        ld a,(posX)
        srl a
        srl a
        srl a
        srl a
        srl a
        ld l,a
        
	; uint_8 mapY = (posY >> 5) << 3;
        ld a,(posY)
        srl a
        srl a
	and 0x38 ; 3 bits

	; if (MAZE[mapY][mapX] != ' ')
        or l
        ld h,hi(MAZE)
        ld l,a
        ld a,(hl)
        cp ' '
        ret z ; not in wall

	; In wall, restore old position.
	ld a,(savePosX)
	ld (posX),a
	ld a,(savePosY)
	ld (posY),a

	ret

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

	; Test top bit for texture.
	bit 7, a
	jp z,texture_2
texture_1:
	ld iyl,0x80+1+4+16
	and 0x7F
        push af        
	ld h,hi(TOP_TEXTURE_1)
	ld l,a
	ld a,(hl)
	ld ixh,a
	ld h,hi(BOTTOM_TEXTURE_1)
	ld a,(hl)
	ld ixl,a
        pop af	
	jp end_texture
texture_2:
	ld iyl,0x80
	and 0x7F
        push af        
	ld h,hi(TOP_TEXTURE_2)
	ld l,a
	ld a,(hl)
	ld ixh,a
	ld h,hi(BOTTOM_TEXTURE_2)
	ld a,(hl)
	ld ixl,a
        pop af	
end_texture:

	; See if we're too tall and should
	; remove the top/bottom character.
	cp 24
	jr nz,not_too_tall
	push af
	ld a,iyl
	ld ixh,a
	ld ixl,a
	pop af
	dec a
not_too_tall:
	; Divide A by 3.
	ld h,hi(DIV3)
	ld l,a
	ld a,(hl)
	; Height is now in A.

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
	ld c,iyl
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

	; int8_t dirX = DIR_TABLE_X[dir];
        ld hl,dir
        ld l,(hl)
        ld h,hi(DIR_TABLE_X)
        ld a,(hl)
        ld (dirX),a
	; int8_t planeY = dirX;
        ld (planeY),a
	; int8_t dirY = DIR_TABLE_Y[dir];
        ld h,hi(DIR_TABLE_Y)
        ld a,(hl)
        ld (dirY),a
	; int8_t planeX = -dirY;
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

	; int8_t rayDirY = dirY + planeY * cameraX / SCREEN_WIDTH;
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
	; uint_8 mapX = posX >> 5;
        ld a,(posX)
        srl a
        srl a
        srl a
        srl a
        srl a
        ld (mapX),a
        
	; uint_8 mapY = posY >> 5;
        ld a,(posY)
        srl a
        srl a
        srl a
        srl a
        srl a
        ld (mapY),a	

	; See if we're aligned with one of the
	; axes, in which case we'll get a
	; divide-by-zero error. Special case
	; both of those.
	ld a,(rayDirX)
	or a
	jp nz,rayDirX_not_zero

#local ; ----------------------------------------
	; uint8_t deltaDistY = SIGNED_DIV_TABLE[(uint8_t) rayDirY];
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
        ld a,-1
        ld (stepY),a
        ; sideDistY = (posY - mapY*32) * deltaDistY / 32;
        ld a,(mapY)
        sla a
        sla a
        sla a
        sla a
        sla a
	ld h,a
        ld a,(posY)
	sub h
        jp rayDirYEnd
rayDirYPos:
        ; } else {
        ; stepY = 1;
        ld a,1
        ld (stepY),a
        ; sideDistY = ((mapY + 1)*32 - posY) * deltaDistY / 32;
        ld a,(mapY)
        inc a
        sla a
        sla a
        sla a
        sla a
        sla a
	ld h,a
        ld a,(posY)
	sub h
        neg
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
        ld a,(stepY)
        ld l,a
        ld a,(mapY)
        add l
        ld (mapY),a

	; Check if ray has hit a wall
        ; if (MAZE[mapY][mapX] != ' ') hit = 1;
        ld a,(mapX)
        ld l,a
        ld a,(mapY)
        sla a
        sla a
        sla a
        or l
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
	
	ld b,0x00 ; Hit Y side.
	jp end_special_cases

rayDirX_not_zero:
	ld a,(rayDirY)
	or a
	jp nz,rayDirY_not_zero

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
        ld a,(mapX)
        sla a
        sla a
        sla a
        sla a
        sla a
        neg
        ld h,a
        ld a,(posX)
        add h
        jp rayDirXEnd
rayDirXPos:
        ; } else {
        ; stepX = 1;
        ld a,1
        ld (stepX),a
        ; sideDistX = ((mapX + 1)*32 - posX) * deltaDistX / 32;
        ld a,(mapX)
        inc a
        sla a
        sla a
        sla a
        sla a
        sla a
        neg
        ld h,a
        ld a,(posX)
        add h
        neg
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
        ld a,(stepX)
        ld l,a
        ld a,(mapX)
        add l
        ld (mapX),a

        ; Check if ray has hit a wall
        ; if (MAZE[mapY][mapX] != ' ') hit = 1;
        ld a,(mapX)
        ld l,a
        ld a,(mapY)
        sla a
        sla a
        sla a
        or l
        ld h,hi(MAZE)
        ld l,a
        ld a,(hl)
        cp ' '
        jp z,loop

        ; Calculate distance projected on camera direction (Euclidean
        ; distance would give fisheye effect!)
	; perpWallDist = sideDistX - deltaDistX;
        ld hl,(sideDistX)
        ld a,(deltaDistX)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        ld (dist),hl
#endlocal ; rayDirY = zero -------------------------

	ld b,0x80 ; Hit X side.
	jp end_special_cases

rayDirY_not_zero:
#local ; ----------------------------------------
        ; uint8_t deltaDistX = SIGNED_DIV_TABLE[(uint8_t) rayDirX];
        ld h,hi(SIGNED_DIV_TABLE)
        ld a,(rayDirX)
        ld l,a
        ld a,(hl)
        ld (deltaDistX),a
        
	; uint8_t deltaDistY = SIGNED_DIV_TABLE[(uint8_t) rayDirY];
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
        ld a,-1
        ld (stepX),a
        ; sideDistX = (posX - mapX*32) * deltaDistX / 32;
        ld a,(mapX)
        sla a
        sla a
        sla a
        sla a
        sla a
        neg
        ld h,a
        ld a,(posX)
        add h
        jp rayDirXEnd
rayDirXPos:
        ; } else {
        ; stepX = 1;
        ld a,1
        ld (stepX),a
        ; sideDistX = ((mapX + 1)*32 - posX) * deltaDistX / 32;
        ld a,(mapX)
        inc a
        sla a
        sla a
        sla a
        sla a
        sla a
        neg
        ld h,a
        ld a,(posX)
        add h
        neg
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
        ld a,-1
        ld (stepY),a
        ; sideDistY = (posY - mapY*32) * deltaDistY / 32;
        ld a,(mapY)
        sla a
        sla a
        sla a
        sla a
        sla a
	ld h,a
        ld a,(posY)
	sub h
        jp rayDirYEnd
rayDirYPos:
        ; } else {
        ; stepY = 1;
        ld a,1
        ld (stepY),a
        ; sideDistY = ((mapY + 1)*32 - posY) * deltaDistY / 32;
        ld a,(mapY)
        inc a
        sla a
        sla a
        sla a
        sla a
        sla a
	ld h,a
        ld a,(posY)
	sub h
        neg
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
        ; jump to next map square, either in x-direction, or in y-direction
        ; if (sideDistX < sideDistY) {
        ld hl,(sideDistX)
        ld de,(sideDistY)
	or a ; clear carry
	sbc hl,de
	add hl,de
        jr nc,moveY ; jump if de <= hl (y < x)
        ; sideDistX += deltaDistX;
        ld a,(deltaDistX)
        ld e,a
        ld d,0
        add hl,de
        ld (sideDistX),hl
        ; mapX += stepX;
        ld a,(stepX)
        ld l,a
        ld a,(mapX)
        add l
        ld (mapX),a
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
        ld a,(stepY)
        ld l,a
        ld a,(mapY)
        add l
        ld (mapY),a
        ; side = 1;
        ld a,1
        ld (side),a
moveEnd:
        ; Check if ray has hit a wall
        ; if (MAZE[mapY][mapX] != ' ') hit = 1;
        ld a,(mapX)
        ld l,a
        ld a,(mapY)
        sla a
        sla a
        sla a
        or l
        ld h,hi(MAZE)
        ld l,a
        ld a,(hl)
        cp ' '
        jp z,loop

        ; Calculate distance projected on camera direction (Euclidean
        ; distance would give fisheye effect!)
	; if (side == 0) {
        ld a,(side)
        or a
        jp nz,hitYSide
	; perpWallDist = sideDistX - deltaDistX;
        ld hl,(sideDistX)
        ld a,(deltaDistX)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        ld (dist),hl
	ld b,0x80 ; indicate hit X side.
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
	ld b,0x00 ; indicate hit Y side.
hitSideEnd:
#endlocal ; neither is zero -------------------------

	; End of the three special cases. By now
	; the "dist" variable should be set and
	; the "b" register should be 0x80 if we
	; hit the X side and 0x00 if we hit the
	; Y side.
end_special_cases:
	; Calculate height of line to draw on screen
	; uint8_t lineHeight = DIST_TO_HEIGHT[perpWallDist];
        ld a,(dist)
        ld h,hi(DIST_TO_HEIGHT)
        ld l,a
        ld a,(hl)

	; Set high bit depending on side.
	or b

        pop bc
        pop hl
        ret

cameraX:.db 0	; int8_t
dirX: 	.db 0	; int8_t
dirY: 	.db 0	; int8_t
planeX:	.db 0	; int8_t
planeY: .db 0	; int8_t
rayDirX:.db 0	; int8_t
rayDirY:.db 0	; int8_t
mapX:	.db 0	; uint8_t
mapY:	.db 0	; uint8_t
side:	.db 0	; uint8_t, was a NS or a EW wall hit?
dist:	.db 0	; uint8_t
deltaDistX:.db 0; uint8_t
deltaDistY:.db 0; uint8_t
; length of ray from current position to next x or y-side
sideDistX:.dw 0 ; int16_t
sideDistY:.dw 0 ; int16_t
; what direction to step in x or y-direction (either +1 or -1)
stepX:	.db 0	; int8_t
stepY:	.db 0	; int8_t
hit:	.db 0	; uint8_t
#endlocal

; -------------------------------------------
; Multiply 8-bit signed values.
; In:  Multiply H with E
; Out: HL = result
#local
signed_mult_8::
        push af
        push de
        ld l,0
        ; Make H non-negative.
        ld a,h
        or a
        jp p,h_not_negative
        neg
        ld h,a
        ld l,1
h_not_negative:
        ; Make E non-negative.
        ld a,e
        or a
        jp p,e_not_negative
        neg
        ld e,a
        ld a,l
        xor 1
        ld l,a
e_not_negative:
        ld a,l
        push af
        call mult8
        pop af
        or a
        jp z,hl_not_negative
        ; Negate HL.
        ld a,l
        cpl
        ld l,a
        ld a,h
        cpl
        ld h,a
        inc hl
hl_not_negative:
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
	ld d,0		; clear d
	ld l,d		; clear l
	ld b,8		; number of bits
loop:
	add hl,hl	; shift left into carry
	jr nc,no_add	; top bit was zero, don't add
	add hl,de	; add E
no_add:
	djnz loop
	ret
#endlocal

; Game state
posX:	.db 100
posY:	.db 128
dir:	.db 4

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

	.org ($ + 255) & 0xFF00
TOP_TEXTURE_2: ; Map 0 to 24 to top characater.
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2
        .db 128+16+32,128+4+8,128+1+2

	.org ($ + 255) & 0xFF00
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

	.org ($ + 255) & 0xFF00
BOTTOM_TEXTURE_2:
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32
        .db 128+1+2,128+4+8,128+16+32

BUFFER:
        .ds SCREEN_WIDTH

        .org ($ + 255) & 0xFF00
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

        .org ($ + 255) & 0xFF00
DIR_TABLE_X:
	.db 32,32,31,31,30,28,27,25
	.db 23,20,18,15,12,9,6,3
	.db 0,-3,-6,-9,-12,-15,-18,-20
	.db -23,-25,-27,-28,-30,-31,-31,-32
	.db -32,-32,-31,-31,-30,-28,-27,-25
	.db -23,-20,-18,-15,-12,-9,-6,-3
	.db 0,3,6,9,12,15,18,20
	.db 23,25,27,28,30,31,31,32

        .org ($ + 255) & 0xFF00
DIR_TABLE_Y:
	.db 0,-3,-6,-9,-12,-15,-18,-20
	.db -23,-25,-27,-28,-30,-31,-31,-32
	.db -32,-32,-31,-31,-30,-28,-27,-25
	.db -23,-20,-18,-15,-12,-9,-6,-3
	.db 0,3,6,9,12,15,18,20
	.db 23,25,27,28,30,31,31,32
	.db 32,32,31,31,30,28,27,25
	.db 23,20,18,15,12,9,6,3

        .org ($ + 255) & 0xFF00
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

        .org ($ + 255) & 0xFF00
DIST_TO_HEIGHT:
	.db 24,24,24,24,24,24,24,24
	.db 24,24,23,22,20,18,17,16 ; Make one 24 -> 23.
	.db 14,14,13,12,11,11,10,10
	.db 9,9,8,8,8,7,7,7
	.db 6,6,6,6,6,5,5,5
	.db 5,5,5,4,4,4,4,4
	.db 4,4,4,4,3,3,3,3
	.db 3,3,3,3,3,3,3,3
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,2,2
	.db 2,2,2,2,2,2,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 1,1,1,1,1,1,1,1
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0


        