// ----------------------------------------------------------------------------
// LIME Container Decrypt and Re-encrypt Engine
// ----------------------------------------------------------------------------
const crypto = require('crypto');
const { P, R, E, TWO64, modexp, le2big, big2le, Uof, murmur3buf } = require('./crypto');

function decryptBlock(buf, key, i) {
  const blkOff = 0x10 + i * 0x1220;
  const keyIv = Buffer.alloc(32);
  const U = Uof(key);
  for (let j = 0; j < 4; j++) {
    const c1 = le2big(buf.subarray(blkOff + j * 128, blkOff + j * 128 + 64));
    const c2 = le2big(buf.subarray(blkOff + j * 128 + 64, blkOff + j * 128 + 128));
    const k = c2 / modexp(c1, U, P);
    if (k >= TWO64) throw new Error('block ' + i + ': invalid key');
    keyIv.writeBigUInt64LE(k, j * 8);
  }
  const decipher = crypto.createDecipheriv('aes-128-ofb', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  decipher.setAutoPadding(false);
  const dec = Buffer.concat([decipher.update(buf.subarray(blkOff + 0x200, blkOff + 0x1200)), decipher.final()]);
  const expectedHash = buf.subarray(blkOff + 0x1200, blkOff + 0x1220);
  const actualHash = crypto.createHash('sha3-256').update(dec).digest();
  if (!actualHash.equals(expectedHash)) {
    throw new Error('block ' + i + ': SHA3 integrity check failed');
  }
  return dec;
}

function decryptFile(buf, key) {
  if (buf.toString('ascii', 0, 4) !== 'DSSS') {
    throw new Error('Invalid file format: missing DSSS header magic');
  }
  const storedHash = buf.readUInt32LE(buf.length - 4);
  const calcHash = murmur3buf(buf.subarray(0, buf.length - 4), 0xffffffff);
  if (storedHash !== calcHash) {
    throw new Error('Murmur3 trailer mismatch: file may be corrupt');
  }
  const decLen = Number(buf.readBigUInt64LE(buf.length - 12));
  const numBlocks = Math.ceil(decLen / 0x1000);
  const payload = Buffer.alloc(numBlocks * 0x1000);
  for (let i = 0; i < numBlocks; i++) {
    decryptBlock(buf, key, i).copy(payload, i * 0x1000);
  }
  return { payload, decLen, numBlocks };
}

function encryptPayload(payload, numBlocks, key, rsaMac) {
  const C1 = modexp(R, E, P);
  const X1 = modexp(modexp(R, Uof(key), P), E, P);
  const C1_BYTES = big2le(C1, 64);
  const parts = [];
  for (let i = 0; i < numBlocks; i++) {
    const keyIv = crypto.randomBytes(32);
    const blockData = payload.subarray(i * 0x1000, (i + 1) * 0x1000);
    const cipher = crypto.createCipheriv('aes-128-ofb', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
    cipher.setAutoPadding(false);
    const enc = Buffer.concat([cipher.update(blockData), cipher.final()]);
    const checksum = crypto.createHash('sha3-256').update(blockData).digest();
    const encKey = Buffer.alloc(0x200);
    for (let j = 0; j < 4; j++) {
      C1_BYTES.copy(encKey, j * 128);
      big2le(X1 * keyIv.readBigUInt64LE(j * 8), 64).copy(encKey, j * 128 + 64);
    }
    parts.push(encKey, enc, checksum);
  }
  parts.push(rsaMac);
  return Buffer.concat(parts);
}

function reencrypt(orig, key, newPayload) {
  const decLen = Number(orig.readBigUInt64LE(orig.length - 12));
  const numBlocks = Math.ceil(decLen / 0x1000);
  const rsaOff = 0x10 + numBlocks * 0x1220;
  const rsaMac = orig.subarray(rsaOff, rsaOff + 0x80);
  const body = encryptPayload(newPayload.subarray(0, numBlocks * 0x1000), numBlocks, key, rsaMac);
  const decLenBuf = Buffer.alloc(8);
  decLenBuf.writeBigUInt64LE(BigInt(decLen));
  const withoutHash = Buffer.concat([orig.subarray(0, 0x10), body, decLenBuf]);
  const hashBuf = Buffer.alloc(4);
  hashBuf.writeUInt32LE(murmur3buf(withoutHash, 0xffffffff));
  const finalBuf = Buffer.concat([withoutHash, hashBuf]);
  if (finalBuf.length !== orig.length) {
    throw new Error('Size mismatch: original was ' + orig.length + ' bytes, rebuilt is ' + finalBuf.length);
  }
  const check = decryptFile(finalBuf, key);
  if (!check.payload.subarray(0, decLen).equals(newPayload.subarray(0, decLen))) {
    throw new Error('Self-verification failed: rebuilt file did not decrypt to identical patched payload');
  }
  return finalBuf;
}

module.exports = { decryptBlock, decryptFile, encryptPayload, reencrypt };
