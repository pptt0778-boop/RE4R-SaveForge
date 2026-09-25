// ----------------------------------------------------------------------------
// RE Engine LIME Cryptographic Primitives
// ----------------------------------------------------------------------------
function hexLE(h) { return BigInt('0x' + h.match(/../g).reverse().join('')); }

const P = hexLE('f33b6fb972a0b72515e45c391829e182ad8a9bdc0a64d3444d79c810ab863717');
const Q = hexLE('799db7dcb9505b928af22e1c8c14f0c156c54dee053269a226bce40854c31b8b');
const R = hexLE('e66f544afcce68c5ef07b9a07b277585344a1db61376e831f73b9fbd5f44f715');
const E = 0x14n;
const TWO64 = 1n << 64n;

function modexp(base, exp, mod) {
  let res = 1n, b = base % mod, e = exp;
  while (e > 0n) {
    if (e & 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return res;
}

function le2big(buf) {
  return BigInt('0x' + (buf.length ? Buffer.from(buf).reverse().toString('hex') : '0'));
}

function big2le(val, len) {
  return Buffer.from(Buffer.from(val.toString(16).padStart(len * 2, '0'), 'hex')).reverse();
}

const Uof = (key) => (TWO64 - 1n - BigInt(key >>> 0)) % Q;

function murmur3buf(buf, seed) {
  let h = seed >>> 0;
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  const n = buf.length >>> 2;
  for (let i = 0; i < n; i++) {
    let k = buf.readUInt32LE(i * 4);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
  }
  let k = 0;
  const tail = buf.length & 3, off = n * 4;
  if (tail === 3) k ^= buf[off + 2] << 16;
  if (tail >= 2) k ^= buf[off + 1] << 8;
  if (tail >= 1) { k ^= buf[off]; k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k; }
  h ^= buf.length;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

const murmur3str = (s) => murmur3buf(Buffer.from(s, 'utf8'), 0xffffffff);

module.exports = {
  P, Q, R, E, TWO64,
  modexp, le2big, big2le, Uof,
  murmur3buf, murmur3str
};
