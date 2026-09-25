// ----------------------------------------------------------------------------
// RE Engine RSZ Hashes and Serialized Struct Field Parsers
// ----------------------------------------------------------------------------
const { murmur3str } = require('./crypto');

const H = {};
for (const n of [
  'PTAS', 'SpinelCount', '_ExPoint', '_IsUnlock', '_IsBuy', '_MaxHP', '_HP',
  '_ID', '_ItemId', '_CurrentCondition', '_CurrentDurability', '_CurrentItemCount',
  '_CurrentAmmo', '_CurrentAmmoCount', '_CurrentTacticalAmmoCount',
  '_CurrentWeaponPartsCustom', '_CustomLevelInWeapon', '_LimitBreakCustomPattern',
  '_Datas', '_IsReflect', '_IsReticleFit', '_CommonLevelInWeapon',
  '_IndividualLevelInWeapon', '_LimitBreakLevelInWeapon', '_CommonCustomCategory',
  '_IndividualCustomCategory', '_LimitBreakCustomCategory', '_NowLevel'
]) {
  H[n] = murmur3str(n);
}

const CLS = {};
for (const n of [
  'chainsaw.WeaponItem', 'chainsaw.WeaponPartsCustom', 'chainsaw.CustomLevelInWeapon',
  'chainsaw.CommonLevelInWeapon', 'chainsaw.IndividualLevelInWeapon', 'chainsaw.LimitBreakLevelInWeapon',
  'chainsaw.PlayerBaseBackup', 'chainsaw.ChCommonPlBackup', 'chainsaw.PartnerBaseBackup', 'chainsaw.ChCommonPnBackup'
]) {
  CLS[n.split('.').pop()] = murmur3str(n);
}

const WEAPONS = {
  274835456: 'SG-09 R', 274837056: 'Punisher', 274838656: 'Red9', 274840256: 'Blacktail',
  274841856: 'Matilda', 274843456: 'Minecart Red9', 274995456: 'W-870', 274997056: 'Riot Gun',
  274998656: 'Striker', 275155456: 'TMP', 275157056: 'Chicago Sweeper', 275158656: 'LE 5',
  275475456: 'SR M1903', 275477056: 'Stingray', 275478656: 'CQBR 5.56', 275635456: 'Broken Butterfly',
  275637056: 'Killer7', 275638656: 'Handcannon', 275795456: 'Bolt Thrower', 276275456: 'Rocket Launcher',
  276277056: 'Rocket Launcher (Special)', 276278656: 'Rocket Launcher (Infinite)',
  276435456: 'Combat Knife', 276437056: 'Fighting Knife', 276438656: 'Kitchen Knife',
  276440256: 'Boot Knife', 276445056: 'Primal Knife', 278035456: 'Sentinel Nine',
  278037056: 'Skull Crusher', 278521856: 'Krausers Bow', 277075456: 'Hand Grenade',
  277077056: 'Heavy Grenade', 277078656: 'Flash Grenade'
};

const KNIVES = new Set([276435456, 276437056, 276438656, 276440256, 276445056]);
const TICKET_ID = 120481600;

const align = (x, a) => (x + a - 1) & ~(a - 1);

function skipClassBody(b, p) {
  const nf = b.readUInt32LE(p); p += 8;
  if (nf > 64) throw new Error('class fields count exceeds safety limit');
  for (let i = 0; i < nf; i++) p = skipField(b, p);
  return p;
}

function skipField(b, p) {
  const ft = b.readInt32LE(p + 4); p += 8;
  if (ft === 17) return skipClassBody(b, p);
  if (ft === -1) {
    const mt = b.readInt32LE(p), ms = b.readUInt32LE(p + 4), len = b.readUInt32LE(p + 8), at = b.readInt32LE(p + 12);
    p += 16;
    if (len > 100000) throw new Error('array length exceeds safety limit');
    if (at === 1) {
      if (b.readUInt32LE(p) === 0xffeeffee) p += 4 + len * 4;
      for (let i = 0; i < len; i++) p = skipClassBody(b, p);
    } else if (mt === 16 && len > 0) {
      let s = 1; while (s < ms) s <<= 1; p += len * s;
    } else if (mt === 15) {
      for (let i = 0; i < len; i++) { p = align(p, 4); const sz = b.readUInt32LE(p); p += 4 + sz * 2; }
    } else {
      for (let i = 0; i < len; i++) { if (ms !== 1) p = align(p, ms); p += ms; }
    }
    return align(p, 4);
  }
  if (ft === 15) { p = align(p, 4); const sz = b.readUInt32LE(p); return align(p + 4 + sz * 2, 4); }
  const sz = b.readUInt32LE(p); p += 4;
  if (sz !== 1) p = align(p, sz);
  return align(p + sz, 4);
}

module.exports = { H, CLS, WEAPONS, KNIVES, TICKET_ID, align, skipClassBody, skipField };
