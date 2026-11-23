(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SightlineModeRules = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BOMB_DEFAULTS = Object.freeze({ roundSeconds: 90, bombSeconds: 35, plantSeconds: 4, defuseSeconds: 6, bestOf: 7 });
  const BOMB_LIMITS = Object.freeze({ roundSeconds: [60, 180], bombSeconds: [20, 60], plantSeconds: [3, 8], defuseSeconds: [4, 10], bestOf: [3, 9] });
  const FFA_DEFAULTS = Object.freeze({ killLimit: 20, matchSeconds: 300, respawnMs: 3000, spawnShieldMs: 1000 });
  function infectionPatientZeroCount(botCount, availableCount) {
    const bots = Math.max(0, Math.min(64, Math.floor(Number(botCount) || 0)));
    const available = Math.max(0, Math.floor(Number(availableCount) || 0));
    const target = Math.max(2, Math.min(10, Math.ceil(bots / 8)));
    return Math.min(target, available);
  }
  function clampSetting(key, value) {
    const bounds = BOMB_LIMITS[key];
    if (!bounds || !Number.isFinite(Number(value))) return BOMB_DEFAULTS[key];
    let n = Math.round(Number(value));
    if (key === 'bestOf' && n % 2 === 0) n += n < BOMB_DEFAULTS.bestOf ? -1 : 1;
    return Math.max(bounds[0], Math.min(bounds[1], n));
  }
  function settings(input) {
    const out = {};
    for (const key of Object.keys(BOMB_DEFAULTS)) out[key] = input && input[key] !== undefined ? clampSetting(key, input[key]) : BOMB_DEFAULTS[key];
    return out;
  }
  function bombAttackTeamForRound(round, bestOf, openingTeam) {
    const opening = openingTeam === 1 ? 1 : 0;
    const total = Number.isFinite(Number(bestOf)) ? Math.max(1, Math.floor(Number(bestOf))) : BOMB_DEFAULTS.bestOf;
    return round > Math.floor(total / 2) ? 1 - opening : opening;
  }
  function resolveBombSites(nav, area, siteAnchors) {
    if (!nav || !Array.isArray(nav.nodes) || !area || ![area.x0, area.x1, area.z0, area.z1].every(Number.isFinite)) return null;
    const width = area.x1 - area.x0, depth = area.z1 - area.z0;
    if (width < 24 || depth < 24) return null;
    const anchors = siteAnchors == null ? [
      { id: 'A', x: area.x0 + width * 0.28, z: area.z0 + depth * 0.48 },
      { id: 'B', x: area.x0 + width * 0.72, z: area.z0 + depth * 0.52 }
    ] : [
      siteAnchors.A && { id: 'A', x: siteAnchors.A.x, z: siteAnchors.A.z },
      siteAnchors.B && { id: 'B', x: siteAnchors.B.x, z: siteAnchors.B.z }
    ];
    if (!Array.isArray(anchors) || anchors.length !== 2) return null;
    const minimumSeparation = Math.max(12, Math.min(30, width * 0.22));
    for (let i = 0; i < 2; i++) {
      const anchor = anchors[i], expectedId = i === 0 ? 'A' : 'B';
      if (!anchor || anchor.id !== expectedId || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z) ||
          anchor.x <= area.x0 + 1 || anchor.x >= area.x1 - 1 || anchor.z <= area.z0 + 1 || anchor.z >= area.z1 - 1) return null;
    }
    if (Math.hypot(anchors[0].x - anchors[1].x, anchors[0].z - anchors[1].z) < minimumSeparation) return null;
    const candidates = [[], []], reachable = nav.reachable;
    for (let i = 0; i < nav.nodes.length; i++) {
      const p = nav.nodes[i];
      if (!p || !Number.isFinite(p.x + p.y + p.z) || Math.abs(p.y) > 0.15 || reachable && !reachable[i]) continue;
      if (p.x < area.x0 + 1 || p.x > area.x1 - 1 || p.z < area.z0 + 1 || p.z > area.z1 - 1) continue;
      for (let a = 0; a < 2; a++) {
        const d = Math.hypot(p.x - anchors[a].x, p.z - anchors[a].z);
        candidates[a].push({ id: i, x: p.x, y: p.y || 0, z: p.z, d });
      }
    }
    for (const list of candidates) list.sort((a, b) => a.d - b.d || a.id - b.id);
    if (!candidates[0].length || !candidates[1].length) return null;
    const limit = Math.min(320, candidates[0].length, candidates[1].length);
    let best = null;
    for (let i = 0; i < limit; i++) for (let j = 0; j < limit; j++) {
      const a = candidates[0][i], b = candidates[1][j], separation = Math.hypot(a.x - b.x, a.z - b.z);
      if (separation < minimumSeparation) continue;
      const score = a.d + b.d + Math.max(0, minimumSeparation * 1.3 - separation) * 0.2;
      if (!best || score < best.score || score === best.score && (a.id < best.a.id || a.id === best.a.id && b.id < best.b.id)) best = { score, a, b };
    }
    if (!best) return null;
    return { A: { id: 'A', node: best.a.id, x: best.a.x, y: best.a.y, z: best.a.z }, B: { id: 'B', node: best.b.id, x: best.b.x, y: best.b.y, z: best.b.z }, separation: Math.hypot(best.a.x - best.b.x, best.a.z - best.b.z) };
  }
  function createBombRound(options) {
    const o = options || {}, cfg = settings(o.settings);
    if (!o.sites || !o.sites.A || !o.sites.B || !Number.isInteger(o.attackTeam) || o.attackTeam < 0 || o.attackTeam > 1 || !Number.isInteger(o.round) || o.round < 1) return null;
    return { round: o.round, attackTeam: o.attackTeam, defendTeam: 1 - o.attackTeam, phase: 'carried', carrierId: o.carrierId == null ? null : o.carrierId,
      carrierName: typeof o.carrierName === 'string' ? o.carrierName.trim().slice(0, 24) : null,
      plantedBy: null, defusedBy: null, droppedBy: null,
      siteId: null, x: null, y: 0, z: null, plantedAt: 0, explodeAt: 0, use: null, settings: cfg, sites: o.sites, revision: 1 };
  }
  function distance2(x, z, p) { return (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z); }
  function beginUse(state, actor, action, now, radius) {
    if (!state || state.use || !actor || !Number.isInteger(actor.id) || !Number.isFinite(actor.x + actor.z + now) || !actor.alive) return false;
    const r2 = (radius || 2.0) ** 2;
    if (action === 'plant') {
      if (state.phase !== 'carried' || state.carrierId !== actor.id || actor.team !== state.attackTeam) return false;
      let site = null;
      for (const id of ['A', 'B']) if (distance2(actor.x, actor.z, state.sites[id]) <= r2) { site = state.sites[id]; break; }
      if (!site) return false;
      state.use = { action, actorId: actor.id, actorName: typeof actor.name === 'string' ? actor.name.trim().slice(0, 24) : null, siteId: site.id, startedAt: now, completeAt: now + state.settings.plantSeconds * 1000, x: actor.x, y: Number.isFinite(actor.y) ? actor.y : 0, z: actor.z };
      state.revision++; return true;
    }
    if (action === 'defuse') {
      if (state.phase !== 'planted' || actor.team !== state.defendTeam || distance2(actor.x, actor.z, state) > r2) return false;
      state.use = { action, actorId: actor.id, actorName: typeof actor.name === 'string' ? actor.name.trim().slice(0, 24) : null, siteId: state.siteId, startedAt: now, completeAt: now + state.settings.defuseSeconds * 1000, x: actor.x, y: Number.isFinite(actor.y) ? actor.y : 0, z: actor.z };
      state.revision++; return true;
    }
    return false;
  }
  function cancelUse(state, actorId) {
    if (!state || !state.use || actorId != null && state.use.actorId !== actorId) return false;
    state.use = null; state.revision++; return true;
  }
  function dropBomb(state, carrierId, point) {
    if (!state || state.phase !== 'carried' || state.carrierId !== carrierId || !point || !Number.isFinite(point.x + point.z)) return false;
    state.phase = 'dropped'; state.droppedBy = { id: carrierId, name: state.carrierName || null }; state.carrierId = null; state.carrierName = null; state.use = null; state.x = point.x; state.y = Number.isFinite(point.y) ? point.y : 0; state.z = point.z; state.revision++; return true;
  }
  function pickupBomb(state, actor, radius) {
    if (!state || state.phase !== 'dropped' || !actor || !Number.isInteger(actor.id) || !actor.alive || actor.team !== state.attackTeam || !Number.isFinite(actor.x + actor.z) || distance2(actor.x, actor.z, state) > (radius || 1.7) ** 2) return false;
    state.phase = 'carried'; state.carrierId = actor.id; state.carrierName = typeof actor.name === 'string' ? actor.name.trim().slice(0, 24) : null; state.x = state.y = state.z = null; state.revision++; return true;
  }
  function advance(state, now, actor) {
    if (!state) return null;
    if (state.phase === 'planted' && now >= state.explodeAt) { state.phase = 'exploded'; state.use = null; state.revision++; return { result: 'attack', event: 'exploded' }; }
    if (!state.use) return null;
    const use = state.use;
    const valid = actor && actor.id === use.actorId && actor.alive && Number.isFinite(actor.x + actor.z) &&
      (use.action === 'plant' ? state.phase === 'carried' && state.carrierId === actor.id && actor.team === state.attackTeam && distance2(actor.x, actor.z, state.sites[use.siteId]) <= 2.0 ** 2 && distance2(actor.x, actor.z, use) <= 2.25 ** 2 :
        state.phase === 'planted' && actor.team === state.defendTeam && distance2(actor.x, actor.z, state) <= 2.0 ** 2 && distance2(actor.x, actor.z, use) <= 2.25 ** 2);
    if (!valid) { cancelUse(state, use.actorId); return { result: null, event: 'cancelled' }; }
    if (now < use.completeAt) return null;
    if (use.action === 'plant') {
      const site = state.sites[use.siteId]; state.phase = 'planted'; state.plantedBy = { id: use.actorId, name: use.actorName || null }; state.carrierId = null; state.carrierName = null; state.siteId = use.siteId;
      state.x = site.x; state.y = site.y || 0; state.z = site.z; state.plantedAt = now; state.explodeAt = now + state.settings.bombSeconds * 1000; state.use = null; state.revision++;
      return { result: null, event: 'planted' };
    }
    state.phase = 'defused'; state.defusedBy = { id: use.actorId, name: use.actorName || null }; state.use = null; state.revision++;
    return { result: 'defend', event: 'defused' };
  }
  function bombWinner(state, aliveAttackers, aliveDefenders, roundExpired) {
    if (!state) return null;
    if (state.phase === 'exploded') return 'attack';
    if (state.phase === 'defused') return 'defend';
    if (state.phase === 'planted') {
      if (aliveDefenders <= 0 && aliveAttackers > 0) return 'attack';
      if (aliveAttackers <= 0 && aliveDefenders <= 0) return 'attack';
      return null;
    }
    if (aliveAttackers <= 0) return 'defend';
    if (aliveDefenders <= 0) return 'attack';
    if (roundExpired) return 'defend';
    return null;
  }
  function createFFA(options) {
    const o = options || {}, limit = Number.isInteger(o.killLimit) ? Math.max(5, Math.min(100, o.killLimit)) : FFA_DEFAULTS.killLimit;
    const matchSeconds = Number.isInteger(o.matchSeconds) ? Math.max(60, Math.min(900, o.matchSeconds)) : FFA_DEFAULTS.matchSeconds;
    return { killLimit: limit, matchSeconds, startedAt: Number.isFinite(o.startedAt) ? o.startedAt : 0, scores: new Map(), seenDeaths: new Set(), winnerId: null };
  }
  function recordFFAElimination(state, killerId, victimId, lifeEpoch) {
    if (!state || !Number.isInteger(killerId) || !Number.isInteger(victimId) || killerId === victimId) return { accepted: false, winnerId: state && state.winnerId };
    const deathKey = victimId + ':' + (Number.isInteger(lifeEpoch) ? lifeEpoch : 0);
    if (state.seenDeaths.has(deathKey)) return { accepted: false, duplicate: true, winnerId: state.winnerId };
    state.seenDeaths.add(deathKey);
    const score = (state.scores.get(killerId) || 0) + 1; state.scores.set(killerId, score);
    if (state.winnerId == null && score >= state.killLimit) state.winnerId = killerId;
    return { accepted: true, score, winnerId: state.winnerId };
  }
  function ffaTimedWinner(state) {
    if (!state || !state.scores.size) return null;
    let winnerId = null, best = -1, tied = false;
    state.scores.forEach((score, id) => { if (score > best) { best = score; winnerId = id; tied = false; } else if (score === best) tied = true; });
    return tied ? null : winnerId;
  }
  return { BOMB_DEFAULTS, BOMB_LIMITS, FFA_DEFAULTS, infectionPatientZeroCount, settings, bombAttackTeamForRound, resolveBombSites, createBombRound, beginUse, cancelUse, dropBomb, pickupBomb, advance, bombWinner, createFFA, recordFFAElimination, ffaTimedWinner };
});
