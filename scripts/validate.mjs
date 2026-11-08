import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import {createRequire}from'node:module';
const require=createRequire(import.meta.url),E=require('../src/engine.cjs'),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=process.argv.slice(2);
if(!files.length)files.push(...fs.readdirSync(path.join(root,'data')).filter(f=>f.endsWith('.json')).map(f=>path.join(root,'data',f)));
let failed=false;
for(const file of files){
 try{const data=JSON.parse(fs.readFileSync(file,'utf8')),errors=E.validateTree(data);if(errors.length){failed=true;console.error(file+'\n'+errors.map(e=>'  '+e).join('\n'));}else console.log(`Valid: ${file} (${data.nodes.length} nodes; ${data.stages.length} configurable stages)`);}
 catch(error){failed=true;console.error(file+': '+error.message);}
}
if(failed)process.exitCode=1;
