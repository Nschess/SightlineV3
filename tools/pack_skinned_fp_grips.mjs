import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const modelDir=path.join(root,'AndroidProject','app','src','main','assets','phone-host','models','fp-arms');
for(const name of ['pistol','rifle','smg','shotgun','marksman','lmg','melee']){
 const bytes=fs.readFileSync(path.join(modelDir,name+'.glb'));
 const out=`/* Embedded local GLB; generated from the project's editable skinned Blender source. */\nwindow.__SIGHTLINE_FP_ARM_DATA__=window.__SIGHTLINE_FP_ARM_DATA__||Object.create(null);window.__SIGHTLINE_FP_ARM_DATA__.${name}='${bytes.toString('base64')}';\n`;
 fs.writeFileSync(path.join(modelDir,'data',name+'.js'),out);
}
