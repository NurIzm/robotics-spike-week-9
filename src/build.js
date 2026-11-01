// Stitches views/*.html into the site's index.html. Safe to run any time from any cwd.
const fs=require('fs'),path=require('path');
const SITE=path.join(__dirname,'..');
const dir=__dirname;
let html=fs.readFileSync(path.join(dir,'index.template.html'),'utf8');
html=html.replace(/<!--VIEW:(\w+)-->/g,(m,n)=>{const f=path.join(dir,'views',n+'.html');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';});
const tmp=path.join(SITE,'.index.tmp.'+process.pid);
fs.writeFileSync(tmp,html);fs.renameSync(tmp,path.join(SITE,'index.html'));
console.log('index.html',html.length,'bytes');
