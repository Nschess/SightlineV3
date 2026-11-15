'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const files = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
];
let checked = 0;
for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(source))) {
    if (/\bsrc\s*=/.test(match[1]) || /\btype\s*=\s*["']module["']/i.test(match[1])) continue;
    checked++;
    try {
      new vm.Script(match[2], { filename: relative + ':inline-' + checked });
    } catch (error) {
      console.error(JSON.stringify({ status: 'FAIL', file: relative, script: checked, message: error.message, stack: error.stack }, null, 2));
      process.exitCode = 1;
      break;
    }
  }
}
if (!process.exitCode) console.log(JSON.stringify({ status: 'PASS', inlineClassicScripts: checked }, null, 2));
