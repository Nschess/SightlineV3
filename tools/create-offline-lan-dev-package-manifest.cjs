'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'PACKAGE-MANIFEST.json');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const files = [];

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.isFile()) {
      const rel = relative(full);
      if (rel !== 'PACKAGE-MANIFEST.json') files.push({ path: rel, sha256: sha256(full) });
    } else {
      throw new Error(`Unsupported filesystem entry: ${relative(full)}`);
    }
  }
}

walk(root);
files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

const sourceFingerprints = {
  server: sha256(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js')),
  page: sha256(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html')),
  hostManifest: sha256(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS')),
  androidSourceManifest: sha256(path.join(root, 'AndroidProject/CURRENT-SOURCE-SHA256.txt'))
};

const manifest = {
  schemaVersion: 1,
  packageName: 'SightlineV3-Accurate-Legendary-Model-Restore-DEV-2026-11-03',
  generatedDate: '2026-11-03',
  packageType: 'editable development source and verification evidence; not an APK, signed release, or distribution build',
  manifestSelfHash: 'Excluded to avoid circular hashing; hash PACKAGE-MANIFEST.json externally.',
  fileCountExcludingManifest: files.length,
  sourceFingerprints,
  sourceAncestry: {
    authoritativeSourceZipSha256: '9172a80eb6d14d5d2b71116c2780fae2a3ea2ff0410e2c19bd54d2e1dad5e65c',
    authoritativeManifestSha256: 'c143082be45130262f0bf3b66204c848cf0daf442066f4c72ceeb47af4fc1fdf',
    priorIntegratedReleaseSourceZipSha256: 'd2a38580e5e3b085903ec27d294ec7339360061aefe6a2ddd9423426d58c0685',
    offlineLanCandidateServerSha256: '504dd50d62fa515efdaf94899f7952e1d8b633536e775d9dcc8ca9e9deaf45de',
    offlineLanCandidatePageSha256: '05f5b8fd81cf74bb4c8872d241b70e67cb9c5dea93552ba23f20856170ea3461',
    legendarySourceZipSha256: '5ca9274bf33c25c8edfa2948b78b3df06850d6297e4d331d651632e9a3f2fe91'
  },
  legendaryArchiveAudit: {
    listedEntries: 498,
    extractedFiles: 536,
    listedPathHashMismatches: 11,
    listedPathsMissing: 0,
    extractedPathsNotListed: 38,
    decision: 'AUDIT_DISCREPANCIES; source selected by matching code and runtime contracts, not by trusting every manifest row'
  },
  integration: {
    decision: 'AUTHORED_LEGENDARY_DRESS_HOOK_RESTORED; VISUAL_ACCEPTANCE_UNVERIFIED; DEV_CANDIDATE_ONLY',
    scope: [
      'LAN bot snapshot presentation projects bounded position, yaw, and pitch without changing authoritative state or cadence.',
      'Offline Infection exposes a 2–64 allied AI bot selector, counts bots separately from the human player, assigns both visual rosters, and supports the player conversion/respawn lifecycle.',
      'Offline and phone-host gameplay pages are synchronized; Android page, host-asset, and source manifests are refreshed.',
      'The new local Legendary module is included in Android WebView allowlists, the HTTP phone-host asset route, and the native 47-file phone-host staging integrity contract.',
      'Fifteen Legendary skins with source-matched model builders are available in Offline and LAN; thirteen incomplete prototype entries remain hidden and server-rejected.',
      'Supported skins: smg, breacher, rook117, carbine, stinger, aurora, falcon, longbow, ranger, tide, hawk, scatter, bulwark, rampart, and needle.',
      'Rampart Phoenix, Needle Tempest, and Rook117 Emerald Revenant use source-matched authored modules; Emerald Revenant is adapted from the uploaded Verdant module with only its weapon/finish identity corrected. The Rook module dresses factory rifle materials and keeps the calibrated stock optic and base geometry.',
      'The latest visual failure was caused by finishGun() never invoking the authored pack rig dress() hook after tagging factory materials. The isolated descendant now calls dress() for a visible authored rig after base-material setup, restoring the archived weapon-space surface pattern/material treatment as well as its already-mounted detail geometry.',
      'Verified authored pack tracer/impact FX and pack sound APIs are wired through existing cosmetic event paths with low-effects and reduced-motion suppression; game stats, aim rays, ammo, reload duration, and authority are unchanged.',
      'Legendary geometry constructors and UI/server selection paths have deterministic source tests; actual current-candidate WebGL visual acceptance remains unverified.',
      'The Outbreak roster regression advances its synthetic wall clock with simulation time; production Outbreak code is unchanged.'
    ],
    excluded: [
      'Thirteen archive Legendary prototypes without a complete, correctly matched runtime builder remain excluded from selection: bastion, forge, mistral, thunder, ember, hammer, vantage, cyclone, switchback, mako, kestrel, pistol, pinion.',
      'Rejected first-person hand prototypes and archive-era pages/server/build files remain excluded. Unverified pack modules and mismatched weapon mappings remain inactive.',
      'No APK, production TLS credentials, signing inputs, or live network artifacts are included.'
    ]
  },
  files
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({
  result: 'WROTE_OFFLINELAN_DEV_PACKAGE_MANIFEST',
  fileCountExcludingManifest: files.length,
  sourceFingerprints,
  manifestSha256: sha256(manifestPath)
}, null, 2));
