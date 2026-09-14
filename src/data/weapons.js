// weapons.js — the arsenal. Index = weapon slot order.
// `flash` is the muzzle-light colour [r,g,b] the dynamic lighting uses.
export const WEAPONS = [
  {
    name: 'FIST', key: 'Digit1', ammo: null, useAmmo: 0,
    fp: 'fp_fist', fpFire: 'fp_fist_fire', cooldown: 0.45, sound: 'punch',
    kind: 'melee', pellets: 1, spread: 0.0, dmg: [2, 20], range: 1.3, flash: null,
  },
  {
    name: 'PISTOL', key: 'Digit2', ammo: 'bullets', useAmmo: 1,
    fp: 'fp_pistol', fpFire: 'fp_pistol_fire', cooldown: 0.38, sound: 'pistol',
    kind: 'hitscan', pellets: 1, spread: 0.02, dmg: [5, 15], range: 24, flash: [1.0, 0.86, 0.5],
  },
  {
    name: 'SHOTGUN', key: 'Digit3', ammo: 'shells', useAmmo: 1,
    fp: 'fp_shotgun', fpFire: 'fp_shotgun_fire', cooldown: 0.85, sound: 'shotgun',
    kind: 'hitscan', pellets: 7, spread: 0.10, dmg: [4, 10], range: 20, flash: [1.0, 0.8, 0.42],
  },
  {
    name: 'SUPER SHOTGUN', key: 'Digit4', ammo: 'shells', useAmmo: 2,
    fp: 'fp_super', fpFire: 'fp_super_fire', cooldown: 1.2, sound: 'supershotgun',
    kind: 'hitscan', pellets: 20, spread: 0.19, dmg: [4, 9], range: 16, flash: [1.0, 0.78, 0.4],
  },
  {
    name: 'CHAINGUN', key: 'Digit5', ammo: 'bullets', useAmmo: 1,
    fp: 'fp_chaingun', fpFire: 'fp_chaingun_fire', cooldown: 0.11, sound: 'chaingun',
    kind: 'hitscan', pellets: 1, spread: 0.045, dmg: [5, 12], range: 24, flash: [1.0, 0.86, 0.5],
  },
  {
    name: 'ROCKET LAUNCHER', key: 'Digit6', ammo: 'rockets', useAmmo: 1,
    fp: 'fp_rocket', fpFire: 'fp_rocket_fire', cooldown: 0.9, sound: 'rocket',
    kind: 'projectile', proj: 'rocket', projSpeed: 9, splash: 2.2, dmg: [90, 130], flash: [1.0, 0.62, 0.28],
  },
  {
    name: 'PLASMA RIFLE', key: 'Digit7', ammo: 'cells', useAmmo: 1,
    fp: 'fp_plasma', fpFire: 'fp_plasma_fire', cooldown: 0.09, sound: 'plasma',
    kind: 'projectile', proj: 'plasma', projSpeed: 13, splash: 0, dmg: [9, 20], flash: [0.45, 0.62, 1.0],
  },
  {
    name: 'BFG 9000', key: 'Digit8', ammo: 'cells', useAmmo: 40,
    fp: 'fp_bfg', fpFire: 'fp_bfg_fire', cooldown: 0.9, sound: 'bfg',
    kind: 'projectile', proj: 'bfgball', projSpeed: 8, projH: 0.95, splash: 4.5, dmg: [380, 540], flash: [0.5, 1.0, 0.5],
  },
  {
    // secret weapon — granted by the "sauce" cheat. A grilled sausage that
    // spits an endless stream of wiggling white tadpoles. No ammo.
    name: 'SAUSAGE', key: 'Digit9', ammo: null, useAmmo: 0, secret: true,
    fp: 'fp_sausage', fpFire: 'fp_sausage_fire', cooldown: 0.14, sound: 'plasma',
    kind: 'projectile', proj: 'tadpole', projSpeed: 12, projH: 0.3, splash: 0, spread: 0.06, dmg: [14, 26], flash: [1.0, 1.0, 1.0],
  },
];

export const AMMO_MAX = { bullets: 200, shells: 50, rockets: 50, cells: 300 };
