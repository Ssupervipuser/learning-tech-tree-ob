function startTree(DATA){
const E=TechEngine;
const safeSource=url=>typeof url==='string'&&(url.startsWith('https://')||url.startsWith('http://'));
// Obsidian 集成：节点可用自定义字段 obsidianNote 指向 vault 内笔记；
// 顶层 obsidianVault 为 vault 名称（可选）。协议可用性由浏览器外部处理，
// 页面本身不发送任何网络请求。
const obsidianUri=(notePath,vault)=>{const p=String(notePath||'').replaceAll('\\','/');
 if(!p)return '';const clean=p.replace(/^\/+/,'');if(!clean)return '';
 return vault?('obsidian://open?vault='+encodeURIComponent(vault)+'&file='+encodeURIComponent(clean))
            :('obsidian://open?file='+encodeURIComponent(clean));};
const $=id=>document.getElementById(id), nodes=DATA.nodes, byId=new Map(nodes.map(n=>[n.id,n]));
const branches=DATA.branches, stages=DATA.stages, sources=new Map(DATA.sources.map(s=>[s.id,s]));
const applicationEdges=DATA.applicationEdges||[],allEdges=[...nodes.flatMap(n=>n.prereqIds.map(source=>({source,target:n.id,relation:'prerequisite'}))),...applicationEdges];
const L=E.layout(nodes,branches.map(b=>b.id),applicationEdges), P=L.positions, KEY='learning-tech-tree:progress:'+DATA.id;
const outgoing=new Map(nodes.map(n=>[n.id,[]])),incoming=new Map(nodes.map(n=>[n.id,[]]));
for(const e of allEdges){outgoing.get(e.source).push(e.target);incoming.get(e.target).push(e.source);}
let completed={},notes={},selected=null,branch=null,pathMode=false,routeMode=false,routeNodes=new Set(),routeEdgeKeys=new Set(),edgeMode=0,highlight=new Set(),view={x:0,y:0,s:.65},hover=null,storageWarned=false;
let cssW=0,cssH=0,dpr=1,frame=0,toastTimer;
try{const raw=localStorage.getItem(KEY);if(raw)({completed,notes}=E.parseProgress(raw,new Set(byId.keys()),DATA.id));}catch(err){setTimeout(()=>toast('本地进度未能读取，请用备份恢复。'),500);}
const canvas=$('map'),ctx=canvas.getContext('2d'),mini=$('minimap'),mc=mini.getContext('2d');
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function save(){try{localStorage.setItem(KEY,JSON.stringify(backup()));}catch(err){if(!storageWarned){toast('浏览器未能保存进度，请立即导出备份。');storageWarned=true;}}}
function backup(){return {format:'learning-tech-progress/v1',treeId:DATA.id,exportedAt:new Date().toISOString(),completed,notes};}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function status(n){return E.status(n,completed);}
function branchInfo(id){return branches.find(b=>b.id===id);}
function el(tag,className,text){const x=document.createElement(tag);if(className)x.className=className;if(text!==undefined)x.textContent=text;return x;}
function requestDraw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
function resize(){const r=canvas.getBoundingClientRect();cssW=r.width;cssH=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);requestDraw();}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe($('mapWrap'));
function focusSet(){if(routeMode)return routeNodes;if(pathMode&&selected)return new Set([...highlight,selected]);if(branch)return new Set(nodes.filter(n=>n.branch===branch).map(n=>n.id));return null;}
function journeyPath(from,to){const queue=[from],previous=new Map([[from,null]]);for(let i=0;i<queue.length&&!previous.has(to);i++)for(const id of outgoing.get(queue[i])||[])if(!previous.has(id)){previous.set(id,queue[i]);queue.push(id);}if(!previous.has(to))return [];const path=[];for(let id=to;id!==null;id=previous.get(id))path.push(id);return path.reverse();}
function traceJourney(){routeNodes=new Set();routeEdgeKeys=new Set();if(!selected)return;for(const path of [journeyPath(DATA.startId,selected),journeyPath(selected,DATA.endId)]){for(const id of path)routeNodes.add(id);for(let i=1;i<path.length;i++)routeEdgeKeys.add(path[i-1]+'>'+path[i]);}}
function showJourney(){if(!selected)return;routeMode=true;pathMode=false;branch=null;traceJourney();updateViewLabel();fit(routeNodes);toast('虚线表示学习发展或应用汇入，不参与必修解锁。');}
function fit(ids){const a=ids?[...ids].map(id=>P[id]).filter(Boolean):Object.values(P);if(!a.length)return;const minX=Math.min(...a.map(p=>p.x))-80,maxX=Math.max(...a.map(p=>p.x))+270,minY=Math.min(...a.map(p=>p.y))-80,maxY=Math.max(...a.map(p=>p.y))+160;view.s=Math.min(1.1,(cssW-50)/(maxX-minX),(cssH-175)/(maxY-minY));view.s=Math.max(.025,view.s);view.x=(cssW-(maxX+minX)*view.s)/2;view.y=110+(cssH-155-(maxY+minY)*view.s)/2;requestDraw();}
function center(id,scale=.82){const p=P[id];if(!p)return;view.s=scale;view.x=cssW/2-(p.x+94)*scale;view.y=cssH/2-(p.y+36)*scale+25;requestDraw();}
const ZOOM_MIN=.025,ZOOM_MAX=2.4,ZOOM_STEPS=1000;
function syncZoomSlider(){
 const scale=Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,view.s));
 const fraction=Math.log(scale/ZOOM_MIN)/Math.log(ZOOM_MAX/ZOOM_MIN);
 const slider=$('zoomSlider');
 slider.value=String(Math.round(fraction*ZOOM_STEPS));
 slider.style.setProperty('--zoom-fill',(fraction*100)+'%');
 const percent=Number((scale*100).toFixed(scale<.1?1:0))+'%';
 slider.setAttribute('aria-valuetext',percent);
 $('zoomValue').textContent=percent;
}
function zoom(factor,cx=cssW/2,cy=cssH/2){const old=view.s,next=Math.min(2.4,Math.max(.025,old*factor));view.x=cx-(cx-view.x)*next/old;view.y=cy-(cy-view.y)*next/old;view.s=next;requestDraw();}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function textLines(text,maxWidth){const lines=[];let line='';for(const char of text){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;}
function drawLaneLabels(){
 // Screen-space minimum keeps headings readable in the overview;
 // above that minimum they grow with the canvas zoom.
 const fontSize=Math.max(14,22*view.s),rowHeight=fontSize+10,topLimit=112,bottomLimit=cssH-30,labels=[];
 for(let i=0;i<branches.length;i++){
  const b=branches[i],laneTop=view.y+L.laneY[b.id]*view.s,laneBottom=view.y+(i+1<branches.length?L.laneY[branches[i+1].id]:L.height-70)*view.s;
  if(laneBottom<topLimit||laneTop>bottomLimit)continue;
  labels.push({b,anchor:Math.max(topLimit,laneTop+7*view.s),y:Math.max(topLimit,laneTop+7*view.s)});
 }
 if(!labels.length)return;
 const gap=Math.min(rowHeight,Math.max(fontSize+2,(bottomLimit-topLimit-rowHeight)/Math.max(1,labels.length-1)));
 for(let i=1;i<labels.length;i++)labels[i].y=Math.max(labels[i].y,labels[i-1].y+gap);
 const overflow=labels[labels.length-1].y+rowHeight-bottomLimit;
 if(overflow>0){labels[labels.length-1].y-=overflow;for(let i=labels.length-2;i>=0;i--)labels[i].y=Math.min(labels[i].y,labels[i+1].y-gap);}
 ctx.save();ctx.font=`600 ${fontSize}px "Microsoft YaHei",sans-serif`;ctx.textBaseline='top';
 for(const {b,anchor,y} of labels){
  const x=16,width=ctx.measureText(b.label).width+25;
  ctx.globalAlpha=branch&&branch!==b.id?.6:1;
  if(Math.abs(anchor-y)>5){ctx.beginPath();ctx.moveTo(x+width+3,y+rowHeight/2);ctx.lineTo(x+width+15,anchor);ctx.strokeStyle=b.color+'88';ctx.lineWidth=1;ctx.stroke();}
  rounded(x,y,width,rowHeight,4);ctx.fillStyle='#0b1625ee';ctx.fill();ctx.strokeStyle=b.color+'77';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle=b.color;ctx.fillRect(x,y+5,3,rowHeight-10);ctx.fillText(b.label,x+12,y+5);
 }
 ctx.restore();
}
function draw(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssW,cssH);
 const step=48*view.s;if(step>12){ctx.fillStyle='#38536c55';for(let x=((view.x%step)+step)%step;x<cssW;x+=step)for(let y=((view.y%step)+step)%step;y<cssH;y+=step)ctx.fillRect(x,y,1,1);}
 ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.s,view.s);
 const focused=focusSet(),left=-view.x/view.s,top=-view.y/view.s,right=(cssW-view.x)/view.s,bottom=(cssH-view.y)/view.s;
 for(const b of branches){const y=L.laneY[b.id];const next=branches[branches.indexOf(b)+1];const h=(next?L.laneY[next.id]:L.height-70)-y;if(y+h<top||y>bottom)continue;ctx.fillStyle=b.color+'06';ctx.fillRect(left,y,L.width,h);ctx.strokeStyle=b.color+'25';ctx.lineWidth=.7/view.s;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
 function edge(from,to,strong=false){const a=P[from],b=P[to];if(!a||!b)return;if(Math.max(a.x,b.x)+220<left||Math.min(a.x,b.x)>right||Math.max(a.y,b.y)+85<top||Math.min(a.y,b.y)>bottom)return;const targets=outgoing.get(from),inputs=incoming.get(to),sx=a.x+192,sy=a.y+17+42*(targets.indexOf(to)+.5)/targets.length,tx=b.x,ty=b.y+17+42*(inputs.indexOf(from)+.5)/inputs.length;const dx=Math.max(36,(tx-sx)*.45);ctx.beginPath();ctx.moveTo(sx,sy);ctx.bezierCurveTo(sx+dx,sy,tx-dx,ty,tx,ty);ctx.stroke();if(view.s>.22||strong){ctx.beginPath();ctx.moveTo(tx-7,ty-3);ctx.lineTo(tx,ty);ctx.lineTo(tx-7,ty+3);ctx.stroke();}}
 if(edgeMode!==2)for(const e of allEdges){const hard=e.relation==='prerequisite',p=e.source,n=e.target,isPath=routeMode?routeEdgeKeys.has(p+'>'+n):hard?selected&&(n===selected||highlight.has(n))&&highlight.has(p):selected&&(p===selected||n===selected);if((pathMode||routeMode)&&!isPath)continue;if(edgeMode===1&&!isPath)continue;const inBranch=!branch||(byId.get(n).branch===branch&&byId.get(p).branch===branch);ctx.strokeStyle=isPath?(hard?'#e5b575dd':'#7bd2c4dd'):inBranch?(hard?'#6b829b44':'#5c9f9255'):'#38506a15';ctx.lineWidth=(isPath?1.6:.8)/Math.max(view.s,.35);ctx.setLineDash(hard?[]:[6/Math.max(view.s,.35),5/Math.max(view.s,.35)]);edge(p,n,isPath);}
 ctx.setLineDash([]);
 for(const n of nodes){const p=P[n.id],w=192,h=76;if(p.x+w<left||p.x>right||p.y+h<top||p.y>bottom)continue;const dim=focused&&!focused.has(n.id),b=branchInfo(n.branch),s=status(n),isSel=n.id===selected;ctx.globalAlpha=dim?.13:1;
  const color=s==='done'?'#6ad1ad':s==='ready'?'#d5ad6c':b.color;
  if(view.s<.15){ctx.fillStyle=isSel?'#f6d29a':color;ctx.fillRect(p.x,p.y,w,h);continue;}
  if(isSel){ctx.shadowColor='#d5ad6c66';ctx.shadowBlur=15;}
  rounded(p.x,p.y,w,h,5);ctx.fillStyle=s==='done'?'#17362f':isSel?'#2e2d29':'#132235';ctx.fill();ctx.strokeStyle=isSel?'#e4ba7e':s==='done'?'#45816e':n.kind==='milestone'?'#8f704b':'#344e69';ctx.lineWidth=(isSel?1.8:1)/view.s;ctx.stroke();ctx.shadowBlur=0;
  ctx.fillStyle=color;ctx.fillRect(p.x,p.y+11,2,h-22);ctx.font='9px Consolas,monospace';ctx.fillStyle='#728da9';ctx.fillText(n.id.toUpperCase(),p.x+13,p.y+16);
  ctx.textAlign='right';ctx.fillStyle=s==='done'?'#6ed7ae':s==='ready'?'#e5bc7a':'#637c98';ctx.fillText(s==='done'?'✓':s==='ready'?'○':'·',p.x+w-12,p.y+16);ctx.textAlign='left';
  ctx.font='500 12px "Microsoft YaHei",sans-serif';ctx.fillStyle=s==='locked'?'#b4c5d9':'#e6edf5';const lines=textLines(n.name,w-26).slice(0,2);lines.forEach((l,i)=>ctx.fillText(l,p.x+13,p.y+36+i*16));
  if(lines.length<2){ctx.font='9px "Microsoft YaHei",sans-serif';ctx.fillStyle='#7c94ac';ctx.fillText(stages[n.stage]+(n.kind==='optional'?' · 可选':n.kind==='milestone'?' · 里程碑':''),p.x+13,p.y+61);}
 }
 ctx.globalAlpha=1;ctx.restore();drawLaneLabels();syncZoomSlider();drawMini();
}
function drawMini(){const w=220,h=115,s=Math.min((w-10)/L.width,(h-10)/L.height);mc.clearRect(0,0,w,h);mc.fillStyle='#091320';mc.fillRect(0,0,w,h);for(const n of nodes){const p=P[n.id];mc.globalAlpha=branch&&n.branch!==branch?.2:.8;mc.fillStyle=n.id===selected?'#ffe5af':branchInfo(n.branch).color;mc.fillRect(5+p.x*s,5+p.y*s,Math.max(1,192*s),Math.max(1,76*s));}mc.globalAlpha=1;mc.strokeStyle='#d4bc91';mc.lineWidth=1;mc.strokeRect(5+(-view.x/view.s)*s,5+(-view.y/view.s)*s,cssW/view.s*s,cssH/view.s*s);}
function metrics(){const count=Object.keys(completed).length,pct=Math.round(count/nodes.length*100);$('totalCount').textContent=nodes.length;$('edgeCount').textContent=allEdges.length;$('edgeCount').title=`先修 ${allEdges.length-applicationEdges.length} · 发展与应用 ${applicationEdges.length}`;$('pct').textContent=pct+'%';$('progressBar').style.width=pct+'%';$('progressText').textContent=count?`${count} 已掌握 · ${nodes.filter(n=>status(n)==='ready').length} 可开始`:'所有节点尚未评估';}
function select(id,move=false){if(!byId.has(id))return;selected=id;highlight=E.ancestors(nodes,id);if(routeMode)traceJourney();document.querySelector('.workspace').classList.remove('no-detail');$('hint').hidden=true;$('searchResults').hidden=true;renderDetail();updateViewLabel();if(move)center(id);requestDraw();}
function updateViewLabel(){const label=routeMode?byId.get(DATA.startId).name+' → 当前能力 → '+byId.get(DATA.endId).name:pathMode&&selected?'目标前置链':branch?branchInfo(branch).label:'全领域科技树';$('viewLabel').textContent=label;$('pathBtn').classList.toggle('active',pathMode);for(const b of branches)$('branch-'+b.id).classList.toggle('active',branch===b.id);}
function depList(parent,ids){const list=el('div','dep-list');for(const id of ids){const n=byId.get(id);if(!n)continue;const btn=el('button');const d=el('i','mini-dot');d.style.background=status(n)==='done'?'#6ed6b2':status(n)==='ready'?'#e3b66e':'#5e728c';btn.append(d,el('span','',n.name),el('span','arrow','↗'));btn.onclick=()=>select(id,true);list.append(btn);}parent.append(list);}
function renderDetail(){const host=$('detailBody');host.replaceChildren();if(!selected){host.append(el('p','','选择一个能力查看详情。'));return;}const n=byId.get(selected),b=branchInfo(n.branch);host.append(el('div','node-code',n.id.toUpperCase()+' / '+(b.en||b.label)),el('h2','',n.name));const tags=el('div','tags');tags.append(el('span','tag',b.label),el('span','tag',stages[n.stage]));if(n.kind!=='core')tags.append(el('span','tag '+n.kind,n.kind==='optional'?'可选支线':'能力里程碑'));host.append(tags,el('h3','','学习范围'),el('p','',n.description),el('h3','','点亮任务 / 可检验产物'),el('div','task-card',n.outcome));if(n.caution)host.append(el('div','caution',n.caution));const mark=el('button','mark-btn'+(completed[n.id]?' is-done':''),completed[n.id]?'✓ 已掌握 · 点击撤销':'＋ 自评已掌握');mark.id='markComplete';mark.onclick=()=>{if(completed[n.id])delete completed[n.id];else completed[n.id]=true;save();metrics();renderDetail();requestDraw();};host.append(mark);const missing=n.prereqIds.filter(p=>!completed[p]);host.append(el('p','status-caption',completed[n.id]?'自评记录已保存。前置是否掌握分别由你评估。':missing.length?`尚有 ${missing.length} 项直接前置待评估；已学过可直接自评。`:'直接前置已满足，可从这个任务开始。'));
 host.append(el('h3','',`直接前置 · ${n.prereqIds.length} 项 / 全部前置 ${highlight.size} 项`));if(n.prereqIds.length)depList(host,n.prereqIds);else host.append(el('p','status-caption',n.id===DATA.startId?'整张地图的学习入口。':'没有额外硬性先修；学习或成果来路见下方虚线关系。'));const showPath=el('button','jump-card','查看完整前置路径 →');showPath.onclick=()=>{pathMode=true;routeMode=false;branch=null;updateViewLabel();fit(focusSet());};host.append(showPath);
 const priorRoutes=applicationEdges.filter(e=>e.target===n.id),nextRoutes=applicationEdges.filter(e=>e.source===n.id);
 function routeList(title,edges,inbound){if(!edges.length)return;host.append(el('h3','',title));for(const e of edges){depList(host,[inbound?e.source:e.target]);host.append(el('div','source-scope',e.reason));}}
 routeList('从哪里发展 / 汇入 · 虚线，非硬门槛',priorRoutes,true);
 routeList('用于什么 / 成果去向 · 虚线，非硬门槛',nextRoutes,false);
 const obsNote=n.obsidianNote||'',obsUri=obsidianUri(obsNote,DATA.obsidianVault);
 if(obsNote){host.append(el('h3','','Obsidian 笔记'));
  if(obsUri){const a=el('a','jump-card','在 Obsidian 中打开 ↗');a.href=obsUri;a.rel='noopener';a.title=obsNote;host.append(a);}
  else host.append(el('div','source-scope','该节点未配置笔记路径。'));
  host.append(el('div','source-scope',obsNote));}
 const journey=el('button','jump-card','查看起点 → 本节点 → 目标终点');journey.onclick=showJourney;host.append(journey);
 if(n.relatedIds.length){host.append(el('h3','','建议背景 · 不参与解锁'));depList(host,n.relatedIds);}
 const children=nodes.filter(x=>x.prereqIds.includes(n.id));if(children.length){host.append(el('h3','',`直接解锁 · ${children.length} 项`));depList(host,children.map(c=>c.id));}
 host.append(el('h3','','我的证据 / 学习记录'));const area=el('textarea','note-area');area.placeholder='记录做过的算例、笔记路径或仍不明白的问题…';area.value=notes[n.id]||'';area.setAttribute('aria-label','学习记录');area.oninput=()=>{notes[n.id]=area.value;save();};host.append(area,el('h3','','来源与编排依据'));
 for(const id of n.sourceIds){const s=sources.get(id);if(!s)continue;if(safeSource(s.url)){const a=el('a','source-link',s.title+' ↗');a.href=s.url;a.target='_blank';a.rel='noopener';host.append(a);}else host.append(el('div','source-link',s.title));host.append(el('div','source-scope',s.scope));}
}
for(const b of branches){const btn=el('button');btn.id='branch-'+b.id;const sw=el('span','branch-swatch');sw.style.background=b.color;btn.append(sw,el('span','',b.label),el('span','branch-count',nodes.filter(n=>n.branch===b.id).length));btn.onclick=()=>{branch=branch===b.id?null:b.id;pathMode=false;routeMode=false;updateViewLabel();fit(focusSet());};$('branches').append(btn);}
for(const [name,id]of [['◁ 起点',DATA.startId],['终点 ▷',DATA.endId]]){const btn=el('button','',name);btn.onclick=()=>{routeMode=false;pathMode=false;branch=null;select(id,true);};$('stageNav').append(btn);}
stages.forEach((name,stage)=>{const btn=el('button','',name);btn.onclick=()=>{branch=null;pathMode=false;routeMode=false;updateViewLabel();const ns=nodes.filter(n=>n.stage===stage);fit(new Set(ns.map(n=>n.id)));toast(name+'：建议学习位置，非硬性年级门槛');};$('stageNav').append(btn);});
$('search').oninput=()=>{const q=$('search').value.trim().toLowerCase(),host=$('searchResults');host.replaceChildren();host.hidden=!q;if(!q)return;const found=nodes.filter(n=>(n.name+' '+n.id+' '+n.description).toLowerCase().includes(q));for(const n of found.slice(0,30)){const btn=el('button','',n.name);btn.append(el('span','',branchInfo(n.branch).label+' · '+stages[n.stage]));btn.onclick=()=>{branch=null;pathMode=false;select(n.id,true);};host.append(btn);}if(!found.length)host.append(el('p','','没有找到；试试知识点名称、关键词或节点ID。'));};
$('search').onkeydown=ev=>{if(ev.key==='Enter')$('searchResults').querySelector('button')?.click();};
$('pathBtn').onclick=()=>{if(!selected){toast('请先选择目标节点。');return;}pathMode=!pathMode;routeMode=false;branch=null;updateViewLabel();if(pathMode)fit(focusSet());else center(selected);};
$('edgesBtn').onclick=()=>{edgeMode=(edgeMode+1)%3;$('edgesBtn').textContent=['连接：全部','连接：目标','连接：隐藏'][edgeMode];requestDraw();};
$('fitBtn').onclick=()=>{branch=null;pathMode=false;routeMode=false;updateViewLabel();fit();};
$('clearFilters').onclick=()=>{branch=null;pathMode=false;routeMode=false;$('search').value='';$('searchResults').hidden=true;updateViewLabel();fit();};
$('homeBtn').onclick=()=>{branch=null;pathMode=false;routeMode=false;select(DATA.startId,true);};
$('zoomIn').onclick=()=>zoom(1.3);$('zoomOut').onclick=()=>zoom(1/1.3);
$('zoomSlider').oninput=()=>{
 const fraction=Number($('zoomSlider').value)/ZOOM_STEPS;
 const scale=ZOOM_MIN*Math.pow(ZOOM_MAX/ZOOM_MIN,fraction);
 zoom(scale/view.s);
 syncZoomSlider();
};

$('closeDetail').onclick=()=>document.querySelector('.workspace').classList.add('no-detail');
$('exportBtn').onclick=()=>{download(DATA.id+'-progress-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(backup(),null,2));toast('进度与笔记已导出，请保存下载文件。');};
$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async ev=>{const f=ev.target.files[0];if(!f)return;try{const next=E.parseProgress(await f.text(),new Set(byId.keys()),DATA.id);completed=next.completed;notes=next.notes;save();metrics();renderDetail();requestDraw();toast('已恢复备份中的进度与笔记。');}catch(err){toast('恢复失败：'+err.message+'。现有进度未改变。');}ev.target.value='';};
$('guideBtn').onclick=()=>$('guide').showModal();$('closeGuide').onclick=()=>$('guide').close();
for(const s of DATA.sources){const block=el('div');const title=safeSource(s.url)?el('a','',s.title+' ↗'):el('b','',s.title);if(safeSource(s.url)){title.href=s.url;title.target='_blank';title.rel='noopener';}block.append(title,el('small','',s.scope));$('sourcesList').append(block);}
function hit(clientX,clientY){const rect=canvas.getBoundingClientRect(),x=(clientX-rect.left-view.x)/view.s,y=(clientY-rect.top-view.y)/view.s;for(let i=nodes.length-1;i>=0;i--){const n=nodes[i],p=P[n.id];if(x>=p.x&&x<=p.x+192&&y>=p.y&&y<=p.y+76)return n.id;}return null;}
let drag=null;
canvas.onpointerdown=ev=>{if(ev.button!==0)return;canvas.setPointerCapture(ev.pointerId);drag={x:ev.clientX,y:ev.clientY,vx:view.x,vy:view.y,moved:false};$('searchResults').hidden=true;};
canvas.onpointermove=ev=>{if(drag){const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;view.x=drag.vx+dx;view.y=drag.vy+dy;$('tooltip').hidden=true;requestDraw();return;}const id=hit(ev.clientX,ev.clientY);if(id!==hover){hover=id;canvas.style.cursor=id?'pointer':'grab';}const tip=$('tooltip');tip.hidden=!id;if(id){const r=canvas.getBoundingClientRect();tip.textContent=byId.get(id).name+' · '+stages[byId.get(id).stage];tip.style.left=Math.max(5,Math.min(cssW-240,ev.clientX-r.left+12))+'px';tip.style.top=Math.max(115,ev.clientY-r.top-38)+'px';}};
canvas.onpointerup=ev=>{if(drag&&!drag.moved){const id=hit(ev.clientX,ev.clientY);if(id)select(id);}drag=null;};canvas.onpointercancel=()=>{drag=null;};canvas.onpointerleave=()=>{$('tooltip').hidden=true;};
canvas.onwheel=ev=>{ev.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-Math.max(-150,Math.min(150,ev.deltaY))*.002),ev.clientX-r.left,ev.clientY-r.top);};
const preventWheel=ev=>ev.preventDefault();canvas.addEventListener('wheel',preventWheel,{passive:false});canvas.ondblclick=ev=>{const r=canvas.getBoundingClientRect();zoom(1.5,ev.clientX-r.left,ev.clientY-r.top);};
mini.onclick=ev=>{const r=mini.getBoundingClientRect(),s=Math.min(210/L.width,105/L.height),x=((ev.clientX-r.left)*220/r.width-5)/s,y=((ev.clientY-r.top)*115/r.height-5)/s;view.x=cssW/2-x*view.s;view.y=cssH/2-y*view.s;requestDraw();};
const handleKeys=ev=>{const editing=['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);if(ev.key==='/'&&!editing){ev.preventDefault();$('search').focus();}if(ev.key==='Escape'&&!$('guide').open){$('searchResults').hidden=true;if(!editing){branch=null;pathMode=false;routeMode=false;updateViewLabel();requestDraw();}}if(!editing&&(ev.key==='+'||ev.key==='='))zoom(1.2);if(!editing&&ev.key==='-')zoom(1/1.2);};window.addEventListener('keydown',handleKeys);
document.title=DATA.title+' · Learning Tech Tree';$('treeTitle').textContent=DATA.title;$('treeSubtitle').textContent=DATA.subtitle||'任意学科 · 任意阶段 · 自定义目标';$('search').placeholder=DATA.searchPlaceholder||'搜索知识点 / 关键词 / ID';$('treeDescription').textContent=DATA.description||'从基础出发，沿先修与应用关系走向你的目标。';
$('exportTreeBtn').onclick=()=>download(DATA.id+'.json',JSON.stringify(DATA,null,2));
metrics();resize();select(DATA.startId);center(DATA.startId,.86);updateViewLabel();
// Read-only diagnostics are useful when validating an exported artifact.
window.techTreeDiagnostics=()=>({nodes:nodes.length,edges:nodes.reduce((s,n)=>s+n.prereqIds.length,0),selected,completedCount:Object.keys(completed).length,errors:E.validate(nodes),canvas:{width:cssW,height:cssH},view:{...view}});

return ()=>{resizeObserver.disconnect();window.removeEventListener('keydown',handleKeys);canvas.removeEventListener('wheel',preventWheel);if(frame)cancelAnimationFrame(frame);clearTimeout(toastTimer);};
}
let disposeTree=null;
function mountTree(data){
 const errors=TechEngine.validateTree(data);if(errors.length)throw Error(errors.slice(0,8).join('\n'));
 if(disposeTree)disposeTree();
 for(const id of ['branches','stageNav','sourcesList','detailBody','searchResults'])document.getElementById(id).replaceChildren();
 document.getElementById('search').value='';document.getElementById('searchResults').hidden=true;document.getElementById('tooltip').hidden=true;
 document.getElementById('edgesBtn').textContent='连接：全部';
 disposeTree=startTree(data);
}
document.getElementById('openTreeBtn').onclick=()=>document.getElementById('treeFile').click();
document.getElementById('treeFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>12*1024*1024)throw Error('Tree files must be smaller than 12 MB');const data=JSON.parse(await file.text());mountTree(data);document.getElementById('exampleSelect').value='';}catch(error){alert('无法打开科技树：'+error.message);}event.target.value='';};
document.getElementById('exampleSelect').onchange=event=>{const path=event.target.value;if(path)window.location.href=path;};
try{mountTree(JSON.parse(document.getElementById('tree-data').textContent));}catch(error){document.getElementById('detailBody').textContent='数据载入失败：'+error.message;}
