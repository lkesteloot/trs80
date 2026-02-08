5 CLS:DEFINT A-Z
10 C1 = 64
11 CA = 8
12 CB = 8
20 C4 = 4*C1
30 XR = 128
40 YR = 48
50 MC = 15
60 RN = -2*C1
70 RX = 1*C1
80 IN = -5*C1/4
90 IX = 5*C1/4
100 RD = (RX - RN)/(XR - 1)
110 ID = (IX - IN)/(YR - 1)
120 I = IN
130 FOR Y = 0 TO YR - 1
140     R = RN
150     FOR X = 0 TO XR - 1
160         ZR = 0
170         ZI = 0
180         CT = 0
190         R2 = 0
200         I2 = 0
220             TR = R2 - I2 + R
230             TI = ZR*2/CA*ZI/CB + I
240             ZR = TR
250             ZI = TI
260             R2 = ZR/CA*ZR/CB
270             I2 = ZI/CA*ZI/CB
280             CT = CT + 1
290         IF CT < MC AND R2 + I2 < C4 GOTO 220
300         IF CT AND 1 THEN SET(X,Y)
310         R = R + RD
320     NEXT X
340     I = I + ID
350 NEXT Y
360 GOTO 360
