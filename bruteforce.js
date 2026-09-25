// ----------------------------------------------------------------------------
// Save Key Brute-Force Worker Thread Engine
// ----------------------------------------------------------------------------
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { P, TWO64, modexp, le2big } = require('./crypto');

if (!isMainThread) {
  const { start, end, file } = workerData;
  const buf = fs.readFileSync(file);
  const block0 = buf.subarray(0x10, 0x10 + 0x1220);
  const c1 = le2big(block0.subarray(0, 64));
  const cts = [0, 1, 2, 3].map(i => le2big(block0.subarray(i * 128 + 64, i * 128 + 128)));
  const c1inv = modexp(c1, P - 2n, P);
  const dataBlock = block0.subarray(0x200, 0x1200);
  const checksum = block0.subarray(0x1200, 0x1220);

  let x = modexp(c1, TWO64 - 1n - BigInt(start), P);
  const REPORT = 1 << 21;
  let sinceReport = 0;

  for (let key = start; key < end; key++) {
    if (cts[0] % x === 0n && cts[1] % x === 0n && cts[2] % x === 0n && cts[3] % x === 0n) {
      const keyIv = Buffer.alloc(32);
      let okAll = true;
      for (let i = 0; i < 4; i++) {
        const k = cts[i] / x;
        if (k >= TWO64) { okAll = false; break; }
        const kb = Buffer.alloc(8);
        kb.writeBigUInt64LE(k);
        kb.copy(keyIv, i * 8);
      }
      if (okAll) {
        try {
          const decipher = crypto.createDecipheriv('aes-128-ofb', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
          decipher.setAutoPadding(false);
          const dec = Buffer.concat([decipher.update(dataBlock), decipher.final()]);
          const clsLen = dec.readUInt32LE(4);
          if (clsLen <= 1000) {
            const hash = crypto.createHash('sha3-256').update(dec).digest();
            if (hash.equals(checksum)) {
              parentPort.postMessage({ type: 'found', key, keyIv: keyIv.toString('hex') });
              process.exit(0);
            }
          }
        } catch (_) {}
      }
    }
    x = (x * c1inv) % P;
    if (++sinceReport >= REPORT) {
      parentPort.postMessage({ type: 'progress', count: sinceReport });
      sinceReport = 0;
    }
  }
  parentPort.postMessage({ type: 'done', start });
  process.exit(0);
}

function runKeyFind(file) {
  const nCores = os.cpus().length;
  const TOTAL = 0x100000000;
  const chunk = Math.ceil(TOTAL / nCores);
  console.log('Starting brute-force key search using ' + nCores + ' worker threads...');
  const t0 = Date.now();
  let progressed = 0;
  let done = false;
  for (let w = 0; w < nCores; w++) {
    const start = w * chunk;
    const end = Math.min(TOTAL, start + chunk);
    if (start >= end) break;
    const worker = new Worker(__filename, { workerData: { start, end, file } });
    worker.on('message', (msg) => {
      if (msg.type === 'found' && !done) {
        done = true;
        console.log('\n========================================');
        console.log('KEY FOUND: ' + msg.key + ' (0x' + msg.key.toString(16) + ')');
        console.log('KeyIV:     ' + msg.keyIv);
        console.log('SteamID64: 0x01100001' + (msg.key >>> 0).toString(16).padStart(8, '0'));
        console.log('========================================\n');
        fs.writeFileSync('found_key.json', JSON.stringify(msg, null, 2));
        console.log('Saved key to found_key.json');
        process.exit(0);
      } else if (msg.type === 'progress') {
        progressed += msg.count;
        if (progressed % (1 << 24) < msg.count) {
          const pct = ((progressed / TOTAL) * 100).toFixed(1);
          const rate = progressed / ((Date.now() - t0) / 1000);
          const eta = (TOTAL - progressed) / rate;
          process.stdout.write('\r[' + pct + '%] rate: ' + (rate / 1e6).toFixed(2) + ' M/s | ETA: ' + eta.toFixed(0) + 's    ');
        }
      }
    });
    worker.on('error', (err) => { console.error('Worker error:', err); process.exit(1); });
  }
}

module.exports = { runKeyFind };
