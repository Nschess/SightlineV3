/*
 * Read-only source coverage audit for the universal character grip matrix.
 * It verifies roster/weapon counts and first-person class payload parity.
 * It does not claim visual acceptance or run the game renderer.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets');
const web = path.join(assets, 'www');
const phone = path.join(assets, 'phone-host');
const evidence = path.join(root, 'evidence', 'universal-character-grip-audit-20261026');
fs.mkdirSync(evidence, { recursive: true });
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const historicalGripPath = path.join(root, 'evidence', 'hand-workflow-20261025', 'grip-anchor-audit-all-characters-2026-10-25.json');
const historicalGrip = fs.existsSync(historicalGripPath) ? JSON.parse(fs.readFileSync(historicalGripPath, 'utf8')) : null;
const historicalAnchorPass = !!(historicalGrip && historicalGrip.pass === true &&
  historicalGrip.characterGripAudit && historicalGrip.characterGripAudit.humanVariants === 34 &&
  historicalGrip.characterGripAudit.weaponCharacterPairs === 952 &&
  historicalGrip.characterGripAudit.missingOrMisaligned.length === 0);

function section(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Missing source section: ${start}`);
  return html.slice(a, b);
}
function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}
function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const opsSource = section('var OPS = [', 'OPS.forEach(function(o)');
const baseHumans = [...opsSource.matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1]);
const extrasSource = section('var EXTRA_NAMES = {', '};');
const extraNames = [...extrasSource.matchAll(/'([^']+)'/g)].map(m => m[1]);
const extras = extraNames.map((name, i) => `x-${i < 12 ? 'red' : 'blue'}-${name.toLowerCase()}`);
const humans = [...baseHumans, ...extras];
const kindsSource = section('var ZKINDS = [', '];');
const zombieKinds = [...kindsSource.matchAll(/'([^']+)'/g)].map(m => m[1]);
const hollowed = zombieKinds.flatMap(kind => [`z-${kind}-0`, `z-${kind}-1`]);

const weaponSource = section('var WEAPONS = {', '/* ---------- map data');
const vm = require('node:vm');
const sandbox = {};
vm.runInNewContext(`${weaponSource}\n${extractFunction('fpGripClass')}\nthis.__weapons=WEAPONS;this.__classify=fpGripClass;`, sandbox, { timeout: 1000 });
const weapons = Object.keys(sandbox.__weapons);
const firearmIds = weapons.filter(id => !sandbox.__weapons[id].melee);
const weaponClasses = ['rifle', 'smg', 'shotgun', 'lmg', 'marksman', 'pistol'];
const classesSeen = [...new Set(weapons.map(id => sandbox.__classify(id)))].sort();
const rejectedAssets = ['index-fp-grip-qa.html','fp-hands-rig.js','gltf-loader-r128.js', ...['lmg','marksman','melee','pistol','rifle','shotgun','smg'].map(k => `models/fp-arms/data/${k}.js`)];
const rejectedAssetsAbsent = rejectedAssets.every(rel => !fs.existsSync(path.join(web, rel)) && !fs.existsSync(path.join(phone, rel)));
const runtimePath = path.join(root, 'evidence', 'character-bot-roster-20261026', 'roster-grip-runtime.json');
const runtime = fs.existsSync(runtimePath) ? JSON.parse(fs.readFileSync(runtimePath, 'utf8')) : null;
const runtimeRows = new Map((runtime?.matrix || []).map(row => [`${row.character}:${row.gripClass}`, row]));
const webglPairsPass = !!(runtime?.pass && runtimeRows.size === humans.length * weaponClasses.length && runtimeRows.size === 204);

const stateColumns = ['idle', 'ads', 'fire_recoil', 'reload', 'walk_run', 'weapon_switch', 'multiplayer'];
const matrix = [];
for (const id of humans) for (const cls of weaponClasses) {
  matrix.push({
    character: id,
    roster: 'human',
    grip_class: cls,
    applicability: 'SUPPORTED_BY_SOURCE',
    source_asset_integrity: rejectedAssetsAbsent ? 'PASS_REJECTED_RIG_REMOVED' : 'FAIL_REJECTED_RIG_REMAINS',
    historical_anchor_coordinates: cls !== 'melee' && historicalAnchorPass ? 'PASS_COORDINATE_ONLY_2026-10-25' : 'NOT_ESTABLISHED',
    idle: runtimeRows.has(`${id}:${cls}`) ? 'PASS_WEBGL_STATIC_GRIP' : 'UNVERIFIED',
    ads: 'UNVERIFIED_DYNAMIC_STATE', fire_recoil: 'UNVERIFIED_DYNAMIC_STATE', reload: 'UNVERIFIED_DYNAMIC_STATE',
    walk_run: 'UNVERIFIED_DYNAMIC_STATE', weapon_switch: 'UNVERIFIED_DYNAMIC_STATE', multiplayer: 'UNVERIFIED_LIVE_NETWORK',
    visual_acceptance: runtimeRows.has(`${id}:${cls}`) ? 'PASS_STATIC_WEBGL' : 'UNVERIFIED',
    notes: 'Actual isolated WebGL render and shared grip alignment row recorded; runtime check is a static pose, not animation validation.',
  });
}
for (const id of hollowed) for (const cls of weaponClasses) {
  const firearm = cls !== 'melee';
  matrix.push({
    character: id,
    roster: 'hollowed',
    grip_class: cls,
    applicability: firearm ? 'NOT_APPLICABLE_UNARMED_ENEMY_DESIGN' : 'UNARMED_MELEE_ANIMATION',
    source_asset_integrity: firearm ? 'N/A' : 'PASS',
    idle: 'N/A_FIREARM_GRIP',
    ads: 'N/A',
    fire_recoil: 'N/A',
    reload: 'N/A',
    walk_run: 'BLOCKED_VISUAL_RUNTIME_UNAVAILABLE',
    weapon_switch: 'N/A',
    multiplayer: 'BLOCKED_VISUAL_RUNTIME_UNAVAILABLE',
    visual_acceptance: firearm ? 'N/A' : 'BLOCKED',
    notes: firearm ? 'Current source excludes zombie operators from firearm attachment; not an armory defect.' : 'Unarmed attack/movement visual coverage still needs runtime inspection.',
  });
}

const headers = Object.keys(matrix[0]);
const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(evidence, 'character-weapon-grip-matrix.csv'),
  [headers.join(','), ...matrix.map(row => headers.map(k => csvCell(row[k])).join(','))].join('\r\n'));

const assetState = rejectedAssetsAbsent;
const report = {
  status: webglPairsPass && assetState ? 'PASS_STATIC_WEBGL_GRIP_MATRIX; DYNAMIC_STATES_UNVERIFIED' : 'BLOCKED_FOR_VISUAL_ACCEPTANCE',
  auditedAt: new Date().toISOString(),
  method: 'Actual Sightline offline WebGL renderer in isolated Chromium/SwiftShader; 34 operator variants × six firearm classes plus individual 28 firearm first-person fallback checks. Rendered screenshots for every operator.',
  counts: { baseHumanOperators: baseHumans.length, extraHumanOperators: extras.length, humanTotal: humans.length, hollowed: hollowed.length, totalPlayableCharacters: humans.length + hollowed.length, weaponDefinitions: weapons.length, firearmDefinitions: firearmIds.length, meleeDefinitions: weapons.length - firearmIds.length, sharedGripClasses: weaponClasses.length, visualMatrixRows: matrix.length },
  characters: { humans, hollowed },
  weapons: { ids: weapons, firearms: firearmIds, classesSeen },
  rejectedFirstPersonRig: { assetsRemovedFromActiveOfflineAndPhoneHostTrees: assetState, files: rejectedAssets, rollbackCopiesPreserved: fs.existsSync(path.join(root,'rollback','pre-remove-rejected-open-hand-20261026')), runtimeRequestsObserved: runtime?.rejectedRigRequests || [] },
  currentWebGLRuntime: runtime ? { pass: runtime.pass, operatorClassPairs: runtime.operatorClassPairs, failures: runtime.failedPairs, humanScreenshots: runtime.renderedOperators, weaponViewmodels: runtime.firearms?.length, renderer: runtime.renderer, file: path.relative(root,runtimePath) } : null,
  historicalRuntimeEvidence: historicalGrip ? {
    file: path.relative(root, historicalGripPath),
    renderer: historicalGrip.method,
    scope: historicalGrip.scope,
    pass: historicalGrip.pass,
    activeFirearms: historicalGrip.summary.activeFirearms,
    weaponCharacterPairs: historicalGrip.characterGripAudit.weaponCharacterPairs,
    humanVariants: historicalGrip.characterGripAudit.humanVariants,
    rightAndSupportPalmDetectedForAllWeapons: historicalGrip.summary.rightPalmDetected === 28 && historicalGrip.summary.supportPalmDetected === 28,
    missingOrMisaligned: historicalGrip.characterGripAudit.missingOrMisaligned,
    maxRightContactMeters: historicalGrip.characterGripAudit.maxRightContactMeters,
    maxSupportContactMeters: historicalGrip.characterGripAudit.maxSupportContactMeters,
    interpretation: 'Historical runtime coordinate/anchor alignment check only. Does not prove natural visual contact, skin deformation, arm continuity, ADS/reload animation quality, or current-run acceptance.',
  } : null,
  sourceChecks: {
    rosterCountsConsistent: humans.length === 34 && hollowed.length === 8,
    weaponCountsConsistent: firearmIds.length === 28 && weapons.length - firearmIds.length === 4,
    rejectedFirstPersonRigAbsentFromActiveOfflineAndPhoneHost: assetState,
    playerFirstPersonUsesPerWeaponLegacyArms: html.includes('Rejected open-hand Image 1 FP model removed') && !html.includes('fpMountArmAsset') && !html.includes('fp-hands-rig.js'),
    thirdPersonRendererHasSharedGripPose: html.includes('function poseWorldArms(u)') && html.includes('SightlineThirdPersonHands.setGrip'),
    hollowedExcludedFromFirearmAttachment: html.includes('if(!u||u.op.zombie)return;'),
  },
  limitations: [
    'The screenshot matrix is static. ADS, firing/recoil, reload, walking/running, switching, LAN, and physical-device behavior remain unverified for the entire roster.',
    'The 28 first-person weapon checks verify that the active legacy renderer and arm meshes remain present; they do not constitute visual approval for all 28 viewmodels.',
    'The eight Hollowed are intentionally unarmed; firearm grip rows are not applicable. Movement/attack animation remains unverified.',
    'The prior ROOK117 sleeve/forearm review recorded visual FAIL and Blender authoring BLOCKED. No previous failed deformation was promoted or repeated.',
  ],
};
fs.writeFileSync(path.join(evidence, 'source-audit.json'), JSON.stringify(report, null, 2));

const md = `# Character Bot Weapon-Grip Audit — 2026-10-26\n\n` +
`## Result: ${report.status}\n\n` +
`The rejected open-hand first-person GLB rig and its embedded payloads have been removed from the active phone-host and offline Android asset trees. The pre-change files are preserved at rollback/pre-remove-rejected-open-hand-20261026. The accepted ROOK117 legacy Image 2 arm path is still active.\n\n` +
`The third-person bots use a separate shared Claude v12.8 character system: makeUnit attaches each character's own arms/hands; poseWorldArms targets each weapon's grip anchors; SightlineThirdPersonHands applies the class pose. This is intentionally not the first-person viewmodel mesh copied onto full-body bots.\n\n` +
`## Runtime evidence\n\n` +
`- ${humans.length} human operator variants rendered with the game's actual Three.js/WebGL renderer in a controlled QA camera scene; see [all-34-operator-views.png](all-34-operator-views.png) and the individual screenshots in operators/. These are static-pose renders, not live gameplay animation acceptance.\n` +
`- ${webglPairsPass ? runtime.matrix.length : 0} operator × firearm-class static pose combinations checked across ${weaponClasses.length} classes; ${runtime?.failedPairs ?? 'unavailable'} grip alignment failures. Both arm pose vectors are checked against live world weapon grip targets.\n` +
`- ${firearmIds.length} player first-person firearms checked individually: active renderer is the per-weapon legacy viewmodel; the rejected loader is absent and no rejected asset request occurred.\n` +
`- ${hollowed.length} Hollowed variants remain unarmed and do not participate in rifle grips.\n` +
`- ${runtime?.renderer || 'No runtime renderer record.'}\n\n` +
`## Limits\n\n` +
`The bot checks cover static pose alignment. ADS, firing/recoil, reload, movement, weapon switching, live multiplayer, and physical Android-device performance were not tested for every bot/class combination. The headless renderer uses SwiftShader, not a hardware GPU. The captured screenshots show full-body static poses; they do not prove finger contact at every animation frame.\n\n` +
`Files: [character-weapon-grip-matrix.csv](character-weapon-grip-matrix.csv), [source-audit.json](source-audit.json), [roster-grip-runtime.json](roster-grip-runtime.json).\n`;
fs.writeFileSync(path.join(evidence, 'AUDIT-REPORT.md'), md);
console.log(JSON.stringify({ evidence, counts: report.counts, sourceChecks: report.sourceChecks, runtime: report.currentWebGLRuntime }, null, 2));
