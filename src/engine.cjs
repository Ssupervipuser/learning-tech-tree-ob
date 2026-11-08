/* Original implementation. Shared by the standalone viewer and Node checks. */
const TechEngine = (() => {
 function validate(nodes) {
  const errors=[],map=new Map();
  for(const n of nodes){if(!n||typeof n.id!=='string'||!n.id){errors.push('无效节点');continue;} if(map.has(n.id))errors.push('重复 ID: '+n.id);map.set(n.id,n);}
  for(const n of nodes)for(const p of n.prereqIds||[])if(!map.has(p))errors.push('缺失前置: '+n.id+' → '+p);
  for(const n of nodes)for(const p of n.relatedIds||[])if(!map.has(p))errors.push('缺失推荐: '+n.id+' → '+p);
  const state=new Map();
  function visit(id,path){if(state.get(id)===1){errors.push('依赖环: '+[...path,id].join(' → '));return;}if(state.get(id)===2)return;state.set(id,1);for(const p of map.get(id)?.prereqIds||[])if(map.has(p))visit(p,[...path,id]);state.set(id,2);}
  for(const n of nodes)visit(n.id,[]);return [...new Set(errors)];
 }
 function status(node,completed){return completed[node.id]?'done':node.prereqIds.every(p=>completed[p])?'ready':'locked';}
 function ancestors(nodes,id){const map=new Map(nodes.map(n=>[n.id,n])),out=new Set(),stack=[...(map.get(id)?.prereqIds||[])];while(stack.length){const p=stack.pop();if(out.has(p))continue;out.add(p);stack.push(...(map.get(p)?.prereqIds||[]));}out.delete(id);return out;}
 function descendants(nodes,id){const out=new Set(),stack=[id],children=new Map();for(const n of nodes)for(const p of n.prereqIds){if(!children.has(p))children.set(p,[]);children.get(p).push(n.id);}while(stack.length){for(const c of children.get(stack.pop())||[])if(!out.has(c)){out.add(c);stack.push(c);}}out.delete(id);return out;}
 function layout(nodes,branches,routes=[]){
  const map=new Map(nodes.map(n=>[n.id,n])),ranks={},visiting=new Set();
  const routeParents=new Map(nodes.map(n=>[n.id,[]]));for(const e of routes)routeParents.get(e.target).push(e.source);
  function rank(n){if(ranks[n.id]!==undefined)return ranks[n.id];if(visiting.has(n.id))throw Error('依赖环');visiting.add(n.id);let r=(n.stage||0)*2;for(const p of [...n.prereqIds,...routeParents.get(n.id)])if(map.has(p))r=Math.max(r,rank(map.get(p))+1);visiting.delete(n.id);return ranks[n.id]=r;}
  nodes.forEach(rank);
  const occupied={},laneHeight={},positions={},laneY={};
  for(const n of nodes){const b=n.branch,key=b+':'+ranks[n.id];const slot=occupied[key]||0;occupied[key]=slot+1;laneHeight[b]=Math.max(laneHeight[b]||0,slot+1);positions[n.id]={x:160+ranks[n.id]*360,y:slot*106};}
  let y=100;for(const b of branches){laneY[b]=y;const h=Math.max(laneHeight[b]||1,2)*106+70;for(const n of nodes)if(n.branch===b)positions[n.id].y+=y+58;y+=h;}
  return {positions,ranks,laneY,width:Math.max(...Object.values(positions).map(p=>p.x))+310,height:y+70};
 }

 function validateTree(tree){
  const errors=[],fail=message=>errors.push(message);
  if(!tree||typeof tree!=='object'||Array.isArray(tree))return ['Expected a tree object'];
  if(tree.format!=='learning-tech-tree/v1')fail('Unsupported tree format');
  const validId=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(id)&&!(id in Object.prototype)&&id!=='prototype';
  if(!validId(tree.id))fail('Tree id must be a stable ASCII identifier');
  if(typeof tree.title!=='string'||!tree.title.trim())fail('Tree title is required');
  if(!Array.isArray(tree.stages)||!tree.stages.length||tree.stages.some(s=>typeof s!=='string'||!s.trim()))fail('Stages must be nonempty text labels');
  if(!Array.isArray(tree.branches)||!tree.branches.length)fail('Branches are required');
  if(!Array.isArray(tree.nodes)||tree.nodes.length<2||tree.nodes.length>2500)return [...errors,'Provide 2–2500 nodes'];
  if(errors.length)return errors;
  const ids=new Set(tree.nodes.map(n=>n?.id)),branchIds=new Set(),sourceIds=new Set();
  for(const b of tree.branches){if(!b||!validId(b.id)||branchIds.has(b.id)||typeof b.label!=='string'||!/^#[0-9a-fA-F]{6}$/.test(b.color||''))fail('Invalid or duplicate branch');else branchIds.add(b.id);}
  if(!Array.isArray(tree.sources))fail('Sources must be an array');
  for(const s of Array.isArray(tree.sources)?tree.sources:[]){if(!s||!validId(s.id)||sourceIds.has(s.id)||typeof s.title!=='string'||typeof s.scope!=='string'||typeof s.url!=='string')fail('Invalid or duplicate source');else sourceIds.add(s.id);if(s?.url&&(typeof s.url!=='string'||(!s.url.startsWith('https://')&&!s.url.startsWith('http://'))))fail('Source URLs must use HTTP or HTTPS');}
  for(const n of tree.nodes){
   if(!n||!validId(n.id)||typeof n.name!=='string'||!n.name.trim())fail('Each node needs a stable id and name');
   if(!n||!branchIds.has(n.branch)||!Number.isInteger(n.stage)||n.stage<0||n.stage>=tree.stages.length)fail('Unknown branch or stage: '+n?.id);
   if(!['core','optional','milestone'].includes(n?.kind))fail('Unknown node kind: '+n?.id);
   for(const k of ['description','outcome','caution'])if(typeof n?.[k]!=='string')fail('Missing text field '+k+': '+n?.id);
   if(!n?.outcome?.trim())fail('Every node needs an observable outcome: '+n?.id);
   for(const k of ['prereqIds','relatedIds','sourceIds'])if(!Array.isArray(n?.[k])||n[k].some(x=>typeof x!=='string')||new Set(n[k]).size!==n[k].length)fail('Invalid id list '+k+': '+n?.id);
   if(Array.isArray(n?.sourceIds)&&n.sourceIds.some(id=>!sourceIds.has(id)))fail('Unknown source: '+n.id);
   if(Object.hasOwn(n||{},'completedOn')||Object.hasOwn(n||{},'notes'))fail('Keep personal progress and notes out of public tree definitions');
  }
  if(errors.length)return errors;
  errors.push(...validate(tree.nodes));
  if(!ids.has(tree.startId)||!ids.has(tree.endId)||tree.startId===tree.endId)fail('Distinct startId and endId must refer to nodes');
  if(!Array.isArray(tree.applicationEdges))fail('applicationEdges must be an array');
  const edges=tree.nodes.flatMap(n=>n.prereqIds.map(source=>({source,target:n.id}))),seenEdges=new Set(edges.map(e=>e.source+'>'+e.target));
  for(const e of Array.isArray(tree.applicationEdges)?tree.applicationEdges:[]){const key=e?.source+'>'+e?.target;if(!e||!ids.has(e.source)||!ids.has(e.target)||e.source===e.target||!['development','application'].includes(e.relation)||typeof e.reason!=='string'||!e.reason.trim()||seenEdges.has(key))fail('Invalid or duplicate application edge: '+key);else{edges.push(e);seenEdges.add(key);}}
  if(errors.length)return errors;
  const forward=new Map([...ids].map(id=>[id,[]])),reverse=new Map([...ids].map(id=>[id,[]])),degree=new Map([...ids].map(id=>[id,0]));
  for(const e of edges){forward.get(e.source).push(e.target);reverse.get(e.target).push(e.source);degree.set(e.target,degree.get(e.target)+1);}
  const queue=[...ids].filter(id=>degree.get(id)===0);for(let i=0;i<queue.length;i++)for(const id of forward.get(queue[i])){degree.set(id,degree.get(id)-1);if(degree.get(id)===0)queue.push(id);}
  if(queue.length!==ids.size)fail('Hard and application edges together must be acyclic');
  function reach(graph,start){const seen=new Set([start]),q=[start];for(let i=0;i<q.length;i++)for(const id of graph.get(q[i])||[])if(!seen.has(id)){seen.add(id);q.push(id);}return seen;}
  const fromStart=reach(forward,tree.startId),toEnd=reach(reverse,tree.endId);
  for(const id of ids){if(!fromStart.has(id))fail('Unreachable from start: '+id);if(!toEnd.has(id))fail('No continuation to end: '+id);}
  if(reverse.get(tree.startId).length)fail('Start node must not have incoming edges');
  if(forward.get(tree.endId).length)fail('End node must not have outgoing edges');
  return errors;
 }
 function parseProgress(text,ids,treeId){
  const x=JSON.parse(text);
  if(!x||x.format!=='learning-tech-progress/v1'||x.treeId!==treeId||!x.completed||typeof x.completed!=='object'||Array.isArray(x.completed))throw Error('The backup belongs to a different tree or format');
  const completed={},notes={};
  for(const [k,v]of Object.entries(x.completed))if(ids.has(k)&&v===true)completed[k]=true;
  for(const [k,v]of Object.entries(x.notes||{}))if(ids.has(k)&&typeof v==='string')notes[k]=v.slice(0,12000);
  return {completed,notes};
 }
 return {validate,validateTree,status,ancestors,descendants,layout,parseProgress};
})();
if(typeof module!=='undefined')module.exports=TechEngine;
