/**
 * @file ws-frame-codec.ts
 * Pure Node.js zero-dependency RFC 6455 WebSocket frame encoder and decoder.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

export interface DecodedWsFrame {
  opcode: number;
  payload: Buffer;
  fin: boolean;
}

export class WsFrameCodec {
  public static encodeTextFrame(text: string): Buffer {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header: Buffer;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + opcode 1 (text)
      header[1] = len;
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payload]);
  }

  public static encodeCloseFrame(code = 1000): Buffer {
    const buf = Buffer.alloc(4);
    buf[0] = 0x88; // FIN + opcode 8 (close)
    buf[1] = 2;
    buf.writeUInt16BE(code, 2);
    return buf;
  }

  public static decodeFrames(buffer: Buffer): { frames: DecodedWsFrame[]; remaining: Buffer } {
    const frames: DecodedWsFrame[] = [];
    let offset = 0;

    while (offset + 2 <= buffer.length) {
      const byte1 = buffer[offset];
      const byte2 = buffer[offset + 1];
      const fin = (byte1 & 0x80) !== 0;
      const opcode = byte1 & 0x0f;
      const masked = (byte2 & 0x80) !== 0;
      let payloadLen = byte2 & 0x7f;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (offset + 4 > buffer.length) break;
        payloadLen = buffer.readUInt16BE(offset + 2);
        headerLen = 4;
      } else if (payloadLen === 127) {
        if (offset + 10 > buffer.length) break;
        payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
        headerLen = 10;
      }

      const maskLen = masked ? 4 : 0;
      const totalLen = headerLen + maskLen + payloadLen;
      if (offset + totalLen > buffer.length) break;

      let payload = buffer.subarray(offset + headerLen + maskLen, offset + totalLen);
      if (masked) {
        const mask = buffer.subarray(offset + headerLen, offset + headerLen + 4);
        payload = this.unmaskPayload(payload, mask);
      }

      frames.push({ opcode, payload, fin });
      offset += totalLen;
    }

    return { frames, remaining: buffer.subarray(offset) };
  }

  private static unmaskPayload(payload: Buffer, mask: Buffer): Buffer {
    const unmasked = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) {
      unmasked[i] = payload[i] ^ mask[i % 4];
    }
    return unmasked;
  }
}
