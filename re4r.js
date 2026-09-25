#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { isMainThread } = require('worker_threads');
const { H, CLS, WEAPONS, KNIVES, TICKET_ID } = require('./rsz');
const { decryptFile, reencrypt } = require('./lime');
const { patchScalar, patchBool, patchHP, patchWeapons, patchItems } = require('./cheats');
const { runKeyFind } = require('./bruteforce');

function parseKeyArg(argv) {
  const kIdx = argv.indexOf('--key');
  if (kIdx !== -1 && argv[kIdx + 1]) {
    const s = argv[kIdx + 1].toLowerCase();
    return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10);
  }
  const sIdx = argv.indexOf('--steamid');
  if (sIdx !== -1 && argv[sIdx + 1]) {
    const sid = BigInt(argv[sIdx + 1]);
    return Number(sid & 0xffffffffn);
  }
  for (const p of ['./found_key.json', '../found_key.json', path.join(__dirname, 'found_key.json')]) {
    if (fs.existsSync(p)) {
      try {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (typeof d.key === 'number') return d.key;
      } catch (_) {}
    }
  }
  return 0x1800;
}

function cmdScan(file, key) {
  console.log('Scanning: ' + file);
  console.log('Key: 0x' + key.toString(16) + ' (' + key + ')\n');
  const orig = fs.readFileSync(file);
  const { payload, decLen } = decryptFile(orig, key);
  console.log('--- Currencies ---');
  for (let o = 0; o + 16 <= decLen; o += 4) {
    const h = payload.readUInt32LE(o);
    if ((h === H['PTAS'] || h === H['SpinelCount'] || h === H['_ExPoint']) &&
        (payload.readInt32LE(o + 4) === 7 || payload.readInt32LE(o + 4) === 1) &&
        payload.readUInt32LE(o + 8) === 4) {
      const label = h === H['PTAS'] ? 'PTAS (Pesetas)' : h === H['SpinelCount'] ? 'Spinel' : 'CP (ExPoint)';
      console.log('  ' + label.padEnd(16) + ': ' + payload.readInt32LE(o + 12).toLocaleString());
    }
  }
  console.log('\n--- Player HP ---');
  for (const cls of ['PlayerBaseBackup', 'ChCommonPlBackup']) {
    for (let o = 0; o + 8 <= decLen; o += 4) {
      if (payload.readUInt32LE(o + 4) !== CLS[cls]) continue;
      for (let p = o + 8; p + 32 <= Math.min(decLen, o + 400); p += 4) {
        if (
          payload.readUInt32LE(p) === H['_MaxHP'] && payload.readInt32LE(p + 4) === 7 &&
          payload.readUInt32LE(p + 16) === H['_HP'] && payload.readInt32LE(p + 20) === 7
        ) {
          console.log('  ' + cls + ': HP = ' + payload.readInt32LE(p + 28) + ' / ' + payload.readInt32LE(p + 12));
          break;
        }
      }
    }
  }
  console.log('\n--- Inventory Highlights ---');
  let tickets = 0;
  for (let o = 0; o + 64 <= decLen; o += 4) {
    if (payload.readUInt32LE(o) !== H['_ItemId']) continue;
    if (
      payload.readUInt32LE(o + 16) !== H['_CurrentCondition'] ||
      payload.readUInt32LE(o + 32) !== H['_CurrentDurability'] ||
      payload.readUInt32LE(o + 48) !== H['_CurrentItemCount']
    ) continue;
    const id = payload.readInt32LE(o + 12);
    const dur = payload.readInt32LE(o + 44);
    const count = payload.readInt32LE(o + 60);
    if (id === TICKET_ID) {
      tickets += count;
      console.log('  [Special Upgrade Ticket] stack count = ' + count);
    } else if (KNIVES.has(id)) {
      console.log('  [Knife: ' + (WEAPONS[id] || id) + '] durability = ' + dur);
    }
  }
  if (!tickets) console.log('  No Special Upgrade Tickets found.');
}

function cmdCheat(file, key, argv) {
  const apply = argv.includes('--apply');
  const onlyArg = argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null;
  const shouldRun = (name) => !only || only.has(name);
  console.log('Target: ' + file);
  console.log('Key:    0x' + key.toString(16) + ' (' + key + ')');
  console.log('Mode:   ' + (apply ? 'WRITE (.bak created)' : 'DRY RUN (.patched created)') + '\n');
  const orig = fs.readFileSync(file);
  const { payload, decLen } = decryptFile(orig, key);
  const b = Buffer.from(payload);
  console.log('[*] Applying cheats...');
  if (shouldRun('ptas')) {
    const n = patchScalar(b, decLen, H['PTAS'], 9999999);
    console.log('  - PTAS (Pesetas) set to 9,999,999 (' + n + ' fields)');
  }
  if (shouldRun('spinel')) {
    const n = patchScalar(b, decLen, H['SpinelCount'], 9999);
    console.log('  - Spinels set to 9,999 (' + n + ' fields)');
  }
  if (shouldRun('cp')) {
    const n = patchScalar(b, decLen, H['_ExPoint'], 999999);
    console.log('  - CP (Extra Content Points) set to 999,999 (' + n + ' fields)');
  }
  if (shouldRun('skins') || shouldRun('unlocks')) {
    const u = patchBool(b, decLen, H['_IsUnlock']);
    const buy = patchBool(b, decLen, H['_IsBuy']);
    console.log('  - Unlocked all Extra Content: ' + u + ' unlocks, ' + buy + ' shop items');
  }
  if (shouldRun('hp')) {
    const n = patchHP(b, decLen, 999999);
    console.log('  - Player/Partner HP set to 999,999 (' + n + ' backups)');
  }
  if (shouldRun('items') || shouldRun('ammo') || shouldRun('tickets')) {
    const r = patchItems(b, decLen, 999, 999999, 1000);
    console.log('  - Stacks boosted to 999: ' + r.boosted);
    console.log('  - Knife durabilities set to 999,999: ' + r.knives);
    if (r.hasTicket) console.log('  - Ticket stack refreshed to 1,000');
    else if (r.swappedTicket) console.log('  - Swapped junk item -> Special Upgrade Ticket x1,000');
  }
  if (shouldRun('weapons')) {
    const c = patchWeapons(b, decLen, 999, 5);
    console.log('  - Upgraded ' + c + ' weapons to Lv 5 + exclusive perk + 999 loaded ammo');
  }
  console.log('\n[*] Re-encrypting save container with fresh random session keys...');
  const finalBuf = reencrypt(orig, key, b);
  console.log('  [+] Cryptographic self-verification passed.');
  if (apply) {
    const bak = file + '.bak';
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(file, bak);
      console.log('  [+] Backup: ' + bak);
    }
    fs.writeFileSync(file, finalBuf);
    console.log('  [+] Written to: ' + file);
  } else {
    const out = file + '.patched';
    fs.writeFileSync(out, finalBuf);
    console.log('  [+] Dry-run saved to: ' + out);
  }
}

function printHelp() {
  console.log('RE4R-SaveForge — Resident Evil 4 Remake (PC) Save Editor\n\nUsage:\n  node re4r.js <cmd> <file> [options]\n\nCommands:\n  scan     <file>         Inspect currencies, HP, weapons, tickets\n  cheat    <file>         Apply cheats and re-encrypt\n  keyfind  <file>         Brute-force the save key (~30-60s)\n\nOptions:\n  --apply                 Write changes directly to file (.bak created)\n  --key <val>             Explicit key (hex 0x1800 or dec 6144)\n  --steamid <id64>        Derive key from SteamID64\n  --only=<list>           Filter: ptas,spinel,cp,hp,weapons,items,skins\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) return printHelp();
  const cmd = argv[0].toLowerCase();
  const file = argv[1];
  if (cmd === 'keyfind') {
    if (!file) { console.error('Error: specify save file to brute-force'); process.exit(1); }
    return runKeyFind(file);
  }
  if (cmd !== 'scan' && cmd !== 'cheat') {
    console.error('Unknown command: ' + cmd); process.exit(1);
  }
  if (!file || !fs.existsSync(file)) {
    console.error('File not found: ' + file); process.exit(1);
  }
  const key = parseKeyArg(argv);
  try {
    if (cmd === 'scan') cmdScan(file, key);
    else if (cmd === 'cheat') cmdCheat(file, key, argv);
  } catch (err) {
    console.error('\nError: ' + err.message);
    if (err.message.includes('SHA3') || err.message.includes('invalid key')) {
      console.error('Hint: Key 0x' + key.toString(16) + ' failed to decrypt.');
      console.error('For genuine Steam, pass --steamid <SteamID64>, or run keyfind.');
    }
    process.exit(1);
  }
}

if (isMainThread) main();
