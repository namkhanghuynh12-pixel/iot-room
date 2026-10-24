import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const jdk=process.env.JAVA_HOME||fs.readdirSync(path.join(root,'tools/java'),{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name.startsWith('jdk-')).map(x=>path.join(root,'tools/java',x.name))[0];
if(!jdk)throw Error('Cần JDK 17 trong JAVA_HOME hoặc tools/java');
const exe=n=>path.join(jdk,'bin',n+(process.platform==='win32'?'.exe':''));
const sdk=path.join(root,'tools/android'),bt=path.join(sdk,'build-tools-35.0.0','android-15');
const androidJar=path.join(sdk,'platforms-android-35','android-35','android.jar');
const build=path.join(root,'data',`android-build-${Date.now()}`),classes=path.join(build,'classes'),dex=path.join(build,'dex');
for(const d of [build,classes,dex])fs.mkdirSync(d,{recursive:true});
function run(cmd,args){execFileSync(cmd,args,{stdio:'inherit',cwd:here,windowsHide:true});}
run(exe('javac'),['-encoding','UTF-8','--release','8','-classpath',androidJar,'-d',classes,path.join(here,'app/src/main/java/vn/phongiot/MainActivity.java')]);
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]);}
run(exe('java'),['-cp',path.join(bt,'lib/d8.jar'),'com.android.tools.r8.D8','--lib',androidJar,'--min-api','26','--output',dex,...walk(classes).filter(x=>x.endsWith('.class'))]);
const unsigned=path.join(build,'unsigned.apk'),aligned=path.join(build,'aligned.apk');
run(path.join(bt,'aapt2.exe'),['link','-I',androidJar,'--manifest',path.join(here,'app/src/main/AndroidManifest.xml'),'--min-sdk-version','26','--target-sdk-version','35','-o',unsigned]);
run(exe('jar'),['uf',unsigned,'-C',dex,'classes.dex']);
run(path.join(bt,'zipalign.exe'),['-f','4',unsigned,aligned]);
const key=path.join(root,'data/android-debug.jks');
if(!fs.existsSync(key))run(exe('keytool'),['-genkeypair','-keystore',key,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','3650','-dname','CN=PhongIoT Debug,O=Local Lab,C=VN','-noprompt']);
const output=path.join(here,'PhongIoT-debug.apk');
run(exe('java'),['-jar',path.join(bt,'lib/apksigner.jar'),'sign','--ks',key,'--ks-pass','pass:android','--key-pass','pass:android','--out',output,aligned]);
run(exe('java'),['-jar',path.join(bt,'lib/apksigner.jar'),'verify','--verbose',output]);
console.log('ANDROID_APK_READY '+output);
