
/**
 * Wolfenstein 3D in C.
 *
 * Coordinate spaces:
 * 0,0 is upper-left of maze.
 * X is across
 * Y is down
 * Angle has 64 steps: 0 to the right, 16 down, 32 left, 48 up.
 *
 * All positions are 8 bits: 3 for the maze (cells) and 5 within the cells.
 *
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <unistd.h>
#include <string.h>

#define DEBUG 0

#define MAZE_SIZE 8
#define SCREEN_WIDTH 64
#define SCREEN_HEIGHT 16

// https://en.wikipedia.org/wiki/Wolfenstein_3D#Development
static char *MAZE[MAZE_SIZE] = {
    "********",
    "* *    *",
    "*    * *",
    "*    * *",
    "*      *",
    "*   ****",
    "**     *",
    "********",
};

static int8_t DIR_TABLE_X[] = {
    32,32,31,31,30,28,27,25,23,20,18,15,12,9,6,3,0,-3,-6,-9,-12,-15,-18,-20,-23,-25,-27,-28,-30,-31,-31,-32,-32,-32,-31,-31,-30,-28,-27,-25,-23,-20,-18,-15,-12,-9,-6,-3,0,3,6,9,12,15,18,20,23,25,27,28,30,31,31,32
};
static int8_t DIR_TABLE_Y[] = {
    0,-3,-6,-9,-12,-15,-18,-20,-23,-25,-27,-28,-30,-31,-31,-32,-32,-32,-31,-31,-30,-28,-27,-25,-23,-20,-18,-15,-12,-9,-6,-3,0,3,6,9,12,15,18,20,23,25,27,28,30,31,31,32,32,32,31,31,30,28,27,25,23,20,18,15,12,9,6,3
};
// abs(255/v)
static uint8_t SIGNED_DIV_TABLE[] = {
    0,255,127,85,63,51,42,36,31,28,25,23,21,19,18,17,15,15,14,13,12,12,11,11,10,10,9,9,9,8,8,8,7,7,7,7,7,6,6,6,6,6,6,5,5,5,5,5,5,5,5,5,4,4,4,4,4,4,4,4,4,4,4,4,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,6,6,6,6,6,6,7,7,7,7,7,8,8,8,9,9,9,10,10,11,11,12,12,13,14,15,15,17,18,19,21,23,25,28,31,36,42,51,63,85,127,255
};
static uint8_t DIST_TO_HEIGHT[] = {
    24,24,24,24,24,24,24,24,24,24,24,23,21,19,18,17,15,15,14,13,12,12,11,11,10,10,9,9,9,8,8,8,7,7,7,7,7,6,6,6,6,6,6,5,5,5,5,5,5,5,5,5,4,4,4,4,4,4,4,4,4,4,4,4,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
};

static uint8_t posX = 100;
static uint8_t posY = 128;
static uint8_t dir = 0;

uint8_t getColumnHeight(uint8_t x) {
    int8_t dirX = DIR_TABLE_X[dir];
    int8_t dirY = DIR_TABLE_Y[dir];
    int8_t planeX = dirY;
    int8_t planeY = -dirX;
    int8_t cameraX = 2*x - SCREEN_WIDTH; // x-coordinate in camera space
    int8_t rayDirX = dirX + planeX * cameraX / SCREEN_WIDTH;  // Shift
    int8_t rayDirY = dirY + planeY * cameraX / SCREEN_WIDTH;

    // which box of the map we're in
    uint8_t mapX = posX >> 5;
    uint8_t mapY = posY >> 5;

    // length of ray from one x or y-side to next x or y-side
    uint8_t side; // was a NS or a EW wall hit?
    uint8_t perpWallDist;
    if (rayDirX == 0) {
        side = 1;
        uint8_t deltaDistY = SIGNED_DIV_TABLE[(uint8_t) rayDirY];

        // length of ray from current position to next x or y-side
        int16_t sideDistY;

        // what direction to step in x or y-direction (either +1 or -1)
        int8_t stepY;

        // calculate step and initial sideDist
        if (rayDirY < 0) {
            stepY = -1;
            sideDistY = (posY - mapY*32) * deltaDistY / 32;
        } else {
            stepY = 1;
            sideDistY = ((mapY + 1)*32 - posY) * deltaDistY / 32;
        }

        // perform DDA
        uint8_t hit = 0; // was there a wall hit?
        while (!hit) {
            // jump to next map square, either in x-direction, or in y-direction
            sideDistY += deltaDistY;
            mapY += stepY;
            // Check if ray has hit a wall
            if (MAZE[mapY][mapX] != ' ') hit = 1;
        }

        // Calculate distance projected on camera direction (Euclidean distance
        // would give fisheye effect!)
        perpWallDist = sideDistY - deltaDistY;
    } else if (rayDirY == 0) {
        side = 0;
        uint8_t deltaDistX = SIGNED_DIV_TABLE[(uint8_t) rayDirX];

        // length of ray from current position to next x or y-side
        int16_t sideDistX;

        // what direction to step in x or y-direction (either +1 or -1)
        int8_t stepX;

        // calculate step and initial sideDist
        if (rayDirX < 0) {
            stepX = -1;
            sideDistX = (posX - mapX*32) * deltaDistX / 32; // Shift
        } else {
            stepX = 1;
            sideDistX = ((mapX + 1)*32 - posX) * deltaDistX / 32;
        }

        // perform DDA
        uint8_t hit = 0; // was there a wall hit?
        while (!hit) {
            // jump to next map square, either in x-direction, or in y-direction
            sideDistX += deltaDistX; // 16-bit add.
            mapX += stepX;
            // Check if ray has hit a wall
            if (MAZE[mapY][mapX] != ' ') hit = 1;
        }

        // Calculate distance projected on camera direction (Euclidean distance
        // would give fisheye effect!)
        perpWallDist = sideDistX - deltaDistX;
    } else {
        uint8_t deltaDistX = SIGNED_DIV_TABLE[(uint8_t) rayDirX];
        uint8_t deltaDistY = SIGNED_DIV_TABLE[(uint8_t) rayDirY];

        // length of ray from current position to next x or y-side
        int16_t sideDistX;
        int16_t sideDistY;

        // what direction to step in x or y-direction (either +1 or -1)
        int8_t stepX;
        int8_t stepY;

        // calculate step and initial sideDist
        if (rayDirX < 0) {
            stepX = -1;
            sideDistX = (posX - mapX*32) * deltaDistX / 32; // Shift
        } else {
            stepX = 1;
            sideDistX = ((mapX + 1)*32 - posX) * deltaDistX / 32;
        }
        if (rayDirY < 0) {
            stepY = -1;
            sideDistY = (posY - mapY*32) * deltaDistY / 32;
        } else {
            stepY = 1;
            sideDistY = ((mapY + 1)*32 - posY) * deltaDistY / 32;
        }

        // perform DDA
        uint8_t hit = 0; // was there a wall hit?
        while (!hit) {
            // jump to next map square, either in x-direction, or in y-direction
            if (sideDistX < sideDistY) { // XXX 16-bit comparison! RST 0x18?
                sideDistX += deltaDistX; // 16-bit add.
                mapX += stepX;
                side = 0;
            } else {
                sideDistY += deltaDistY;
                mapY += stepY;
                side = 1;
            }
            // Check if ray has hit a wall
            if (MAZE[mapY][mapX] != ' ') hit = 1;
        }

        // Calculate distance projected on camera direction (Euclidean distance
        // would give fisheye effect!)
        if (side == 0) {
            perpWallDist = sideDistX - deltaDistX;
        } else {
            perpWallDist = sideDistY - deltaDistY;
        }

#if DEBUG
        printf("x: %d, raydir: %d %d, side: %d %d, delta: %d %d, mapX: %d, mapY: %d, perp: %d\n",
                x, rayDirX, rayDirY, sideDistX, sideDistY, deltaDistX, deltaDistY,
                mapX, mapY, perpWallDist);
#endif 
    }

    // Calculate height of line to draw on screen
    uint8_t lineHeight = DIST_TO_HEIGHT[perpWallDist];

    if (side == 1) {
        lineHeight |= 0x80;
    }

    return lineHeight;
}

void getScreenWidth(uint8_t height[SCREEN_WIDTH]) {
    for (uint8_t x = 0; x < SCREEN_WIDTH; x++) {
        height[x] = getColumnHeight(x);
    }
}

void drawWalls(uint8_t height[SCREEN_WIDTH], uint8_t screen[SCREEN_HEIGHT][SCREEN_WIDTH + 1]) {
    memset(screen, ' ', SCREEN_HEIGHT*(SCREEN_WIDTH + 1));

    for (uint8_t x = 0; x < SCREEN_WIDTH; x++) {
        uint8_t h = height[x];
        char c = (h & 0x80) == 0 ? '*' : '|';
        h = (h & 0x7F) / 3;
        uint8_t y1 = SCREEN_HEIGHT/2 - h;
        uint8_t y2 = SCREEN_HEIGHT/2 + h;
        for (uint8_t y = y1; y < y2; y++) {
            screen[y][x] = c;
        }
    }
}

void printScreen(uint8_t screen[SCREEN_HEIGHT][SCREEN_WIDTH + 1]) {
    // Clear screen.
#if !DEBUG
    printf("\x1B[H\x1B[J");
#endif

    for (uint8_t y = 0; y < SCREEN_HEIGHT; y++) {
        screen[y][SCREEN_WIDTH] = '\0';
        printf("%s\n", screen[y]);
    }

    printf("Dir = %d\n", dir);
}

int main() {
    uint8_t height[SCREEN_WIDTH];
    uint8_t screen[SCREEN_HEIGHT][SCREEN_WIDTH + 1];

    while (1) {
        getScreenWidth(height);
        drawWalls(height, screen);
        printScreen(screen);

        usleep(1000*200);
        dir = (dir + 1) % 64;

#if DEBUG
        break;
#endif
    }
}
