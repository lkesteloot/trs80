/*
 * Copyright 2019 Lawrence Kesteloot
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {BitType} from "./BitType";

/**
 * Information about one particular bit (its position and status).
 */
export class BitData {
    public startFrame: number;
    public endFrame: number;
    public bitType: BitType;

    /**
     * Create an object representing a bit.
     *
     * @param startFrame the first frame, inclusive.
     * @param endFrame the last frame, inclusive.
     * @param bitType what kind of bit it is.
     */
    constructor(startFrame: number, endFrame: number, bitType: BitType) {
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.bitType = bitType;
    }
}
