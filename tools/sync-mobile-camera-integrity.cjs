const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..','AndroidProject');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const host=path.join(root,'app/src/main/assets/phone-host'),bundle=hash(path.join(host,'index.html'));
const native=path.join(root,'app/src/main/java/com/sightline/v3/MainActivity.java');let java=fs.readFileSync(native,'utf8');
java=java.replace(/private static final String HOST_BUNDLE_SHA256 = "[a-f0-9]{64}";/,'private static final String HOST_BUNDLE_SHA256 = "'+bundle+'";');
if(!java.includes('RECOVERY_HOST_BUNDLE_SHA256')){
 java=java.replace('    private static final Set<String> FILES', '    // Keep the recovered PC host compatible, alongside this exact development host.\r\n    private static final String RECOVERY_HOST_BUNDLE_SHA256 = "a3606ca595d6973e71720c7adbd8c03b1949d08c748249e8365d1ba14284ec5b";\r\n    private static boolean acceptsHostBundle(String bundle) {\r\n        return HOST_BUNDLE_SHA256.equals(bundle) || RECOVERY_HOST_BUNDLE_SHA256.equals(bundle);\r\n    }\r\n    private static final Set<String> FILES');
 java=java.replaceAll('HOST_BUNDLE_SHA256.equals(status.optString("bundle"))','acceptsHostBundle(status.optString("bundle"))');
}
fs.writeFileSync(native,java);
const sums=path.join(host,'SHA256SUMS');fs.writeFileSync(sums,fs.readFileSync(sums,'utf8').replace(/^[a-f0-9]{64}(  index.html\r?)$/m,bundle+'$1'));
const current=path.join(root,'CURRENT-SOURCE-SHA256.txt');
fs.writeFileSync(current,fs.readFileSync(current,'utf8').replace(/^([a-f0-9]{64})  (.+?)(\r?)$/gm,(row,old,rel,cr)=>hash(path.join(root,rel))+'  '+rel+cr));
console.log('Synchronized current camera bundle/inventories:',bundle);
