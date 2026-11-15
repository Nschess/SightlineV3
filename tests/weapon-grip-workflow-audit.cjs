/*
 * Read-only runtime audit of Sightline's actual third-person weapon grip
 * anchors. Uses the playable source in isolated headless Chromium/SwiftShader.
 * It does not modify project source or connect to a LAN server.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const out = path.join(root, 'evidence', 'hand-workflow-20261025');
fs.mkdirSync(out, { recursive: true });
const indexPath = process.env.SIGHTLINE_INDEX_OVERRIDE || path.join(assets, 'index.html');
const reportName = 'grip-anchor-audit' + (process.env.SIGHTLINE_AUDIT_TAG ? '-' + process.env.SIGHTLINE_AUDIT_TAG : '') + '.json';

function gameHtml() {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    const file = path.resolve(assets, src);
    if (!file.startsWith(path.resolve(assets) + path.sep) || !fs.existsSync(file)) {
      throw new Error('Missing/nonlocal game script: ' + src);
    }
    return '<script>\n' + fs.readFileSync(file, 'utf8') + '\n</script>';
  });
  const debug = 'if (/[?&]debug\\b/.test(location.search)) window.__sl';
  if (!html.includes(debug)) throw new Error('Sightline debug API hook missing');
  html = html.replace(debug, 'if (true) window.__sl');
  const api = 'characterQA: { buildRig:';
  if (!html.includes(api)) throw new Error('Character QA API hook missing');
  html = html.replace(api, 'characterQA: { weaponSpecs:function(){return WEAPONS;}, weaponMeta:function(){return WORLD_WEAPON_META;}, weaponProfiles:function(){return WORLD_WEAPON_PRESENTATION;}, worldWeaponShape:worldWeaponShape, worldViewmodelGeometry:worldViewmodelGeometry, makeUnit:makeUnit, buildRig:');
  // The protected baseline predates explicit contact-source metadata. Instrument
  // its original local mesh lookup only for the before/after audit.
  if (!html.includes('rightPalmFound:!!(rightSocket||grip)')) {
    const legacyMeta = 'rightGrip:[0,0,0],leftGrip:leftPalm?';
    if (!html.includes(legacyMeta)) throw new Error('Baseline contact metadata hook missing');
    html = html.replace(legacyMeta, 'rightGrip:[0,0,0],rightPalmFound:!!grip,leftPalmFound:!!leftPalm,leftGrip:leftPalm?');
  }
  const storageShim = '<script>window.__gripAuditStore={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return Object.prototype.hasOwnProperty.call(window.__gripAuditStore,k)?window.__gripAuditStore[k]:null},setItem(k,v){window.__gripAuditStore[k]=String(v)},removeItem(k){delete window.__gripAuditStore[k]}}});</script>';
  return html.replace('<head>', '<head>' + storageShim, 1);
}

(async () => {
  const result = {
    method: 'Actual Sightline source and Three.js r128 in isolated headless Chrome WebGL/SwiftShader; all weapon builders invoked in-game.',
    scope: 'Active firearm world geometry and derived dominant/support grip points. Does not claim visual hand realism.',
    weapons: [], errors: [],
  };
  const browser = await chromium.launch({
    executablePath: process.env.SIGHTLINE_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
    page.on('requestfailed', r => result.errors.push('request failed: ' + r.url() + ' ' + (r.failure()?.errorText || '')));
    await page.route('http://127.0.0.1:39175/**', async route => {
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: gameHtml() });
      const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      if (!rel || rel.includes('..')) return route.fulfill({ status: 404, body: 'Not found' });
      const file = path.resolve(assets, rel);
      if (!file.startsWith(path.resolve(assets) + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' });
      const ext = path.extname(file).toLowerCase();
      const type = ext === '.js' ? 'application/javascript' : ext === '.json' ? 'application/json' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.wav' ? 'audio/wav' : 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
    });
    await page.goto('http://127.0.0.1:39175/?debug', { waitUntil: 'load', timeout: 60000 });
      const audit = await page.evaluate(() => {
      const qa = window.__sl && window.__sl.characterQA;
      if (!qa) throw new Error('Debug API not initialized');
      const specs = qa.weaponSpecs(), keys = Object.keys(specs).filter(k => !specs[k].melee);
      const rows = [];
      for (const key of keys) {
        try {
          const geometry = qa.worldWeaponShape(key), m = qa.weaponMeta()[key];
          const p = qa.weaponProfiles()[key], b = geometry.boundingBox && geometry.boundingBox.getSize(new THREE.Vector3());
          const rightSource = m && m.rightGripSource || (m && m.rightPalmFound ? 'firing-glove-mesh' : p && p.anchor === 'authored-grip' && p.rightGrip ? 'profile-authored' : 'profile-fallback');
          const supportSource = m && m.leftGripSource || (m && m.leftPalmFound ? 'support-glove-mesh' : p && p.anchor === 'authored-grip' && p.leftGrip ? 'profile-authored' : 'profile-fallback');
          rows.push({ key, renderedGeometry: !!geometry && !!geometry.attributes.position && geometry.attributes.position.count > 0,
            vertexCount: geometry && geometry.attributes.position ? geometry.attributes.position.count : 0,
            bounds: b ? [b.x, b.y, b.z].map(v => Math.round(v * 10000) / 10000) : null,
            rightPalmFound: m ? m.rightPalmFound : rightSource === 'profile-authored', leftPalmFound: m ? m.leftPalmFound : supportSource === 'profile-authored',
            rightGrip: m && m.rightGrip, leftGrip: m && m.leftGrip,
            rightAnchor: m && m.rightAnchor, profile: p && { length: p.length, anchor: p.anchor },
            rightGripSource: rightSource, leftGripSource: supportSource, source: key === 'rook117' && !m ? 'authored-rook117-world-asset' : m && m.source, error: null });
        } catch (e) { rows.push({ key, renderedGeometry: false, error: String(e && e.message || e) }); }
      }
      return rows;
    });
    result.weapons = audit;
    const characterGripAudit = await page.evaluate(() => {
      const qa = window.__sl.characterQA, specs = qa.weaponSpecs();
      const keys = Object.keys(specs).filter(k => !specs[k].melee), ops = qa.operators().filter(op => !op.zombie);
      const rows = []; let maxRightContactMeters = 0, maxSupportContactMeters = 0, maxRightHandAxisErrorRadians = 0, maxSupportHandAxisErrorRadians = 0;
      function worldDistance(a, b) { return a.distanceTo(b); }
      for (const op of ops) {
        let unit = null;
        try {
          unit = qa.makeUnit(400 + rows.length * 2, 400, op);
          const perWeapon = [];
          for (const key of keys) {
            qa.ensureWorldWeapon(unit, key); qa.poseWorldArms(unit); unit.g.updateMatrixWorld(true);
            const meta = key === 'rook117' ? null : qa.weaponMeta()[key], profile = qa.weaponProfiles()[key];
            const rightOffset = meta && meta.rightGrip || profile && profile.rightGrip || [0,0,0];
            const leftOffset = meta && meta.leftGrip || profile && profile.leftGrip || [0,0,-.29];
            const rightDefault = unit.armRDefaultDir;
            const leftDefault = unit.armLDefaultDir;
            if (!unit.armR || !unit.armL || !unit.worldGun || !rightDefault || !leftDefault) throw new Error('Missing active Claude arm or gun rig');
            const rightHandPoint = unit.armR.localToWorld(rightDefault.clone());
            const leftHandPoint = unit.armL.localToWorld(leftDefault.clone());
            const rightTarget = unit.worldGun.localToWorld(new THREE.Vector3(rightOffset[0],rightOffset[1],rightOffset[2]));
            const leftTarget = unit.worldGun.localToWorld(new THREE.Vector3(leftOffset[0],leftOffset[1],leftOffset[2]));
            const rightError = worldDistance(rightHandPoint, rightTarget), leftError = worldDistance(leftHandPoint, leftTarget);
            maxRightContactMeters = Math.max(maxRightContactMeters, rightError); maxSupportContactMeters = Math.max(maxSupportContactMeters, leftError);
            if (!unit.handRigR || !unit.handRigL) throw new Error('Missing articulated right/support hand');
            const gunAxis = unit.worldGun.getWorldDirection(new THREE.Vector3());
            const rightHandAxis = unit.handRigR.getWorldDirection(new THREE.Vector3());
            const supportHandAxis = unit.handRigL.getWorldDirection(new THREE.Vector3());
            const rightAxisError = gunAxis.angleTo(rightHandAxis), supportAxisError = gunAxis.angleTo(supportHandAxis);
            maxRightHandAxisErrorRadians = Math.max(maxRightHandAxisErrorRadians, rightAxisError);
            maxSupportHandAxisErrorRadians = Math.max(maxSupportHandAxisErrorRadians, supportAxisError);
            const rightJoints = unit.handRigR.userData.handJoints, supportJoints = unit.handRigL.userData.handJoints;
            const rightIndexRest = rightJoints && rightJoints.index[1].rotation.x;
            window.SightlineThirdPersonHands.setGrip(unit.handRigR, 'rifle', 1, 1, 1);
            const rightIndexFiring = rightJoints && rightJoints.index[1].rotation.x;
            const rightIndexTipFiring = rightJoints && rightJoints.index[2].rotation.x;
            window.SightlineThirdPersonHands.setGrip(unit.handRigR, 'rifle', 1, 0, 0);
            const rightTriggerPose = rightIndexRest < .2 && rightIndexFiring > .4 && rightIndexTipFiring > .6;
            const supportCurlPose = supportJoints && supportJoints.index[1].rotation.x > 0 && supportJoints.middle[1].rotation.x > 0;
            perWeapon.push({ key, rightErrorMeters: rightError, supportErrorMeters: leftError,
              rightHandAxisErrorRadians: rightAxisError, supportHandAxisErrorRadians: supportAxisError,
              articulatedHands: !!(unit.handRigR && unit.handRigL), rightFingerJointCount: unit.handRigR.userData.fingerBoneCount,
              supportFingerJointCount: unit.handRigL.userData.fingerBoneCount, rightTriggerPose: !!rightTriggerPose,
              rightIndexRestRadians: rightIndexRest, rightIndexFiringRadians: rightIndexFiring, rightIndexTipFiringRadians: rightIndexTipFiring, supportCurlPose: !!supportCurlPose,
              rightSource: meta && meta.rightGripSource, supportSource: meta && meta.leftGripSource });
          }
          rows.push({ id: op.id, weaponsChecked: perWeapon.length, maxRightErrorMeters: Math.max(...perWeapon.map(x=>x.rightErrorMeters)),
            maxSupportErrorMeters: Math.max(...perWeapon.map(x=>x.supportErrorMeters)), failures: perWeapon.filter(x=>x.rightErrorMeters>.015||x.supportErrorMeters>.015||x.rightHandAxisErrorRadians>.01||x.supportHandAxisErrorRadians>.01||!x.articulatedHands||x.rightFingerJointCount!==15||x.supportFingerJointCount!==15||!x.rightTriggerPose||!x.supportCurlPose).map(x=>x.key) });
        } catch (e) { rows.push({ id: op.id, error: String(e && e.message || e) }); }
        finally { if (unit && unit.g && unit.g.parent) unit.g.parent.remove(unit.g); }
      }
      return { humanVariants: ops.length, expectedHumanVariants: 34, activeFirearms: keys.length,
        weaponCharacterPairs: rows.reduce((sum, row) => sum + (row.weaponsChecked || 0), 0), maxRightContactMeters,
        maxSupportContactMeters, maxRightHandAxisErrorRadians, maxSupportHandAxisErrorRadians,
        missingOrMisaligned: rows.filter(row => row.error || row.weaponsChecked !== keys.length || row.failures && row.failures.length), rows };
    });
    result.characterGripAudit = characterGripAudit;
    result.summary = {
      activeFirearms: audit.length,
      geometryConstructed: audit.filter(w => w.renderedGeometry).length,
      rightPalmDetected: audit.filter(w => w.rightPalmFound === true).length,
      supportPalmDetected: audit.filter(w => w.leftPalmFound === true).length,
      rightFallbacks: audit.filter(w => w.rightGripSource === 'profile-fallback').map(w => w.key),
      supportFallbacks: audit.filter(w => w.leftGripSource === 'profile-fallback').map(w => w.key),
      missingRightPalm: audit.filter(w => w.rightPalmFound === false).map(w => w.key),
      missingSupportPalm: audit.filter(w => w.leftPalmFound === false).map(w => w.key),
      constructionFailures: audit.filter(w => !w.renderedGeometry).map(w => ({ key: w.key, error: w.error })),
      pageErrors: result.errors,
    };
    result.pass = result.summary.activeFirearms === 28 &&
      result.summary.geometryConstructed === 28 &&
      result.summary.rightPalmDetected === 28 &&
      result.summary.supportPalmDetected === 28 &&
      audit.every(w => w.rightGripSource !== 'profile-fallback' && w.leftGripSource !== 'profile-fallback') &&
      result.summary.rightFallbacks.length === 0 &&
      result.summary.supportFallbacks.length === 0 &&
      result.summary.constructionFailures.length === 0 &&
      characterGripAudit.humanVariants === 34 &&
      characterGripAudit.activeFirearms === 28 &&
      characterGripAudit.weaponCharacterPairs === 952 &&
      characterGripAudit.missingOrMisaligned.length === 0 &&
      characterGripAudit.maxRightContactMeters <= 0.015 &&
      characterGripAudit.maxSupportContactMeters <= 0.015 &&
      characterGripAudit.maxRightHandAxisErrorRadians <= 0.01 &&
      characterGripAudit.maxSupportHandAxisErrorRadians <= 0.01 &&
      !result.errors.length;
    await context.close();
  } catch (e) {
    result.error = e.stack || String(e);
    result.pass = false;
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, reportName), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.summary || result, null, 2));
  console.log('RESULT ' + (result.pass ? 'PASS' : 'FAIL'));
  process.exitCode = result.pass ? 0 : 1;
})();
