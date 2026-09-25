// ----------------------------------------------------------------------------
// High-level cheat patchers (PTAS, CP, Spinels, HP, items, weapons, unlocks)
// ----------------------------------------------------------------------------
const { H, CLS, WEAPONS, KNIVES, TICKET_ID, align, skipClassBody } = require('./rsz');

function patchScalar(b, decLen, hash, newVal, filter) {
  let n = 0;
  for (let o = 0; o + 16 <= decLen; o += 4) {
    if (b.readUInt32LE(o) !== hash) continue;
    const ft = b.readInt32LE(o + 4);
    if ((ft !== 7 && ft !== 1) || b.readUInt32LE(o + 8) !== 4) continue;
    const old = b.readInt32LE(o + 12);
    if (filter && !filter(old, o)) continue;
    b.writeInt32LE(newVal, o + 12);
    n++;
  }
  return n;
}

function patchBool(b, decLen, hash) {
  let n = 0;
  for (let o = 0; o + 13 <= decLen; o += 4) {
    if (b.readUInt32LE(o) !== hash) continue;
    if (b.readInt32LE(o + 4) !== 2 || b.readUInt32LE(o + 8) !== 1) continue;
    if (b[o + 12] === 0) {
      b[o + 12] = 1;
      n++;
    }
  }
  return n;
}

function patchHP(b, decLen, newHP) {
  let n = 0;
  for (const cls of ['PlayerBaseBackup', 'ChCommonPlBackup', 'PartnerBaseBackup', 'ChCommonPnBackup']) {
    for (let o = 0; o + 8 <= decLen; o += 4) {
      if (b.readUInt32LE(o + 4) !== CLS[cls]) continue;
      const numF = b.readUInt32LE(o);
      if (numF < 3 || numF > 64) continue;
      for (let p = o + 8; p + 32 <= Math.min(decLen, o + 400); p += 4) {
        if (
          b.readUInt32LE(p) === H['_MaxHP'] && b.readInt32LE(p + 4) === 7 && b.readUInt32LE(p + 8) === 4 &&
          b.readUInt32LE(p + 16) === H['_HP'] && b.readInt32LE(p + 20) === 7 && b.readUInt32LE(p + 24) === 4
        ) {
          b.writeInt32LE(newHP, p + 12);
          b.writeInt32LE(newHP, p + 28);
          n++;
          break;
        }
      }
    }
  }
  return n;
}

function collectLevelListWrites(b, p, fieldHash, elemClass, elemFields, setVal, writes) {
  if (b.readUInt32LE(p) !== fieldHash || b.readInt32LE(p + 4) !== -1) throw new Error('level list header mismatch');
  p += 8;
  const mt = b.readInt32LE(p), len = b.readUInt32LE(p + 8);
  p += 16;
  if (mt !== 17 || len > 64) throw new Error('invalid level array');
  if (b.readUInt32LE(p) === 0xffeeffee) p += 4 + len * 4;
  for (let i = 0; i < len; i++) {
    const nf = b.readUInt32LE(p), ch = b.readUInt32LE(p + 4);
    if (nf !== elemFields || ch !== elemClass) throw new Error('level element mismatch');
    p += 8;
    for (let f = 0; f < elemFields; f++) {
      if (f > 0) writes.push({ off: p + 12, val: setVal });
      p += 16;
    }
  }
  return align(p, 4);
}

function collectWeaponWrites(b, off, writes, ammoVal, levelVal) {
  let p = off + 8;
  const need = h => { if (b.readUInt32LE(p) !== h) throw new Error('field mismatch'); };
  need(H['_CurrentAmmo']); p += 16;
  need(H['_CurrentAmmoCount']); writes.push({ off: p + 12, val: ammoVal }); p += 16;
  need(H['_CurrentTacticalAmmoCount']); writes.push({ off: p + 12, val: ammoVal }); p += 16;
  need(H['_CurrentWeaponPartsCustom']); p += 8; p = skipClassBody(b, p);
  need(H['_CustomLevelInWeapon']); p += 8;
  const nf = b.readUInt32LE(p), ch = b.readUInt32LE(p + 4);
  if (nf !== 5 || ch !== CLS['CustomLevelInWeapon']) throw new Error('bad CustomLevelInWeapon');
  p += 8;
  need(H['_IsReflect']); p += 16;
  need(H['_IsReticleFit']); p += 16;
  p = collectLevelListWrites(b, p, H['_CommonLevelInWeapon'], CLS['CommonLevelInWeapon'], 17, levelVal, writes);
  p = collectLevelListWrites(b, p, H['_IndividualLevelInWeapon'], CLS['IndividualLevelInWeapon'], 13, levelVal, writes);
  p = collectLevelListWrites(b, p, H['_LimitBreakLevelInWeapon'], CLS['LimitBreakLevelInWeapon'], 2, 1, writes);
  need(H['_LimitBreakCustomPattern']); p += 16;
  need(H['_ID']);
  return true;
}

function patchWeapons(b, decLen, ammoVal, levelVal) {
  let count = 0;
  for (let o = 0; o + 16 <= decLen; o += 4) {
    if (b.readUInt32LE(o) !== 11 || b.readUInt32LE(o + 4) !== CLS['WeaponItem']) continue;
    const writes = [];
    try {
      collectWeaponWrites(b, o, writes, ammoVal, levelVal);
      for (const w of writes) b.writeInt32LE(w.val, w.off);
      count++;
    } catch (_) {}
  }
  return count;
}

function isSkipId(id) {
  return id <= 0 ||
    (id >= 127200000 && id < 127380000) ||
    (id >= 124320000 && id < 124380000) ||
    id === 124000000 || id === 120800000 ||
    id === TICKET_ID || id === 275957056 || id === 275958656;
}

function patchItems(b, decLen, stackVal, knifeDur, ticketCount) {
  let boosted = 0, knives = 0, hasTicket = false;
  const victims = [];
  for (let o = 0; o + 64 <= decLen; o += 4) {
    if (b.readUInt32LE(o) !== H['_ItemId']) continue;
    const ft = b.readInt32LE(o + 4);
    if ((ft !== 7 && ft !== 1) || b.readUInt32LE(o + 8) !== 4) continue;
    if (
      b.readUInt32LE(o + 16) !== H['_CurrentCondition'] ||
      b.readUInt32LE(o + 32) !== H['_CurrentDurability'] ||
      b.readUInt32LE(o + 48) !== H['_CurrentItemCount']
    ) continue;
    const id = b.readInt32LE(o + 12);
    if (id === TICKET_ID) {
      hasTicket = true;
      b.writeInt32LE(ticketCount, o + 60);
      continue;
    }
    if (isSkipId(id)) continue;
    if (KNIVES.has(id)) {
      b.writeInt32LE(knifeDur, o + 44);
      knives++;
      continue;
    }
    if (id >= 274835456 && id <= 279000000) continue;
    const cnt = b.readInt32LE(o + 60);
    if (cnt !== stackVal) {
      b.writeInt32LE(stackVal, o + 60);
      boosted++;
    }
    if (id >= 116000000 && id < 116020000) victims.push({ o, prio: 2, id });
    else if (id >= 114400000 && id < 114430000) victims.push({ o, prio: 1, id });
  }
  let swappedTicket = false;
  if (!hasTicket && victims.length) {
    victims.sort((a, b2) => b2.prio - a.prio);
    const v = victims[0];
    b.writeInt32LE(TICKET_ID, v.o + 12);
    b.writeInt32LE(ticketCount, v.o + 60);
    swappedTicket = true;
  }
  return { boosted, knives, hasTicket, swappedTicket };
}

module.exports = { patchScalar, patchBool, patchHP, patchWeapons, patchItems };
