# RE4R-SaveForge

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20PC-0078D6?logo=windows&logoColor=white)](https://store.steampowered.com/app/2050650/Resident_Evil_4/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0%20(Pure%20Node)-brightgreen.svg)]()

> **Autonomous save editor, decryptor, key-cracker and cheat engine for Resident Evil 4 Remake (2023) PC.**
> Zero external dependencies, pure Node.js standard library.

---

## Features

- **Full LIME Cryptographic Pipeline**: Decrypts and safely re-encrypts RE Engine save containers with fresh session keys and valid checksums.
- **Automatic Key Derivation**: Derives the save decryption key directly from your SteamID64.
- **Multi-threaded Key Finder**: High-speed brute-force mode for imported saves with unknown SteamIDs (~10-20M keys/sec across CPU cores).
- **Currencies & Rewards**:
  - PTAS (Pesetas) boosted to **9,999,999** (merchant cap).
  - Spinels boosted to **9,999** (trade shop cap).
  - CP (Extra Content Shop points) boosted to **999,999**.
- **Character & Combat**:
  - Player & Partner HP boosted to **999,999** (god mode).
  - Knives durability boosted to **999,999** (unbreakable Combat, Fighting, Kitchen, Boot, Primal knives).
  - Ammo & consumable item stacks topped up to **999**.
- **Weapons & Merchant Upgrades**:
  - All owned weapons maxed to **Lv 5** across every category.
  - **Exclusive perks** unlocked automatically without needing merchant tickets.
  - Loaded chamber ammo set to **999**.
  - Injects or refreshes **Special Upgrade Tickets x1,000** (Item ID 120481600).
- **Unlockables & Extras**:
  - All bonus costumes, accessories, weapons, models, concept art, and records unlocked (data00-1.bin).
- **Safety First**:
  - Automatic .bak backup creation before any file write.
  - Self-verifying re-encryption: verifies that newly encrypted files decrypt bit-identically before committing.
  - Built-in dry-run mode (outputs to .patched without touching your original save).

---

## Installation

1. Install [Node.js](https://nodejs.org/) (v18 or newer, LTS recommended).
2. Clone or download this repository:
   git clone https://github.com/pptt0778-boop/RE4R-SaveForge.git
   cd RE4R-SaveForge
3. No npm install needed! Zero external dependencies.

---

## Save File Locations

- Genuine Steam: C:\Program Files (x86)\Steam\userdata\<SteamID3>\2050650\remote\win64_save\
- RUNE / Emulator: C:\Users\Public\Documents\Steam\RUNE\2050650\remote\win64_save\
- Goldberg: C:\Users\<User>\AppData\Roaming\Goldberg SteamEmu Saves\2050650\remote\win64_save\

### Save File Anatomy
- data00-1.bin & data000.bin: System saves (Extra Content shop, records, unlocks).
- data001slot.bin to data020slot.bin: Manual campaign saves 1 to 20.
- data100slot.bin: Autosave slot.

---

## Usage

### 1. Inspect a Save (scan)
node re4r.js scan path/to/data001slot.bin
node re4r.js scan path/to/data001slot.bin --steamid 76561198012345678

### 2. Apply Cheats (cheat)
# Dry run (creates .patched file alongside):
node re4r.js cheat path/to/data001slot.bin

# Directly apply (creates .bak backup automatically):
node re4r.js cheat path/to/data001slot.bin --apply

# For genuine Steam:
node re4r.js cheat path/to/data001slot.bin --steamid 76561198012345678 --apply

# Unlock all Extra Content (costumes, models, weapons, records):
node re4r.js cheat path/to/data00-1.bin --apply

# Selective cheats with --only:
node re4r.js cheat path/to/data001slot.bin --only=ptas,spinel --apply
node re4r.js cheat path/to/data001slot.bin --only=weapons,tickets --apply
node re4r.js cheat path/to/data001slot.bin --only=hp,items --apply

Available filters: ptas, spinel, cp, hp, weapons, items, ammo, tickets, skins.

### 3. Find Unknown Key (keyfind)
node re4r.js keyfind path/to/data100slot.bin

---

## Technical Architecture

RE Engine saves on PC use Capcom LIME container encryption:
- Header (0x10 bytes): Magic DSSS, version, flags
- Blocks (0x1220 bytes each):
  - 0x000..0x200: ElGamal Key Exchange (4 pairs of c1, c2)
  - 0x200..0x1200: AES-128-OFB encrypted data (4096 bytes)
  - 0x1200..0x1220: SHA3-256 integrity hash of plain data
- Trailer (12 bytes): Decrypted length + MurmurHash3 checksum

Key derivation:
- key = SteamID64 mod 2^32
- u = (2^64 - 1 - key) mod q

RSZ Serialization Note: Derived class fields serialize before base class fields in RE Engine RSZ format.

---

## Disclaimer

This project is created strictly for educational and single-player offline convenience purposes under fair use.
Resident Evil is a registered trademark of CAPCOM CO., LTD. Not affiliated with Capcom or Valve Corporation.

## License

MIT License. See LICENSE for details.
