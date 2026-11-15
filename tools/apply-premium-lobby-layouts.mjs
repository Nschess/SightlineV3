import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..'));
const files = [
  path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'),
  path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html')
];
const cssPath = path.join(root, 'tools/sightline-premium-lobby-spaces.css');
const css = fs.readFileSync(cssPath, 'utf8').trim();

function once(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(label + ': expected one source anchor, found ' + count);
  return source.replace(oldText, newText);
}
function lineOnce(source, expression, replacement, label) {
  const matches = source.match(expression);
  if (!matches || matches.length !== 1) throw new Error(label + ': expected one line, found ' + (matches ? matches.length : 0));
  return source.replace(expression, replacement);
}

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('class="mn-panel image2-lobby"')) {
    throw new Error('Image 2 lobby is already installed; refusing to replace it with the superseded Squad Bay layout: ' + file);
  }
  if (html.includes('id="sightline-premium-lobby-spaces"')) throw new Error('Styles are already installed; refusing duplicate write: ' + file);

  html = once(html,
    '<div class="mn-panel" id="pn-play" role="tabpanel" aria-label="Play">',
    '<div class="mn-panel squad-bay" id="pn-play" role="tabpanel" aria-label="Play"><div class="squad-bay-overline"><span>SQUAD BAY</span><span>LIVE ARENA · OPERATOR READY</span></div>',
    'Squad Bay root');

  html = once(html,
    "    h = hd('Operators', 'FIELD ROSTER · '+OPS.length+' PLAYABLE IDENTITIES')+'<section class=\"operator-console\" aria-label=\"Operator selection\"><div id=\"op-det\">",
    "    h = hd('Operators', 'FIELD ROSTER · '+OPS.length+' PLAYABLE IDENTITIES')+'<div class=\"operator-bay-callout\"><span class=\"ops-kicker\">SELECTED OPERATIVE · LIVE 3D STAGE</span><span>Preview uses the active game character and rig.</span></div><section class=\"operator-console\" aria-label=\"Operator selection\"><div id=\"op-det\">",
    'Operators callout');

  html = lineOnce(html, /^    h = hd\('Operations Area'.*$/m,
    "    var mapBombSites=R.mode==='bomb'?soloBombPrepareSites():null;\n    h = '<section class=\"operations-table\" aria-label=\"Operations Table\"><div class=\"ops-table-meta\"><span>OPERATIONS TABLE · ARENA INTELLIGENCE</span><strong>'+(R.mode==='bomb'?'BOMB DEFUSAL · A / B SITES':'LIVE DEPLOYMENT MAP')+'</strong></div>'+hd('Operations Table', CURMAP.tag) + '<div class=\"ops-map-layout\"><figure class=\"ops-map-window\"><div class=\"ops-map-art\" id=\"mn-mapsvg\">' + mapSvg(CURMAP) + '</div><figcaption><span>SELECTED ARENA</span><strong>'+esc(CURMAP.name)+'</strong></figcaption></figure><aside class=\"ops-map-brief\"><span class=\"ops-kicker\">'+(R.mode==='bomb'?'BOMB DEFUSAL · ROUTE PLAN':'TACTICAL RECONNAISSANCE')+'</span><h3>'+esc(CURMAP.name)+'</h3><p>'+CURMAP.desc+'</p><ul>' + CURMAP.notes.map(function (n) { return '<li><b>' + n[0] + '</b><span>' + n[1] + '</span></li>'; }).join('') + '</ul><p class=\"small\">'+(R.mode==='bomb'?'A/B sites come from this arena’s configured objective data. Reachable plant points are checked before deployment.':'Preview is derived from this arena’s authored geometry, callouts, and spawn zones.')+'</p>'+(R.mode==='bomb'?'<div class=\"ops-site-pair\"><div class=\"ops-site\" data-site=\"a\"><i>A</i><b>PLANT SITE A</b><small>'+(mapBombSites?'ROUTE READY':'ROUTE CHECK AT DEPLOY')+'</small></div><div class=\"ops-site\" data-site=\"b\"><i>B</i><b>PLANT SITE B</b><small>'+(mapBombSites?'ROUTE READY':'ROUTE CHECK AT DEPLOY')+'</small></div></div>':'')+'</aside></div><div class=\"ops-picker-head\"><span>SELECT DEPLOYMENT ARENA</span><span>'+MAPS.length+' AUTHORED MAPS</span></div><div class=\"mappick\" data-pick></div></section>';",
    'Operations Table markup');

  html = once(html,
    '    var lock = !canPick();',
    "    var lock = !canPick(), bombPlanSites=R.mode==='bomb'?soloBombPrepareSites():null;\n    var bombPlan=R.mode==='bomb'?'<section class=\"ops-bomb-plan\" aria-label=\"Bomb Defusal A and B operations plan\"><div class=\"ops-bomb-map\">'+mapSvg(CURMAP)+'</div><div class=\"ops-bomb-info\"><span class=\"ops-kicker\">OPERATIONS TABLE · '+esc(CURMAP.tag)+'</span><h3>'+esc(CURMAP.name)+' · BOMB PLAN</h3><p>Configure the live Bomb Defusal rules below. The map shows this arena’s actual A/B objective markers; route validation remains in the game’s deployment checks.</p><div class=\"ops-site-pair\"><div class=\"ops-site\" data-site=\"a\"><i>A</i><b>ATTACK / DEFEND SITE</b><small>'+(bombPlanSites?'SITE DATA READY':'SITE VALIDATION PENDING')+'</small></div><div class=\"ops-site\" data-site=\"b\"><i>B</i><b>ATTACK / DEFEND SITE</b><small>'+(bombPlanSites?'SITE DATA READY':'SITE VALIDATION PENDING')+'</small></div></div></div></section><h3 class=\"ops-rule-heading\">MATCH PARAMETERS</h3>':'';",
    'Bomb plan data');
  html = once(html,
    "    h = hd('Match rules', 'Applies to the next match') + '<p>' + DIFF[R.diff].note + (lock ? ' These are locked during a match.' : '') + '</p>' + RULE_SPEC.filter(function (it) {",
    "    h = (R.mode==='bomb'?hd('Bomb Defusal', 'OPERATIONS TABLE · ROUND CONFIGURATION'):hd('Match rules', 'Applies to the next match')) + bombPlan + '<p>' + DIFF[R.diff].note + (lock ? ' These are locked during a match.' : '') + '</p>' + RULE_SPEC.filter(function (it) {",
    'Bomb rules header');

  html = once(html, '</style>\n<div class="wrap">', '</style>\n<style id="sightline-premium-lobby-spaces">\n' + css + '\n</style>\n<div class="wrap">', 'premium lobby stylesheet');
  fs.writeFileSync(file, html, 'utf8');
  console.log('UPDATED ' + path.relative(root, file));
}
