; https://github.com/gp48k/z80-dis-tiny/tree/main/src/matt-1/-best-

z80dis:
        xor     a
        ld      iyl,a           ;IYL=isixiy
        call    ld_a_hl
        sub     b               ;b=$40
        jp      c,grp_00
        sub     b
        jr      c,grp_40
        sub     b
        jr      c,grp_80
        jr      grp_c0

rst10:
rrca3
        rrca
        rrca
        rrca
        and     7
        bit     2,a
        ret

rst18:
jrtbl8  ld      b,a
        and     7
jrtbl   ex      (sp),hl
        ld      c,a
        ld      a,b
        jr      jt8z

rst20:
ld_a_hl
        ld      a,(hl)
        inc     hl
        ld      bc,$4080
        ret

osiz    dec     a
        push    bc

rst28:
out_str_ind
        pop     bc
out_str_ind_p1
        or      a
        jr      z,ots0_p1
        push    af
osi0    ld      a,(bc)
        inc     bc
        rlca
        jr      nc,osi0
        inc     a ;cp      ('_'-32+64)*2+1 ; done if list terminator
        jr      z,ots2
        pop     af
        jr      osiz

rst38:
out_str
out_str_arg
        ld      iyh,a           ;IYH=otsarg
ots0    pop     bc
ots0_p1 ld      a,(bc)
        inc     bc
        push    bc
        push    af
        and     $3f
        add     a,32
        ld      (de),a
        inc     de
        sub     a,'3'
        cp      '?'-'3'+1
        call    c,replace
        pop     af
        add     a,a
        jp      p,ots1
        ld      a,' '
        ld      (de),a
        inc     de
ots1    jr      nc,ots0
ots2    pop     bc
ld_de_0 xor     a
        ld      (de),a
        ret

grp_40
        cp      $76-$40-$40
        jr      nz,isld
ishalt
        call    out_str
        defb    'H'-32,'A'-32,'L'-32,'T'-32+128
; move isld down so jr's will reach
;isld
;        call    out_str_arg
;        defb    'L'-32,'D'-32+64,'='-32,','-32,'3'-32+128

grp_c0
        call    jrtbl8
        defb    gc00-$
        defb    gc01-$
        defb    gc02-$
        defb    gc03-$
        defb    gc04-$
        defb    gc05-$
        defb    gc06-$
        defb    gc07-$

gc05
        call    rrca3
        rra
        jr      nc,gc05y
gc05x
        call    jrtbl8          ;instead of jrtbl so a is passed
        defb    gc050-$
        defb    gc051-$
        defb    grp_ed-$
        defb    gc053-$

gc053   dec     a               ;FD
gc051   jr      z80dis+1        ;DD

gc050
iscall
        call    out_str
        defb    'C'-32,'A'-32,'L'-32,'L'-32+64,'5'-32+128

;gc052
;        jr      grp_ed          ;ED


; move gc05y down so jr's will reach
;gc05y
;ispush
;        call    out_str_arg
;        defb    'P'-32,'U'-32,'S'-32,'H'-32+64,'8'-32+128

; tucked jrtbl8 tail in here so jr's will reach
jt8z    ld      b,0
        add     hl,bc
        ld      c,(hl)
        add     hl,bc
        ex      (sp),hl
        ret

gc06                            ;c is clr
grp_80                          ;c is set
        push    af              ;save c
        call    isalux
        defb    'A'-32,'D'-32,'D'-32+64,'A'-32,','-32+128
        defb    'A'-32,'D'-32,'C'-32+64,'A'-32,','-32+128
        defb    'S'-32,'U'-32,'B'-32+64+128
        defb    'S'-32,'B'-32,'C'-32+64,'A'-32,','-32+128
        defb    'A'-32,'N'-32,'D'-32+64+128
        defb    'X'-32,'O'-32,'R'-32+64+128
        defb    'O'-32,'R'-32+64+128
        defb    'C'-32,'P'-32+64+128

; tucked gc05y in here so jr's will reach
gc05y
ispush
        call    out_str_arg
        defb    'P'-32,'U'-32,'S'-32,'H'-32+64,'8'-32+128

; tucked isld in here so jr'swill reach
isld
        call    out_str_arg
        defb    'L'-32,'D'-32+64,'='-32,','-32,'3'-32+128

gc00
isretc
        call    out_str_arg
        defb    'R'-32,'E'-32,'T'-32+64,';'-32+128

gc01
        call    rrca3
        rra
        jr      c,gc010
ispop
        call    out_str_arg
        defb    'P'-32,'O'-32,'P'-32+64,'8'-32+128

gc010   call    out_str_ind
        defb    'R'-32,'E'-32,'T'-32+128
        defb    'E'-32,'X'-32,'X'-32+128
        defb    'J'-32,'P'-32+64,'('-32,'6'-32,')'-32+128
        defb    'L'-32,'D'-32+64,'S'-32,'P'-32,','-32,'6'-32+128

gc02
isjpc
        call    out_str_arg
        defb    'J'-32,'P'-32+64,';'-32,','-32,'5'-32+128

gc03
        call    rrca3
        dec     a
        jr      nz,not_cb
grp_cb                          ;CB
        cp      a,iyl           ;IYL=isixiy, a=0
        call    ld_a_hl
        jr      z,grp_cbx
        call    ld_a_hl
        push    hl
        dec     hl
        dec     hl
        call    grp_cbx
        pop     hl
        ret

grp_cbx
        sub     b ;$40
        push    af              ;save a and c
        jr      c,grp_cb00
grp_cbc0
grp_cb80
grp_cb40
        rlca
        rlca
        and     3               ;a=0,1,2 not 3
        call    bit_res_set
        pop     af
        call    out_str_arg
        defb    '<'-32,','-32,'3'-32+128

bit_res_set
        call    out_str_ind
        defb    'B'-32,'I'-32,'T'-32+64+128
        defb    'R'-32,'E'-32,'S'-32+64+128
        defb    'S'-32,'E'-32,'T'-32+64+128

grp_cb00                        ;c is set in af on stack
        call    iscbalux
        defb    'R'-32,'L'-32,'C'-32+64+128
        defb    'R'-32,'R'-32,'C'-32+64+128
        defb    'R'-32,'L'-32+64+128
        defb    'R'-32,'R'-32+64+128
        defb    'S'-32,'L'-32,'A'-32+64+128
        defb    'S'-32,'R'-32,'A'-32+64+128
        defb    128
        defb    'S'-32,'R'-32,'L'-32+64+128

not_cb
        inc     a
        call    out_str_ind
        defb    'J'-32,'P'-32+64,'5'-32+128
        defb    128
        defb    'O'-32,'U'-32,'T'-32+64,'('-32,'4'-32,')'-32,','-32,'A'-32+128
        defb    'I'-32,'N'-32+64,'A'-32,','-32,'('-32,'4'-32,')'-32+128
        defb    'E'-32,'X'-32+64,'('-32,'S'-32,'P'-32,')'-32,','-32,'6'-32+128
        defb    'E'-32,'X'-32+64,'D'-32,'E'-32,','-32,'H'-32,'L'-32+128
        defb    'D'-32,'I'-32+128
        defb    'E'-32,'I'-32+128

gc04
iscallc
        call    out_str_arg
        defb    'C'-32,'A'-32,'L'-32,'L'-32+64,';'-32,','-32,'5'-32+128

;gc06
;isalun
;        jr      grp_80

gc07
isrst
        and     $38
        call    out_str_arg
        defb    'R'-32,'S'-32,'T'-32+64,':'-32+128

grp_ed
        call    ld_a_hl
;        add     $40
        cp      c ;$40+$40=$80
;        jp      c,ld_de_0       ;grp_ed00, grp_edc0
;        cp     $80+$40
        jr      c,grp_ed40
grp_ed80
;        xor     $a0+$40         ;10x..y.. xit if x=0 or y=1
        and     $1f             ;only needed if not only grp_ed80 case!
        ld      c,a
;        and     $24             ;bound to valid range 0-15
;        jp      nz,ld_de_0      ;xit80
;        ld      a,c
        and     $03
        add     a,c
        rrca
        call    out_str_ind
        defb    'L'-32,'D'-32,'I'-32+128     
        defb    'C'-32,'P'-32,'I'-32+128     
        defb    'I'-32,'N'-32,'I'-32+128     
        defb    'O'-32,'U'-32,'T'-32,'I'-32+128     
        defb    'L'-32,'D'-32,'D'-32+128     
        defb    'C'-32,'P'-32,'D'-32+128     
        defb    'I'-32,'N'-32,'D'-32+128     
        defb    'O'-32,'U'-32,'T'-32,'D'-32+128     
        defb    'L'-32,'D'-32,'I'-32,'R'-32+128     
        defb    'C'-32,'P'-32,'I'-32,'R'-32+128     
        defb    'I'-32,'N'-32,'I'-32,'R'-32+128     
        defb    'O'-32,'T'-32,'I'-32,'R'-32+128
        defb    'L'-32,'D'-32,'D'-32,'R'-32+128     
        defb    'C'-32,'P'-32,'D'-32,'R'-32+128     
        defb    'I'-32,'N'-32,'D'-32,'R'-32+128
        defb    'O'-32,'T'-32,'D'-32,'R'-32+128
; terminator only needed if index is not bounded above!     
        defb    '_'-32+64+128 ; list terminator

grp_ed40
        call    jrtbl8
        defb    ged400-$
        defb    ged401-$
        defb    ged402-$
        defb    ged403-$
        defb    ged404-$
        defb    ged405-$
        defb    ged406-$
        defb    ged407-$
ged400
isinpc
        call    out_str_arg
        defb    'I'-32,'N'-32+64,'='-32,','-32,'('-32,'C'-32,')'-32+128

ged401
isoutc
        call    out_str_arg
        defb    'O'-32,'U'-32,'T'-32+64,'('-32,'C'-32,')'-32,','-32,'='-32+128

ged402
        call    rrca3
        rra
        jr      c,isadcw
issbcw
        call    out_str_arg
        defb    'S'-32,'B'-32,'C'-32+64,'6'-32,','-32,'7'-32+128
isadcw
        call    out_str_arg
        defb    'A'-32,'D'-32,'C'-32+64,'6'-32,','-32,'7'-32+128

ged403
        call    rrca3
        rra
        jr      c,isldrpatnn
isldatnnrp
        call    out_str_arg
        defb    'L'-32,'D'-32+64,'('-32,'5'-32,')'-32,','-32,'7'-32+128
isldrpatnn
        call    out_str_arg
        defb    'L'-32,'D'-32+64,'7'-32,','-32,'('-32,'5'-32,')'-32+128

ged404
        and     $38
;        jr      nz,xited
isneg
        call    out_str_ind
        defb    'N'-32,'E'-32,'G'-32+128
        defb    '_'-32+64+128 ; list terminator

ged405
        call    rrca3
        call    out_str_ind
        defb    'R'-32,'E'-32,'T'-32,'N'-32+128
        defb    'R'-32,'E'-32,'T'-32,'I'-32+128
        defb    '_'-32+64+128 ; list terminator

ged406
        call    rrca3
        call    out_str_ind
        defb    'I'-32,'M'-32+64,'0'-32+128
        defb    128
        defb    'I'-32,'M'-32+64,'1'-32+128
        defb    'I'-32,'M'-32+64,'2'-32+128
        defb    '_'-32+64+128 ; list terminator

ged407
        call    rrca3
        call    out_str_ind
        defb    'L'-32,'D'-32+64,'I'-32,','-32,'A'-32+128
        defb    'L'-32,'D'-32+64,'R'-32,','-32,'A'-32+128
        defb    'L'-32,'D'-32+64,'A'-32,','-32,'I'-32+128
        defb    'L'-32,'D'-32+64,'A'-32,','-32,'R'-32+128
        defb    'R'-32,'R'-32,'D'-32+128
        defb    'R'-32,'L'-32,'D'-32+128
        defb    '_'-32+64+128 ; list terminator

grp_00
        call    jrtbl8
        defb    g000-$
        defb    g001-$
        defb    g002-$
        defb    g003-$
        defb    g004-$
        defb    g005-$
        defb    g006-$
        defb    g007-$

g000
        call    rrca3
        jr      nz,g0004        ;go if bit2=1
        call    out_str_ind
        defb    'N'-32,'O'-32,'P'-32+128
        defb    'E'-32,'X'-32+64,'A'-32,'F'-32,','-32,'A'-32,'F'-32,''''-32+128
        defb    'D'-32,'J'-32,'N'-32,'Z'-32+64,'9'-32+128
        defb    'J'-32,'R'-32+64,'9'-32+128

g0004
isjrc
        and     3
        call    out_str_arg
        defb    'J'-32,'R'-32+64,'?'-32,','-32,'9'-32+128

g001
        call    rrca3
        rra
        jr      c,isaddw
isldw
        call    out_str_arg
        defb    'L'-32,'D'-32+64,'7'-32,','-32,'5'-32+128
isaddw
        call    out_str_arg
        defb    'A'-32,'D'-32,'D'-32+64,'6'-32,','-32,'7'-32+128

g002
        call    rrca3
        jr      nz,g0022        ;go if bit2=1
        rrca
        jr      c,g0021
        call    out_str_arg
        defb    'L'-32,'D'-32+64,'('-32,'7'-32,')'-32,','-32,'A'-32+128
g0021   call    out_str_arg
        defb    'L'-32,'D'-32+64,'A'-32,','-32,'('-32,'7'-32,')'-32+128
g0022   and     3
        call    out_str_ind
        defb    'L'-32,'D'-32+64,'('-32,'5'-32,')'-32,','-32,'6'-32+128
        defb    'L'-32,'D'-32+64,'6'-32,','-32,'('-32,'5'-32,')'-32+128
        defb    'L'-32,'D'-32+64,'('-32,'5'-32,')'-32,','-32,'A'-32+128
        defb    'L'-32,'D'-32+64,'A'-32,','-32,'('-32,'5'-32,')'-32+128

g003
isincdecw
        call    rrca3
        rra
        jr      c,isdecw
isincw
        call    out_str_arg
        defb    'I'-32,'N'-32,'C'-32+64,'7'-32+128
isdecw
        call    out_str_arg
        defb    'D'-32,'E'-32,'C'-32+64,'7'-32+128

g004
isinc
        call    out_str_arg
        defb    'I'-32,'N'-32,'C'-32+64,'='-32+128

g005
isdec
        call    out_str_arg
        defb    'D'-32,'E'-32,'C'-32+64,'='-32+128

g006
isldn
        call    out_str_arg
        defb    'L'-32,'D'-32+64,'='-32,','-32,'4'-32+128

g007
        call    rrca3
        call    out_str_ind
        defb    'R'-32,'L'-32,'C'-32,'A'-32+128
        defb    'R'-32,'R'-32,'C'-32,'A'-32+128
        defb    'R'-32,'L'-32,'A'-32+128
        defb    'R'-32,'R'-32,'A'-32+128
        defb    'D'-32,'A'-32,'A'-32+128
        defb    'C'-32,'P'-32,'L'-32+128
        defb    'S'-32,'C'-32,'F'-32+128
        defb    'C'-32,'C'-32,'F'-32+128

;===============================

replace dec     de
        ld      b,iyh           ;IYH=otsarg
        call    jrtbl
        defb    out_reg-$       ; '3'
        defb    hexb_at_hl-$    ; '4'
        defb    hexw_at_hl-$    ; '5'
        defb    out_hlixiy-$    ; '6'
        defb    out_rp0-$       ; '7'
        defb    out_rp-$        ; '8'
        defb    hexrel_at_hl-$  ; '9'
        defb    hex_a-$         ; ':'
        defb    out_cond_hi-$   ; ';'
        defb    out_bit-$       ; '<'
        defb    out_reg_hi-$    ; '='
        defb    hexofs_at_hl-$  ; '>'
        defb    out_cond-$      ; '?'

out_cond_hi
        call    rrca3
out_cond
        call    out_str_ind
        defb    'N'-32,'Z'-32+128
        defb    'Z'-32+128
        defb    'N'-32,'C'-32+128
        defb    'C'-32+128
        defb    'N'-32,'V'-32+128
        defb    'V'-32+128
        defb    'P'-32+128
        defb    'M'-32+128

out_rp
        inc     a
rp0     inc     a
        and     3
        jr      nz,nothlixiy
out_hlixiy
        ld      a,iyl           ;IYL=isixiy
        call    out_str_ind
        defb    'H'-32,'L'-32+128
        defb    'I'-32,'X'-32+128
        defb    'I'-32,'Y'-32+128

out_rp0
        inc     a
        and     3
        jr      nz,rp0
nothlixiy
        call    out_str_ind
        defb    'S'-32,'P'-32+128
        defb    'A'-32,'F'-32+128
        defb    'B'-32,'C'-32+128
        defb    'D'-32,'E'-32+128

iscbalux
isalux
        call    rrca3
        pop     bc
        call    out_str_ind_p1
        pop     af
        jr      c,out_reg
hexb_at_hl
        call    ld_a_hl
hex_a
        ld      b,a
hex_b
        ld      a,'$'
        ld      (de),a
        inc     de
hb0     ld      a,b
        rrca
        rrca
        rrca
        rrca
        call    hb1
        ld      a,b
hb1     and     $0f
        cp      10
        sbc     a,$69
        daa
        ld      (de),a
        inc     de
;        jp      ld_de_0
        xor     a
        ld      (de),a
        ret

hexofs_at_hl
        call    ld_a_hl
        cp      c ;$80
        ld      c,'+'
        jr      c,ofsplus
        neg
        ld      c,'-'
ofsplus
        ld      b,a
        ld      a,c
        ld      (de),a
        inc     de
        jr      hex_b

hexrel_at_hl
        call    ld_a_hl
        ld      c,a
        rlca
        sbc     a,a
        ld      b,a
        push    hl
        add     hl,bc
        ex      (sp),hl
        pop     bc
        jr      hex_bc

hexw_at_hl
        ld      c,(hl)
        inc     hl
        ld      b,(hl)
        inc     hl
hex_bc
        call    hex_b
        ld      b,c
        jr      hb0

out_bit
        call    rrca3
        jr      hb1

out_reg_hi
        call    rrca3
out_reg
        inc     a
        and     7
        cp      7
        jr      nz,nothl
        add     a,iyl
nothl   call    out_str_ind
        defb    'A'-32+128,'B'-32+128,'C'-32+128,'D'-32+128,'E'-32+128,'H'-32+128,'L'-32+128
        defb    '('-32,'H'-32,'L'-32,')'-32+128
        defb    '('-32,'I'-32,'X'-32,'>'-32,')'-32+128
        defb    '('-32,'I'-32,'Y'-32,'>'-32,')'-32+128
