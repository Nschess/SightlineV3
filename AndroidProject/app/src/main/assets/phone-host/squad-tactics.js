/* Shared tactical geometry for solo and LAN Outbreak. No rendering, timers or dependencies.
   Roles only alter positioning and priorities; they never change combat statistics. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SightlineSquad = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  var roles = ['protect', 'support', 'secure', 'reinforce'];
  function assignment(n, slot) {
    if (!(n > 0)) return 'protect';
    return roles[Math.max(0, slot) % Math.min(4, n)];
  }
  /* Offsets are relative to where the player actually looks, not world axes.
     Never target the player's physical position: even the protector keeps a lane open. */
  function point(anchor, role, slot, pressure) {
    var yaw = anchor.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    var rx = Math.cos(yaw), rz = -Math.sin(yaw), side = slot % 2 ? -1 : 1;
    var p = pressure ? 0.85 : 1;
    var forward = 0, right = 0;
    if (role === 'protect') { forward = -2.7 * p; right = side * 2.6; }
    else if (role === 'support') { forward = 2.5 * p; right = side * 6.4; }
    else if (role === 'secure') { forward = -5.8 * p; right = -side * 6.8; }
    else { forward = -8 * p; right = side * 4.4; }
    var ring = Math.floor(slot / 4);
    forward -= ring * 1.8; right += (ring % 2 ? -1 : 1) * ring * 1.1;
    return { x: anchor.x + fx * forward + rx * right,
      y: anchor.y || 0, z: anchor.z + fz * forward + rz * right };
  }
  /* Rotate the most weakened bot away from the close-guard post. Stable order
     avoids every-frame role thrash when combat health changes. */
  function order(bots) {
    return bots.slice().sort(function (a, b) {
      var ah = a.hp / Math.max(1, a.maxhp || 100), bh = b.hp / Math.max(1, b.maxhp || 100);
      var at = ah < 0.4 ? 1 : 0, bt = bh < 0.4 ? 1 : 0;
      return at - bt || (a.id || 0) - (b.id || 0);
    });
  }
  return { assignment: assignment, point: point, order: order, roles: roles.slice() };
});
