/* ===== Lobby 10 features (runs inside the game closure: uses R, ME, CURMAP, MP, G, audio()) ===== */
var SL_SWAY = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
var slCueAt = 0;
function slCue(kind) {
  try {
    if (!G.uiSound || !soundOn) return;
    var now = performance.now(); if (now - slCueAt < 40) return; slCueAt = now;
    if (!AC) audio(); if (!AC) return;
    var c = { tab: [420, 640, .07, .03, 'triangle'], hover: [900, 1100, .035, .012, 'sine'], card: [150, 48, .55, .05, 'sine'],
      begin: [220, 330, .2, .04, 'triangle'], found: [130, 520, 1.2, .03, 'triangle'], tap: [300, 240, .05, .03, 'triangle'] }[kind];
    if (!c) return;
    sfxTone(c[0], c[1], c[2], c[3], c[4], busUi);
    if (kind === 'card') sfxNoise(.5, 600, .035, .7);
  } catch (e) {}
}
window.__slAudio = { cue: slCue };

/* ambient bed: two low sines + filtered noise with a slow swell, only on the idle lobby */
var slAmb = null;
function slAmbPref() { try { return localStorage.getItem('sl-ambient') !== '0'; } catch (e) { return true; } }
function slAmbStart() {
  if (slAmb || !AC || !noiseBuf) return;
  try {
    var g = AC.createGain(), mix = AC.createGain(), o1 = AC.createOscillator(), o2 = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(),
      n = AC.createBufferSource(), nf = AC.createBiquadFilter(), ng = AC.createGain();
    g.gain.value = 0; mix.gain.value = .5; g.connect(busUi); mix.connect(g);
    o1.type = 'sine'; o1.frequency.value = 55; o2.type = 'sine'; o2.frequency.value = 82.6; o2.detune.value = 7;
    lfo.frequency.value = .07; lg.gain.value = .2; lfo.connect(lg); lg.connect(mix.gain);
    n.buffer = noiseBuf; n.loop = true; nf.type = 'lowpass'; nf.frequency.value = 260; ng.gain.value = .22;
    o1.connect(mix); o2.connect(mix); n.connect(nf); nf.connect(ng); ng.connect(mix);
    o1.start(); o2.start(); lfo.start(); n.start();
    g.gain.setTargetAtTime(.07, AC.currentTime, .9);
    slAmb = { g: g, nodes: [o1, o2, lfo, n] };
  } catch (e) { slAmb = null; }
}
function slAmbStop() {
  if (!slAmb) return; var a = slAmb; slAmb = null;
  try { a.g.gain.setTargetAtTime(0, AC.currentTime, .25); } catch (e) {}
  setTimeout(function () { a.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); try { a.g.disconnect(); } catch (e) {} }, 1300);
}
function slAmbTick() {
  var want = menuOpen() && state === 'idle' && G.uiSound && soundOn && slAmbPref() && !document.hidden && AC && AC.state === 'running';
  if (want && !slAmb) slAmbStart(); else if (!want && slAmb) slAmbStop();
}
setInterval(slAmbTick, 800);
document.addEventListener('pointerdown', function () { try { if (menuOpen() && G.uiSound && soundOn) audio(); } catch (e) {} }, { passive: true });
function slSoundBtn() {
  var b = $('#mn-sound'); if (!b) return; var on = slAmbPref();
  b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Menu music on' : 'Menu music off';
}
(function () {
  var b = $('#mn-sound'); if (!b) return;
  b.addEventListener('click', function () { try { localStorage.setItem('sl-ambient', slAmbPref() ? '0' : '1'); } catch (e) {} slSoundBtn(); slAmbTick(); slCue('tap'); });
  slSoundBtn();
})();
(function () {
  var ov = $('#ov-start'); if (!ov) return;
  ov.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.mn-tab,.mn-subtab')) slCue('tab'); }, true);
  if (!touchMode) ov.addEventListener('mouseover', function (e) {
    var t = e.target.closest && e.target.closest('.mode-choice,.mn-tab,.mn-subtab'); if (t && !t.contains(e.relatedTarget)) slCue('hover');
  });
  document.addEventListener('pointerdown', function (e) {
    if (!touchMode) return;
    try { if (e.target.closest && e.target.closest('#ov-start .mn-tab,#ov-start .mn-subtab,#ov-start .mode-choice,#ov-start .btn,#sl-matchfound') && navigator.vibrate) navigator.vibrate(8); } catch (x) {}
  }, { passive: true });
})();

/* navigation helper for the new buttons */
function slGoto(which) {
  var re = { operators: /operators/i, rules: /match rules/i, multiplayer: /multiplayer/i, maps: /^\s*(0?3)?\s*maps\s*$/i }[which]; if (!re) return;
  var list = [].slice.call(document.querySelectorAll('#mn-nav .mn-tab,#mn-subnav .mn-subtab'));
  for (var i = 0; i < list.length; i++) if (re.test(list[i].textContent)) { list[i].click(); return; }
}
document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-sl-goto]'); if (b) { e.preventDefault(); slGoto(b.getAttribute('data-sl-goto')); } });

/* real stats on the deploy card, operative plate, squad strip */
function slTime(s) { s = Math.round(+s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function slAuto(v) { return v > 0 ? String(v) : 'Auto'; }
function slAllies(v) { return v < 0 ? 'None' : slAuto(v); }
var SL_SKILL = { recruit: 'Recruit', regular: 'Regular', veteran: 'Veteran', elite: 'Elite' };
function slStatRows() {
  var skill = SL_SKILL[R.diff] || String(R.diff || ''), map = ['Map', CURMAP.name];
  if (R.mode === 'ffa') return [map, ['Score limit', R.ffaKills], ['Time', slTime(R.ffaTime)], ['Opponents', slAuto(R.bots)], ['Skill', skill]];
  if (R.mode === 'bomb') return [map, ['Best of', R.bombBestOf], ['Round time', slTime(R.bombTime)], ['Enemies', slAuto(R.bots)], ['Allies', slAllies(R.mates)], ['Skill', skill]];
  if (R.mode === 'outbreak' || R.mode === 'infection') return [map, ['Time', slTime(R.ztime)], ['Horde cap', R.zcap], ['Allies', slAllies(R.mates)], ['Skill', skill]];
  return [map, ['Rounds', 'First to ' + R.rounds], ['Round time', slTime(R.time)], ['Enemies', slAuto(R.bots)], ['Allies', slAllies(R.mates)], ['Skill', skill]];
}
function slRenderStats() {
  var brief = $('#mode-brief'); if (!brief) return;
  var rows = mpConnected() ? [['Map', CURMAP.name], ['Rules', 'Set by LAN host']] : slStatRows();
  brief.insertAdjacentHTML('beforeend', '<dl class="mode-stats">' + rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
    (mpConnected() ? '' : '<button type="button" class="mode-stats-edit" data-sl-goto="rules">Edit rules</button>'));
}
function slRenderPlate() {
  var el = $('#lobby-nameplate'); if (!el) return;
  el.innerHTML = '<span class="lp-k">Your operative</span><b>' + esc(ME.name) + '</b><span class="lp-s">' + esc((ME.role || '') + (ME.role ? ' · ' : '') + TEAMS[ME.team].name) + '</span>' +
    '<button type="button" class="lp-change" data-sl-goto="operators">Change operative</button>';
}
function slRenderSquad() {
  var el = $('#lobby-squad'); if (!el) return;
  var on = mpConnected(), names = [];
  if (on && MP.names) for (var k in MP.names) if (MP.names[k]) names.push(String(MP.names[k]));
  el.innerHTML = '<span class="ls-av">' + opSvg(ME, 30) + '</span><div class="ls-text"><b>' + (on ? 'LAN · ' + Math.max(1, names.length) + ' online' : 'Squad · solo') + '</b><span>' +
    (on ? esc(names.slice(0, 3).join(', ')) : 'Playing offline with bots') + '</span></div><button type="button" class="ls-btn" data-sl-goto="multiplayer">' + (on ? 'Lobby' : 'Find friends') + '</button>';
}
var slRMPBase = renderModePicker;
/* v8 Play screen data: hero description, DEPLOY sub-label, map links, LAN status pill, key hints */
var slHeroMode = null;
function slRenderV8() {
  var cur = $('#pn-play .lobby-mode-current'), pressed = document.querySelector('#pn-play .mode-choice[aria-pressed=true]');
  if (cur && pressed) {
    var d = pressed.querySelector('.mode-desc'); cur.setAttribute('data-desc', d ? d.textContent : ''); var nm = $('#ov-mode-name'); cur.setAttribute('data-long', nm && nm.textContent.length > 9 ? '1' : '0');
    if (slHeroMode !== null && slHeroMode !== R.mode && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cur.classList.remove('sl-pop'); void cur.offsetWidth; cur.classList.add('sl-pop'); }
    slHeroMode = R.mode;
    try { var ac = getComputedStyle(pressed).getPropertyValue('--ac').trim(); if (ac) document.documentElement.style.setProperty('--sl-ac', ac); } catch (e) {}
  }
  var bs = $('#btn-start'), sub = 'Offline';
  if (mpConnected()) sub = 'Set by LAN host';
  else { var rows = slStatRows(), kr = null, sk = null; rows.forEach(function (r) { if (!kr && /^(Rounds|Score limit|Best of|Time)$/.test(r[0])) kr = r; if (r[0] === 'Skill') sk = r; });
    sub = (kr ? (kr[0] === 'Rounds' ? kr[1] : kr[0] + ' ' + kr[1]) : '') + (sk ? (kr ? ' \u00b7 ' : '') + sk[1] : ''); }
  if (bs) bs.setAttribute('data-sub', sub);
  var brief = $('#mode-brief');
  if (brief && !brief.querySelector('.sl-maplinks')) brief.insertAdjacentHTML('beforeend', '<div class="sl-maplinks"><button type="button" data-sl-goto="maps">Change map</button>' + (mpConnected() ? '' : '<button type="button" data-sl-goto="rules">Match rules</button>') + '<button type="button" data-sl-goto="multiplayer">LAN</button></div>');
  var lan = $('#sl-lan'), on = mpConnected();
  if (!lan) { var card = $('#mn-card'); if (card) { card.insertAdjacentHTML('afterend', '<button type="button" class="sl-lan" id="sl-lan" data-sl-goto="multiplayer" title="LAN lobby"><i></i><span></span></button>'); lan = $('#sl-lan'); } }
  if (lan) { lan.classList.toggle('on', on); lan.lastChild.textContent = on ? 'LAN connected' : 'Offline \u00b7 LAN'; }
  var pp = $('#pn-play');
  if (pp && !$('#sl-hints')) { pp.insertAdjacentHTML('beforeend', '<div class="sl-hints" id="sl-hints"><button type="button" data-sl-goto="rules"><i>R</i>Rules</button></div>'); var ib = $('#btn-intro'); if (ib) $('#sl-hints').appendChild(ib); }
}
renderModePicker = function () { slRMPBase(); try { slRenderStats(); slRenderPlate(); slRenderSquad(); slRenderV8(); } catch (e) {} };
(function () {
  var t0 = $('#ov-title'), pp = $('#pn-play'); if (!t0 || !pp) return;
  var base = t0.textContent.trim().toLowerCase();
  function sync() { var t = t0.textContent.trim().toLowerCase(); pp.classList.toggle('sl-titled', !!t && t !== base); }
  new MutationObserver(sync).observe(t0, { childList: true, characterData: true, subtree: true }); sync();
})();
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  var t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (t && t.isContentEditable)) return;
  if (!menuOpen() || state !== 'idle' || document.querySelector('#sl-intro.si-in,#sl-matchfound.mf-on')) return;
  var k = (e.key || '').toLowerCase();
  if (k === 'q' || k === 'e') { var tabs = [].slice.call(document.querySelectorAll('#mn-nav .mn-tab')), i = tabs.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; }); if (i < 0) return; tabs[(i + (k === 'e' ? 1 : tabs.length - 1)) % tabs.length].click(); e.preventDefault(); }
  else if (k === 'r' && document.body.getAttribute('data-sl-route') === 'play' && !mpConnected()) { slGoto('rules'); e.preventDefault(); }
});
try { renderModePicker(); } catch (e) {}

/* loadout: legendary / NEW tags, share */
var SL_SEEN_KEY = 'sl-finish-seen-v1', slSeen = null;
function slSeenLoad() {
  if (slSeen) return slSeen;
  try { slSeen = JSON.parse(localStorage.getItem(SL_SEEN_KEY) || 'null'); } catch (e) { slSeen = null; }
  if (!slSeen || typeof slSeen !== 'object') slSeen = {};
  return slSeen;
}
function slSeenSave() { try { localStorage.setItem(SL_SEEN_KEY, JSON.stringify(slSeen)); } catch (e) {} }
/* First sight of a weapon records its current finishes as known; only finishes added later show NEW. */
function slFinishIsNew(key, f, list) {
  var s = slSeenLoad();
  if (!s[key]) { s[key] = list.map(function (x) { return x.name; }); slSeenSave(); return false; }
  return s[key].indexOf(f.name) < 0;
}
slFinishTags = function (key, f, list) {
  return (f.legendary ? '<em class="lf-tag lf-legendary">Legendary</em>' : '') + (slFinishIsNew(key, f, list) ? '<em class="lf-tag lf-new">New</em>' : '');
};
document.addEventListener('click', function (e) {
  var fb = e.target.closest && e.target.closest('.loadout-finish[data-slfid]');
  if (fb) { var p = fb.getAttribute('data-slfid').split('|'), s = slSeenLoad(); if (s[p[0]] && s[p[0]].indexOf(p[1]) < 0) { s[p[0]].push(p[1]); slSeenSave(); } }
  var sb = e.target.closest && e.target.closest('[data-sl-share]'); if (!sb) return;
  var h = document.querySelector('.loadout-heading h3'), fin = document.querySelector('.loadout-finish.is-selected b');
  var txt = 'Sightline loadout — ' + (h ? h.textContent : 'Firearm') + (fin ? ' · ' + fin.textContent : '') + ' · Operative ' + ME.name;
  function done(ok) { var cur = document.querySelector('[data-sl-share]') || sb; cur.textContent = ok ? 'Copied \u2713' : 'Copy failed'; setTimeout(function () { var c2 = document.querySelector('[data-sl-share]'); if (c2) c2.textContent = 'Share loadout'; }, 1600); }
  function fallback() { try { var t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); var ok = document.execCommand('copy'); document.body.removeChild(t); done(ok); } catch (x) { done(false); } }
  if (navigator.share) navigator.share({ title: 'Sightline', text: txt }).catch(function (er) { if (!er || er.name !== 'AbortError') fallback(); });
  else if (navigator.clipboard && navigator.clipboard.writeText) { var settled = false, t = setTimeout(function () { if (!settled) { settled = true; fallback(); } }, 1000); navigator.clipboard.writeText(txt).then(function () { if (!settled) { settled = true; clearTimeout(t); done(true); } }, function () { if (!settled) { settled = true; clearTimeout(t); fallback(); } }); }
  else fallback();
}, true);

/* screen transitions: animate only when the route really changes (not on every re-render) */
var slLastRoute = document.body.getAttribute('data-sl-route'), slRouteT = 0;
new MutationObserver(function () {
  var r = document.body.getAttribute('data-sl-route'); if (r === slLastRoute) return; slLastRoute = r;
  var m = document.querySelector('#ov-start .mn-main'); if (!m) return;
  m.classList.remove('sl-route-in'); void m.offsetWidth; m.classList.add('sl-route-in');
  clearTimeout(slRouteT); slRouteT = setTimeout(function () { m.classList.remove('sl-route-in'); }, 520);
}).observe(document.body, { attributes: true, attributeFilter: ['data-sl-route'] });

/* match-found style transition before an offline deploy */
(function () {
  var ov = $('#ov-start'); if (!ov) return;
  function MFE() { return document.getElementById('sl-matchfound'); }
  var timer = 0, busy = false, bypass = false;
  function hide() { var mf = MFE(); clearTimeout(timer); busy = false; if (mf) mf.classList.remove('mf-on'); setTimeout(function () { if (!busy && mf) mf.hidden = true; }, 380); }
  function go() { clearTimeout(timer); if (!busy) return; bypass = true; try { $('#btn-start').click(); } finally { bypass = false; } hide(); }
  ov.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#btn-start'); if (!b || bypass) return;
    if (busy) { e.stopPropagation(); e.preventDefault(); return; }
    if (MP.on || mpConnected() || state === 'paused' || !canPick() || window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.stopPropagation(); e.preventDefault(); audio(); busy = true;
    var mf = MFE(); if (!mf) { busy = false; return; }
    var m = modeInfo();
    $('#mf-map').textContent = CURMAP.name; $('#mf-mode').textContent = m[0] + (R.mode === 'tactical' ? ' · First to ' + R.rounds : '');
    $('#mf-brief').textContent = m[2]; $('#mf-hint').textContent = touchMode ? 'Tap to skip' : 'Click to skip · Esc to cancel · Tab opens the scoreboard in match';
    mf.hidden = false; void mf.offsetWidth; mf.classList.add('mf-on'); slCue('found');
    timer = setTimeout(go, touchMode ? 1300 : 1600);
  }, true);
  document.addEventListener('click', function (e) { if (busy && e.target.closest && e.target.closest('#sl-matchfound')) go(); });
  document.addEventListener('keydown', function (e) { if (busy && e.key === 'Escape') { e.stopPropagation(); hide(); } }, true);
})();

/* ---------- v7 lobby stage: dark studio set + per-mode atmosphere (Play / Operators only) ----------
   Hides the map while the lobby preview is shown, builds a small stage around the operative, tints it by the
   selected mode. Disable with localStorage 'sl-stage' = 'off'. Everything is restored when leaving the lobby. */
(function () {
  var off = true; try { off = localStorage.getItem('sl-stage') !== 'on'; } catch (e) {}
  if (off || typeof lobbyPreviewUpdate !== 'function' || typeof THREE === 'undefined') return;
  var origLPU = lobbyPreviewUpdate;
  var stage = null, on = false, hidden = [], lastLen = -1, saved = null, savedMapId = null, ourBg = null;
  var accent = new THREE.Color(0x7be0c6), accentT = new THREE.Color(0x7be0c6), accentKey = '', accentCss = '';
  var tex = function (w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new THREE.CanvasTexture(c); return t; };
  var mat = function (o) { o.fog = false; o.depthWrite = false; return new THREE.MeshBasicMaterial(o); };
  function build() {
    stage = new THREE.Group(); stage.name = 'sightlineLobbyStage';
    var dome = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), mat({
      side: THREE.BackSide, map: tex(4, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#01030a'); gr.addColorStop(.38, '#06101d'); gr.addColorStop(.5, '#0c1d2e'); gr.addColorStop(.62, '#050a12'); gr.addColorStop(1, '#010204'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
    dome.renderOrder = -20; stage.add(dome);
    var glowTex = tex(4, 128, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var band = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 16, 40, 1, true), mat({ side: THREE.BackSide, map: glowTex, transparent: true, blending: THREE.AdditiveBlending, opacity: .5, color: accent }));
    band.position.y = 3.5; band.renderOrder = -19; stage.add(band); stage.userData.band = band;
    var floor = new THREE.Mesh(new THREE.CircleGeometry(65, 40), mat({ color: 0x04070b })); floor.rotation.x = -Math.PI / 2; floor.position.y = .0; floor.renderOrder = -18; stage.add(floor);
    var pool = new THREE.Mesh(new THREE.CircleGeometry(15, 48), mat({ transparent: true, map: tex(256, 256, function (g, w) { var gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(46,70,92,1)'); gr.addColorStop(.28, 'rgba(18,30,42,.95)'); gr.addColorStop(.62, 'rgba(8,14,20,.6)'); gr.addColorStop(1, 'rgba(4,7,11,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }) }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = .015; pool.renderOrder = -17; stage.add(pool);
    var under = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), mat({ transparent: true, blending: THREE.AdditiveBlending, opacity: .55, color: accent, map: tex(128, 128, function (g, w) { var gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.5, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }) }));
    under.rotation.x = -Math.PI / 2; under.position.y = .03; under.renderOrder = -16; stage.add(under); stage.userData.under = under;
    [[1.55, 1.6, .9], [2.5, 2.52, .45], [3.7, 3.72, .22]].forEach(function (r) {
      var ring = new THREE.Mesh(new THREE.RingGeometry(r[0], r[1], 72), mat({ transparent: true, blending: THREE.AdditiveBlending, opacity: r[2], color: accent, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = .04; ring.renderOrder = -15; stage.add(ring); (stage.userData.rings = stage.userData.rings || []).push(ring); });
    var coneTex = tex(4, 128, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.55, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,.04)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var cone = new THREE.Mesh(new THREE.CylinderGeometry(.3, 2.5, 7.5, 40, 1, true), mat({ side: THREE.DoubleSide, map: coneTex, transparent: true, blending: THREE.AdditiveBlending, opacity: .26, color: 0xcfe9ff }));
    cone.position.y = 3.75; cone.renderOrder = -14; stage.add(cone); stage.userData.cone = cone;
    var barTex = tex(32, 128, function (g, w, h) { var gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gx; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; var gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(.25, 'rgba(0,0,0,1)'); gy.addColorStop(.8, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gy; g.fillRect(0, 0, w, h); });
    var bars = new THREE.Group(); bars.position.y = 3; stage.add(bars); stage.userData.bars = bars;
    [[-.5, 0x8fd6ff, .55], [.5, 0xffb86b, .45]].forEach(function (b, i) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(.55, 7), mat({ map: barTex, transparent: true, blending: THREE.AdditiveBlending, opacity: b[2], color: i ? 0xffb86b : 0x8fd6ff, side: THREE.DoubleSide }));
      var ang = .38 + Math.PI + b[0] * .9; m.position.set(Math.sin(ang) * 6.2, 0, Math.cos(ang) * 6.2); m.rotation.y = ang + Math.PI; m.renderOrder = -13; bars.add(m); });
    if (!touchMode) {
      var N = 70, pos = new Float32Array(N * 3); for (var i = 0; i < N; i++) { var a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 3.2; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 5.5; pos[i * 3 + 2] = Math.sin(a) * r; }
      var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: .045, color: 0xdff3ff, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pts.renderOrder = -12; stage.add(pts); stage.userData.dust = pts; }
    scene.add(stage);
  }
  function readAccent() {
    var el = document.querySelector('#pn-play .mode-choice[aria-pressed=true]'), key = document.body.getAttribute('data-sl-mode') || '';
    if (!el) return; var v = ''; try { v = getComputedStyle(el).getPropertyValue('--ac').trim(); } catch (e) {}
    if (!v || v === accentCss) return; accentCss = v;
    try { accentT.set(v); document.documentElement.style.setProperty('--sl-ac', '#' + accentT.getHexString()); } catch (e) {}
  }
  function hideWorld() {
    hidden.forEach(function (o) { o.visible = true; }); hidden = [];
    var keep = [camera, hemi, sun, stage, LOBBY_PREVIEW && LOBBY_PREVIEW.g];
    scene.children.forEach(function (o) { if (keep.indexOf(o) < 0 && o.visible) { o.visible = false; hidden.push(o); } });
    lastLen = scene.children.length;
  }
  function saveLights() {
    saved = { hc: hemi.color.clone(), hg: hemi.groundColor.clone(), hi: hemi.intensity, sc: sun.color.clone(), si: sun.intensity, sp: sun.position.clone(), sw: sky.visible, bg: saved && saved.bg };
    savedMapId = CURMAP.id;
  }
  function enter() {
    if (!stage) build(); stage.visible = true; on = true; ourBg = null; saveLights(); hideWorld(); document.body.classList.add('sl-stage-on');
  }
  function exit() {
    on = false; if (stage) stage.visible = false;
    hidden.forEach(function (o) { o.visible = true; }); hidden = [];
    if (saved) { hemi.color.copy(saved.hc); hemi.groundColor.copy(saved.hg); hemi.intensity = saved.hi; sun.color.copy(saved.sc); sun.intensity = saved.si; sun.position.copy(saved.sp); sky.visible = saved.sw; if (saved.bg) scene.background = saved.bg; }
    saved = null; ourBg = null; document.body.classList.remove('sl-stage-on');
  }
  var ST = 0;
  lobbyPreviewUpdate = function (active) {
    origLPU(active);
    var route = document.body.getAttribute('data-sl-route'), want = !!active && (route === 'play' || route === 'op' || route === 'operators') && LOBBY_PREVIEW && LOBBY_PREVIEW.g && LOBBY_PREVIEW.g.visible;
    if (want && !on) enter(); else if (!want && on) exit();
    if (!on) return;
    if (savedMapId !== CURMAP.id) { saveLights(); }
    if (scene.children.length !== lastLen) hideWorld();
    if (scene.background !== ourBg) { saved.bg = scene.background; ourBg = new THREE.Color(0x03060b); }
    scene.background = ourBg; sky.visible = false;
    var p = LOBBY_PREVIEW.g.position; stage.position.set(p.x, 0, p.z);
    readAccent(); accent.lerp(accentT, .08);
    hemi.color.setHex(0x9bbbe0); hemi.groundColor.setHex(0x0a1018); hemi.intensity = .5;
    sun.color.setHex(0xfff0dc); sun.intensity = 1.15; sun.position.set(p.x - 18, 26, p.z + 20);
    var rim = LOBBY_PREVIEW.g.getObjectByName('sightlineLobbyOperatorRim'); if (rim) { rim.color.copy(accent); rim.intensity = .8; }
    var t = performance.now() * .001, u = stage.userData;
    u.rings.forEach(function (r, i) { r.material.color.copy(accent); r.material.opacity = [.9, .45, .22][i] * (SL_SWAY ? .85 + Math.sin(t * 1.3 + i) * .15 : 1); });
    u.band.material.color.copy(accent); u.under.material.color.copy(accent);
    u.cone.material.color.copy(accent).lerp(new THREE.Color(0xffffff), .6);
    if (SL_SWAY) { u.bars.rotation.y = Math.sin(t * .16) * .08; if (u.dust) u.dust.rotation.y = t * .03; }
  };
  window.__slStage = { active: function () { return on; }, hidden: function () { return hidden.length; } };
})();
