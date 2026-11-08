import fs from 'node:fs';
import path from 'node:path';

// 从 Obsidian vault 扫描 md，生成 learning-tech-tree/v1 JSON
// 用法: node scripts/obsidian-import.mjs <vaultPath> <rootFolder> <outJson> [vaultName] [treeId]
const [, , vaultPath, rootFolder, outJson, vaultNameArg, treeIdArg] = process.argv;
if (!vaultPath || !rootFolder || !outJson) {
  console.error('Usage: node scripts/obsidian-import.mjs <vaultPath> <rootFolder> <outJson> [vaultName] [treeId]');
  process.exit(1);
}
const vaultName = vaultNameArg || path.basename(path.resolve(vaultPath));

// 中文目录名无法直接生成合法 ASCII id，优先用显式传入的 treeId，
// 否则退化为「obsidian-<拼音式短哈希>」
function makeTreeId(folder) {
  if (treeIdArg) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(treeIdArg)) {
      console.error('treeId 必须以字母开头，只含字母数字下划线连字符：' + treeIdArg);
      process.exit(1);
    }
    return treeIdArg;
  }
  const ascii = folder.replaceAll(/[^A-Za-z0-9]/g, '');
  if (ascii) return ('obsidian-' + ascii).toLowerCase().slice(0, 60);
  let h = 0;
  for (const ch of folder) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 'obsidian-tree-' + h.toString(36);
}

function readFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const block = text.slice(3, end);
  const titleMatch = block.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return { title: titleMatch ? titleMatch[1].trim() : null };
}

// 收集 md（跳过 assets 与隐藏）
function walk(dir, base) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'assets') continue;
      out.push(...walk(abs, base));
    } else if (entry.name.endsWith('.md')) {
      out.push(path.relative(base, abs).replaceAll('\\', '/'));
    }
  }
  return out.sort();
}

const rootAbs = path.join(vaultPath, rootFolder);
if (!fs.existsSync(rootAbs)) {
  console.error('Root folder not found: ' + rootAbs);
  process.exit(1);
}

// 第一层目录 = 阶段；第二步先用「目录」做分支
const files = walk(rootAbs, vaultPath);
const subDirs = [...new Set(files.map((f) => {
  const rel = f.slice(rootFolder.length + 1);
  const parts = rel.split('/');
  return parts.length > 1 ? parts[0] : '_root';
}))].sort();

const stages = ['入门', '基础', '进阶', '实战'];

const branchColors = ['#83b6df', '#7bd2c4', '#e5b575', '#d98cb3', '#9f8ce0', '#6ad1ad', '#e08b8b', '#a8c46a'];
const branches = subDirs.map((d, i) => ({
  id: 'b' + i,
  label: d === '_root' ? rootFolder : d,
  en: d === '_root' ? rootFolder.toUpperCase() : d.toUpperCase(),
  color: branchColors[i % branchColors.length],
}));

const nodes = [];
const idOf = new Map();

function makeId(relPath) {
  let base = relPath.replace(/\.md$/, '').replaceAll('/', '_').replaceAll(/[^A-Za-z0-9_-]/g, '_');
  if (!/^[A-Za-z]/.test(base)) base = 'n_' + base;
  let id = base.slice(0, 90);
  let n = 1;
  while (idOf.has(id)) id = base.slice(0, 86) + '_' + n++;
  idOf.set(id, relPath);
  return id;
}

// 先建所有节点
for (const rel of files) {
  const abs = path.join(vaultPath, rel);
  const fm = readFrontmatter(fs.readFileSync(abs, 'utf8').slice(0, 2000));
  const inner = rel.slice(rootFolder.length + 1);
  const parts = inner.split('/');
  const dirName = parts.length > 1 ? parts[0] : '_root';
  const branchIdx = subDirs.indexOf(dirName);
  const depth = parts.length - 1;
  const stage = Math.min(depth, stages.length - 1);
  const title = fm.title || path.basename(rel, '.md').replace(/^\d+[-.]?/, '');
  nodes.push({
    id: makeId(inner),
    name: title,
    branch: 'b' + branchIdx,
    stage,
    kind: 'core',
    prereqIds: [],
    relatedIds: [],
    description: 'Obsidian 笔记：' + rel,
    outcome: '读完并整理《' + title + '》的关键结论与疑问。',
    caution: '',
    sourceIds: ['obsidian'],
    obsidianNote: rel, // 自定义字段：笔记相对路径
  });
}

// 连线：同一目录内按文件序号链式相连，目录首页作为该分支入口
const byDir = new Map();
files.forEach((rel, i) => {
  const inner = rel.slice(rootFolder.length + 1);
  const parts = inner.split('/');
  const key = parts.slice(0, -1).join('/') || '_root';
  if (!byDir.has(key)) byDir.set(key, []);
  byDir.get(key).push(nodes[i]);
});

for (const [, list] of byDir) {
  // 形如 00-overview.md 的首页优先作入口
  const idx = list.findIndex((n) => /overview|课程介绍|总结/.test(n.obsidianNote));
  if (idx > 0) list.unshift(list.splice(idx, 1)[0]);
  for (let i = 1; i < list.length; i++) list[i].prereqIds = [list[i - 1].id];
}

// 目录树：父目录的入口节点作为子目录入口的先修，保证嵌套目录也能从 start 到达
const dirEntry = new Map();
for (const [key, list] of byDir) dirEntry.set(key, list[0]);
const dirOf = (key) => {
  if (key === '_root' || !key.includes('/')) return '_root';
  return key.split('/').slice(0, -1).join('/') || '_root';
};
// 按深度从浅到深挂接，避免父目录尚未处理
const dirKeys = [...byDir.keys()].sort((a, b) => a.split('/').length - b.split('/').length);
const rootKey = files.length ? (files[0].slice(rootFolder.length + 1).split('/').length > 1 ? files[0].slice(rootFolder.length + 1).split('/')[0] : '_root') : '_root';

// 选出主入口：优先取浅层目录的入口
const shallow = dirKeys.filter((k) => k !== '_root' && !k.includes('/'));
const mainRoot = shallow.length ? dirEntry.get(shallow[0]) : dirEntry.get(dirKeys[0]);

for (const key of dirKeys) {
  const entry = dirEntry.get(key);
  if (!entry || entry === mainRoot) continue;
  const parentKey = dirOf(key);
  const parentEntry = dirEntry.get(parentKey);
  if (parentEntry && parentEntry !== entry) {
    entry.prereqIds = [parentEntry.id];
  } else if (mainRoot) {
    entry.prereqIds = [mainRoot.id];
  }
}

// 收束节点：单独建一个终点，把每条链的末端都接过来，保证所有节点都能通向 end
const endNode = {
  id: 'finish',
  name: '知识收束与复盘',
  branch: branches[0].id,
  stage: stages.length - 1,
  kind: 'milestone',
  prereqIds: [],
  relatedIds: [],
  description: '所有分支的末端汇入此处，用于整体复盘。',
  outcome: '写一页总结：已掌握的主题、仍存疑的问题、下一步方向。',
  caution: '这是浏览结构上的收束点，不代表学会了全部内容。',
  sourceIds: ['obsidian'],
  obsidianNote: '',
};
nodes.push(endNode);

// 末端 = 没有任何节点以它为先修的节点；把它们都接到 finish 之下
const hasSuccessor = new Set(nodes.flatMap((n) => n.prereqIds));
endNode.prereqIds = nodes
  .filter((n) => n.id !== 'finish' && !hasSuccessor.has(n.id))
  .map((n) => n.id);

mainRoot.kind = 'milestone';

const tree = {
  format: 'learning-tech-tree/v1',
  id: makeTreeId(rootFolder),
  title: rootFolder + ' 知识树',
  subtitle: '由 Obsidian 笔记自动生成 · 点击节点跳转对应笔记',
  description: '每个节点对应 vault 中的一篇笔记，点击「在 Obsidian 中打开」可直接跳转。',
  version: '0.1.0',
  language: 'zh-CN',
  obsidianVault: vaultName,
  education: { path: 'self-study', duration: null, note: '由笔记目录自动生成的浏览结构，不是课程方案。' },
  stages,
  branches,
  sources: [
    { id: 'obsidian', title: 'Obsidian vault: ' + vaultName, url: '', scope: '本地笔记，未上传。' },
  ],
  startId: mainRoot ? mainRoot.id : nodes[0].id,
  endId: endNode.id,
  nodes,
  applicationEdges: [],
};

fs.writeFileSync(outJson, JSON.stringify(tree, null, 2), 'utf8');
console.log(`Generated ${outJson}`);
console.log(`  vault: ${vaultName} (${path.resolve(vaultPath)})`);
console.log(`  folder: ${rootFolder}`);
console.log(`  nodes: ${nodes.length}, branches: ${branches.length}, stages: ${stages.length}`);
