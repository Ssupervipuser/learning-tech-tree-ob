import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),E=require('../src/engine.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),skip=args.includes('--skip-validation'),pos=args.filter(x=>!x.startsWith('--'));
const mainFlag=args.find(x=>x.startsWith('--main='));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const safeJSON=data=>JSON.stringify(data).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');

// 扫描 data/ 下所有合法定义，生成下拉目录
function listDefinitions(){
 const dir=path.join(root,'data');
 if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>{
  const abs=path.join(dir,f);
  try{const data=JSON.parse(fs.readFileSync(abs,'utf8'));
   if(data.format!=='learning-tech-tree/v1')return null;
   return {file:'data/'+f,id:data.id,title:data.title||data.id};
  }catch{return null;}
 }).filter(Boolean);
}

function render(data,output,allDefs){
 if(!skip){const errors=E.validateTree(data);if(errors.length)throw Error(errors.join('\n'));}
 const prefix=path.dirname(output)===root?'':'../';
 const catalog=[['','自定义科技树'],...allDefs.map(d=>{
  // index.html 自身用空值，其余指向 examples/ 下同名 html
  const href=d.file.replace(/^data\//,'examples/').replace(/\.json$/,'.html');
  return [prefix+href,d.title,d.id];
 })].map(([value,label,id])=>{
  const sel=value!==''&&id===data.id?' selected':'';
  return `<option value="${escape(value)}"${sel}>${escape(label)}</option>`;
 }).join('');
 let html=read('src/template.html');
 const parts={'/*STYLE*/':read('src/style.css'),'/*CATALOG*/':catalog,'/*DATA*/':safeJSON(data),'/*ENGINE*/':read('src/engine.cjs'),'/*APP*/':read('src/app.js')};
 for(const [marker,value]of Object.entries(parts))html=html.replace(marker,()=>value);
 html=html.replace('<html lang="zh-CN">',`<html lang="${escape(data.language||'zh-CN')}">`);
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,html,'utf8');
 console.log(`Built ${path.relative(root,output)} (${data.nodes.length} nodes)`);
}
if(pos.length){
 if(pos.length!==2)throw Error('Usage: node scripts/build.mjs [input.json output.html] [--main=<tree-id>] [--skip-validation]');
 render(JSON.parse(fs.readFileSync(path.resolve(pos[0]),'utf8')),path.resolve(pos[1]),listDefinitions());
}else{
 const defs=listDefinitions();
 if(!defs.length)throw Error('No learning-tech-tree definitions found under data/');
 // 全部构建到 examples/
 for(const d of defs){
  const html='examples/'+d.file.replace(/^data\//,'').replace(/\.json$/,'.html');
  render(JSON.parse(read(d.file)),path.join(root,html),defs);
 }
 // 选主树写入根 index.html，支持 --main=<id> 指定
 const wanted=mainFlag?mainFlag.slice('--main='.length):null;
 const primary=wanted?defs.find(d=>d.id===wanted):defs[0];
 if(!primary)throw Error(`Tree id not found for --main: ${wanted}`);
 render(JSON.parse(read(primary.file)),path.join(root,'index.html'),defs);
 console.log(`Primary tree: ${primary.id} -> index.html`);
}
