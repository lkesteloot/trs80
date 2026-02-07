
/**
 * Test of 16-bit signed multiply.
 *
 * This program tests the code on this page:
 *
 * https://wikiti.brandonw.net/index.php?title=Z80_Routines:Math:Multiplication#16.2A16_multiplication_2
 *
 * It's a 16-bit signed multiply into a 32-bit register, doing a
 * straightforward unsigned multiply but pre-compensating for the error introduced
 * by not taking into account negative operands. This pre-compensation is broken
 * because it affects HL up front, which causes incorrect carry bits to be seen
 * later. Post-compensation works (see the PRECOMPENSATE define below). Oddly,
 * the page explains that the supplied code is a fixed version of another routine
 * (with a link), but the two routines are identical.
 *
 * cc multiply.c -o multiply && ./multiply
 */

#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>

// Set to 1 to pre-compensate, the way the original code was written. This does not
// result in the correct answer. Set to 0 to post-compensate, which results in the
// correct answer.
#define PRECOMPENSATE 1

typedef uint8_t BYTE;
typedef uint16_t WORD;
typedef int16_t SWORD;
typedef uint32_t LONG;

// DEHL = BC*DE (signed)
LONG multiply(WORD bc, WORD de) {
    BYTE a = 0;                 //    xor a             ; Clear A and carry (for SBC).
    WORD hl = 0;                //    ld h,a            ; Clear HL.
    WORD offset = 0;
                                //    ld l,a
    if (de & 0x8000) {          //    bit 7,d           ; See if DE is negative.
                                //    jr z,de_positive  ; Skip if not.
#if PRECOMPENSATE
        hl -= bc;               //    sbc hl,bc         ; HL -= BC.
#else
        offset -= bc;
#endif
    }
                                //de_positive:
    if (bc & 0x8000) {          //    or b              ; See if BC is negative.
                                //    jp p,bc_positive  ; Skip if not.
#if PRECOMPENSATE
        hl -= de;               //    sbc hl,de         ; HL -= DE.
#else
        offset -= de;
#endif
    }
                                //bc_positive:
    for (a = 0; a < 16; a++) {  //    ld a,16           ; 16 iterations of the loop.
        int hl_carry = hl >> 15;//loop:
        hl += hl;               //    add hl,hl         ; HL <<= 1, shift in 0, carry out.
        int de_carry = de >> 15;
        de <<= 1;               //    rl e              ; DE <<= 1, shift in carry.
        de |= hl_carry;         //    rl d              ; Shift out MSB of DE.
        if (de_carry) {         //    jr nc,skip        ; Skip if 0 MSB.
            int sum = (LONG) hl + (LONG) bc;
            int sum_carry = (sum >> 16) & 1;
            hl = sum;           //    add hl,bc         ; HL += BC.
            if (sum_carry) {    //    jr nc,skip        ; Skip if HL didn't carry.
                de++;           //    inc de            ; Add carry to DE.
            }
        }
                                //skip:
                                //    dec a             ; Next loop iteration.
                                //    jr nz,loop
    }

    // Post-compensate.
    de += offset;

    return (((LONG) de) << 16) | hl;
}

void test(WORD A, WORD B) {
    LONG direct = (LONG) (SWORD) A * (LONG) (SWORD) B;
    LONG computed = multiply(A, B);

    if (direct != computed) {
        printf("A = 0x%04X %d\n", A, (int) (signed short) A);
        printf("B = 0x%04X %d\n", B, (int) (signed short) B);
        printf("long direct =   0x%08X %d\n", direct, direct);
        printf("long computed = 0x%08X %d\n", computed, computed);
        printf("\n");
    }
}

int main() {
    test(32766, 32766);

    test(1, 32766);
    test(32766, 1);

    test(-1, 32766);
    test(32766, -1);

    test(1, -32766);
    test(-32766, 1);

    test(-1, -32766); // Broken if pre-computing.
    test(-32766, -1); // OK.

    // Random tests.
    if (RAND_MAX < 65536) {
        printf("RAND_MAX too small: %d\n", RAND_MAX);
    }
    for (int i = 0; i < 100 && 1; i++) {
        WORD A = rand();
        WORD B = rand();

        test(A, B);
    }

    return 0;
}
