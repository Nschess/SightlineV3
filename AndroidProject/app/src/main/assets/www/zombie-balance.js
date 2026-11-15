/* Shared Outbreak-only balance. Infection player zombies keep their separate 1560 HP.
   Keeping this catalog shared prevents solo/LAN health and cash drift. */
(function (root, factory) {
  const catalog=factory();
  if (typeof module === 'object' && module.exports) module.exports=catalog;
  if (root) root.SightlineZombieBalance=catalog;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const types=Object.freeze({
    walker: Object.freeze({ hp: 100, bounty: 55 }),
    sprinter: Object.freeze({ hp: 155, bounty: 75 }),
    brute: Object.freeze({ hp: 800, bounty: 260 }),
    spitter: Object.freeze({ hp: 185, bounty: 95 })
  });
  function health(type, wave, mode) {
    if (mode === 'infection') return 1560;
    const t=types[type]; if (!t) throw new Error('Unknown zombie: '+type);
    const w=Math.max(1,Number.isFinite(wave)?wave:1);
    if (type === 'walker') return 100; // user-requested standard Co-op walker health at every wave
    return Math.round(t.hp*(1+Math.min(.3,(w-1)*.02)));
  }
  return Object.freeze({types,health});
});
