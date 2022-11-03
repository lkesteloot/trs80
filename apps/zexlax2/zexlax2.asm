	.title	'Z80 instruction set exerciser'

; zexlax.z80 - Z80 instruction set exerciser
; Copyright (C) 1994  Frank D. Cringle
;
; This program is free software; you can redistribute it and/or
; modify it under the terms of the GNU General Public License
; as published by the Free Software Foundation; either version 2
; of the License, or (at your option) any later version.
;
; This program is distributed in the hope that it will be useful,
; but WITHOUT ANY WARRANTY; without even the implied warranty of
; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
; GNU General Public License for more details.
;
; You should have received a copy of the GNU General Public License
; along with this program; if not, write to the Free Software
; Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.

;-------------------- Configuration -----------------------------

; Set to 1 to test only documented flags and effects.
docflag	equ	0

; Set to 1 to test WZ state.  If set then docflag must be 0.
wzflag	equ	1

; Set to 1 to build CP/M compatable version
cpm	equ	0

;----------------------------------------------------------------

; GWP - to test the test infrastructure
testtest equ	0

	if	wzflag
	if	docflag
	error	docflag must be 0 if wzflag is set
	endif
	endif

	if	cpm

	aseg
	org	100h

	else

	org	5000h

	endif

begin:	jp	start

; The following items must all be on the same 256 byte page.

; Machine state before test (needs to be at predictably constant address)
; And it must start at an odd address.
msbt:	ds	16
spbt	equ	$-2
its:
	if	wzflag
	ex	af,af'
	scf
	jp	nc,0		; set WZ
wzbt	equ	$-2
	ex	af,af'
	endif
iut:	db	0,0,0,0
	if	wzflag
	ex	af,af'		; save AF
	exx
	bit	0,(hl)		; get bit 3 and 5 of W
	exx
	endif
	jp	idone

crcval	ds	4
; machine state after test
dummy:	ds	2
msat:	ds	12	; memop,iy,ix,hl,de,bc
flgsat:	ds	2	; af
	if	wzflag
zwat:	ds	2	; wz, but byte swapped
	endif
spat:	ds	2	; sp

counter: ds	20*3+1	; 3 bytes for each non-zero mask byte + terminator
shifter: ds	2+20*2+3; 2 byte ctl + 2 bytes for each nz mask byte + term

; For the purposes of this test program, the machine state consists of:
;	a 2 byte memory operand, followed by
;	the registers iy,ix,hl,de,bc,af,sp
; for a total of 16 bytes.

; The program tests instructions (or groups of similar instructions)
; by cycling through a sequence of machine states, executing the test
; instruction for each one and running a 32-bit crc over the resulting
; machine states.  At the end of the sequence the crc is compared to
; an expected value that was found empirically on a real Z80.

; A test case is defined by a descriptor which consists of:
;	a flag mask byte,
;	the base case,
;	the increment vector,
;	the shift vector,
;	the expected crc,
;	a short descriptive message.
;
; The flag mask byte is used to prevent undefined flag bits from
; influencing the results.  Documented flags are as per Mostek Z80
; Technical Manual.
;
; The next three parts of the descriptor are 20 byte vectors
; corresponding to a 4 byte instruction and a 16 byte machine state.
; The first part is the base case, which is the first test case of
; the sequence.  This base is then modified according to the next 2
; vectors.  Each 1 bit in the increment vector specifies a bit to be
; cycled in the form of a binary counter.  For instance, if the byte
; corresponding to the accumulator is set to 0ffh in the increment
; vector, the test will be repeated for all 256 values of the
; accumulator.  Note that 1 bits don't have to be contiguous.  The
; number of test cases 'caused' by the increment vector is equal to
; 2^(number of 1 bits).  The shift vector is similar, but specifies a
; set of bits in the test case that are to be successively inverted.
; Thus the shift vector 'causes' a number of test cases equal to the
; number of 1 bits in it.

; The total number of test cases is the product of those caused by the
; counter and shift vectors and can easily become unweildy.  Each
; individual test case can take a few milliseconds to execute, due to
; the overhead of test setup and crc calculation, so test design is a
; compromise between coverage and execution time.

; This program is designed to detect differences between
; implementations and is not ideal for diagnosing the causes of any
; discrepancies.  However, provided a reference implementation (or
; real system) is available, a failing test case can be isolated by
; hand using a binary search of the test space.

; Some macros that may ease porting
;	init	- system specific initialization (e.g., set up stack)
;	putc	- send character E to output device
;	msg_de	- output message pointed to by DE, '$' terminated
;	finish	- system specific termination (does not return)

	if	cpm

init	macro
	ld	hl,(6)
	ld	sp,hl
	endm

putc	macro
	ld	c,2
	call	bdos
	endm

msg_de	macro
	ld	c,9
	call	bdos
	endm

finish	macro	xx
	jp	0		; warm boot
	endm

bdos	push	af
	push	bc
	push	de
	push	hl
	call	5
	pop	hl
	pop	de
	pop	bc
	pop	af
	ret

	else

cursor:	defw	15360

init	macro
; Turn on fast CPU speed on the Model 4
	in	a,($ff)
	or	$40
	out	($ec),a

	ld	hl,15360
	ld	de,15360+1
	ld	bc,1024-1
	ld	(hl),' '
	ldir
	endm

putc	macro
	push	af
	ld	a,e
	call	putchar
	pop	af
	endm

msg_de	macro
	call	print
	endm

finish	macro

	call	showbuf

	jp	$
	endm

print:	push	af
	push	de
plp:	ld	a,(de)
	inc	de
	cp	'$'
	jr	z,pdone
	call	putchar
	jr	plp
pdone:	pop	de
	pop	af
	ret

putchar:
	out	(0f8h),a
	cp	13
	ret	z

; RS-232 output (expects RS-232 to be initialized)
; OK if no RS-232 installed

	push	af
wt232:	in	a,(0eah)		; wait until RS-232 transmit empty
	and	40h			; (this will be OK if RS-232 not installed)
	jr	z,wt232
	pop	af
	out	(0ebh),a

	push	hl
	ld	hl,(cursor)

	cp	10
	jr	nz,nolf

	ld	a,l
	and	$c0
	add	64
	ld	l,a
	ld	a,0
	adc	h
	ld	h,a
	jr	scrchk

nolf:	ld	(hl),a
	inc	hl

scrchk:	bit	6,h
	jr	z,noscr

	push	de
	push	bc

; Buffer line
	ld	hl,15360
	ld	de,(bufpos)
	ld	bc,64
	ldir
	ld	(bufpos),de

	ld	hl,15360+64
	ld	de,15360
	ld	bc,1024-64
	ldir
	ld	hl,15360+15*64
	ld	de,15360+15*64+1
	ld	(hl),' '
	ld	bc,64-1
	ldir
	ld	hl,15360+15*64
	pop	bc
	pop	de

noscr:	ld	(cursor),hl
	pop	hl
	ret

	endif

msg1:	db	'Z80 instruction exerciser (documented '
	if	!docflag
	db	'and undocumented '
	endif
	db	'flags'
	if	docflag
	db	'only'
	else
	if	wzflag
	db	' and WZ'
	endif
	endif
	db	')',10,13,10,13,'$'
msg2:	db	'Tests complete$'
okmsg:	db	'  OK',10,13,'$'
ermsg1:	db	' ERROR want:$'
ermsg2:	db	' got:$'
crlf:	db	10,13,'$'

; compare crc
; hl points to value to compare to crcval

start:	init

	call	verify

	ld	de,msg1
	msg_de

	ld	hl,tests	; first test case
loop:	ld	a,(hl)		; end of list ?
	inc	hl
	or	(hl)
	jp	z,done
	dec	hl
	call	stt
	jp	loop
	
done:	ld	de,msg2
	msg_de
	finish

; Check that there is no overlap between the mask of any test and the
; instruction template.  This will typically be a problem arising from
; the msbt address being improperly aligned.

verify:	ld	hl,tests
vlp:	ld	a,(hl)
	inc	hl
	or	(hl)
	ret	z
	dec	hl

	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	inc	hl

	push	hl
	inc	de		; skip flag byte
	ld	hl,20
	add	hl,de
	ld	b,20

	push	hl
chkmsk:	ld	a,(de)
	and	(hl)
	jr	nz,mskbad
	inc	de
	inc	hl
	djnz	chkmsk
	pop	hl
	pop	hl
	jr	vlp

mskbad: pop	hl
	ld	de,mskmsg
	msg_de
	ld	de,20+20+4
	add	hl,de
	ex	de,hl
	msg_de
	ld	de,crlf
	msg_de
	pop	hl
	jr	vlp

mskmsg:	defb	'Mask error in $'

tests:
	if	testtest
	dw	faux
	dw	0
	endif

	dw	adc16
	dw	add16
	dw	add16x
	dw	add16y
	dw	alu8i
	dw	alu8r1
	dw	alu8r2
	dw	alu8rm
	dw	alu8ra
	dw	alu8rx
	dw	alu8x
	dw	bitx
	dw	bitr1
	dw	bitr2
	dw	bitm
	dw	bita
	dw	cpd1
	dw	cpi1
	dw	daa
	dw	cpl
	dw	scf
	dw	ccf
	dw	inca
	dw	incb
	dw	incbc
	dw	incc
	dw	incd
	dw	incde
	dw	ince
	dw	inch
	dw	inchl
	dw	incix
	dw	inciy
	dw	incl
	dw	incm
	dw	incsp
	dw	incx
	dw	incxh
	dw	incxl
	dw	incyh
	dw	incyl
	dw	ld161
	dw	ld162
	dw	ld163
	dw	ld164
	dw	ld165
	dw	ld166
	dw	ld167
	dw	ld168
	dw	ld16im
	dw	ld16ix
	dw	ld8bd
	dw	ld8im
	dw	ld8imx
	dw	ld8ix1
	dw	ld8ix2
	dw	ld8ix3
	dw	ld8ixy
	dw	ld8r1r1
	dw	ld8r1r2
	dw	ld8r1m
	dw	ld8r1a
	dw	ld8r2r1
	dw	ld8r2r2
	dw	ld8r2a
;	dw	ld8lm
;	dw	ld8hm
	dw	ld8mr1
;	dw	ld8ml
;	dw	ld8mh
	dw	ld8ma
	dw	ld8ar1
	dw	ld8ar2
	dw	ld8am
	dw	ld8aa
	dw	lx8r1r1
	dw	lx8r1xy
	dw	lx8r1a
	dw	lx8xyr1
	dw	lx8xyxy
	dw	lx8xya
	dw	lx8ar1
	dw	lx8axy
	dw	lx8aa
	dw	lda
	dw	ldd1
	dw	ldd2
	dw	ldi1
	dw	ldi2
	dw	neg
	dw	rld
	dw	rot8080
	dw	rotxy
	dw	rotzr1
	dw	rotzr2
	dw	rotzm
	dw	rotza
	dw	srzr1
	dw	srzr2
	dw	srzm
	dw	srza
	dw	srzx
	dw	st8ix1
	dw	st8ix2
	dw	st8ix3
	dw	stabd
	dw	0

tstr	macro	insn,memop,iy_,ix_,hl_,de_,bc_,flags,acc,sp_,?lab
?lab:	db	insn
	ds	?lab+4-$,0
	dw	memop,iy_,ix_,hl_,de_,bc_
	db	flags
	db	acc
	dw	sp_
	if	$-?lab ne 20
	error	'missing parameter'
	endif
	endm

tmsg	macro	msg,?lab
?lab:	db	"msg"
	if	$ ge ?lab+30
	error	'message too long'
	else
	ds	?lab+30-$,'.'
	endif
	db	'$'
	endm

	if	wzflag

doc	macro	c1,c2,c3,c4
	endm

full	macro	c1,c2,c3,c4
	endm

docful	macro	c1,c2,c3,c4
	endm

wz	macro	c1,c2,c3,c4
	db	c1,c2,c3,c4
	endm

	else

docful	macro	c1,c2,c3,c4
	db	c1,c2,c3,c4
	endm

wz	macro	c1,c2,c3,c4
	endm

	if	docflag

doc	macro	c1,c2,c3,c4
	db	c1,c2,c3,c4
	endm

full	macro	c1,c2,c3,c4
	endm

	else

doc	macro	c1,c2,c3,c4
	endm

full	macro	c1,c2,c3,c4
	db	c1,c2,c3,c4
	endm

	endif

	endif

; Offsets to registers in the msat (machine state after test)

off_iy	equ	2
off_ix	equ	4
off_hl	equ	6
off_de	equ	8
off_bc	equ	10
off_af	equ	12
	if	wzflag
off_wz	equ	14
off_sp	equ	16
	else
off_sp	equ	14
	endif

; Z80 flag register: SZ5H3VNC

; <adc,sbc> hl,<bc,de,hl,sp> (38,912 cycles)
adc16:	db	0c7h		; flag mask
	tstr	"0edh,042h",02091h,057f5h,01e8ah,03ec3h&~$f821,03f5ah,0cd5ah,056h,0c7h,0e967h
	tstr	"0,038h",0,0,0,0f821h,0,0,0,0,0		; (1024 cycles)
	tstr	0,0,0,0,-1,-1,-1,0d7h,0,-1		; (38 cycles)
	doc	$13,$f6,$9b,$bb			; expected crc
	full	$92,$6a,$11,$2a
	wz	$94,$b6,$2e,$5f
	defb	0,0,0
	tmsg	'<adc,sbc> hl,<bc,de,hl,sp>'

; add hl,<bc,de,hl,sp> (19,456 cycles)
add16:	db	0c7h		; flag mask
	tstr	9,0fd78h,04bbah,028d5h,0e6e4h&~$f821,05ff7h,05e4eh,050h,0bch,08ea3h
	tstr	030h,0,0,0,0f821h,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,-1,-1,-1,0d7h,0,-1		; (38 cycles)
	doc	$ef,$a1,$37,$2d			; expected crc
	full	$32,$94,$76,$f7
	wz	$7e,$0e,$1a,$e6
	defb	0,0,0
	tmsg	'add hl,<bc,de,hl,sp>'

; add ix,<bc,de,ix,sp> (19,456 cycles)
add16x:	db	0c7h		; flag mask
	tstr	"0ddh,9",0f1edh,098dfh,03bf9h&~$f821,0a566h,0f6e7h,04b9fh,042h,0d7h,03cdah
	tstr	"0,030h",0,0,0f821h,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,-1,0,-1,-1,0d7h,0,-1		; (38 cycles)
	doc	$f3,$dc,$29,$63			; expected crc
	full	$12,$fe,$fa,$57
	wz	$3a,$0a,$6c,$8c
	defb	0,0,0
	tmsg	'add ix,<bc,de,ix,sp>'

; add iy,<bc,de,iy,sp> (19,456 cycles)
add16y:	db	0c7h		; flag mask
	tstr	"0fdh,9",03e75h,0de17h&~$f821,0adbeh,0c767h,08fd4h,0c645h,091h,073h,0774fh
	tstr	"0,030h",0,0f821h,0,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,-1,0,0,-1,-1,0d7h,0,-1		; (38 cycles)
	doc	$da,$71,$71,$f5			; expected crc
	full	$24,$b3,$f4,$ae
	wz	$4d,$7d,$db,$ae
	defb	0,0,0
	tmsg	'add iy,<bc,de,iy,sp>'

; aluop a,nn (28,672 cycles)
alu8i:	db	0d7h		; flag mask
	tstr	0c6h,0bfc2h,026c7h,0b545h,09024h,05e65h,0fe3bh,040h,0,0b369h
	tstr	038h,0,0,0,0,0,0,0,-1,0			; (2048 cycles)
	tstr	"0,-1",0,0,0,0,0,0,0d7h,0,0		; (14 cycles)
	doc	$16,$44,$7f,$f4			; expected crc
	full	$14,$e0,$7e,$c7
	wz	$a5,$e3,$64,$b4
	defb	0,0,0
	tmsg	'aluop a,nn'

; aluop a,<b,c,d,e> (311,296 cycles)
alu8r1:	db	0d7h		; flag mask
	tstr	080h,00b5ah,00ba9h,08ea9h,03bf9h,05d93h,063e3h,050h,0,03e22h
	tstr	03bh,0,0,0,0,0,0,0,-1,0		; (8,192 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0	; (38 cycles)
	doc	$cb,$f3,$c1,$18
	full	$22,$e9,$db,$c2
	wz	$6c,$e4,$88,$dc
	defb	0,0,0
	tmsg	'aluop a,<b,c,d,e>'

; aluop a,<h,l> (180,224 cycles)
alu8r2:	db	0d7h		; flag mask
	tstr	084h,00b5ah,00ba9h,08ea9h,03bf9h,05d93h,063e3h,050h,0,03e22h
	tstr	039h,0,0,0,0,0,0,0,-1,0		; (8,192 cycles)
	tstr	0,0,0,0,-1,0,0,0d7h,0,0		; (22 cycles)
	doc	$b9,$db,$bf,$27
	full	$ff,$48,$13,$74
	wz	$87,$a1,$a1,$be
	defb	0,0,0
	tmsg	'aluop a,<h,l>'

; aluop a,(hl) (94,208 cycles)
alu8rm:	db	0d7h		; flag mask
	tstr	086h,00b5ah,00ba9h,08ea9h,msbt,05d93h,063e3h,050h,0,03e22h
	tstr	038h,0,0,0,0,0,0,0,-1,0		; (2,048 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0	; (46 cycles)
	doc	$8c,$c8,$c7,$ef
	full	$96,$b7,$97,$40
	wz	$30,$69,$6d,$8c
	defb	off_hl,0,0
	tmsg	'aluop a,(hl)'

; aluop a,a (12,228 cycles)
alu8ra:	db	0d7h		; flag mask
	tstr	087h,00b5ah,00ba9h,08ea9h,03bf9h,05d93h,063e3h,050h,0,03e22h
	tstr	038h,0,0,0,0,0,0,0,-1,0		; (2,048 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0		; (6 cycles)
	doc	$53,$a9,$cd,$0a
	full	$cf,$d5,$69,$49
	wz	$f0,$2f,$65,$20
	defb	0,0,0
	tmsg	'aluop a,a'

; aluop a,<ixh,ixl,iyh,iyl> (376,832 cycles)
alu8rx:	db	0d7h		; flag mask
	tstr	"0ddh,084h",0c94dh,09232h,0d56ch,0949bh,0bc0bh,088d8h,056h,0,014deh
	tstr	"020h,039h",0,0,0,0,0,0,0,-1,0		; (8,192 cycles)
	tstr	0,0,0,-1,-1,0,0,0d7h,0,0		; (46 cycles)
	doc	$2c,$5e,$8f,$02
	full	$e7,$b1,$ff,$41
	wz	$1f,$5f,$26,$ce
	defb	0,0,0
	tmsg	'aluop a,<ixh,ixl,iyh,iyl>'

; aluop a,(<ix,iy>+1) (229,376 cycles)
alu8x:	db	0d7h		; flag mask
	tstr	"0ddh,086h,1",0adddh,msbt-1,msbt-1,0c250h,09c51h,06607h,0c2h,0,097dch
	tstr	"020h,038h",0,1,1,0,0,0,0,-1,0		; (16,384 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0		; (14 cycles)
	doc	$f7,$82,$39,$b7
	full	$9e,$6a,$2d,$7a
	wz	$91,$1c,$7c,$8c
	defb	off_iy,off_ix,0
	tmsg	'aluop a,(<ix,iy>+1)'

; bit n,(<ix,iy>+1) (32,768 cycles)
bitx:	db	053h		; flag mask
	tstr	"0ddh,0cbh,1,046h",06938h,msbt-1,msbt-1,0d43dh,0cad0h,01e69h,0,0afh,065d2h
	tstr	"020h,0,0,038h",0,0,0,0,0,0,0ffh,0,0	; (4,096 cycles)
	tstr	0,0ffh,0,0,0,0,0,0,0,0			; (8 cycles)
	doc	$e9,$65,$bf,$6f
	full	$8e,$14,$9f,$70
	wz	$75,$e0,$e4,$31
	defb	off_iy,off_ix,0
	tmsg	'bit n,(<ix,iy>+1)'

; bit n,<b,c,d,e> (786,432 cycles)
bitr1:	db	053h		; flag mask
	tstr	"0cbh,100o",04cf3h,0304eh,0a67fh,06938h,0f61ah,0e6dch,0,039h,06985h
	tstr	"0,073o",0,0,0,0,0,0,0ffh,0,0	; (16,384 cycles)
	tstr	0,0,0,0,0,-1,-1,0,0,0		; (48 cycles)
	doc	$cc,$c3,$d6,$41
	full	$46,$af,$a8,$cd
	wz	$c5,$75,$f8,$d2
	defb	0,0,0
	tmsg	'bit n,<b,c,d,e>'

; bit n,<h,l> (786,432 cycles)
bitr2:	db	053h		; flag mask
	tstr	"0cbh,104o",04cf3h,0304eh,0a67fh,06938h,0f61ah,0e6dch,0,039h,06985h
	tstr	"0,071o",0,0,0,0,0,0,0ffh,0,0	; (16,384 cycles)
	tstr	0,0,0,0,-1,0,0,0,-1,0		; (48 cycles)
	doc	$8d,$47,$c8,$d7
	full	$79,$b5,$d4,$b9
	wz	$a9,$f9,$16,$5f
	defb	0,0,0
	tmsg	'bit n,<h,l>'

; bit n,(hl) (786,432 cycles)
bitm:	db	053h		; flag mask
	tstr	"0cbh,106o",04cf3h,0304eh,0a67fh,msbt,0f61ah,0e6dch,0,039h,06985h
	tstr	"0,070o",0,0,0,0,0,0,0ffh,0,0	; (16,384 cycles)
	tstr	0,0ffh,0,0,0,0,0,0,-1,0		; (48 cycles)
	doc	$0e,$17,$93,$28
	full	$d1,$41,$96,$d2
	wz	$ce,$dc,$8d,$e7
	defb	off_hl,0,0
	tmsg	'bit n,(hl)'

; bit n,a (786,432 cycles)
bita:	db	053h		; flag mask
	tstr	"0cbh,107o",04cf3h,0304eh,0a67fh,06938h,0f61ah,0e6dch,0,039h,06985h
	tstr	"0,070o",0,0,0,0,0,0,0ffh,0,0	; (16,384 cycles)
	tstr	0,0ffh,0,0,0,0,0,0,-1,0		; (48 cycles)
	doc	$d8,$46,$5f,$dd
	full	$1b,$24,$09,$f5
	wz	$93,$ff,$1b,$ef
	defb	0,0,0
	tmsg	'bit n,a'

; cpd<r> (1) (6144 cycles)
cpd1:	db	0d7h		; flag mask
	tstr	"0edh,0a9h",0f7cfh,0ce7ch,03dc4h,msbt+15,0d324h,1,0c5h,0,0f8edh
	tstr	"0,010h",0,0,0,0,0,004h,0,-1,0		; (1024 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$46,$c2,$8d,$95
	full	$50,$db,$ba,$24
	wz	$a6,$94,$e9,$b3
	defb	off_hl,0,0
	tmsg	'cpd<r>'

; cpi<r> (1) (6144 cycles)
cpi1:	db	0d7h		; flag mask
	tstr	"0edh,0a1h",0bc9ah,07b47h,061bch,msbt,0c97bh,1,094h,0,0bbdch
	tstr	"0,010h",0,0,0,0,0,004h,0,-1,0		; (1024 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$e8,$26,$73,$06
	full	$f8,$b3,$e1,$91
	wz	$bb,$20,$5c,$5d
	defb	off_hl,0,0
	tmsg	'cpi<r>'

 if 0
; <daa,cpl,scf,ccf> (262,144 cycles)
daa:	db	0d7h		; flag mask
	tstr	027h,09b31h,01181h,0ad31h,09cd2h,02c83h,0c075h,0,0,00bc1h
	tstr	018h,0,0,0,0,0,0,0ffh,-1,0		; (262,144 cycles)
	tstr	0,0,0,0,0,0,0,0,0,0			; (1 cycle)
	doc	$4e,$29,$6e,$10			; expected crc
	full	$67,$39,$ec,$f3
	wz	$00,$00,$00,$13
	defb	0,0,0
	tmsg	'<daa,cpl,scf,ccf>'
 endif

; daa (262,144 cycles)
daa:	db	0d7h		; flag mask
	tstr	027h,09b31h,01181h,0ad31h,09cd2h,02c83h,0c075h,0,0,00bc1h
	tstr	0,0,0,0,0,0,0,0ffh,-1,0
	tstr	0,0,0,0,0,0,0,0,0,0
	doc	$6e,$56,$a7,$10
	full	$00,$a3,$42,$91
	wz	$86,$36,$27,$a6
	defb	0,0,0
	tmsg	'daa'

; cpl (262,144 cycles)
cpl:	db	0d7h		; flag mask
	tstr	02fh,09b31h,01181h,0ad31h,09cd2h,02c83h,0c075h,0,0,00bc1h
	tstr	0,0,0,0,0,0,0,0ffh,-1,0
	tstr	0,0,0,0,0,0,0,0,0,0
	doc	$55,$16,$60,$0d
	full	$1b,$3b,$fb,$e6
	wz	$69,$e4,$52,$dd
	defb	0,0,0
	tmsg	'cpl'

; scf (262,144 cycles)
scf:	db	0d7h		; flag mask
	tstr	037h,09b31h,01181h,0ad31h,09cd2h,02c83h,0c075h,0,0,00bc1h
	tstr	0,0,0,0,0,0,0,0ffh,-1,0
	tstr	0,0,0,0,0,0,0,0,0,0
	doc	$b7,$d8,$66,$e3
	full	$75,$71,$a4,$e4
		; $e8,$00,$fb,$41	if F.3 = A.3, F.5 = A.5
	wz	$90,$30,$e8,$95
	defb	0,0,0
	tmsg	'scf'

; ccf (262,144 cycles)
ccf:	db	0d7h		; flag mask
	tstr	03fh,09b31h,01181h,0ad31h,09cd2h,02c83h,0c075h,0,0,00bc1h
	tstr	0,0,0,0,0,0,0,0ffh,-1,0
	tstr	0,0,0,0,0,0,0,0,0,0
	doc	$1f,$ae,$b2,$03
		;$40,$76,$2f,$a1		if F.3 = A.3, F.5 = A.5
	full	$dd,$07,$70,$04
	wz	$c0,$0c,$bc,$8b
	defb	0,0,0
	tmsg	'ccf'

; <inc,dec> a (3072 cycles)
inca:	db	0d7h		; flag mask
	tstr	03ch,078edh,0ebc8h,06c01h,0a662h,02488h,02909h,007h,0,034a0h
	tstr	001h,0,0,0,0,0,0,0,-1,0			; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$55,$54,$dd,$e0				; expected crc
	full	$c8,$97,$20,$d0
	wz	$b2,$ea,$34,$31
	defb	0,0,0
	tmsg	'<inc,dec> a'

; <inc,dec> b (3072 cycles)
incb:	db	0d7h		; flag mask
	tstr	004h,0174dh,09ac6h,0e493h,026d7h,0182ah,00093h,014h,054h,00b45h
	tstr	001h,0,0,0,0,0,0ff00h,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$70,$86,$da,$45			; expected crc
	full	$ed,$45,$27,$75
	wz	$a9,$3a,$7c,$dc
	defb	0,0,0
	tmsg	'<inc,dec> b'

; <inc,dec> bc (1536 cycles)
incbc:	db	0d7h		; flag mask
	tstr	003h,01247h,0e430h,0d9e0h,05b01h,0f65fh,0c4cch&~$f821,0c5h,040h,04ebeh
	tstr	008h,0,0,0,0,0,0f821h,0,0,0		; (256 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	docful	$d6,$af,$cf,$e7			; expected crc
	wz	$e6,$99,$1a,$33
	defb	0,0,0
	tmsg	'<inc,dec> bc'

; <inc,dec> c (3072 cycles)
incc:	db	0d7h		; flag mask
	tstr	00ch,0383bh,0576ah,00bf2h,04d48h,0f455h,0d700h,093h,037h,0c5f9h
	tstr	001h,0,0,0,0,0,0ffh,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$67,$59,$1b,$a4			; expected crc
	full	$fa,$9a,$e6,$94
	wz	$8d,$db,$5c,$09
	defb	0,0,0
	tmsg	'<inc,dec> c'

; <inc,dec> d (3072 cycles)
incd:	db	0d7h		; flag mask
	tstr	014h,0aa90h,06324h,05483h,0f849h,00015h,05fbbh,040h,02ah,06464h
	tstr	001h,0,0,0,0,0ff00h,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$1f,$f9,$0b,$c0			; expected crc
	full	$82,$3a,$f6,$f0
	wz	$8f,$1a,$8a,$34
	defb	0,0,0
	tmsg	'<inc,dec> d'

; <inc,dec> de (1536 cycles)
incde:	db	0d7h		; flag mask
	tstr	013h,0f953h,084f8h,0c89eh,06271h,0231ch&~$f821,08451h,091h,02fh,0698fh
	tstr	008h,0,0,0,0,0f821h,0,0,0,0		; (256 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	docful	$9b,$34,$c9,$0d			; expected crc
	wz	$9d,$8c,$34,$b8
	defb	0,0,0
	tmsg	'<inc,dec> de'

; <inc,dec> e (3072 cycles)
ince:	db	0d7h		; flag mask
	tstr	01ch,04cdfh,0580fh,0d73eh,0c4a7h,02800h,02595h,057h,021h,07bc8h
	tstr	001h,0,0,0,0,0ffh,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$28,$57,$f1,$81			; expected crc
	full	$b5,$94,$0c,$b1
	wz	$dc,$4d,$29,$d4
	defb	0,0,0
	tmsg	'<inc,dec> e'

; <inc,dec> h (3072 cycles)
inch:	db	0d7h		; flag mask
	tstr	024h,07a73h,0c6bfh,069eeh,000e3h,03120h,0f86eh,003h,040h,0cec0h
	tstr	001h,0,0,0,0ff00h,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$c8,$cc,$62,$62			; expected crc
	full	$55,$0f,$9f,$52
	wz	$f1,$6f,$46,$c8
	defb	0,0,0
	tmsg	'<inc,dec> h'

; <inc,dec> hl (1536 cycles)
inchl:	db	0d7h		; flag mask
	tstr	023h,02dd8h,01c28h,0036bh,0ecd2h&~$f821,09d16h,0a8e0h,093h,0ceh,03e27h
	tstr	008h,0,0,0,0f821h,0,0,0,0,0		; (256 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	docful	$32,$dc,$82,$57			; expected crc
	wz	$fe,$da,$5e,$99
	defb	0,0,0
	tmsg	'<inc,dec> hl'

; <inc,dec> ix (1536 cycles)
incix:	db	0d7h		; flag mask
	tstr	"0ddh,023h",00200h,02cd8h,0e341h&~$f821,02977h,0cf89h,0f9abh,044h,0b5h,0734dh
	tstr	"0,8",0,0,0f821h,0,0,0,0,0,0		; (256 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	docful	$c1,$d0,$21,$a1			; expected crc
	wz	$b8,$e0,$09,$21
	defb	0,0,0
	tmsg	'<inc,dec> ix'

; <inc,dec> iy (1536 cycles)
inciy:	db	0d7h		; flag mask
	tstr	"0fdh,023h",0a9a6h,0706bh&~$f821,0226eh,087c8h,04bb2h,0e4ebh,043h,020h,000c5h
	tstr	"0,8",0,0f821h,0,0,0,0,0,0,0		; (256 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	docful	$4e,$e6,$3c,$e4			; expected crc
	wz	$7a,$23,$94,$4f
	defb	0,0,0
	tmsg	'<inc,dec> iy'

; <inc,dec> l (3072 cycles)
incl:	db	0d7h		; flag mask
	tstr	02ch,004eah,02925h,0d3ffh,00600h,0d806h,0b9bah,0c1h,022h,08100h
	tstr	001h,0,0,0,0ffh,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$ab,$f1,$64,$2e			; expected crc
	full	$36,$32,$99,$1e
	wz	$c7,$bb,$6e,$72
	defb	0,0,0
	tmsg	'<inc,dec> l'

; <inc,dec> (hl) (3072 cycles)
incm:	db	0d7h		; flag mask
	tstr	034h,04600h,07e9ch,025b2h,msbt,093ceh,0a0cfh,095h,0f1h,03cceh
	tstr	001h,0ffh,0,0,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$73,$c5,$1a,$9e
	full	$e0,$23,$08,$50
	wz	$3d,$77,$1a,$21
	defb	off_hl,0,0
	tmsg	'<inc,dec> (hl)'


; <inc,dec> sp (1536 cycles)
incsp:	db	0d7h		; flag mask
	tstr	033h,0ff4fh,016a7h,09b4eh,08097h,02ad7h,04fd1h,0c7h,0aah,0cc18h&~$f821
	tstr	008h,0,0,0,0,0,0,0,0,0f821h		; (256 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	docful	$55,$9c,$95,$15			; expected crc
	wz	$c9,$e0,$ee,$61
	defb	0,0,0
	tmsg	'<inc,dec> sp'

; <inc,dec> (<ix,iy>+1) (6144 cycles)
incx:	db	0d7h		; flag mask
	tstr	"0ddh,034h,1",0b500h,msbt-1,msbt-1,0af0eh,0d549h,0a6abh,014h,0e8h,0f573h
	tstr	"020h,1",0ffh,0,0,0,0,0,0,0,0		; (1024 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$db,$fb,$b8,$1a
	full	$9b,$7f,$5c,$3e
	wz	$a2,$ea,$07,$6c
	defb	off_iy,off_ix,0
	tmsg	'<inc,dec> (<ix,iy>+1)'

; <inc,dec> ixh (3072 cycles)
incxh:	db	0d7h		; flag mask
	tstr	"0ddh,024h",07b67h,00019h,0b0dbh,0fb34h,0c7c4h,0d680h,057h,0aah,06ebeh
	tstr	"0,1",0,0ff00h,0,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$dd,$1a,$5f,$4b			; expected crc
	full	$5e,$80,$93,$58
	wz	$f9,$33,$89,$e9
	defb	0,0,0
	tmsg	'<inc,dec> ixh'

; <inc,dec> ixl (3072 cycles)
incxl:	db	0d7h		; flag mask
	tstr	"0ddh,02ch",03305h,0bc00h,07c9ch,0b9a6h,070c6h,0e7d4h,0c4h,002h,07d8bh
	tstr	"0,1",0,0ffh,0,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$ab,$03,$c0,$96			; expected crc
	full	$66,$09,$64,$76
	wz	$c9,$64,$f8,$15
	defb	0,0,0
	tmsg	'<inc,dec> ixl'

; <inc,dec> iyh (3072 cycles)
incyh:	db	0d7h		; flag mask
	tstr	"0ddh,024h",0d45ch,0604eh,0008ch,09a18h,05ac0h,06c39h,051h,0d8h,096ffh
	tstr	"0,1",0,0,0ff00h,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$98,$49,$a7,$3e			; expected crc
	full	$05,$8a,$5a,$0e
	wz	$76,$36,$68,$d7
	defb	0,0,0
	tmsg	'<inc,dec> iyh'

; <inc,dec> iyl (3072 cycles)
incyl:	db	0d7h		; flag mask
	tstr	"0ddh,02ch",0548eh,08051h,0d400h,0610ah,0b030h,0d1b0h,016h,0aah,0df35h
	tstr	"0,1",0,0,0ffh,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$f1,$dc,$8b,$1b			; expected crc
	full	$6c,$1f,$76,$2b
	wz	$9a,$6b,$d4,$87
	defb	0,0,0
	tmsg	'<inc,dec> iyl'

; ld <bc,de>,(nnnn) (32 cycles)
ld161:	db	0d7h		; flag mask
	tstr	"0edh,04bh,low msbt,high msbt",0e11dh,08442h,0ef71h,00462h,06842h,07e4bh,090h,02dh,04bdch
	tstr	"0,010h",0,0,0,0,0,0,0,0,0		; (2 cycles)
	tstr	0,-1,0,0,0,0,0,0,0,0			; (16 cycles)
	docful	$db,$cd,$8b,$40			; expected crc
	wz	$12,$ca,$ca,$17
	defb	0,0,0
	tmsg	'ld <bc,de>,(nnnn)'

; ld hl,(nnnn) (16 cycles)
ld162:	db	0d7h		; flag mask
	tstr	"02ah,low msbt,high msbt",0ff85h,0db18h,03fech,0cb0fh,05d6ch,0f6cbh,093h,0f3h,0bad7h
	tstr	0,0,0,0,0,0,0,0,0,0			; (1 cycle)
	tstr	0,-1,0,0,0,0,0,0,0,0			; (16 cycles)
	docful	$a5,$5c,$55,$6f			; expected crc
	wz	$5f,$14,$42,$91
	defb	0,0,0
	tmsg	'ld hl,(nnnn)'
	
; ld sp,(nnnn) (16 cycles)
ld163:	db	0d7h		; flag mask
	tstr	"0edh,07bh,low msbt,high msbt",0a7e0h,02148h,086e3h,071a8h,07013h,0f343h,000h,001h,01edeh
	tstr	0,0,0,0,0,0,0,0,0,0			; (1 cycles)
	tstr	0,-1,0,0,0,0,0,0,0,0			; (16 cycles)
	docful	$08,$d6,$05,$73				; expected crc
	wz	$17,$b8,$fc,$4b
	defb	0,0,0
	tmsg	'ld sp,(nnnn)'

; ld <ix,iy>,(nnnn) (32 cycles)
ld164:	db	0d7h		; flag mask
	tstr	"0ddh,02ah,low msbt,high msbt",06a85h,03b6bh,029b3h,0440dh,0a927h,08eb7h,000h,079h,0941eh
	tstr	020h,0,0,0,0,0,0,0,0,0			; (2 cycles)
	tstr	0,-1,0,0,0,0,0,0,0,0			; (16 cycles)
	docful	$41,$b5,$18,$bb			; expected crc
	wz	$13,$4b,$fe,$8a
	defb	0,0,0
	tmsg	'ld <ix,iy>,(nnnn)'
	
; ld (nnnn),<bc,de> (64 cycles)
ld165:	db	0d7h		; flag mask
	tstr	"0edh,043h,low msbt,high msbt",08fa5h,07bd7h,04a80h,04308h,056c5h,058bah,052h,034h,08bd7h
	tstr	"0,010h",0,0,0,0,0,0,0,0,0		; (2 cycles)
	tstr	0,0,0,0,0,-1,-1,0,0,0			; (32 cycles)
	docful	$ee,$bb,$35,$17			; expected crc
	wz	$2c,$0d,$db,$67
	defb	0,0,0
	tmsg	'ld (nnnn),<bc,de>'

; ld (nnnn),hl (16 cycles)
ld166:	db	0d7h		; flag mask
	tstr	"022h,low msbt,high msbt",035f0h,0ba43h,0e8d1h,040e8h,02cd6h,07d11h,014h,062h,0dc00h
	tstr	0,0,0,0,0,0,0,0,0,0			; (1 cycle)
	tstr	0,0,0,0,-1,0,0,0,0,0			; (16 cycles)
	docful	$94,$b2,$0e,$4f				; expected crc
	wz	$b6,$0b,$85,$3c
	defb	0,0,0
	tmsg	'ld (nnnn),hl'

; ld (nnnn),sp (16 cycles)
ld167:	db	0d7h		; flag mask
	tstr	"0edh,073h,low msbt,high msbt",06e32h,07d6ah,00232h,00128h,067b0h,0e34fh,051h,02dh,0f2e2h
	tstr	0,0,0,0,0,0,0,0,0,0			; (1 cycle)
	tstr	0,0,0,0,0,0,0,0,0,-1			; (16 cycles)
	docful	$65,$9d,$15,$a5			; expected crc
	wz	$ec,$c9,$17,$86
	defb	0,0,0
	tmsg	'ld (nnnn),sp'

; ld (nnnn),<ix,iy> (64 cycles)
ld168:	db	0d7h		; flag mask
	tstr	"0ddh,022h,low msbt,high msbt",066f2h,015a3h,0b6d2h,05d0ah,0e8b5h,04b7bh,055h,059h,0e6bch
	tstr	020h,0,0,0,0,0,0,0,0,0			; (2 cycles)
	tstr	0,0,-1,-1,0,0,0,0,0,0			; (32 cycles)
	docful	$49,$d2,$31,$d0			; expected crc
	wz	$18,$d9,$bc,$06
	defb	0,0,0
	tmsg	'ld (nnnn),<ix,iy>'

; ld <bc,de,hl,sp>,nnnn (64 cycles)
ld16im:	db	0d7h		; flag mask
	tstr	1,07e15h,0bc88h,06027h,05d37h,058f4h,071a9h,017h,0dfh,09f60h
	tstr	030h,0,0,0,0,0,0,0,0,0			; (4 cycles)
	tstr	"0,0ffh,0ffh",0,0,0,0,0,0,0,0,0		; (16 cycles)
	docful	$ab,$d7,$b2,$7a			; expected crc
	wz	$82,$ab,$dd,$47
	defb	0,0,0
	tmsg	'ld <bc,de,hl,sp>,nnnn'

; ld <ix,iy>,nnnn (32 cycles)
ld16ix:	db	0d7h		; flag mask
	tstr	"0ddh,021h",06e7dh,0b693h,0b98ah,05e64h,046c9h,02aa0h,012h,093h,0f2d6h
	tstr	020h,0,0,0,0,0,0,0,0,0			; (2 cycles)
	tstr	"0,0,0ffh,0ffh",0,0,0,0,0,0,0,0,0	; (16 cycles)
	docful	$be,$88,$ee,$41			; expected crc
	wz	$f4,$ca,$60,$65
	defb	0,0,0
	tmsg	'ld <ix,iy>,nnnn'

; ld a,(<bc,de>) (44 cycles)
ld8bd:	db	0d7h		; flag mask
	tstr	00ah,063a6h,072beh,0fad8h,02eebh,msbt,msbt,087h,077h,0477bh
	tstr	010h,0,0,0,0,0,0,0,0,0		; (2 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,-1,0	; (22 cycles)
	docful	$c9,$36,$87,$fa			; expected crc
	wz	$4f,$0c,$aa,$9a
	defb	off_de,off_bc,0
	tmsg	'ld a,(<bc,de>)'

; ld <b,c,d,e,h,l,(hl),a>,nn (64 cycles)
ld8im:	db	0d7h		; flag mask
	tstr	6,0c3fah,038c0h,0224ch,0aa24h,0fb14h,03072h,0d3h,035h,017dfh
	tstr	038h,0,0,0,0,0,0,0,0,0			; (8 cycles)
	tstr	0,0,0,0,0,0,0,0,-1,0			; (8 cycles)
	docful	$8f,$2f,$05,$bf			; expected crc
	wz	$77,$5a,$c5,$4c
	defb	0,0,0
	tmsg	'ld <b,c,d,e,h,l,(hl),a>,nn'

; ld (<ix,iy>+1),nn (32 cycles)
ld8imx:	db	0d7h		; flag mask
	tstr	"0ddh,036h,1",0251dh,msbt-1,msbt-1,0a9cch,02604h,083a1h,056h,083h,05204h
	tstr	020h,0,0,0,0,0,0,0,0,0			; (2 cycles)
	tstr	"0,0,0,-1",0,0,0,0,0,0,0,-1,0		; (16 cycles)
	docful	$1d,$65,$de,$89			; expected crc
	wz	$13,$d3,$db,$7b
	defb	off_iy,off_ix,0
	tmsg	'ld (<ix,iy>+1),nn'

; ld <b,c,d,e>,(<ix,iy>+1) (512 cycles)
ld8ix1:	db	0d7h		; flag mask
	tstr	"0ddh,046h,1",0b8f5h,msbt-1,msbt-1,05471h,079a3h,0c6d2h,083h,070h,0c2e1h
	tstr	"020h,018h",0,1,1,0,0,0,0,0,0		; (32 cycles)
	tstr	0,-1,0,0,0,0,0,0,0,0			; (16 cycles)
	docful	$af,$bd,$5a,$8d			; expected crc
	wz	$9c,$59,$7b,$0b
	defb	off_iy,off_ix,0
	tmsg	'ld <b,c,d,e>,(<ix,iy>+1)'

; ld <h,l>,(<ix,iy>+1) (256 cycles)
ld8ix2:	db	0d7h		; flag mask
	tstr	"0ddh,066h,1",072d4h,msbt-1,msbt-1,0e735h,0938ch,029f4h,082h,048h,08da6h
	tstr	"020h,008h",0,1,1,0,0,0,0,0,0		; (16 cycles)
	tstr	0,-1,0,0,0,0,0,0,0,0			; (16 cycles)
	docful	$cb,$11,$c2,$dc			; expected crc
	wz	$f5,$e3,$8a,$e4
	defb	off_iy,off_ix,0
	tmsg	'ld <h,l>,(<ix,iy>+1)'

; ld a,(<ix,iy>+1) (128 cycles)
ld8ix3:	db	0d7h		; flag mask
	tstr	"0ddh,07eh,1",03d14h,msbt-1,msbt-1,07bceh,0ceb3h,05dc4h,084h,057h,098dch
	tstr	020h,0,1,1,0,0,0,0,0,0			; (8 cycles)
	tstr	0,-1,0,0,0,0,0,0,0,0			; (16 cycles)
	docful	$7a,$95,$32,$1b			; expected crc
	wz	$f3,$0c,$c7,$e1
	defb	off_iy,off_ix,0
	tmsg	'ld a,(<ix,iy>+1)'

; ld <ixh,ixl,iyh,iyl>,nn (32 cycles)
ld8ixy:	db	0d7h		; flag mask
	tstr	"0ddh,026h",0c194h,0739ch,0f589h,01798h,0f876h,0c138h,0d4h,0a1h,05d2ch
	tstr	"020h,8",0,0,0,0,0,0,0,0,0		; (4 cycles)
	tstr	0,0,0,0,0,0,0,0,-1,0			; (8 cycles)
	docful	$31,$0e,$e9,$61			; expected crc
	wz	$a3,$39,$1a,$6b
	defb	0,0,0
	tmsg	'ld <ixh,ixl,iyh,iyl>,nn'

; ld <b,c,d,e>,<b,c,d,e> (cycles)
ld8r1r1:db	0d7h		; flag mask
	tstr	100o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,070h,033fdh
	tstr	033o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0	; (54 cycles)
	docful	$f5,$0e,$37,$28			; expected crc
	wz	$1d,$bb,$f7,$09
	defb	0,0,0
	tmsg	'ld <b,c,d,e>,<b,c,d,e>'

; ld <b,c,d,e>,<h,l> (cycles)
ld8r1r2:db	0d7h		; flag mask
	tstr	104o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,070h,033fdh
	tstr	031o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0	; (54 cycles)
	docful	$58,$44,$ea,$a9			; expected crc
	wz	$83,$72,$a2,$0a
	defb	0,0,0
	tmsg	'ld <b,c,d,e>,<h,l>'

; ld <b,c,d,e>,(hl) (cycles)
ld8r1m:db	0d7h		; flag mask
	tstr	106o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,0,033fdh
	tstr	030o,0,0,0,0,0,0,0,255,0	; (32 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0		; (54 cycles)
	docful	$9a,$75,$7a,$b4			; expected crc
	wz	$4e,$f5,$9a,$87
	defb	off_hl,0,0
	tmsg	'ld <b,c,d,e>,(hl)'

; ld <b,c,d,e>,a (cycles)
ld8r1a:db	0d7h		; flag mask
	tstr	107o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,0,033fdh
	tstr	030h,0,0,0,0,0,0,0,255,0	; (32 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0	; (54 cycles)
	docful	$63,$a6,$97,$42			; expected crc
	wz	$8b,$6b,$4a,$a6
	defb	0,0,0
	tmsg	'ld <b,c,d,e>,a'


; ld <h,l>,<b,c,d,e> (cycles)
ld8r2r1:db	0d7h		; flag mask
	tstr	140o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,070h,033fdh
	tstr	013o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0		; (54 cycles)
	docful	$74,$77,$f6,$f9			; expected crc
	wz	$fb,$2c,$6e,$38
	defb	0,0,0
	tmsg	'ld <h,l>,<b,c,d,e>'

; ld <h,l>,<h,l> (cycles)
ld8r2r2:db	0d7h		; flag mask
	tstr	144o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,070h,033fdh
	tstr	011o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,-1,0,0,0d7h,0,0		; (54 cycles)
	docful	$f2,$1e,$29,$cb			; expected crc
	wz	$90,$b7,$c1,$f5
	defb	0,0,0
	tmsg	'ld <h,l>,<h,l>'

 if 0
; ld l,(hl) (cycles)
ld8lm:	db	0d7h		; flag mask
	tstr	146o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,070h,033fdh
	tstr	0,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0	; (54 cycles)
	docful	$ab,$05,$b6,$19			; expected crc
	wz	$00,$00,$00,$41
	defb	off_hl,-1,0
	tmsg	'ld l,(hl)'

; ld h,(hl) (cycles)
ld8hm:	db	0d7h		; flag mask
	tstr	156o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,070h,033fdh
	tstr	0,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0	; (54 cycles)
	docful	$ab,$05,$b6,$19			; expected crc
	wz	$00,$00,$00,$42
	defb	off_hl,-1,0
	tmsg	'ld h,(hl)'
 endif

; ld <h,l>,a (cycles)
ld8r2a:db	0d7h		; flag mask
	tstr	147o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,0,033fdh
	tstr	010o,0,0,0,0,0,0,0,255,0	; (32 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0		; (54 cycles)
	docful	$bd,$7a,$0d,$00			; expected crc
	wz	$93,$73,$4e,$f0
	defb	0,0,0
	tmsg	'ld <h,l>,a'

; ld (hl),<b,c,d,e> (cycles)
ld8mr1:	db	0d7h		; flag mask
	tstr	160o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,070h,033fdh
	tstr	003o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0ffh,0,0,0,-1,-1,0d7h,-1,0	; (54 cycles)
	docful	$af,$27,$86,$24			; expected crc
	wz	$61,$eb,$24,$45
	defb	off_hl,0,0
	tmsg	'ld (hl),<b,c,d,e>'

 if 0
; ld (hl),l (cycles)
ld8ml:	db	0d7h		; flag mask
	tstr	164o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,070h,033fdh
	tstr	000o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0	; (54 cycles)
	docful	$ab,$05,$b6,$19			; expected crc
	wz	$00,$00,$00,$45
	defb	off_hl,-1,0
	tmsg	'ld (hl),l'

; ld (hl),h (cycles)
ld8mh:	db	0d7h		; flag mask
	tstr	165o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,070h,033fdh
	tstr	000h,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0	; (54 cycles)
	docful	$ab,$05,$b6,$19			; expected crc
	wz	$00,$00,$00,$46
	defb	off_hl,-1,0
	tmsg	'ld (hl),h'
 endif

; ld (hl),a (cycles)
ld8ma:	db	0d7h		; flag mask
	tstr	167o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,070h,033fdh
	tstr	000o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,-1,0	; (54 cycles)
	docful	$08,$5b,$8b,$ff			; expected crc
	wz	$e8,$2f,$6e,$7d
	defb	off_hl,0,0
	tmsg	'ld (hl),a'

; ld a,<b,c,d,e> (cycles)
ld8ar1:	db	0d7h		; flag mask
	tstr	170o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,070h,033fdh
	tstr	003o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,-1,0	; (54 cycles)
	docful	$54,$35,$75,$c4			; expected crc
	wz	$69,$95,$53,$cb
	defb	0,0,0
	tmsg	'ld a,<b,c,d,e>'

; ld a,<h,l> (cycles)
ld8ar2:	db	0d7h		; flag mask
	tstr	174o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,070h,033fdh
	tstr	001o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,-1,0,0,0d7h,-1,0	; (54 cycles)
	docful	$9e,$2d,$a9,$51			; expected crc
	wz	$fe,$50,$cb,$d1
	defb	0,0,0
	tmsg	'ld a,<h,l>'

; ld a,(hl) (cycles)
ld8am:	db	0d7h		; flag mask
	tstr	176o,021d0h,062d4h,08087h,msbt,08dech,0c036h,015h,070h,033fdh
	tstr	000o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,-1,0	; (54 cycles)
	docful	$48,$59,$bc,$4a			; expected crc
	wz	$56,$7a,$7b,$84
	defb	off_hl,0,0
	tmsg	'ld a,(hl)'

; ld a,a (cycles)
ld8aa:	db	0d7h		; flag mask
	tstr	177o,021d0h,062d4h,08087h,0c194h,08dech,0c036h,015h,070h,033fdh
	tstr	000o,0,0,0,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,-1,0		; (54 cycles)
	docful	$1a,$8f,$ed,$56			; expected crc
	wz	$fa,$eb,$5b,$fa
	defb	0,0,0
	tmsg	'ld a,a'

; xy ld <b,c,d,e>,<b,c,d,e> (6912 cycles)
lx8r1r1:db	0d7h		; flag mask
	tstr	"0ddh,100o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,033o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0	; (54 cycles)
	docful	$4b,$3f,$16,$2b			; expected crc
	wz	$6e,$7d,$d0,$95
	defb	0,0,0
	tmsg	'xy ld <b,c,d,e>,<b,c,d,e>'

; xy ld <b,c,d,e>,<ixy> (6912 cycles)
lx8r1xy:db	0d7h		; flag mask
	tstr	"0ddh,104o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,031o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,-1,-1,0,-1,-1,0d7h,0,0	; (54 cycles)
	docful	$dd,$16,$b2,$61			; expected crc
	wz	$5a,$cf,$2e,$8a
	defb	0,0,0
	tmsg	'xy ld <b,c,d,e>,<ixy>'

; xy ld <b,c,d,e>,a (6912 cycles)
lx8r1a:	db	0d7h		; flag mask
	tstr	"0ddh,107o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,030o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,-1,0		; (54 cycles)
	docful	$be,$82,$9e,$1c			; expected crc
	wz	$9a,$a7,$a0,$4d
	defb	0,0,0
	tmsg	'xy ld <b,c,d,e>,a'

; xy ld <ixy>,<b,c,d,e> (6912 cycles)
lx8xyr1:db	0d7h		; flag mask
	tstr	"0ddh,140o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,013o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0	; (54 cycles)
	docful	$ab,$74,$e0,$0a			; expected crc
	wz	$81,$0b,$2c,$4d
	defb	0,0,0
	tmsg	'xy ld <ixy>,<b,c,d,e>'

; xy ld <ixy>,<ixy> (6912 cycles)
lx8xyxy:db	0d7h		; flag mask
	tstr	"0ddh,144o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,011o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,-1,-1,0,0,0,0d7h,0,0	; (54 cycles)
	docful	$bc,$9c,$75,$a0			; expected crc
	wz	$e0,$77,$39,$dd
	defb	0,0,0
	tmsg	'xy ld <ixy>,<ixy>'

; xy ld <ixy>,a (6912 cycles)
lx8xya:	db	0d7h		; flag mask
	tstr	"0ddh,147o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,010o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,-1,0		; (54 cycles)
	docful	$32,$69,$42,$00			; expected crc
	wz	$c5,$5d,$bb,$89
	defb	0,0,0
	tmsg	'xy ld <ixy>,a'


; xy ld a,<b,c,d,e> (6912 cycles)
lx8ar1:	db	0d7h		; flag mask
	tstr	"0ddh,170o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,003o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,-1,0		; (54 cycles)
	docful	$ca,$e8,$c0,$d7			; expected crc
	wz	$28,$20,$86,$08
	defb	0,0,0
	tmsg	'xy ld a,<b,c,d,e>'

; xy ld a,<ixy> (6912 cycles)
lx8axy:	db	0d7h		; flag mask
	tstr	"0ddh,174o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,001o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,-1,-1,0,0,0,0d7h,0,0	; (54 cycles)
	docful	$ce,$db,$62,$1e			; expected crc
	wz	$02,$de,$93,$e9
	defb	0,0,0
	tmsg	'xy ld a,<ixy>'

; xy ld a,a (6912 cycles)
lx8aa:	db	0d7h		; flag mask
	tstr	"0ddh,177o",00eeeh,062d4h,08087h,0c194h,08850h,0fa2fh,0d6h,0c6h,0ca55h
	tstr	"020h,000o",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,-1,0		; (54 cycles)
	docful	$31,$04,$15,$eb			; expected crc
	wz	$74,$51,$cb,$64
	defb	0,0,0
	tmsg	'xy ld a,a'

; ld a,(nnnn) / ld (nnnn),a (44 cycles)
lda:	db	0d7h		; flag mask
	tstr	"032h,low msbt,high msbt",053efh,0228dh,07ce5h,02607h,0be40h,020c4h,095h,0a6h,034d3h
	tstr	008h,0,0,0,0,0,0,0,0,0			; (2 cycle)
	tstr	0,0ffh,0,0,0,0,0,0d7h,-1,0		; (22 cycles)
	docful	$c7,$0a,$91,$fa			; expected crc
	wz	$f4,$0a,$44,$d4
	defb	0,0,0
	tmsg	'ld a,(nnnn) / ld (nnnn),a'

; ldd<r> (1) (44 cycles)
ldd1:	db	0d7h		; flag mask
	tstr	"0edh,0a8h",05f23h,07105h,064b9h,msbt+3,msbt+1,1,095h,09fh,09f07h
	tstr	"0,010h",0,0,0,0,0,0,0,0,0		; (2 cycles)
	tstr	0,-1,0,0,0,0,0,0d7h,0,0			; (22 cycles)
	doc	$4f,$35,$27,$9e
	full	$4f,$35,$27,$9e
	wz	$10,$bd,$a3,$4b
	defb	off_hl,off_de,0
	tmsg	'ldd<r> (1)'

; ldd<r> (2) (44 cycles)
ldd2:	db	0d7h		; flag mask
	tstr	"0edh,0a8h",03d23h,0b820h,0f72ah,msbt+3,msbt+1,2,096h,0ceh,02e79h
	tstr	"0,010h",0,0,0,0,0,0,0,0,0		; (2 cycles)
	tstr	0,-1,0,0,0,0,0,0d7h,0,0			; (22 cycles)
	doc	$76,$30,$43,$e6
	full	$01,$c3,$da,$97
	wz	$7d,$74,$4e,$09
	defb	off_hl,off_de,0
	tmsg	'ldd<r> (2)'

; ldi<r> (1) (44 cycles)
ldi1:	db	0d7h		; flag mask
	tstr	"0edh,0a0h",063a4h,039f9h,02be4h,msbt+2,msbt,1,004h,037h,05bf4h
	tstr	"0,010h",0,0,0,0,0,0,0,0,0		; (2 cycles)
	tstr	0,-1,0,0,0,0,0,0d7h,0,0			; (22 cycles)
	docful	$5e,$7d,$c3,$86			; expected crc
	wz	$44,$97,$58,$81
	defb	off_hl,off_de,0
	tmsg	'ldi<r> (1)'

; ldi<r> (2) (44 cycles)
ldi2:	db	0d7h		; flag mask
	tstr	"0edh,0a0h",016b3h,0cb5bh,0b839h,msbt+2,msbt,2,004h,079h,03189h
	tstr	"0,010h",0,0,0,0,0,0,0,0,0		; (2 cycles)
	tstr	0,-1,0,0,0,0,0,0d7h,0,0			; (22 cycles)
	docful	$95,$a9,$d3,$26			; expected crc
	wz	$da,$99,$11,$47
	defb	off_hl,off_de,0
	tmsg	'ldi<r> (2)'

; neg (65,536 cycles)
neg:	db	0d7h		; flag mask
	tstr	"0edh,044h",0bc95h,04798h,09e8eh,073ffh,01e98h,0d21fh,0,0,0ea1ch
	tstr	0,0,0,0,0,0,0,0ffh,-1,0			; (65,536 cycles)
	tstr	0,0,0,0,0,0,0,0,0,0			; (1 cycle)
	doc	$f4,$51,$80,$2d			; expected crc
	full	$c8,$fe,$ce,$be
	wz	$83,$d7,$12,$ad
	defb	0,0,0
	tmsg	'neg'

; <rld,rrd> (7168 cycles)
rld:	db	0d7h		; flag mask
	tstr	"0edh,067h",01500h,0b1c9h,002b9h,msbt,03ccfh,00d05h,012h,079h,0d080h
	tstr	"0,8",0ffh,0,0,0,0,0,0,0,0		; (512 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,-1,0			; (14 cycles)
	doc	$81,$91,$28,$0a
	full	$2e,$80,$d8,$d1
	wz	$46,$fe,$e4,$d0
	defb	off_hl,0,0
	tmsg	'<rrd,rld>'

; <rlca,rrca,rla,rra> (6144 cycles)
rot8080: db	0d7h		; flag mask
	tstr	7,02c24h,0878ah,04b38h,0c408h,06985h,09d19h,052h,0,0b228h
	tstr	018h,0,0,0,0,0,0,0,-1,0			; (1024 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0			; (6 cycles)
	doc	$aa,$57,$9a,$44			; expected crc
	full	$b7,$b9,$78,$3f
	wz	$ec,$d2,$49,$c8
	defb	0,0,0
	tmsg	'<rlca,rrca,rla,rra>'

; shift/rotate (<ix,iy>+1) (416 cycles)
rotxy:	db	0d7h		; flag mask
	tstr	"0ddh,0cbh,1,6",02ff8h,msbt-1,msbt-1,013e6h,0e92fh,0ab28h,014h,092h,0dbc1h
	tstr	"020h,0,0,038h",0,0,0,0,0,0,080h,0,0	; (32 cycles)
	tstr	0,0ffh,0,0,0,0,0,057h,0,0		; (13 cycles)
	doc	$d8,$ff,$28,$a7
	full	$3e,$d4,$b1,$b2
	wz	$f9,$a9,$1c,$2c
	defb	off_iy,off_ix,0
	tmsg	'shf/rot (<ix,iy>+1)'

; shift/rotate <b,c,d,e> (2,880 cycles)
rotzr1:	db	0d7h		; flag mask
	tstr	"0cbh,0",0aa49h,05be9h,0bbeeh,0c408h,08820h,0a331h,057h,005h,0d7c2h
	tstr	"0,03bh",0,0,0,0,0,0,080h,0,0	; (64 cycles)
	tstr	0,0,0,0,0,-1,-1,057h,-1,0	; (45 cycles)
	doc	$ac,$9f,$2a,$59
	full	$71,$a7,$19,$bb
	wz	$67,$a3,$84,$5c
	defb	0,0,0
	tmsg	'shf/rot <b,c,d,e>'

; shift/rotate <h,l> (1,440 cycles)
rotzr2:	db	0d7h		; flag mask
	tstr	"0cbh,4",0aa49h,05be9h,0bbeeh,0c408h,08820h,0a331h,057h,005h,0d7c2h
	tstr	"0,039h",0,0,0,0,0,0,080h,0,0	; (32 cycles)
	tstr	0,0,0,0,-1,0,0,057h,0,0		; (45 cycles)
	doc	$40,$7f,$c0,$b6
	full	$85,$60,$33,$16
	wz	$f8,$5b,$a7,$5a
	defb	0,0,0
	tmsg	'shf/rot <h,l>'

; shift/rotate (hl) (720 cycles)
rotzm:	db	0d7h		; flag mask
	tstr	"0cbh,6",0aa49h,05be9h,0bbeeh,msbt,08820h,0a331h,057h,005h,0d7c2h
	tstr	"0,038h",0,0,0,0,0,0,080h,0,0	; (16 cycles)
	tstr	0,0ffh,0,0,0,0,0,057h,0,0	; (53 cycles)
	doc	$53,$87,$38,$54
	full	$81,$e2,$8e,$2a
	wz	$3e,$12,$a0,$a5
	defb	off_hl,0,0
	tmsg	'shf/rot (hl)'

; shift/rotate a (208 cycles)
rotza:	db	0d7h		; flag mask
	tstr	"0cbh,7",0aa49h,05be9h,0bbeeh,0c408h,08820h,0a331h,057h,005h,0d7c2h
	tstr	"0,038h",0,0,0,0,0,0,080h,0,0	; (16 cycles)
	tstr	0,0,0,0,0,0,0,057h,-1,0		; (13 cycles)
	doc	$e0,$1a,$4e,$81
	full	$07,$06,$e2,$f1
	wz	$ca,$00,$45,$20
	defb	0,0,0
	tmsg	'shf/rot a'

; <set,res> n,<b,c,d,e> (228 cycles)
srzr1:	db	0d7h		; flag mask
	tstr	"0cbh,080h",0120fh,03b1dh,044f6h,0d23dh,04dd3h,0a388h,0d7h,01ch,0f29ah
	tstr	"0,07bh",0,0,0,0,0,0,0,0,0	; (6 cycles)
	tstr	0,0,0,0,0,-1,-1,0d7h,0,0	; (38 cycles)
	docful	$8b,$64,$a0,$28			; expected crc
	wz	$ae,$3b,$cc,$e2
	defb	0,0,0
	tmsg	'<set,res> n,<b,c,d,e>'

; <set,res> n,<h,l> (448 cycles)
srzr2:	db	0d7h		; flag mask
	tstr	"0cbh,084h",0120fh,03b1dh,044f6h,0d23dh,04dd3h,0a388h,0d7h,01ch,0f29ah
	tstr	"0,079h",0,0,0,0,0,0,0,0,0	; (32 cycles)
	tstr	0,0,0,0,-1,0,0,0d7h,0,0		; (14 cycles)
	docful	$d2,$ea,$48,$bd			; expected crc
	wz	$5b,$88,$c4,$ea
	defb	0,0,0
	tmsg	'<set,res> n,<h,l>'

; <set,res> n,(hl) (224 cycles)
srzm:	db	0d7h		; flag mask
	tstr	"0cbh,086h",0120fh,03b1dh,044f6h,msbt,04dd3h,0a388h,0d7h,01ch,0f29ah
	tstr	"0,078h",0,0,0,0,0,0,0,0,0	; (16 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0	; (14 cycles)
	docful	$9b,$04,$1d,$1a			; expected crc
	wz	$96,$eb,$59,$f6
	defb	off_hl,0,0
	tmsg	'<set,res> n,(hl)'

; <set,res> n,a (24,576 cycles)
srza:	db	0d7h		; flag mask
	tstr	"0cbh,087h",0120fh,03b1dh,044f6h,0d23dh,04dd3h,0a388h,0d7h,0,0f29ah
	tstr	"0,078h",0,0,0,0,0,0,0,-1,0	; (4,096 cycles)
	tstr	0,0,0,0,0,0,0,0d7h,0,0		; (6 cycles)
	docful	$68,$ba,$8d,$3a			; expected crc
	wz	$aa,$fc,$51,$82
	defb	0,0,0
	tmsg	'<set,res> n,a'

; <set,res> n,(<ix,iy>+1) (1792 cycles)
srzx:	db	0d7h		; flag mask
	tstr	"0ddh,0cbh,1,086h",06e55h,msbt-1,msbt-1,0b8b8h,05e89h,00a02h,010h,042h,09fc7h
	tstr	"020h,0,0,078h",0,0,0,0,0,0,0,0,0	; (128 cycles)
	tstr	0,0ffh,0,0,0,0,0,0d7h,0,0		;(14 cycles)
	docful	$80,$0b,$82,$de			; expected crc
	wz	$18,$5a,$3d,$83
	defb	off_iy,off_ix,0
	tmsg	'<set,res> n,(<ix,iy>+1)'

; ld (<ix,iy>+1),<b,c,d,e> (1024 cycles)
st8ix1:	db	0d7h		; flag mask
	tstr	"0ddh,070h,1",0d23dh,msbt-1,msbt-1,0f0b7h,007d2h,0c6d6h,0d2h,0aah,09ab7h
	tstr	"020h,003h",0,1,1,0,0,0,0,0,0		; (32 cycles)
	tstr	0,0,0,0,0,-1,-1,0,0,0			; (32 cycles)
	docful	$d4,$bd,$bd,$4d			; expected crc
	wz	$8e,$96,$eb,$36
	defb	off_iy,off_ix,0
	tmsg	'ld (<ix,iy>+1),<b,c,d,e>'

; ld (<ix,iy>+1),<h,l> (256 cycles)
st8ix2:	db	0d7h		; flag mask
	tstr	"0ddh,074h,1",0c3d8h,msbt-1,msbt-1,02ae6h,0e106h,0ecf2h,092h,079h,01860h
	tstr	"020h,001h",0,1,1,0,0,0,0,0,0		; (16 cycles)
	tstr	0,0,0,0,-1,0,0,0,0,0			; (32 cycles)
	docful	$0c,$6b,$8a,$dd			; expected crc
	wz	$9f,$3f,$fb,$46
	defb	off_iy,off_ix,0
	tmsg	'ld (<ix,iy>+1),<h,l>'

; ld (<ix,iy>+1),a (64 cycles)
st8ix3:	db	0d7h		; flag mask
	tstr	"0ddh,077h,1",02dbeh,msbt-1,msbt-1,004b5h,046a6h,0da21h,085h,0a9h,0829bh
	tstr	020h,0,1,1,0,0,0,0,0,0			; (8 cycles)
	tstr	0,0,0,0,0,0,0,0,-1,0			; (8 cycles)
	docful	$11,$fa,$d8,$40			; expected crc
	wz	$54,$08,$b2,$3a
	defb	off_iy,off_ix,0
	tmsg	'ld (<ix,iy>+1),a'

; ld (<bc,de>),a (48 cycles)
stabd:	db	0d7h		; flag mask
	tstr	2,0f744h,0f012h,0243ah,073bah,msbt,msbt+1,0d0h,055h,05101h
	tstr	010h,0,0,0,0,0,0,0,0,0			; (2 cycles)
	tstr	0,-1,0,0,0,0,0,0,-1,0			; (24 cycles)
	docful	$cf,$a7,$c7,$5c
	wz	$a7,$36,$bd,$72
	defb	off_de,off_bc,0
	tmsg	'ld (<bc,de>),a'

	if	testtest

faux:	db	0
	tstr	"$c3,low fauxsub,high fauxsub",0,0,0,0,0,0,0,0,$8000
	tstr	0,$30,0,0,0,0,0,0,0,0
	tstr	0,$13,7,0,0,0,0,0,0,0
	db	$e4,$7f,$13,$3b
	df	0,0,0
	tmsg	'test the test'

fauxsub:
	push	de
	push	hl
	ld	de,crlf
	msg_de
	ld	hl,msbt
	call	phex8
	pop	hl
	pop	de
	jp	idone

	endif

; start test pointed to by (hl)
stt:	push	hl
	ld	a,(hl)		; get pointer to test
	inc	hl
	ld	h,(hl)
	ld	l,a

	if	docflag
	ld	a,(hl)		; flag mask
	ld	(flgmsk+1),a
	endif

	inc	hl
	push	hl
	ld	de,20
	add	hl,de		; point to incmask
	call	init_cnt
	pop	hl
	push	hl
	ld	de,20+20
	add	hl,de		; point to scanmask
	call	init_shift
	pop	hl
	push	hl
	ld	de,iut		; copy initial instruction under test
	ld	bc,4
	ldir
	ld	de,msbt		; copy initial machine state
	ld	bc,16
	ldir
	ld	de,20+20+4+3	; skip incmask, scanmask, expcrc, addrfix
	add	hl,de
	ex	de,hl
	msg_de			; show test name
	call	initcrc		; initialise crc

	if	wzflag
	ld	hl,0
	ld	(wzbt),hl
	endif

	pop	hl
	push	hl

	exx
	ld	de,msat
	exx
	ld	de,20+20+20+4
	add	hl,de		; addrfix

	ld	a,(hl)
	inc	hl
	exx
	ld	l,a
	ld	h,0
	add	hl,de
	ld	(afix0r+1),hl
	ld	(afix0w+1),hl
	exx

	ld	a,(hl)
	inc	hl
	exx
	ld	l,a
	ld	h,0
	add	hl,de
	ld	(afix1r+1),hl
	ld	(afix1w+1),hl
	exx

	ld	a,(hl)
	inc	hl
	exx
	ld	l,a
	ld	h,0
	add	hl,de
	ld	(afix2r+1),hl
	ld	(afix2w+1),hl
	exx

; GWP - do first iteration separately to generate the same patterns at the
; old code.  When I feel it all works we'll use a more natural loop.

	call	test
	call	inccnt
	call	z,shift_left
	jr	z,tlpdn

; test loop
tlp:	call	shift_xor
	call	test		; execute the test instruction
	call	shift_xor
	call	inccnt		; increment the counter
	call	z,shift_left	; shift the scan bit if counter finished
	jp	nz,tlp		; keep going if shift not done

tlpdn:
	pop	hl		; pointer to test case
	ld	de,20+20+20
	add	hl,de		; point to expected crc
	call	cmpcrc
	ld	de,okmsg
	jp	z,tlpok
	ld	de,ermsg1
	msg_de
	call	phex8
	ld	de,ermsg2
	msg_de
	ld	hl,crcval
	call	phex8
	ld	de,crlf
tlpok:	msg_de
	pop	hl
	inc	hl
	inc	hl
	ret

; clear memory at hl, bc bytes
clrmem:	push	af
	push	bc
	push	de
	push	hl
	ld	(hl),0
	ld	d,h
	ld	e,l
	inc	de
	dec	bc
	ldir
	pop	hl
	pop	de
	pop	bc
	pop	af
	ret

; test harness
test:
 if 0
	ld	hl,iut
	call	phex8
	ld	e,' '
	putc
	ld	hl,msbt
	ld	b,16
pp:	ld	a,(hl)
	call	phex2
	inc	hl
	djnz	pp
	ld	e,10
	putc
 endif

	if	wzflag
 	exx
	ld	hl,0
	exx
	endif

	di			; disable interrupts
	ld	(spsav),sp	; save stack pointer
	ld	sp,msbt+2	; point to test-case machine state
	pop	iy		; and load all regs
	pop	ix
	pop	hl
	pop	de
	pop	bc
	pop	af
	ld	sp,(spbt)
	jp	its
idone:	ld	(spat),sp	; save stack pointer
	ld	sp,spat
	if	wzflag
	push	af		; ZW (well, 2 bits of W in F) 
	ex	af,af'
	endif
	push	af		; save other registers
	push	bc
	push	de
	push	hl
	push	ix
	push	iy
	ld	sp,0		; restore stack pointer
spsav	equ	$-2
	ei			; enable interrupts

; Adjust any addresses in results
	ld	de,-msbt
afix0r:	ld	hl,(0)
	add	hl,de
afix0w:	ld	(0),hl
afix1r:	ld	hl,(0)
	add	hl,de
afix1w:	ld	(0),hl
afix2r:	ld	hl,(0)
	add	hl,de
afix2w:	ld	(0),hl

; Any operation that modifies memory writes to msbt and msbt+1 so we
; use that in our CRC.
; Well, at the very least we can recude these changes to 7 cycles in our
; completely unrolled CRC update.
	ld	hl,(msbt)	; copy memory operand
	ld	(msat),hl

	ld	de,msat
	ld	hl,crcval+3	; point to low byte of old crc

; Unrolled CRC update of the state after test.
crc	macro
	ld	a,(de)
	inc	e
	call	updcrc
	endm

	crc			; memop
	crc			; memop + 1
	crc			; IXL
	crc			; IXH

	crc			; IYL
	crc			; IYH
	crc			; L
	crc			; H

	crc			; E
	crc			; D
	crc			; C
	crc			; B

	ld	a,(de)		; F
	if	docflag
flgmsk:	and	a,0d7h		; mask-out irrelevant bits (self-modified code!)
	endif
	inc	e
	call	updcrc
	crc			; A

	if	wzflag
	ld	a,(de)		; F with W bits 3, 5
	and	$28
	inc	e
	call	updcrc
	inc	e		; A skipped
	endif

	crc			; low SP
	ld	a,(de)
	call	updcrc		; high SP

	ret

; display hex string (pointer in hl, byte count in b)
hexstr:	ld	a,(hl)
	call	phex2
	inc	hl
	dec	b
	jp	nz,hexstr
	ret

; display hex
; display the big-endian 32-bit value pointed to by hl
phex8:	push	af
	push	bc
	push	hl
	ld	b,4
ph8lp:	ld	a,(hl)
	call	phex2
	inc	hl
	dec	b
	jp	nz,ph8lp
	pop	hl
	pop	bc
	pop	af
	ret

; display byte in a
phex2:	push	af
	rrca
	rrca
	rrca
	rrca
	call	phex1
	pop	af
; fall through	

; display low nibble in a
phex1:	push	af
	push	bc
	push	de
	push	hl
	and	a,0fh
	cp	a,10
	jp	c,ph11
	add	a,'a'-'9'-1
ph11:	add	a,'0'
	ld	e,a
	putc
	pop	hl
	pop	de
	pop	bc
	pop	af
	ret

cmpcrc:	push	bc
	push	de
	push	hl
	ld	de,crcval
	ld	b,4
cclp:	ld	a,(de)
	cp	a,(hl)
	jp	nz,cce
	inc	hl
	inc	de
	dec	b
	jp	nz,cclp
cce:	pop	hl
	pop	de
	pop	bc
	ret

; 32-bit crc routine
; entry: a contains next byte, updates crcval
; exit:  crc updated
; HL must be loaded with crcval+3 upon entry (and will be there at exit)
; crcval must not cross a 256 byte boundary
; crctab must be 1024 aligned.
updcrc:	push	de
	xor	a,(hl)		; xor crcval+3 with new byte

	ld	d,(high crctab) shr 2	; OK because of 1K alignment
	add	a,a
	rl	d
	add	a,a
	rl	d
	ld	e,a

	ld	l,low crcval

crcstep	macro
	ld	a,(de)		; a = *crctab
	xor	a,c		; a ^= c
	ld	c,(hl)		; c = *crcval
	ld	(hl),a		; *crcval = a
	endm

	ld	a,(de)
	ld	c,(hl)
	ld	(hl),a
	inc	e
	inc	l
	crcstep
	inc	e
	inc	l
	crcstep
	inc	e
	inc	l
	crcstep

      if	0
      	push	de
	ld	hl,crcval
	call	phex8
	ld	de,crlf
	msg_de
	pop	de
      endif

	pop	de
	ret

initcrc:push	af
	push	bc
	push	hl
	ld	hl,crcval
	ld	a,0ffh
	ld	b,4
icrclp:	ld	(hl),a
	inc	hl
	djnz	icrclp
	pop	hl
	pop	bc
	pop	af
	ret

; Align to 1024 byte boundary
	org	($+1023) & $fc00

crctab:	db	000h,000h,000h,000h
	db	077h,007h,030h,096h
	db	0eeh,00eh,061h,02ch
	db	099h,009h,051h,0bah
	db	007h,06dh,0c4h,019h
	db	070h,06ah,0f4h,08fh
	db	0e9h,063h,0a5h,035h
	db	09eh,064h,095h,0a3h
	db	00eh,0dbh,088h,032h
	db	079h,0dch,0b8h,0a4h
	db	0e0h,0d5h,0e9h,01eh
	db	097h,0d2h,0d9h,088h
	db	009h,0b6h,04ch,02bh
	db	07eh,0b1h,07ch,0bdh
	db	0e7h,0b8h,02dh,007h
	db	090h,0bfh,01dh,091h
	db	01dh,0b7h,010h,064h
	db	06ah,0b0h,020h,0f2h
	db	0f3h,0b9h,071h,048h
	db	084h,0beh,041h,0deh
	db	01ah,0dah,0d4h,07dh
	db	06dh,0ddh,0e4h,0ebh
	db	0f4h,0d4h,0b5h,051h
	db	083h,0d3h,085h,0c7h
	db	013h,06ch,098h,056h
	db	064h,06bh,0a8h,0c0h
	db	0fdh,062h,0f9h,07ah
	db	08ah,065h,0c9h,0ech
	db	014h,001h,05ch,04fh
	db	063h,006h,06ch,0d9h
	db	0fah,00fh,03dh,063h
	db	08dh,008h,00dh,0f5h
	db	03bh,06eh,020h,0c8h
	db	04ch,069h,010h,05eh
	db	0d5h,060h,041h,0e4h
	db	0a2h,067h,071h,072h
	db	03ch,003h,0e4h,0d1h
	db	04bh,004h,0d4h,047h
	db	0d2h,00dh,085h,0fdh
	db	0a5h,00ah,0b5h,06bh
	db	035h,0b5h,0a8h,0fah
	db	042h,0b2h,098h,06ch
	db	0dbh,0bbh,0c9h,0d6h
	db	0ach,0bch,0f9h,040h
	db	032h,0d8h,06ch,0e3h
	db	045h,0dfh,05ch,075h
	db	0dch,0d6h,00dh,0cfh
	db	0abh,0d1h,03dh,059h
	db	026h,0d9h,030h,0ach
	db	051h,0deh,000h,03ah
	db	0c8h,0d7h,051h,080h
	db	0bfh,0d0h,061h,016h
	db	021h,0b4h,0f4h,0b5h
	db	056h,0b3h,0c4h,023h
	db	0cfh,0bah,095h,099h
	db	0b8h,0bdh,0a5h,00fh
	db	028h,002h,0b8h,09eh
	db	05fh,005h,088h,008h
	db	0c6h,00ch,0d9h,0b2h
	db	0b1h,00bh,0e9h,024h
	db	02fh,06fh,07ch,087h
	db	058h,068h,04ch,011h
	db	0c1h,061h,01dh,0abh
	db	0b6h,066h,02dh,03dh
	db	076h,0dch,041h,090h
	db	001h,0dbh,071h,006h
	db	098h,0d2h,020h,0bch
	db	0efh,0d5h,010h,02ah
	db	071h,0b1h,085h,089h
	db	006h,0b6h,0b5h,01fh
	db	09fh,0bfh,0e4h,0a5h
	db	0e8h,0b8h,0d4h,033h
	db	078h,007h,0c9h,0a2h
	db	00fh,000h,0f9h,034h
	db	096h,009h,0a8h,08eh
	db	0e1h,00eh,098h,018h
	db	07fh,06ah,00dh,0bbh
	db	008h,06dh,03dh,02dh
	db	091h,064h,06ch,097h
	db	0e6h,063h,05ch,001h
	db	06bh,06bh,051h,0f4h
	db	01ch,06ch,061h,062h
	db	085h,065h,030h,0d8h
	db	0f2h,062h,000h,04eh
	db	06ch,006h,095h,0edh
	db	01bh,001h,0a5h,07bh
	db	082h,008h,0f4h,0c1h
	db	0f5h,00fh,0c4h,057h
	db	065h,0b0h,0d9h,0c6h
	db	012h,0b7h,0e9h,050h
	db	08bh,0beh,0b8h,0eah
	db	0fch,0b9h,088h,07ch
	db	062h,0ddh,01dh,0dfh
	db	015h,0dah,02dh,049h
	db	08ch,0d3h,07ch,0f3h
	db	0fbh,0d4h,04ch,065h
	db	04dh,0b2h,061h,058h
	db	03ah,0b5h,051h,0ceh
	db	0a3h,0bch,000h,074h
	db	0d4h,0bbh,030h,0e2h
	db	04ah,0dfh,0a5h,041h
	db	03dh,0d8h,095h,0d7h
	db	0a4h,0d1h,0c4h,06dh
	db	0d3h,0d6h,0f4h,0fbh
	db	043h,069h,0e9h,06ah
	db	034h,06eh,0d9h,0fch
	db	0adh,067h,088h,046h
	db	0dah,060h,0b8h,0d0h
	db	044h,004h,02dh,073h
	db	033h,003h,01dh,0e5h
	db	0aah,00ah,04ch,05fh
	db	0ddh,00dh,07ch,0c9h
	db	050h,005h,071h,03ch
	db	027h,002h,041h,0aah
	db	0beh,00bh,010h,010h
	db	0c9h,00ch,020h,086h
	db	057h,068h,0b5h,025h
	db	020h,06fh,085h,0b3h
	db	0b9h,066h,0d4h,009h
	db	0ceh,061h,0e4h,09fh
	db	05eh,0deh,0f9h,00eh
	db	029h,0d9h,0c9h,098h
	db	0b0h,0d0h,098h,022h
	db	0c7h,0d7h,0a8h,0b4h
	db	059h,0b3h,03dh,017h
	db	02eh,0b4h,00dh,081h
	db	0b7h,0bdh,05ch,03bh
	db	0c0h,0bah,06ch,0adh
	db	0edh,0b8h,083h,020h
	db	09ah,0bfh,0b3h,0b6h
	db	003h,0b6h,0e2h,00ch
	db	074h,0b1h,0d2h,09ah
	db	0eah,0d5h,047h,039h
	db	09dh,0d2h,077h,0afh
	db	004h,0dbh,026h,015h
	db	073h,0dch,016h,083h
	db	0e3h,063h,00bh,012h
	db	094h,064h,03bh,084h
	db	00dh,06dh,06ah,03eh
	db	07ah,06ah,05ah,0a8h
	db	0e4h,00eh,0cfh,00bh
	db	093h,009h,0ffh,09dh
	db	00ah,000h,0aeh,027h
	db	07dh,007h,09eh,0b1h
	db	0f0h,00fh,093h,044h
	db	087h,008h,0a3h,0d2h
	db	01eh,001h,0f2h,068h
	db	069h,006h,0c2h,0feh
	db	0f7h,062h,057h,05dh
	db	080h,065h,067h,0cbh
	db	019h,06ch,036h,071h
	db	06eh,06bh,006h,0e7h
	db	0feh,0d4h,01bh,076h
	db	089h,0d3h,02bh,0e0h
	db	010h,0dah,07ah,05ah
	db	067h,0ddh,04ah,0cch
	db	0f9h,0b9h,0dfh,06fh
	db	08eh,0beh,0efh,0f9h
	db	017h,0b7h,0beh,043h
	db	060h,0b0h,08eh,0d5h
	db	0d6h,0d6h,0a3h,0e8h
	db	0a1h,0d1h,093h,07eh
	db	038h,0d8h,0c2h,0c4h
	db	04fh,0dfh,0f2h,052h
	db	0d1h,0bbh,067h,0f1h
	db	0a6h,0bch,057h,067h
	db	03fh,0b5h,006h,0ddh
	db	048h,0b2h,036h,04bh
	db	0d8h,00dh,02bh,0dah
	db	0afh,00ah,01bh,04ch
	db	036h,003h,04ah,0f6h
	db	041h,004h,07ah,060h
	db	0dfh,060h,0efh,0c3h
	db	0a8h,067h,0dfh,055h
	db	031h,06eh,08eh,0efh
	db	046h,069h,0beh,079h
	db	0cbh,061h,0b3h,08ch
	db	0bch,066h,083h,01ah
	db	025h,06fh,0d2h,0a0h
	db	052h,068h,0e2h,036h
	db	0cch,00ch,077h,095h
	db	0bbh,00bh,047h,003h
	db	022h,002h,016h,0b9h
	db	055h,005h,026h,02fh
	db	0c5h,0bah,03bh,0beh
	db	0b2h,0bdh,00bh,028h
	db	02bh,0b4h,05ah,092h
	db	05ch,0b3h,06ah,004h
	db	0c2h,0d7h,0ffh,0a7h
	db	0b5h,0d0h,0cfh,031h
	db	02ch,0d9h,09eh,08bh
	db	05bh,0deh,0aeh,01dh
	db	09bh,064h,0c2h,0b0h
	db	0ech,063h,0f2h,026h
	db	075h,06ah,0a3h,09ch
	db	002h,06dh,093h,00ah
	db	09ch,009h,006h,0a9h
	db	0ebh,00eh,036h,03fh
	db	072h,007h,067h,085h
	db	005h,000h,057h,013h
	db	095h,0bfh,04ah,082h
	db	0e2h,0b8h,07ah,014h
	db	07bh,0b1h,02bh,0aeh
	db	00ch,0b6h,01bh,038h
	db	092h,0d2h,08eh,09bh
	db	0e5h,0d5h,0beh,00dh
	db	07ch,0dch,0efh,0b7h
	db	00bh,0dbh,0dfh,021h
	db	086h,0d3h,0d2h,0d4h
	db	0f1h,0d4h,0e2h,042h
	db	068h,0ddh,0b3h,0f8h
	db	01fh,0dah,083h,06eh
	db	081h,0beh,016h,0cdh
	db	0f6h,0b9h,026h,05bh
	db	06fh,0b0h,077h,0e1h
	db	018h,0b7h,047h,077h
	db	088h,008h,05ah,0e6h
	db	0ffh,00fh,06ah,070h
	db	066h,006h,03bh,0cah
	db	011h,001h,00bh,05ch
	db	08fh,065h,09eh,0ffh
	db	0f8h,062h,0aeh,069h
	db	061h,06bh,0ffh,0d3h
	db	016h,06ch,0cfh,045h
	db	0a0h,00ah,0e2h,078h
	db	0d7h,00dh,0d2h,0eeh
	db	04eh,004h,083h,054h
	db	039h,003h,0b3h,0c2h
	db	0a7h,067h,026h,061h
	db	0d0h,060h,016h,0f7h
	db	049h,069h,047h,04dh
	db	03eh,06eh,077h,0dbh
	db	0aeh,0d1h,06ah,04ah
	db	0d9h,0d6h,05ah,0dch
	db	040h,0dfh,00bh,066h
	db	037h,0d8h,03bh,0f0h
	db	0a9h,0bch,0aeh,053h
	db	0deh,0bbh,09eh,0c5h
	db	047h,0b2h,0cfh,07fh
	db	030h,0b5h,0ffh,0e9h
	db	0bdh,0bdh,0f2h,01ch
	db	0cah,0bah,0c2h,08ah
	db	053h,0b3h,093h,030h
	db	024h,0b4h,0a3h,0a6h
	db	0bah,0d0h,036h,005h
	db	0cdh,0d7h,006h,093h
	db	054h,0deh,057h,029h
	db	023h,0d9h,067h,0bfh
	db	0b3h,066h,07ah,02eh
	db	0c4h,061h,04ah,0b8h
	db	05dh,068h,01bh,002h
	db	02ah,06fh,02bh,094h
	db	0b4h,00bh,0beh,037h
	db	0c3h,00ch,08eh,0a1h
	db	05ah,005h,0dfh,01bh
	db	02dh,002h,0efh,08dh

init_cnt:
	ld	de,counter
	ld	c,low iut
	ld	b,4
	call	inicnt

	ld	b,16
	ld	c,low msbt
	call	inicnt

	ld	a,$ff
	ld	(de),a
	ret

inicnt:	ld	a,(hl)
	or	a
	jr	z,nobit

	cpl
	ld	(de),a
	inc	e
	ld	(de),a
	inc	e
	ld	a,c
	ld	(de),a
	inc	e

nobit:	inc	hl
	inc	c
	djnz	inicnt
	ret


inccnt:	ld	hl,counter

ilp:	ld	a,(hl)		; mask for increment, preserve destination
	cp	$ff
	ret	z		; mask $ff means we've reached the end

	inc	l
	ld	c,a
	cpl
	ld	b,a		; count bits mask

	ld	a,1
	add	a,(hl)		; increment counter (need carry)
	push	af

	or	c		; restore slip bits in counter
	ld	(hl),a		; remember counter
	ex	af,af'		; save counter to apply to template

	inc	l		; position
	ld	d,high iut	; should loaded by caller	
	ld	e,(hl)
	inc	l

	ld	a,(de)
	and	c		; clear bits we set
	ld	c,a
	ex	af,af'
	and	b		; isolate count bits
	or	c		; put them into template
	ld	(de),a		; template modified

	pop	af
	jr	c,ilp
	; nz guaranteed
	ret

init_shift:
	ex	de,hl
	ld	hl,shifter

	ld	(hl),0		; mask bit
	inc	l
	ld	a,l
	inc	a
	ld	(hl),a		; pointer to current byte
	inc	l

	push	hl

	ld	b,4
	ld	c,low iut
	call	inishf

	ld	b,16
	ld	c,low msbt
	call	inishf

	; Hard code shift through bit 3 and 5 of W
	if	wzflag
	ld	b,1
	ld	c,low(wzbt + 1)
	ld	de,bit35
	call	inishf
	endif

; These two bytes give us a run-out of zero just like the original.
; Which is good, I'd say, but it should come naturally.

	ld	(hl),$fe
	inc	l
	ld	(hl),low dummy
	inc	l

	ld	(hl),$ff

	pop	hl
; XXX - seems like we could avoid the complement with an xor?
; yes: or mask, xor mask should do it
; XXX if so, might well apply to update loop and counter, too.
	ld	a,(hl)		; first mask byte
	cpl
	ld	c,a		; mask for preserving shifted bits
	ld	a,(hl)
	inc	a		; set first bit
	and	c		; leave only that bit
	dec	l
	dec	l
	ld	(hl),a		; save bit
	ret
	if	wzflag
bit35:	defb	$28
	endif

inishf:	ld	a,(de)
	or	a
	jr	z,nsbit

	cpl
	ld	(hl),a
	inc	l
	ld	(hl),c
	inc	l

nsbit:	inc	de
	inc	c
	djnz	inishf
	ret

shift_xor:
	ld	hl,shifter
	ld	a,(hl)
	inc	l
	ld	l,(hl)
	inc	l
	ld	l,(hl)
	xor	(hl)
	ld	(hl),a
	ret

shift_left:
	ld	hl,shifter

	ld	c,(hl)
	inc	l
	ld	l,(hl)

	ld	a,(hl)
	cp	$ff
	ret	z

	ld	b,a

	add	a,c
	add	a,c		; shift bit left with slip bits
	push	af		; save carry indicating we must continue

	ld	c,a
	ld	a,b
	cpl			; mask to clear slip bits
	and	c		; now we have the bit
	ld	(shifter),a	; and save it

	pop	af
	ret	nc		; nz guaranteed

	inc	l
	inc	l
	ld	a,l
	ld	(shifter+1),a	; remember next byte position

; XXX - as in initialization, xor probably easier
	ld	a,(hl)		; mask byte for next position
	cpl
	ld	c,a		; mask for preserving shifted bits
	ld	a,(hl)
	inc	a		; get the next bit
	and	c		; mask off the rest
	ld	(shifter),a	; remember the new bit

	; still nz
	ret


	if	!cpm

showbuf:
; Copy the rest of the displayed results to the screen buffer
	ld	hl,(cursor)
	ld	a,l
	add	a,63
	jr	nc,hok
	inc	h
hok:	and	$c0
	ld	l,a
	ld	de,-15360
	add	hl,de
	ld	a,h
	or	l
	jr	z,nodisp
	ld	b,h
	ld	c,l
	ld	de,(bufpos)
	ld	hl,15360
	ldir
	ld	(bufpos),de
nodisp:
; No need for scrolling unless more than a screen was buffered.
	ld	hl,buffer+1024
	ex	de,hl
	or	a
	sbc	hl,de
	ret	c

; Don't go into a display loop unless we're a real TRS-80.
; Test 1 - ROM at 0 then we're a TRS-80
	ld	hl,0
	ld	a,(hl)
	cpl
	ld	(hl),a
	cp	(hl)
	jr	nz,trs80
; Test 2 - if bit 1 of $FF can't be cleared via $ec then we're not.
	in	a,($ff)
	res	1,a
	out	($ec),a
	in	a,($ff)
	bit	1,a
	ret	nz

trs80:	ld	hl,(bufpos)
	ld	de,-1024
	add	hl,de
	ld	(pos),hl
	ld	(bufpos),hl	; this now marks the last position.

; Up/down arrows will scroll through the tests.
displp:	ld	a,($3840)
	ld	hl,(pos)
	ld	de,buffer
	ld	bc,-64
	bit	3,a
	jr	nz,move
	bit	4,a
	ld	de,(bufpos)
	ld	bc,64
	jr	z,displp

move:	or	a
	sbc	hl,de
	jr	z,displp	; at buffer top/bottom; do nothing
	ld	hl,(pos)
	add	hl,bc
	ld	(pos),hl
	ld	de,15360
	ld	bc,1024
	ldir

	jr	displp

	ret

; Screen buffer so test results may be examined later.
bufpos:	defw	buffer
pos:	defs	2
buffer:

	end	begin
