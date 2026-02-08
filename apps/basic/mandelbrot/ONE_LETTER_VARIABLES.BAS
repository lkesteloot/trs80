5 CLS:DEFINT A-Z
10 A = 64
11 B = 8
12 C = 8
20 D = 4*A
30 E = 128
40 F = 48
50 G = 15
60 H = -2*A
70 J = 1*A
80 K = -5*A/4
90 L = 5*A/4
100 M = (J - H)/(E - 1)
110 N = (L - K)/(F - 1)
120 I = K
130 Y = 0
140     R = H
150     X = 0
160         O = 0
170         P = 0
180         Q = 0
190         S = 0
200         T = 0
220             U = S - T + R
230             V = O*2/B*P/C + I
240             O = U
250             P = V
260             S = O/B*O/C
270             T = P/B*P/C
280             Q = Q + 1
290         IF Q < G AND S + T < D GOTO 220
300         IF Q AND 1 THEN SET(X,Y)
310         R = R + M
320     X = X + 1
321     IF X < E THEN GOTO 160
340     I = I + N
350 Y = Y + 1
351 IF Y < F THEN GOTO 140
