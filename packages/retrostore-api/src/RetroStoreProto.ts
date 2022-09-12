export const enum Trs80Model {
  UNKNOWN_MODEL = "UNKNOWN_MODEL",
  MODEL_I = "MODEL_I",
  MODEL_III = "MODEL_III",
  MODEL_4 = "MODEL_4",
  MODEL_4P = "MODEL_4P",
}

export const encodeTrs80Model: { [key: string]: number } = {
  UNKNOWN_MODEL: 0,
  MODEL_I: 1,
  MODEL_III: 2,
  MODEL_4: 3,
  MODEL_4P: 4,
};

export const decodeTrs80Model: { [key: number]: Trs80Model } = {
  0: Trs80Model.UNKNOWN_MODEL,
  1: Trs80Model.MODEL_I,
  2: Trs80Model.MODEL_III,
  3: Trs80Model.MODEL_4,
  4: Trs80Model.MODEL_4P,
};

export const enum MediaType {
  UNKNOWN = "UNKNOWN",
  DISK = "DISK",
  CASSETTE = "CASSETTE",
  COMMAND = "COMMAND",
  BASIC = "BASIC",
}

export const encodeMediaType: { [key: string]: number } = {
  UNKNOWN: 0,
  DISK: 1,
  CASSETTE: 2,
  COMMAND: 3,
  BASIC: 4,
};

export const decodeMediaType: { [key: number]: MediaType } = {
  0: MediaType.UNKNOWN,
  1: MediaType.DISK,
  2: MediaType.CASSETTE,
  3: MediaType.COMMAND,
  4: MediaType.BASIC,
};

export interface ApiResponseApps {
  success?: boolean;
  message?: string;
  app?: App[];
}

export function encodeApiResponseApps(message: ApiResponseApps): Uint8Array {
  let bb = popByteBuffer();
  _encodeApiResponseApps(message, bb);
  return toUint8Array(bb);
}

function _encodeApiResponseApps(message: ApiResponseApps, bb: ByteBuffer): void {
  // optional bool success = 1;
  let $success = message.success;
  if ($success !== undefined) {
    writeVarint32(bb, 8);
    writeByte(bb, $success ? 1 : 0);
  }

  // optional string message = 2;
  let $message = message.message;
  if ($message !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $message);
  }

  // repeated App app = 3;
  let array$app = message.app;
  if (array$app !== undefined) {
    for (let value of array$app) {
      writeVarint32(bb, 26);
      let nested = popByteBuffer();
      _encodeApp(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }
}

export function decodeApiResponseApps(binary: Uint8Array): ApiResponseApps {
  return _decodeApiResponseApps(wrapByteBuffer(binary));
}

function _decodeApiResponseApps(bb: ByteBuffer): ApiResponseApps {
  let message: ApiResponseApps = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional bool success = 1;
      case 1: {
        message.success = !!readByte(bb);
        break;
      }

      // optional string message = 2;
      case 2: {
        message.message = readString(bb, readVarint32(bb));
        break;
      }

      // repeated App app = 3;
      case 3: {
        let limit = pushTemporaryLength(bb);
        let values = message.app || (message.app = []);
        values.push(_decodeApp(bb));
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface ApiResponseMediaImages {
  success?: boolean;
  message?: string;
  mediaImage?: MediaImage[];
}

export function encodeApiResponseMediaImages(message: ApiResponseMediaImages): Uint8Array {
  let bb = popByteBuffer();
  _encodeApiResponseMediaImages(message, bb);
  return toUint8Array(bb);
}

function _encodeApiResponseMediaImages(message: ApiResponseMediaImages, bb: ByteBuffer): void {
  // optional bool success = 1;
  let $success = message.success;
  if ($success !== undefined) {
    writeVarint32(bb, 8);
    writeByte(bb, $success ? 1 : 0);
  }

  // optional string message = 2;
  let $message = message.message;
  if ($message !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $message);
  }

  // repeated MediaImage mediaImage = 3;
  let array$mediaImage = message.mediaImage;
  if (array$mediaImage !== undefined) {
    for (let value of array$mediaImage) {
      writeVarint32(bb, 26);
      let nested = popByteBuffer();
      _encodeMediaImage(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }
}

export function decodeApiResponseMediaImages(binary: Uint8Array): ApiResponseMediaImages {
  return _decodeApiResponseMediaImages(wrapByteBuffer(binary));
}

function _decodeApiResponseMediaImages(bb: ByteBuffer): ApiResponseMediaImages {
  let message: ApiResponseMediaImages = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional bool success = 1;
      case 1: {
        message.success = !!readByte(bb);
        break;
      }

      // optional string message = 2;
      case 2: {
        message.message = readString(bb, readVarint32(bb));
        break;
      }

      // repeated MediaImage mediaImage = 3;
      case 3: {
        let limit = pushTemporaryLength(bb);
        let values = message.mediaImage || (message.mediaImage = []);
        values.push(_decodeMediaImage(bb));
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface ApiResponseDownloadSystemState {
  success?: boolean;
  message?: string;
  systemState?: SystemState;
}

export function encodeApiResponseDownloadSystemState(message: ApiResponseDownloadSystemState): Uint8Array {
  let bb = popByteBuffer();
  _encodeApiResponseDownloadSystemState(message, bb);
  return toUint8Array(bb);
}

function _encodeApiResponseDownloadSystemState(message: ApiResponseDownloadSystemState, bb: ByteBuffer): void {
  // optional bool success = 1;
  let $success = message.success;
  if ($success !== undefined) {
    writeVarint32(bb, 8);
    writeByte(bb, $success ? 1 : 0);
  }

  // optional string message = 2;
  let $message = message.message;
  if ($message !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $message);
  }

  // optional SystemState systemState = 3;
  let $systemState = message.systemState;
  if ($systemState !== undefined) {
    writeVarint32(bb, 26);
    let nested = popByteBuffer();
    _encodeSystemState($systemState, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }
}

export function decodeApiResponseDownloadSystemState(binary: Uint8Array): ApiResponseDownloadSystemState {
  return _decodeApiResponseDownloadSystemState(wrapByteBuffer(binary));
}

function _decodeApiResponseDownloadSystemState(bb: ByteBuffer): ApiResponseDownloadSystemState {
  let message: ApiResponseDownloadSystemState = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional bool success = 1;
      case 1: {
        message.success = !!readByte(bb);
        break;
      }

      // optional string message = 2;
      case 2: {
        message.message = readString(bb, readVarint32(bb));
        break;
      }

      // optional SystemState systemState = 3;
      case 3: {
        let limit = pushTemporaryLength(bb);
        message.systemState = _decodeSystemState(bb);
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface ApiResponseUploadSystemState {
  success?: boolean;
  message?: string;
  token?: Long;
}

export function encodeApiResponseUploadSystemState(message: ApiResponseUploadSystemState): Uint8Array {
  let bb = popByteBuffer();
  _encodeApiResponseUploadSystemState(message, bb);
  return toUint8Array(bb);
}

function _encodeApiResponseUploadSystemState(message: ApiResponseUploadSystemState, bb: ByteBuffer): void {
  // optional bool success = 1;
  let $success = message.success;
  if ($success !== undefined) {
    writeVarint32(bb, 8);
    writeByte(bb, $success ? 1 : 0);
  }

  // optional string message = 2;
  let $message = message.message;
  if ($message !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $message);
  }

  // optional int64 token = 3;
  let $token = message.token;
  if ($token !== undefined) {
    writeVarint32(bb, 24);
    writeVarint64(bb, $token);
  }
}

export function decodeApiResponseUploadSystemState(binary: Uint8Array): ApiResponseUploadSystemState {
  return _decodeApiResponseUploadSystemState(wrapByteBuffer(binary));
}

function _decodeApiResponseUploadSystemState(bb: ByteBuffer): ApiResponseUploadSystemState {
  let message: ApiResponseUploadSystemState = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional bool success = 1;
      case 1: {
        message.success = !!readByte(bb);
        break;
      }

      // optional string message = 2;
      case 2: {
        message.message = readString(bb, readVarint32(bb));
        break;
      }

      // optional int64 token = 3;
      case 3: {
        message.token = readVarint64(bb, /* unsigned */ false);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface App {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  release_year?: number;
  screenshot_url?: string[];
  author?: string;
  ext_trs80?: Trs80Extension;
}

export function encodeApp(message: App): Uint8Array {
  let bb = popByteBuffer();
  _encodeApp(message, bb);
  return toUint8Array(bb);
}

function _encodeApp(message: App, bb: ByteBuffer): void {
  // optional string id = 1;
  let $id = message.id;
  if ($id !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $id);
  }

  // optional string name = 2;
  let $name = message.name;
  if ($name !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $name);
  }

  // optional string version = 3;
  let $version = message.version;
  if ($version !== undefined) {
    writeVarint32(bb, 26);
    writeString(bb, $version);
  }

  // optional string description = 4;
  let $description = message.description;
  if ($description !== undefined) {
    writeVarint32(bb, 34);
    writeString(bb, $description);
  }

  // optional int32 release_year = 5;
  let $release_year = message.release_year;
  if ($release_year !== undefined) {
    writeVarint32(bb, 40);
    writeVarint64(bb, intToLong($release_year));
  }

  // repeated string screenshot_url = 6;
  let array$screenshot_url = message.screenshot_url;
  if (array$screenshot_url !== undefined) {
    for (let value of array$screenshot_url) {
      writeVarint32(bb, 50);
      writeString(bb, value);
    }
  }

  // optional string author = 7;
  let $author = message.author;
  if ($author !== undefined) {
    writeVarint32(bb, 58);
    writeString(bb, $author);
  }

  // optional Trs80Extension ext_trs80 = 8;
  let $ext_trs80 = message.ext_trs80;
  if ($ext_trs80 !== undefined) {
    writeVarint32(bb, 66);
    let nested = popByteBuffer();
    _encodeTrs80Extension($ext_trs80, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }
}

export function decodeApp(binary: Uint8Array): App {
  return _decodeApp(wrapByteBuffer(binary));
}

function _decodeApp(bb: ByteBuffer): App {
  let message: App = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional string id = 1;
      case 1: {
        message.id = readString(bb, readVarint32(bb));
        break;
      }

      // optional string name = 2;
      case 2: {
        message.name = readString(bb, readVarint32(bb));
        break;
      }

      // optional string version = 3;
      case 3: {
        message.version = readString(bb, readVarint32(bb));
        break;
      }

      // optional string description = 4;
      case 4: {
        message.description = readString(bb, readVarint32(bb));
        break;
      }

      // optional int32 release_year = 5;
      case 5: {
        message.release_year = readVarint32(bb);
        break;
      }

      // repeated string screenshot_url = 6;
      case 6: {
        let values = message.screenshot_url || (message.screenshot_url = []);
        values.push(readString(bb, readVarint32(bb)));
        break;
      }

      // optional string author = 7;
      case 7: {
        message.author = readString(bb, readVarint32(bb));
        break;
      }

      // optional Trs80Extension ext_trs80 = 8;
      case 8: {
        let limit = pushTemporaryLength(bb);
        message.ext_trs80 = _decodeTrs80Extension(bb);
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface Trs80Extension {
  model?: Trs80Model;
}

export function encodeTrs80Extension(message: Trs80Extension): Uint8Array {
  let bb = popByteBuffer();
  _encodeTrs80Extension(message, bb);
  return toUint8Array(bb);
}

function _encodeTrs80Extension(message: Trs80Extension, bb: ByteBuffer): void {
  // optional Trs80Model model = 1;
  let $model = message.model;
  if ($model !== undefined) {
    writeVarint32(bb, 8);
    writeVarint32(bb, encodeTrs80Model[$model]);
  }
}

export function decodeTrs80Extension(binary: Uint8Array): Trs80Extension {
  return _decodeTrs80Extension(wrapByteBuffer(binary));
}

function _decodeTrs80Extension(bb: ByteBuffer): Trs80Extension {
  let message: Trs80Extension = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional Trs80Model model = 1;
      case 1: {
        message.model = decodeTrs80Model[readVarint32(bb)];
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface MediaImage {
  type?: MediaType;
  filename?: string;
  data?: Uint8Array;
  uploadTime?: Long;
  description?: string;
}

export function encodeMediaImage(message: MediaImage): Uint8Array {
  let bb = popByteBuffer();
  _encodeMediaImage(message, bb);
  return toUint8Array(bb);
}

function _encodeMediaImage(message: MediaImage, bb: ByteBuffer): void {
  // optional MediaType type = 1;
  let $type = message.type;
  if ($type !== undefined) {
    writeVarint32(bb, 8);
    writeVarint32(bb, encodeMediaType[$type]);
  }

  // optional string filename = 2;
  let $filename = message.filename;
  if ($filename !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $filename);
  }

  // optional bytes data = 3;
  let $data = message.data;
  if ($data !== undefined) {
    writeVarint32(bb, 26);
    writeVarint32(bb, $data.length), writeBytes(bb, $data);
  }

  // optional int64 uploadTime = 4;
  let $uploadTime = message.uploadTime;
  if ($uploadTime !== undefined) {
    writeVarint32(bb, 32);
    writeVarint64(bb, $uploadTime);
  }

  // optional string description = 5;
  let $description = message.description;
  if ($description !== undefined) {
    writeVarint32(bb, 42);
    writeString(bb, $description);
  }
}

export function decodeMediaImage(binary: Uint8Array): MediaImage {
  return _decodeMediaImage(wrapByteBuffer(binary));
}

function _decodeMediaImage(bb: ByteBuffer): MediaImage {
  let message: MediaImage = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional MediaType type = 1;
      case 1: {
        message.type = decodeMediaType[readVarint32(bb)];
        break;
      }

      // optional string filename = 2;
      case 2: {
        message.filename = readString(bb, readVarint32(bb));
        break;
      }

      // optional bytes data = 3;
      case 3: {
        message.data = readBytes(bb, readVarint32(bb));
        break;
      }

      // optional int64 uploadTime = 4;
      case 4: {
        message.uploadTime = readVarint64(bb, /* unsigned */ false);
        break;
      }

      // optional string description = 5;
      case 5: {
        message.description = readString(bb, readVarint32(bb));
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface Registers {
  ix?: number;
  iy?: number;
  pc?: number;
  sp?: number;
  af?: number;
  bc?: number;
  de?: number;
  hl?: number;
  af_prime?: number;
  bc_prime?: number;
  de_prime?: number;
  hl_prime?: number;
  i?: number;
  r_1?: number;
  r_2?: number;
}

export function encodeRegisters(message: Registers): Uint8Array {
  let bb = popByteBuffer();
  _encodeRegisters(message, bb);
  return toUint8Array(bb);
}

function _encodeRegisters(message: Registers, bb: ByteBuffer): void {
  // optional int32 ix = 1;
  let $ix = message.ix;
  if ($ix !== undefined) {
    writeVarint32(bb, 8);
    writeVarint64(bb, intToLong($ix));
  }

  // optional int32 iy = 2;
  let $iy = message.iy;
  if ($iy !== undefined) {
    writeVarint32(bb, 16);
    writeVarint64(bb, intToLong($iy));
  }

  // optional int32 pc = 3;
  let $pc = message.pc;
  if ($pc !== undefined) {
    writeVarint32(bb, 24);
    writeVarint64(bb, intToLong($pc));
  }

  // optional int32 sp = 4;
  let $sp = message.sp;
  if ($sp !== undefined) {
    writeVarint32(bb, 32);
    writeVarint64(bb, intToLong($sp));
  }

  // optional int32 af = 5;
  let $af = message.af;
  if ($af !== undefined) {
    writeVarint32(bb, 40);
    writeVarint64(bb, intToLong($af));
  }

  // optional int32 bc = 6;
  let $bc = message.bc;
  if ($bc !== undefined) {
    writeVarint32(bb, 48);
    writeVarint64(bb, intToLong($bc));
  }

  // optional int32 de = 7;
  let $de = message.de;
  if ($de !== undefined) {
    writeVarint32(bb, 56);
    writeVarint64(bb, intToLong($de));
  }

  // optional int32 hl = 8;
  let $hl = message.hl;
  if ($hl !== undefined) {
    writeVarint32(bb, 64);
    writeVarint64(bb, intToLong($hl));
  }

  // optional int32 af_prime = 9;
  let $af_prime = message.af_prime;
  if ($af_prime !== undefined) {
    writeVarint32(bb, 72);
    writeVarint64(bb, intToLong($af_prime));
  }

  // optional int32 bc_prime = 10;
  let $bc_prime = message.bc_prime;
  if ($bc_prime !== undefined) {
    writeVarint32(bb, 80);
    writeVarint64(bb, intToLong($bc_prime));
  }

  // optional int32 de_prime = 11;
  let $de_prime = message.de_prime;
  if ($de_prime !== undefined) {
    writeVarint32(bb, 88);
    writeVarint64(bb, intToLong($de_prime));
  }

  // optional int32 hl_prime = 12;
  let $hl_prime = message.hl_prime;
  if ($hl_prime !== undefined) {
    writeVarint32(bb, 96);
    writeVarint64(bb, intToLong($hl_prime));
  }

  // optional int32 i = 13;
  let $i = message.i;
  if ($i !== undefined) {
    writeVarint32(bb, 104);
    writeVarint64(bb, intToLong($i));
  }

  // optional int32 r_1 = 14;
  let $r_1 = message.r_1;
  if ($r_1 !== undefined) {
    writeVarint32(bb, 112);
    writeVarint64(bb, intToLong($r_1));
  }

  // optional int32 r_2 = 15;
  let $r_2 = message.r_2;
  if ($r_2 !== undefined) {
    writeVarint32(bb, 120);
    writeVarint64(bb, intToLong($r_2));
  }
}

export function decodeRegisters(binary: Uint8Array): Registers {
  return _decodeRegisters(wrapByteBuffer(binary));
}

function _decodeRegisters(bb: ByteBuffer): Registers {
  let message: Registers = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional int32 ix = 1;
      case 1: {
        message.ix = readVarint32(bb);
        break;
      }

      // optional int32 iy = 2;
      case 2: {
        message.iy = readVarint32(bb);
        break;
      }

      // optional int32 pc = 3;
      case 3: {
        message.pc = readVarint32(bb);
        break;
      }

      // optional int32 sp = 4;
      case 4: {
        message.sp = readVarint32(bb);
        break;
      }

      // optional int32 af = 5;
      case 5: {
        message.af = readVarint32(bb);
        break;
      }

      // optional int32 bc = 6;
      case 6: {
        message.bc = readVarint32(bb);
        break;
      }

      // optional int32 de = 7;
      case 7: {
        message.de = readVarint32(bb);
        break;
      }

      // optional int32 hl = 8;
      case 8: {
        message.hl = readVarint32(bb);
        break;
      }

      // optional int32 af_prime = 9;
      case 9: {
        message.af_prime = readVarint32(bb);
        break;
      }

      // optional int32 bc_prime = 10;
      case 10: {
        message.bc_prime = readVarint32(bb);
        break;
      }

      // optional int32 de_prime = 11;
      case 11: {
        message.de_prime = readVarint32(bb);
        break;
      }

      // optional int32 hl_prime = 12;
      case 12: {
        message.hl_prime = readVarint32(bb);
        break;
      }

      // optional int32 i = 13;
      case 13: {
        message.i = readVarint32(bb);
        break;
      }

      // optional int32 r_1 = 14;
      case 14: {
        message.r_1 = readVarint32(bb);
        break;
      }

      // optional int32 r_2 = 15;
      case 15: {
        message.r_2 = readVarint32(bb);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface MemoryRegion {
  start?: number;
  length?: number;
  data?: Uint8Array;
}

export function encodeMemoryRegion(message: MemoryRegion): Uint8Array {
  let bb = popByteBuffer();
  _encodeMemoryRegion(message, bb);
  return toUint8Array(bb);
}

function _encodeMemoryRegion(message: MemoryRegion, bb: ByteBuffer): void {
  // optional int32 start = 1;
  let $start = message.start;
  if ($start !== undefined) {
    writeVarint32(bb, 8);
    writeVarint64(bb, intToLong($start));
  }

  // optional int32 length = 3;
  let $length = message.length;
  if ($length !== undefined) {
    writeVarint32(bb, 24);
    writeVarint64(bb, intToLong($length));
  }

  // optional bytes data = 2;
  let $data = message.data;
  if ($data !== undefined) {
    writeVarint32(bb, 18);
    writeVarint32(bb, $data.length), writeBytes(bb, $data);
  }
}

export function decodeMemoryRegion(binary: Uint8Array): MemoryRegion {
  return _decodeMemoryRegion(wrapByteBuffer(binary));
}

function _decodeMemoryRegion(bb: ByteBuffer): MemoryRegion {
  let message: MemoryRegion = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional int32 start = 1;
      case 1: {
        message.start = readVarint32(bb);
        break;
      }

      // optional int32 length = 3;
      case 3: {
        message.length = readVarint32(bb);
        break;
      }

      // optional bytes data = 2;
      case 2: {
        message.data = readBytes(bb, readVarint32(bb));
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface SystemState {
  model?: Trs80Model;
  registers?: Registers;
  memoryRegions?: MemoryRegion[];
}

export function encodeSystemState(message: SystemState): Uint8Array {
  let bb = popByteBuffer();
  _encodeSystemState(message, bb);
  return toUint8Array(bb);
}

function _encodeSystemState(message: SystemState, bb: ByteBuffer): void {
  // optional Trs80Model model = 1;
  let $model = message.model;
  if ($model !== undefined) {
    writeVarint32(bb, 8);
    writeVarint32(bb, encodeTrs80Model[$model]);
  }

  // optional Registers registers = 2;
  let $registers = message.registers;
  if ($registers !== undefined) {
    writeVarint32(bb, 18);
    let nested = popByteBuffer();
    _encodeRegisters($registers, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // repeated MemoryRegion memoryRegions = 3;
  let array$memoryRegions = message.memoryRegions;
  if (array$memoryRegions !== undefined) {
    for (let value of array$memoryRegions) {
      writeVarint32(bb, 26);
      let nested = popByteBuffer();
      _encodeMemoryRegion(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }
}

export function decodeSystemState(binary: Uint8Array): SystemState {
  return _decodeSystemState(wrapByteBuffer(binary));
}

function _decodeSystemState(bb: ByteBuffer): SystemState {
  let message: SystemState = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional Trs80Model model = 1;
      case 1: {
        message.model = decodeTrs80Model[readVarint32(bb)];
        break;
      }

      // optional Registers registers = 2;
      case 2: {
        let limit = pushTemporaryLength(bb);
        message.registers = _decodeRegisters(bb);
        bb.limit = limit;
        break;
      }

      // repeated MemoryRegion memoryRegions = 3;
      case 3: {
        let limit = pushTemporaryLength(bb);
        let values = message.memoryRegions || (message.memoryRegions = []);
        values.push(_decodeMemoryRegion(bb));
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface FetchMediaImagesParams {
  app_id?: string;
}

export function encodeFetchMediaImagesParams(message: FetchMediaImagesParams): Uint8Array {
  let bb = popByteBuffer();
  _encodeFetchMediaImagesParams(message, bb);
  return toUint8Array(bb);
}

function _encodeFetchMediaImagesParams(message: FetchMediaImagesParams, bb: ByteBuffer): void {
  // optional string app_id = 1;
  let $app_id = message.app_id;
  if ($app_id !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $app_id);
  }
}

export function decodeFetchMediaImagesParams(binary: Uint8Array): FetchMediaImagesParams {
  return _decodeFetchMediaImagesParams(wrapByteBuffer(binary));
}

function _decodeFetchMediaImagesParams(bb: ByteBuffer): FetchMediaImagesParams {
  let message: FetchMediaImagesParams = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional string app_id = 1;
      case 1: {
        message.app_id = readString(bb, readVarint32(bb));
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface GetAppParams {
  app_id?: string;
}

export function encodeGetAppParams(message: GetAppParams): Uint8Array {
  let bb = popByteBuffer();
  _encodeGetAppParams(message, bb);
  return toUint8Array(bb);
}

function _encodeGetAppParams(message: GetAppParams, bb: ByteBuffer): void {
  // optional string app_id = 1;
  let $app_id = message.app_id;
  if ($app_id !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $app_id);
  }
}

export function decodeGetAppParams(binary: Uint8Array): GetAppParams {
  return _decodeGetAppParams(wrapByteBuffer(binary));
}

function _decodeGetAppParams(bb: ByteBuffer): GetAppParams {
  let message: GetAppParams = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional string app_id = 1;
      case 1: {
        message.app_id = readString(bb, readVarint32(bb));
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface Trs80Params {
  media_types?: MediaType[];
}

export function encodeTrs80Params(message: Trs80Params): Uint8Array {
  let bb = popByteBuffer();
  _encodeTrs80Params(message, bb);
  return toUint8Array(bb);
}

function _encodeTrs80Params(message: Trs80Params, bb: ByteBuffer): void {
  // repeated MediaType media_types = 1;
  let array$media_types = message.media_types;
  if (array$media_types !== undefined) {
    let packed = popByteBuffer();
    for (let value of array$media_types) {
      writeVarint32(packed, encodeMediaType[value]);
    }
    writeVarint32(bb, 10);
    writeVarint32(bb, packed.offset);
    writeByteBuffer(bb, packed);
    pushByteBuffer(packed);
  }
}

export function decodeTrs80Params(binary: Uint8Array): Trs80Params {
  return _decodeTrs80Params(wrapByteBuffer(binary));
}

function _decodeTrs80Params(bb: ByteBuffer): Trs80Params {
  let message: Trs80Params = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // repeated MediaType media_types = 1;
      case 1: {
        let values = message.media_types || (message.media_types = []);
        if ((tag & 7) === 2) {
          let outerLimit = pushTemporaryLength(bb);
          while (!isAtEnd(bb)) {
            values.push(decodeMediaType[readVarint32(bb)]);
          }
          bb.limit = outerLimit;
        } else {
          values.push(decodeMediaType[readVarint32(bb)]);
        }
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface ListAppsParams {
  start?: number;
  num?: number;
  query?: string;
  trs80?: Trs80Params;
}

export function encodeListAppsParams(message: ListAppsParams): Uint8Array {
  let bb = popByteBuffer();
  _encodeListAppsParams(message, bb);
  return toUint8Array(bb);
}

function _encodeListAppsParams(message: ListAppsParams, bb: ByteBuffer): void {
  // optional int32 start = 1;
  let $start = message.start;
  if ($start !== undefined) {
    writeVarint32(bb, 8);
    writeVarint64(bb, intToLong($start));
  }

  // optional int32 num = 2;
  let $num = message.num;
  if ($num !== undefined) {
    writeVarint32(bb, 16);
    writeVarint64(bb, intToLong($num));
  }

  // optional string query = 3;
  let $query = message.query;
  if ($query !== undefined) {
    writeVarint32(bb, 26);
    writeString(bb, $query);
  }

  // optional Trs80Params trs80 = 4;
  let $trs80 = message.trs80;
  if ($trs80 !== undefined) {
    writeVarint32(bb, 34);
    let nested = popByteBuffer();
    _encodeTrs80Params($trs80, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }
}

export function decodeListAppsParams(binary: Uint8Array): ListAppsParams {
  return _decodeListAppsParams(wrapByteBuffer(binary));
}

function _decodeListAppsParams(bb: ByteBuffer): ListAppsParams {
  let message: ListAppsParams = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional int32 start = 1;
      case 1: {
        message.start = readVarint32(bb);
        break;
      }

      // optional int32 num = 2;
      case 2: {
        message.num = readVarint32(bb);
        break;
      }

      // optional string query = 3;
      case 3: {
        message.query = readString(bb, readVarint32(bb));
        break;
      }

      // optional Trs80Params trs80 = 4;
      case 4: {
        let limit = pushTemporaryLength(bb);
        message.trs80 = _decodeTrs80Params(bb);
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface UploadSystemStateParams {
  state?: SystemState;
}

export function encodeUploadSystemStateParams(message: UploadSystemStateParams): Uint8Array {
  let bb = popByteBuffer();
  _encodeUploadSystemStateParams(message, bb);
  return toUint8Array(bb);
}

function _encodeUploadSystemStateParams(message: UploadSystemStateParams, bb: ByteBuffer): void {
  // optional SystemState state = 1;
  let $state = message.state;
  if ($state !== undefined) {
    writeVarint32(bb, 10);
    let nested = popByteBuffer();
    _encodeSystemState($state, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }
}

export function decodeUploadSystemStateParams(binary: Uint8Array): UploadSystemStateParams {
  return _decodeUploadSystemStateParams(wrapByteBuffer(binary));
}

function _decodeUploadSystemStateParams(bb: ByteBuffer): UploadSystemStateParams {
  let message: UploadSystemStateParams = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional SystemState state = 1;
      case 1: {
        let limit = pushTemporaryLength(bb);
        message.state = _decodeSystemState(bb);
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface DownloadSystemStateParams {
  token?: Long;
}

export function encodeDownloadSystemStateParams(message: DownloadSystemStateParams): Uint8Array {
  let bb = popByteBuffer();
  _encodeDownloadSystemStateParams(message, bb);
  return toUint8Array(bb);
}

function _encodeDownloadSystemStateParams(message: DownloadSystemStateParams, bb: ByteBuffer): void {
  // optional int64 token = 1;
  let $token = message.token;
  if ($token !== undefined) {
    writeVarint32(bb, 8);
    writeVarint64(bb, $token);
  }
}

export function decodeDownloadSystemStateParams(binary: Uint8Array): DownloadSystemStateParams {
  return _decodeDownloadSystemStateParams(wrapByteBuffer(binary));
}

function _decodeDownloadSystemStateParams(bb: ByteBuffer): DownloadSystemStateParams {
  let message: DownloadSystemStateParams = {} as any;

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional int64 token = 1;
      case 1: {
        message.token = readVarint64(bb, /* unsigned */ false);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

interface ByteBuffer {
  bytes: Uint8Array;
  offset: number;
  limit: number;
}

function pushTemporaryLength(bb: ByteBuffer): number {
  let length = readVarint32(bb);
  let limit = bb.limit;
  bb.limit = bb.offset + length;
  return limit;
}

function skipUnknownField(bb: ByteBuffer, type: number): void {
  switch (type) {
    case 0: while (readByte(bb) & 0x80) { } break;
    case 2: skip(bb, readVarint32(bb)); break;
    case 5: skip(bb, 4); break;
    case 1: skip(bb, 8); break;
    default: throw new Error("Unimplemented type: " + type);
  }
}

function stringToLong(value: string): Long {
  return {
    low: value.charCodeAt(0) | (value.charCodeAt(1) << 16),
    high: value.charCodeAt(2) | (value.charCodeAt(3) << 16),
    unsigned: false,
  };
}

function longToString(value: Long): string {
  let low = value.low;
  let high = value.high;
  return String.fromCharCode(
    low & 0xFFFF,
    low >>> 16,
    high & 0xFFFF,
    high >>> 16);
}

// The code below was modified from https://github.com/protobufjs/bytebuffer.js
// which is under the Apache License 2.0.

let f32 = new Float32Array(1);
let f32_u8 = new Uint8Array(f32.buffer);

let f64 = new Float64Array(1);
let f64_u8 = new Uint8Array(f64.buffer);

function intToLong(value: number): Long {
  value |= 0;
  return {
    low: value,
    high: value >> 31,
    unsigned: value >= 0,
  };
}

let bbStack: ByteBuffer[] = [];

function popByteBuffer(): ByteBuffer {
  const bb = bbStack.pop();
  if (!bb) return { bytes: new Uint8Array(64), offset: 0, limit: 0 };
  bb.offset = bb.limit = 0;
  return bb;
}

function pushByteBuffer(bb: ByteBuffer): void {
  bbStack.push(bb);
}

function wrapByteBuffer(bytes: Uint8Array): ByteBuffer {
  return { bytes, offset: 0, limit: bytes.length };
}

function toUint8Array(bb: ByteBuffer): Uint8Array {
  let bytes = bb.bytes;
  let limit = bb.limit;
  return bytes.length === limit ? bytes : bytes.subarray(0, limit);
}

function skip(bb: ByteBuffer, offset: number): void {
  if (bb.offset + offset > bb.limit) {
    throw new Error('Skip past limit');
  }
  bb.offset += offset;
}

function isAtEnd(bb: ByteBuffer): boolean {
  return bb.offset >= bb.limit;
}

function grow(bb: ByteBuffer, count: number): number {
  let bytes = bb.bytes;
  let offset = bb.offset;
  let limit = bb.limit;
  let finalOffset = offset + count;
  if (finalOffset > bytes.length) {
    let newBytes = new Uint8Array(finalOffset * 2);
    newBytes.set(bytes);
    bb.bytes = newBytes;
  }
  bb.offset = finalOffset;
  if (finalOffset > limit) {
    bb.limit = finalOffset;
  }
  return offset;
}

function advance(bb: ByteBuffer, count: number): number {
  let offset = bb.offset;
  if (offset + count > bb.limit) {
    throw new Error('Read past limit');
  }
  bb.offset += count;
  return offset;
}

function readBytes(bb: ByteBuffer, count: number): Uint8Array {
  let offset = advance(bb, count);
  return bb.bytes.subarray(offset, offset + count);
}

function writeBytes(bb: ByteBuffer, buffer: Uint8Array): void {
  let offset = grow(bb, buffer.length);
  bb.bytes.set(buffer, offset);
}

function readString(bb: ByteBuffer, count: number): string {
  // Sadly a hand-coded UTF8 decoder is much faster than subarray+TextDecoder in V8
  let offset = advance(bb, count);
  let fromCharCode = String.fromCharCode;
  let bytes = bb.bytes;
  let invalid = '\uFFFD';
  let text = '';

  for (let i = 0; i < count; i++) {
    let c1 = bytes[i + offset], c2: number, c3: number, c4: number, c: number;

    // 1 byte
    if ((c1 & 0x80) === 0) {
      text += fromCharCode(c1);
    }

    // 2 bytes
    else if ((c1 & 0xE0) === 0xC0) {
      if (i + 1 >= count) text += invalid;
      else {
        c2 = bytes[i + offset + 1];
        if ((c2 & 0xC0) !== 0x80) text += invalid;
        else {
          c = ((c1 & 0x1F) << 6) | (c2 & 0x3F);
          if (c < 0x80) text += invalid;
          else {
            text += fromCharCode(c);
            i++;
          }
        }
      }
    }

    // 3 bytes
    else if ((c1 & 0xF0) == 0xE0) {
      if (i + 2 >= count) text += invalid;
      else {
        c2 = bytes[i + offset + 1];
        c3 = bytes[i + offset + 2];
        if (((c2 | (c3 << 8)) & 0xC0C0) !== 0x8080) text += invalid;
        else {
          c = ((c1 & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F);
          if (c < 0x0800 || (c >= 0xD800 && c <= 0xDFFF)) text += invalid;
          else {
            text += fromCharCode(c);
            i += 2;
          }
        }
      }
    }

    // 4 bytes
    else if ((c1 & 0xF8) == 0xF0) {
      if (i + 3 >= count) text += invalid;
      else {
        c2 = bytes[i + offset + 1];
        c3 = bytes[i + offset + 2];
        c4 = bytes[i + offset + 3];
        if (((c2 | (c3 << 8) | (c4 << 16)) & 0xC0C0C0) !== 0x808080) text += invalid;
        else {
          c = ((c1 & 0x07) << 0x12) | ((c2 & 0x3F) << 0x0C) | ((c3 & 0x3F) << 0x06) | (c4 & 0x3F);
          if (c < 0x10000 || c > 0x10FFFF) text += invalid;
          else {
            c -= 0x10000;
            text += fromCharCode((c >> 10) + 0xD800, (c & 0x3FF) + 0xDC00);
            i += 3;
          }
        }
      }
    }

    else text += invalid;
  }

  return text;
}

function writeString(bb: ByteBuffer, text: string): void {
  // Sadly a hand-coded UTF8 encoder is much faster than TextEncoder+set in V8
  let n = text.length;
  let byteCount = 0;

  // Write the byte count first
  for (let i = 0; i < n; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < n) {
      c = (c << 10) + text.charCodeAt(++i) - 0x35FDC00;
    }
    byteCount += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  writeVarint32(bb, byteCount);

  let offset = grow(bb, byteCount);
  let bytes = bb.bytes;

  // Then write the bytes
  for (let i = 0; i < n; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < n) {
      c = (c << 10) + text.charCodeAt(++i) - 0x35FDC00;
    }
    if (c < 0x80) {
      bytes[offset++] = c;
    } else {
      if (c < 0x800) {
        bytes[offset++] = ((c >> 6) & 0x1F) | 0xC0;
      } else {
        if (c < 0x10000) {
          bytes[offset++] = ((c >> 12) & 0x0F) | 0xE0;
        } else {
          bytes[offset++] = ((c >> 18) & 0x07) | 0xF0;
          bytes[offset++] = ((c >> 12) & 0x3F) | 0x80;
        }
        bytes[offset++] = ((c >> 6) & 0x3F) | 0x80;
      }
      bytes[offset++] = (c & 0x3F) | 0x80;
    }
  }
}

function writeByteBuffer(bb: ByteBuffer, buffer: ByteBuffer): void {
  let offset = grow(bb, buffer.limit);
  let from = bb.bytes;
  let to = buffer.bytes;

  // This for loop is much faster than subarray+set on V8
  for (let i = 0, n = buffer.limit; i < n; i++) {
    from[i + offset] = to[i];
  }
}

function readByte(bb: ByteBuffer): number {
  return bb.bytes[advance(bb, 1)];
}

function writeByte(bb: ByteBuffer, value: number): void {
  let offset = grow(bb, 1);
  bb.bytes[offset] = value;
}

function readFloat(bb: ByteBuffer): number {
  let offset = advance(bb, 4);
  let bytes = bb.bytes;

  // Manual copying is much faster than subarray+set in V8
  f32_u8[0] = bytes[offset++];
  f32_u8[1] = bytes[offset++];
  f32_u8[2] = bytes[offset++];
  f32_u8[3] = bytes[offset++];
  return f32[0];
}

function writeFloat(bb: ByteBuffer, value: number): void {
  let offset = grow(bb, 4);
  let bytes = bb.bytes;
  f32[0] = value;

  // Manual copying is much faster than subarray+set in V8
  bytes[offset++] = f32_u8[0];
  bytes[offset++] = f32_u8[1];
  bytes[offset++] = f32_u8[2];
  bytes[offset++] = f32_u8[3];
}

function readDouble(bb: ByteBuffer): number {
  let offset = advance(bb, 8);
  let bytes = bb.bytes;

  // Manual copying is much faster than subarray+set in V8
  f64_u8[0] = bytes[offset++];
  f64_u8[1] = bytes[offset++];
  f64_u8[2] = bytes[offset++];
  f64_u8[3] = bytes[offset++];
  f64_u8[4] = bytes[offset++];
  f64_u8[5] = bytes[offset++];
  f64_u8[6] = bytes[offset++];
  f64_u8[7] = bytes[offset++];
  return f64[0];
}

function writeDouble(bb: ByteBuffer, value: number): void {
  let offset = grow(bb, 8);
  let bytes = bb.bytes;
  f64[0] = value;

  // Manual copying is much faster than subarray+set in V8
  bytes[offset++] = f64_u8[0];
  bytes[offset++] = f64_u8[1];
  bytes[offset++] = f64_u8[2];
  bytes[offset++] = f64_u8[3];
  bytes[offset++] = f64_u8[4];
  bytes[offset++] = f64_u8[5];
  bytes[offset++] = f64_u8[6];
  bytes[offset++] = f64_u8[7];
}

function readInt32(bb: ByteBuffer): number {
  let offset = advance(bb, 4);
  let bytes = bb.bytes;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  );
}

function writeInt32(bb: ByteBuffer, value: number): void {
  let offset = grow(bb, 4);
  let bytes = bb.bytes;
  bytes[offset] = value;
  bytes[offset + 1] = value >> 8;
  bytes[offset + 2] = value >> 16;
  bytes[offset + 3] = value >> 24;
}

function readInt64(bb: ByteBuffer, unsigned: boolean): Long {
  return {
    low: readInt32(bb),
    high: readInt32(bb),
    unsigned,
  };
}

function writeInt64(bb: ByteBuffer, value: Long): void {
  writeInt32(bb, value.low);
  writeInt32(bb, value.high);
}

function readVarint32(bb: ByteBuffer): number {
  let c = 0;
  let value = 0;
  let b: number;
  do {
    b = readByte(bb);
    if (c < 32) value |= (b & 0x7F) << c;
    c += 7;
  } while (b & 0x80);
  return value;
}

function writeVarint32(bb: ByteBuffer, value: number): void {
  value >>>= 0;
  while (value >= 0x80) {
    writeByte(bb, (value & 0x7f) | 0x80);
    value >>>= 7;
  }
  writeByte(bb, value);
}

function readVarint64(bb: ByteBuffer, unsigned: boolean): Long {
  let part0 = 0;
  let part1 = 0;
  let part2 = 0;
  let b: number;

  b = readByte(bb); part0 = (b & 0x7F); if (b & 0x80) {
    b = readByte(bb); part0 |= (b & 0x7F) << 7; if (b & 0x80) {
      b = readByte(bb); part0 |= (b & 0x7F) << 14; if (b & 0x80) {
        b = readByte(bb); part0 |= (b & 0x7F) << 21; if (b & 0x80) {

          b = readByte(bb); part1 = (b & 0x7F); if (b & 0x80) {
            b = readByte(bb); part1 |= (b & 0x7F) << 7; if (b & 0x80) {
              b = readByte(bb); part1 |= (b & 0x7F) << 14; if (b & 0x80) {
                b = readByte(bb); part1 |= (b & 0x7F) << 21; if (b & 0x80) {

                  b = readByte(bb); part2 = (b & 0x7F); if (b & 0x80) {
                    b = readByte(bb); part2 |= (b & 0x7F) << 7;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    low: part0 | (part1 << 28),
    high: (part1 >>> 4) | (part2 << 24),
    unsigned,
  };
}

function writeVarint64(bb: ByteBuffer, value: Long): void {
  let part0 = value.low >>> 0;
  let part1 = ((value.low >>> 28) | (value.high << 4)) >>> 0;
  let part2 = value.high >>> 24;

  // ref: src/google/protobuf/io/coded_stream.cc
  let size =
    part2 === 0 ?
      part1 === 0 ?
        part0 < 1 << 14 ?
          part0 < 1 << 7 ? 1 : 2 :
          part0 < 1 << 21 ? 3 : 4 :
        part1 < 1 << 14 ?
          part1 < 1 << 7 ? 5 : 6 :
          part1 < 1 << 21 ? 7 : 8 :
      part2 < 1 << 7 ? 9 : 10;

  let offset = grow(bb, size);
  let bytes = bb.bytes;

  switch (size) {
    case 10: bytes[offset + 9] = (part2 >>> 7) & 0x01;
    case 9: bytes[offset + 8] = size !== 9 ? part2 | 0x80 : part2 & 0x7F;
    case 8: bytes[offset + 7] = size !== 8 ? (part1 >>> 21) | 0x80 : (part1 >>> 21) & 0x7F;
    case 7: bytes[offset + 6] = size !== 7 ? (part1 >>> 14) | 0x80 : (part1 >>> 14) & 0x7F;
    case 6: bytes[offset + 5] = size !== 6 ? (part1 >>> 7) | 0x80 : (part1 >>> 7) & 0x7F;
    case 5: bytes[offset + 4] = size !== 5 ? part1 | 0x80 : part1 & 0x7F;
    case 4: bytes[offset + 3] = size !== 4 ? (part0 >>> 21) | 0x80 : (part0 >>> 21) & 0x7F;
    case 3: bytes[offset + 2] = size !== 3 ? (part0 >>> 14) | 0x80 : (part0 >>> 14) & 0x7F;
    case 2: bytes[offset + 1] = size !== 2 ? (part0 >>> 7) | 0x80 : (part0 >>> 7) & 0x7F;
    case 1: bytes[offset] = size !== 1 ? part0 | 0x80 : part0 & 0x7F;
  }
}

function readVarint32ZigZag(bb: ByteBuffer): number {
  let value = readVarint32(bb);

  // ref: src/google/protobuf/wire_format_lite.h
  return (value >>> 1) ^ -(value & 1);
}

function writeVarint32ZigZag(bb: ByteBuffer, value: number): void {
  // ref: src/google/protobuf/wire_format_lite.h
  writeVarint32(bb, (value << 1) ^ (value >> 31));
}

function readVarint64ZigZag(bb: ByteBuffer): Long {
  let value = readVarint64(bb, /* unsigned */ false);
  let low = value.low;
  let high = value.high;
  let flip = -(low & 1);

  // ref: src/google/protobuf/wire_format_lite.h
  return {
    low: ((low >>> 1) | (high << 31)) ^ flip,
    high: (high >>> 1) ^ flip,
    unsigned: false,
  };
}

function writeVarint64ZigZag(bb: ByteBuffer, value: Long): void {
  let low = value.low;
  let high = value.high;
  let flip = high >> 31;

  // ref: src/google/protobuf/wire_format_lite.h
  writeVarint64(bb, {
    low: (low << 1) ^ flip,
    high: ((high << 1) | (low >>> 31)) ^ flip,
    unsigned: false,
  });
}
