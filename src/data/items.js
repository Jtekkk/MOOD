// items.js — pickups keyed by their `things`-grid character.
// apply(game) returns true if the item was consumed (false = leave it, e.g. full health).

export const ITEMS = {
  h: { sprite: 'stimpack', spriteH: 0.45, sound: 'health',
    apply: (g) => addHealth(g, 10, 100, 'Picked up a stimpack.') },
  H: { sprite: 'medikit', spriteH: 0.5, sound: 'health',
    apply: (g) => addHealth(g, 25, 100, 'Picked up a medikit!') },
  p: { sprite: 'healthbonus', spriteH: 0.4, sound: 'pickup',
    apply: (g) => addHealth(g, 1, 200, 'Picked up a health bonus.') },
  a: { sprite: 'greenarmor', spriteH: 0.5, sound: 'pickup',
    apply: (g) => setArmor(g, 100, 'Picked up the armor.') },
  A: { sprite: 'bluearmor', spriteH: 0.5, sound: 'pickup',
    apply: (g) => setArmor(g, 200, 'Picked up the MegaArmor!') },
  g: { sprite: 'megasphere', spriteH: 0.6, sound: 'health',
    apply: (g) => { g.player.health = 200; g.player.armor = 200; g.message('MegaSphere!'); return true; } },
  l: { sprite: 'clip', spriteH: 0.3, sound: 'pickup',
    apply: (g) => addAmmo(g, 'bullets', 10, 'Picked up a clip.') },
  L: { sprite: 'ammobox', spriteH: 0.4, sound: 'pickup',
    apply: (g) => addAmmo(g, 'bullets', 50, 'Picked up a box of bullets.') },
  s: { sprite: 'shells', spriteH: 0.3, sound: 'pickup',
    apply: (g) => addAmmo(g, 'shells', 4, 'Picked up 4 shotgun shells.') },
  S: { sprite: 'shellbox', spriteH: 0.4, sound: 'pickup',
    apply: (g) => addAmmo(g, 'shells', 20, 'Picked up a box of shells.') },
  r: { sprite: 'rocketbox', spriteH: 0.4, sound: 'pickup',
    apply: (g) => addAmmo(g, 'rockets', 5, 'Picked up a box of rockets.') },
  '2': { sprite: 'pickup_shotgun', spriteH: 0.45, sound: 'weapon',
    apply: (g) => giveWeapon(g, 2, 'shells', 8, 'You got the shotgun!') },
  '3': { sprite: 'pickup_sshotgun', spriteH: 0.45, sound: 'weapon',
    apply: (g) => giveWeapon(g, 3, 'shells', 8, 'You got the super shotgun!') },
  '4': { sprite: 'pickup_chaingun', spriteH: 0.45, sound: 'weapon',
    apply: (g) => giveWeapon(g, 4, 'bullets', 20, 'You got the chaingun!') },
  '5': { sprite: 'pickup_rocket', spriteH: 0.45, sound: 'weapon',
    apply: (g) => giveWeapon(g, 5, 'rockets', 2, 'You got the rocket launcher!') },
  R: { sprite: 'keyRed', spriteH: 0.5, sound: 'pickup',
    apply: (g) => giveKey(g, 'red', 'Picked up a red keycard.') },
  U: { sprite: 'keyBlue', spriteH: 0.5, sound: 'pickup',
    apply: (g) => giveKey(g, 'blue', 'Picked up a blue keycard.') },
  Y: { sprite: 'keyYellow', spriteH: 0.5, sound: 'pickup',
    apply: (g) => giveKey(g, 'yellow', 'Picked up a yellow keycard.') },
  e: { sprite: 'cell', spriteH: 0.3, sound: 'pickup',
    apply: (g) => addAmmo(g, 'cells', 20, 'Picked up an energy cell.') },
  E: { sprite: 'cellpack', spriteH: 0.4, sound: 'pickup',
    apply: (g) => addAmmo(g, 'cells', 100, 'Picked up an energy cell pack.') },
  6: { sprite: 'pickup_plasma', spriteH: 0.45, sound: 'weapon',
    apply: (g) => giveWeapon(g, 6, 'cells', 40, 'You got the plasma rifle!') },
  7: { sprite: 'pickup_bfg', spriteH: 0.5, sound: 'weapon',
    apply: (g) => giveWeapon(g, 7, 'cells', 80, 'You got the BFG 9000!') },
};

function addHealth(g, amt, cap, msg) {
  if (g.player.health >= cap) return false;
  g.player.health = Math.min(cap, g.player.health + amt);
  g.message(msg); return true;
}
function setArmor(g, amt, msg) {
  if (g.player.armor >= amt) return false;
  g.player.armor = amt; g.message(msg); return true;
}
function addAmmo(g, type, amt, msg) {
  const max = { bullets: 200, shells: 50, rockets: 50, cells: 300 }[type];
  if (g.player.ammo[type] >= max) return false;
  g.player.ammo[type] = Math.min(max, g.player.ammo[type] + amt);
  g.message(msg); return true;
}
function giveWeapon(g, idx, ammoType, amt, msg) {
  const had = g.player.owned[idx];
  g.player.owned[idx] = true;
  if (ammoType) g.player.ammo[ammoType] = Math.min({ bullets: 200, shells: 50, rockets: 50, cells: 300 }[ammoType], g.player.ammo[ammoType] + amt);
  if (!had) g.player.weapon = idx;     // auto-switch to a newly found weapon
  g.message(msg); return true;
}
function giveKey(g, color, msg) {
  if (g.player.keys[color]) return false;
  g.player.keys[color] = true; g.message(msg); return true;
}
