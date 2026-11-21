(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SightlineEngagement = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var OP_STEPS = [
    { id: 'move', title: 'Move to the marker', hint: 'Use the joystick or movement keys to reach the amber route marker.' },
    { id: 'look', title: 'Look around', hint: 'Swipe or move the camera to scan the arena.' },
    { id: 'aim', title: 'Aim at the hostile', hint: 'Hold ADS and center the lone hostile in your sights.' },
    { id: 'fire', title: 'Fire once', hint: 'Fire a controlled shot at the hostile.' },
    { id: 'reload', title: 'Reload the carbine', hint: 'Reload, then move to the next target when the magazine is full.' },
    { id: 'objective', title: 'Secure the route', hint: 'Eliminate the remaining recruits to finish the operation.' }
  ];

  var GOAL_KEY = 'sightline.optional-goals.v1';
  var GOALS = [
    { id: 'headshots', title: 'Precision', detail: 'Earn 3 headshots in one match.', target: 3, value: function (s) { return number(s.hs); } },
    { id: 'hits', title: 'Stay on target', detail: 'Land 10 hits in one match.', target: 10, value: function (s) { return number(s.hits); } },
    { id: 'eliminations', title: 'Clear the room', detail: 'Earn 5 eliminations in one match.', target: 5, value: function (s) { return number(s.kills); } }
  ];

  function number(value) {
    value = Number(value);
    return isFinite(value) && value > 0 ? value : 0;
  }

  function comparePersonalRecords(records, summary) {
    records = records || {};
    summary = summary || {};
    var shots = number(summary.shots), accuracy = shots ? Math.round(100 * number(summary.hits) / shots) : 0;
    var kills = number(summary.kills), bestKills = number(records.kills), bestAccuracy = number(records.acc);
    return { kills: kills, accuracy: accuracy, newKillsBest: kills > bestKills, newAccuracyBest: shots > 0 && accuracy > bestAccuracy };
  }

  function createOperation() {
    var active = false, complete = false, index = 0, destination = null, lookOrigin = null, cachedSnapshot = null;

    function snapshot() {
      if (cachedSnapshot) return cachedSnapshot;
      var step = OP_STEPS[index] || null;
      cachedSnapshot = { active: active, complete: complete, step: step ? step.id : 'complete', title: step ? step.title : 'Operation complete', hint: step ? step.hint : 'Return to the lobby or replay the operation.', index: index, total: OP_STEPS.length };
      return cachedSnapshot;
    }
    function advance() {
      if (index < OP_STEPS.length - 1) { index++; cachedSnapshot = null; }
      return snapshot();
    }

    return {
      start: function (options) {
        options = options || {};
        if (options.networked || options.reconnecting || options.hostMigration) return false;
        active = true; complete = false; index = 0; cachedSnapshot = null;
        destination = options.destination && { x: Number(options.destination.x) || 0, z: Number(options.destination.z) || 0, radius: Math.max(.5, Number(options.destination.radius) || 1.1) };
        lookOrigin = { yaw: Number(options.yaw) || 0, pitch: Number(options.pitch) || 0 };
        return snapshot();
      },
      update: function (pose) {
        if (!active || !pose) return snapshot();
        var step = OP_STEPS[index];
        if (step.id === 'move' && destination && Math.hypot(Number(pose.x) - destination.x, Number(pose.z) - destination.z) <= destination.radius) advance();
        else if (step.id === 'look' && lookOrigin && (Math.abs(Number(pose.yaw) - lookOrigin.yaw) >= .22 || Math.abs(Number(pose.pitch) - lookOrigin.pitch) >= .18)) advance();
        else if (step.id === 'aim' && pose.aimed) advance();
        return snapshot();
      },
      canFire: function () { var step = OP_STEPS[index]; return active && !!step && (step.id === 'fire' || step.id === 'objective'); },
      shot: function () { if (active && OP_STEPS[index].id === 'fire') return advance(); return snapshot(); },
      reloadStarted: function () { return snapshot(); },
      reloadFinished: function () { if (active && OP_STEPS[index].id === 'reload') return advance(); return snapshot(); },
      eliminated: function () {
        if (!active || OP_STEPS[index].id !== 'objective') return snapshot();
        complete = true; active = false; index = OP_STEPS.length; cachedSnapshot = null;
        return snapshot();
      },
      cancel: function () { active = false; complete = false; destination = null; lookOrigin = null; index = 0; cachedSnapshot = null; return snapshot(); },
      snapshot: snapshot
    };
  }

  function readGoalState(storage, priorMatchCount) {
    try {
      var saved = storage && JSON.parse(storage.getItem(GOAL_KEY) || 'null');
      if (saved && saved.version === 1 && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < GOALS.length && Number.isInteger(saved.completed) && saved.completed >= 0) return saved;
    } catch (e) {}
    var count = Math.floor(number(priorMatchCount));
    return { version: 1, index: count % GOALS.length, completed: 0 };
  }

  function resolveOptionalGoal(storage, summary, priorMatchCount) {
    summary = summary || {};
    var state = readGoalState(storage, priorMatchCount), goal = GOALS[state.index], value = goal.value(summary);
    var completed = value >= goal.target, nextState = { version: 1, index: completed ? (state.index + 1) % GOALS.length : state.index, completed: state.completed + (completed ? 1 : 0) };
    try { if (storage) storage.setItem(GOAL_KEY, JSON.stringify(nextState)); } catch (e) {}
    return {
      completed: completed,
      goal: { id: goal.id, title: goal.title, detail: goal.detail, target: goal.target },
      value: Math.min(value, goal.target),
      completedCount: nextState.completed,
      next: completed ? { id: GOALS[nextState.index].id, title: GOALS[nextState.index].title, detail: GOALS[nextState.index].detail, target: GOALS[nextState.index].target } : null
    };
  }

  return { createOperation: createOperation, resolveOptionalGoal: resolveOptionalGoal, comparePersonalRecords: comparePersonalRecords, goalKey: GOAL_KEY, goals: GOALS.map(function (g) { return { id: g.id, title: g.title, detail: g.detail, target: g.target }; }) };
});
