/* Solo Offline Co-op Outbreak ally equipment. No network, player wallet, or game timers.
   Data comes from the SAME catalog as the player's shop. Paid guns cost separate
   credits earned by an ally between cleared waves; nothing is unlocked for free. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SightlineLoadout = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  var roles = {
    protect: ['switchback','needle','thunder','falcon','smg','mako','breacher','kestrel','ember','carbine','scatter','stinger','hammer','aurora','rampart','hawk','bulwark','ranger','tide','longbow'],
    support: ['falcon','mistral','pinion','vantage','carbine','stinger','aurora','mako','rampart','smg','ranger','tide','bulwark','kestrel','scatter','breacher','ember','longbow','hawk','hammer'],
    secure: ['bastion','forge','pinion','cyclone','vantage','rampart','ranger','stinger','tide','bulwark','carbine','aurora','longbow','scatter','ember','mako','smg','breacher','kestrel','hawk','hammer'],
    reinforce: ['switchback','falcon','mistral','thunder','needle','stinger','smg','carbine','mako','aurora','kestrel','rampart','breacher','scatter','ember','ranger','tide','bulwark','hawk','hammer','longbow']
  };
  function allowed(k, weapons, store) {
    var w = weapons[k];
    return !!(w && !w.melee && Number.isFinite(w.price) && w.price >= 0 &&
      Number.isFinite(w.mag) && w.mag > 0 && Number.isFinite(w.reload) && w.reload > 0 &&
      (k === 'pistol' || store.indexOf(k) >= 0));
  }
  function ammo(w) { return {mag:w.mag, res:0, reload:0, unlimitedReserve:true}; }
  function tick(a,w,dt) {
    if (!a || !a.unlimitedReserve || !w || !(dt >= 0)) return;
    if (a.reload > 0) {
      a.reload = Math.max(0,a.reload - dt);
      if (a.reload === 0) a.mag = Math.min(w.mag,Math.max(0,a.mag) + (w.mag - Math.max(0,a.mag)));
    } else if (a.mag === 0) a.reload = w.reload; // one real reload, never free rounds
  }
  function fire(a) { if (!a || !a.unlimitedReserve || a.reload > 0 || a.mag <= 0) return false; a.mag--; return true; }
  function cooldown(w) { return Math.max(0.095,60 / Math.max(1,w.rpm || 300)); }
  function distance(w) {
    if (w.pellets) return 11;
    if (w.longRange || w.scope) return 31;
    if (w.rs && w.rs < 23) return 15;
    if (w.slot === '1') return 15;
    return 23;
  }
  function accuracy(w, dist) {
    var range = distance(w), factor = w.pellets ? 0.92 : w.scope ? 0.85 : 1;
    if (dist > range) factor *= Math.max(0.4,1 - (dist - range) * (w.pellets ? 0.055 : 0.012));
    return factor;
  }
  function damage(w, dist) {
    // The existing NPC combat power is the baseline. Avoid full player headshot or
    // shotgun pellet multipliers: those would erase waves with no player input.
    var factor = Math.max(0.7,Math.min(1.25, (w.dmg || 24) / 26));
    if (w.pellets) factor = dist < 9 ? 1.25 : dist < 15 ? 0.85 : 0.45;
    if (w.scope || w.bolt) factor = Math.min(1.32,factor+0.08);
    return factor;
  }
  function rank(k,role,slot,span,used,price) {
    var pref = roles[role] || roles.reinforce, index = pref.indexOf(k);
    if (index < 0) return -99;
    var score = 20 - index * 0.88;
    // Mild stable variation, so a whole row of defenders doesn't pick one rifle.
    score += ((slot * 7 + index * 3) % 5) * 0.25;
    if (span > 95 && ['ranger','rampart','tide','carbine'].indexOf(k)>=0) score += 1.25;
    if (span < 75 && ['smg','mako','breacher','scatter'].indexOf(k)>=0) score += 1;
    score -= Math.min(3,(used[k] || 0)*1.4);
    score -= Math.max(0,price) / 3200;
    return score;
  }
  function choose(bot,weapons,store,used,wave,span) {
    if (!bot || !bot.alive || !(wave >= 1) || wave - (bot.lastUpgradeWave || 0) < 2) return null;
    var current = bot.weapon || 'pistol', credits = Math.max(0,bot.squadCredits||0);
    var best = null, bestScore = -Infinity, oldScore = current === 'pistol' ? 3 : rank(current,bot.role,bot.slot,span,used,(weapons[current]||{}).price||0);
    for (var i=0;i<store.length;i++) {
      var key=store[i], w=weapons[key];
      if (key===current || !allowed(key,weapons,store) || w.price===0 || w.price>credits) continue;
      if (current === 'pistol' && (roles[bot.role] || roles.reinforce).indexOf(key) > 6) continue; // save for a role-suitable gun
      var s=rank(key,bot.role,bot.slot,span,used,w.price);
      if (s>bestScore) {bestScore=s;best=key;}
    }
    return best && bestScore > oldScore + 1.25 ? {key:best,price:weapons[best].price} : null;
  }
  function income(wave) {return Math.round((300+100*wave)*0.6);}
  return {allowed:allowed,ammo:ammo,tick:tick,fire:fire,cooldown:cooldown,distance:distance,accuracy:accuracy,damage:damage,choose:choose,income:income};
});
