/**
 * Learning Tech Tree for Obsidian
 *
 * 把一个 learning-tech-tree/v1 定义渲染成可交互的学习路线图：
 * - 侧边栏面板 / 主区域标签页两种视图
 * - 点击节点打开对应笔记；待学节点一键创建
 * - 进度保存在插件自身 data.json
 *
 * 无外部依赖，无需构建。
 */
const obsidian = require('obsidian');
const {
  Plugin,
  ItemView,
  WorkspaceLeaf,
  TFile,
  Notice,
  Modal,
  Setting,
  PluginSettingTab,
} = obsidian;

const VIEW_TYPE_TREE = 'lt-tree-view';
const VIEW_TYPE_SIDEBAR = 'lt-sidebar-view';
const DEFAULT_SETTINGS = {
  treeFolder: '学习路线图',
  progress: {},
  lastTreeId: null,
};

/* ---------------------------------- 工具 ---------------------------------- */

function normalizePath(p) {
  return String(p || '').replaceAll('\\', '/').replace(/^\/+/, '');
}

/** 拓扑分层：rank = max(先修 rank) + 1，同时兼容 stage */
function computeRanks(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ranks = {};
  const visiting = new Set();
  function rank(n) {
    if (ranks[n.id] !== undefined) return ranks[n.id];
    if (visiting.has(n.id)) return (n.stage || 0) * 2; // 有环时退化，避免死循环
    visiting.add(n.id);
    let r = (n.stage || 0) * 2;
    for (const p of n.prereqIds || []) {
      const pn = byId.get(p);
      if (pn) r = Math.max(r, rank(pn) + 1);
    }
    visiting.delete(n.id);
    return (ranks[n.id] = r);
  }
  for (const n of nodes) rank(n);
  return ranks;
}

/** 计算节点布局。
 *  - 窄视口（侧边栏）：单列纵向列表，按阶段分组，占满宽度，100% 可读
 *  - 宽视口（主标签页）：阶段=列，横向展开成图
 */
function computeLayout(tree, viewW, viewH) {
  const nodes = tree.nodes || [];
  const branches = tree.branches || [];
  const stages = tree.stages || [];
  const stageCount = Math.max(1, stages.length);
  const vertical = !viewW || viewW < 620;

  const branchOrder = new Map(branches.map((b, i) => [b.id, i]));
  const stageOf = (n) => Math.min(Math.max(0, n.stage || 0), stageCount - 1);

  if (vertical) {
    // === 单列列表：每个阶段一个小标题，节点逐行排列 ===
    const CARD_W = Math.max(180, (viewW || 420) - 34);
    const CARD_H = 34;
    const ROW_GAP = 5;
    const HEADER_H = 26;

    const sorted = [...nodes].sort((a, b) => {
      const sa = stageOf(a), sb = stageOf(b);
      if (sa !== sb) return sa - sb;
      const ba = branchOrder.get(a.branch) ?? 99;
      const bb = branchOrder.get(b.branch) ?? 99;
      if (ba !== bb) return ba - bb;
      return (a.name || '').localeCompare(b.name || '', 'zh');
    });

    const positions = {};
    const ranks = {};
    const stageHeaders = [];
    let y = 16;
    let curStage = -1;
    for (const n of sorted) {
      const st = stageOf(n);
      if (st !== curStage) {
        curStage = st;
        // 阶段标题需要留出足够空间，避免被卡片压住
        if (stageHeaders.length) y += 14;
        stageHeaders.push({ y, label: stages[st] || `阶段 ${st + 1}` });
        y += HEADER_H;
      }
      ranks[n.id] = st;
      positions[n.id] = { x: 17, y };
      y += CARD_H + ROW_GAP;
    }

    return {
      positions, ranks, stageHeaders,
      width: CARD_W + 34, height: Math.max(200, y + 10),
      CARD_W, CARD_H, stageCount, maxRows: sorted.length, vertical: true, laneTop: {},
    };
  }

  // === 横向图：阶段=列 ===
  const CARD_W = 150, CARD_H = 42, COL_GAP = 28, ROW_GAP = 7;
  const sorted = [...nodes].sort((a, b) => {
    const sa = stageOf(a), sb = stageOf(b);
    if (sa !== sb) return sa - sb;
    const ba = branchOrder.get(a.branch) ?? 99;
    const bb = branchOrder.get(b.branch) ?? 99;
    return ba - bb;
  });

  const positions = {};
  const ranks = {};
  const slotUsed = new Map();
  let maxRows = 1;
  for (const n of sorted) {
    const st = stageOf(n);
    ranks[n.id] = st;
    const slot = slotUsed.get(st) || 0;
    slotUsed.set(st, slot + 1);
    maxRows = Math.max(maxRows, slot + 1);
    positions[n.id] = { x: 16 + st * (CARD_W + COL_GAP), y: 16 + slot * (CARD_H + ROW_GAP) };
  }

  return {
    positions, ranks, stageHeaders: [],
    width: Math.max(400, 16 + stageCount * (CARD_W + COL_GAP)),
    height: Math.max(240, 16 + maxRows * (CARD_H + ROW_GAP) + 8),
    CARD_W, CARD_H, stageCount, maxRows, vertical: false, laneTop: {},
  };
}

/* ---------------------------------- 视图 ---------------------------------- */

class TreeView extends ItemView {
  constructor(leaf, plugin, opts = {}) {
    super(leaf);
    this.plugin = plugin;
    this.sidebar = !!opts.sidebar;
    this.tree = null;
    this.layout = null;
    this.selected = null;
    this.filterBranch = null;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.canvas = null;
    this.ctx = null;
    this.mini = null;
    this.miniCtx = null;
    this.detailEl = null;
    this.treeSelectEl = null;
  }

  getViewType() {
    return this.sidebar ? VIEW_TYPE_SIDEBAR : VIEW_TYPE_TREE;
  }

  getDisplayText() {
    return this.tree ? this.tree.title || '学习路线图' : '学习路线图';
  }

  getIcon() {
    return 'network';
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('lt-root');
    if (this.sidebar) root.addClass('lt-sidebar');

    // 顶部工具条
    const bar = root.createDiv({ cls: 'lt-toolbar' });
    this.treeSelectEl = bar.createEl('select', { cls: 'lt-tree-select dropdown' });
    this.treeSelectEl.addEventListener('change', () => {
      this.plugin.setActiveTree(this.treeSelectEl.value, this);
    });
    const fitBtn = bar.createEl('button', { cls: 'lt-icon-btn', text: '全图' });
    fitBtn.addEventListener('click', () => this.fitToView());

    // 主体：画布 + 详情
    const body = root.createDiv({ cls: 'lt-body' });
    const canvasWrap = body.createDiv({ cls: 'lt-canvas-wrap' });
    this.canvas = canvasWrap.createEl('canvas', { cls: 'lt-canvas' });
    this.ctx = this.canvas.getContext('2d');

    this.mini = canvasWrap.createEl('canvas', { cls: 'lt-mini' });
    this.miniCtx = this.mini.getContext('2d');

    this.detailEl = body.createDiv({ cls: 'lt-detail' });

    this.registerDomEvent(this.canvas, 'wheel', (e) => {
      e.preventDefault();
      if (this.layout && this.layout.vertical) {
        // 列表模式：滚轮 = 垂直滚动
        const maxPan = Math.max(0, this.layout.height * this.scale - this._cssH);
        this.panY = Math.max(-maxPan, Math.min(0, this.panY - e.deltaY));
        this.render();
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      this.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    let dragging = null;
    this.registerDomEvent(this.canvas, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      dragging = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY, moved: false };
    });
    this.registerDomEvent(this.canvas, 'pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
      if (Math.hypot(dx, dy) > 4) dragging.moved = true;
      if (dragging.moved) {
        if (this.layout && this.layout.vertical) {
          // 列表模式：只允许垂直拖动，并限制在内容范围内
          const maxPan = Math.max(0, this.layout.height * this.scale - this._cssH);
          this.panY = Math.max(-maxPan, Math.min(0, dragging.py + dy));
          this.panX = 0;
        } else {
          this.panX = dragging.px + dx;
          this.panY = dragging.py + dy;
        }
        this.render();
      }
    });
    this.registerDomEvent(this.canvas, 'pointerup', (e) => {
      if (dragging && !dragging.moved) {
        const id = this.hitTest(e.clientX, e.clientY);
        if (id) this.selectNode(id);
      }
      dragging = null;
    });
    this.registerDomEvent(this.canvas, 'pointercancel', () => { dragging = null; });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvasWrap);
    this.register(() => this.resizeObserver && this.resizeObserver.disconnect());

    await this.plugin.refreshView(this);
  }

  async onClose() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const prevW = this._cssW, prevH = this._cssH;
    this._cssW = Math.max(1, rect.width);
    this._cssH = Math.max(1, rect.height);
    this.canvas.width = Math.round(this._cssW * dpr);
    this.canvas.height = Math.round(this._cssH * dpr);
    this.canvas.style.width = this._cssW + 'px';
    this.canvas.style.height = this._cssH + 'px';
    this._dpr = dpr;
    // 首次测量或尺寸显著变化时重新适配，避免树只画在角落
    if (this.layout && (!prevW || !prevH || Math.abs(prevW - this._cssW) > 40 || Math.abs(prevH - this._cssH) > 40)) {
      this.fitToView();
      return;
    }
    this.render();
  }

  setTree(tree) {
    this.tree = tree;
    if (tree) {
      // 布局依赖视口尺寸，由 fitToView 内部计算
      this.layout = { positions: {}, ranks: {}, width: 1, height: 1, CARD_W: 150, CARD_H: 42, stageCount: 1, maxRows: 1, vertical: false, laneTop: {} };
      this.selected = null;
      this.filterBranch = null;
      this.updateTreeSelect();
      this.fitToView();
      this.renderDetail();
    } else {
      this.layout = null;
      this.render();
      this.renderDetail();
    }
  }

  updateTreeSelect() {
    if (!this.treeSelectEl) return;
    this.treeSelectEl.empty();
    const trees = this.plugin.getTrees();
    for (const t of trees) {
      const opt = this.treeSelectEl.createEl('option', { text: t.title || t.id, value: t.id });
      if (this.tree && t.id === this.tree.id) opt.selected = true;
    }
  }

  fitToView() {
    if (!this.tree) return;
    // 若尚未测量尺寸（视图刚创建），先同步测一次，避免用 0 或旧值计算
    if (!this._cssW || !this._cssH) {
      const wrap = this.canvas && this.canvas.parentElement;
      const rect = wrap ? wrap.getBoundingClientRect() : null;
      if (!rect || rect.width < 2 || rect.height < 2) return;
      this._cssW = rect.width;
      this._cssH = rect.height;
    }
    // 重新计算布局（方向取决于视口宽高比与宽度）
    this.layout = computeLayout(this.tree, this._cssW, this._cssH);

    if (this.layout.vertical) {
      // 列表模式：1:1 显示，垂直滚动浏览
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      this.render();
      return;
    }

    const pad = 16;
    const sx = (this._cssW - pad * 2) / this.layout.width;
    const sy = (this._cssH - pad * 2) / this.layout.height;
    this.scale = Math.max(0.12, Math.min(1.4, Math.min(sx, sy)));
    this.panX = Math.max(pad, (this._cssW - this.layout.width * this.scale) / 2);
    this.panY = pad;
    this.render();
  }

  zoomAt(factor, cx, cy) {
    const next = Math.max(0.1, Math.min(3, this.scale * factor));
    const k = next / this.scale;
    this.panX = cx - (cx - this.panX) * k;
    this.panY = cy - (cy - this.panY) * k;
    this.scale = next;
    this.render();
  }

  hitTest(clientX, clientY) {
    if (!this.layout || !this.tree) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.scale;
    const y = (clientY - rect.top - this.panY) / this.scale;
    const { CARD_W, CARD_H } = this.layout;
    // 逆序：上层优先
    for (let i = this.tree.nodes.length - 1; i >= 0; i--) {
      const n = this.tree.nodes[i];
      const p = this.layout.positions[n.id];
      if (!p) continue;
      if (x >= p.x && x <= p.x + CARD_W && y >= p.y && y <= p.y + CARD_H) return n.id;
    }
    return null;
  }

  selectNode(id) {
    if (!this.tree) return;
    this.selected = id;
    this.render();
    this.renderDetail();
  }

  isCompleted(id) {
    const prog = this.plugin.settings.progress[this.tree.id] || {};
    return !!prog[id];
  }

  statusOf(node) {
    if (this.isCompleted(node.id)) return 'done';
    const prog = this.plugin.settings.progress[this.tree.id] || {};
    const ok = (node.prereqIds || []).every((p) => prog[p]);
    return ok ? 'ready' : 'locked';
  }

  render() {
    if (!this.ctx || !this.tree || !this.layout) {
      if (this.ctx && this._cssW) {
        this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        this.ctx.clearRect(0, 0, this._cssW, this._cssH);
        this.ctx.fillStyle = '#0d1723';
        this.ctx.fillRect(0, 0, this._cssW, this._cssH);
        this.ctx.fillStyle = '#7f97b0';
        this.ctx.font = '13px sans-serif';
        this.ctx.fillText('未找到学习路线图，请检查设置中的「树文件目录」', 20, 40);
      }
      return;
    }
    const ctx = this.ctx;
    const { positions, CARD_W, CARD_H, laneTop } = this.layout;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._cssW, this._cssH);

    const bg = getComputedStyle(document.body).getPropertyValue('--background-primary') || '#1e1e1e';
    ctx.fillStyle = bg && bg.trim() ? bg.trim() : '#1e1e1e';
    ctx.fillRect(0, 0, this._cssW, this._cssH);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.scale, this.scale);

    const accent = getComputedStyle(document.body).getPropertyValue('--text-accent') || '#7f6df2';
    const textNormal = getComputedStyle(document.body).getPropertyValue('--text-normal') || '#dcddde';
    const textMuted = getComputedStyle(document.body).getPropertyValue('--text-muted') || '#999';
    const bgSecondary = getComputedStyle(document.body).getPropertyValue('--background-secondary') || '#262626';

    // 阶段背景 / 标题
    const stageCount = this.layout.stageCount || 1;
    const CARD_W0 = this.layout.CARD_W, CARD_H0 = this.layout.CARD_H;
    if (this.layout.vertical) {
      // 列表模式：画阶段小标题
      for (const h of this.layout.stageHeaders || []) {
        ctx.fillStyle = textMuted;
        ctx.font = '600 10px var(--font-interface, sans-serif)';
        ctx.textBaseline = 'alphabetic';
        const label = h.label.toUpperCase();
        const baseline = h.y + 14;
        ctx.fillText(label, 17, baseline);
        ctx.strokeStyle = textMuted + '33';
        ctx.lineWidth = 1 / this.scale;
        ctx.beginPath();
        const tw = ctx.measureText(label).width;
        ctx.moveTo(17 + tw + 8, baseline - 4);
        ctx.lineTo(this.layout.width - 20, baseline - 4);
        ctx.stroke();
      }
    } else {
      for (let c = 0; c < stageCount; c++) {
        if (c % 2 !== 0) continue;
        ctx.fillStyle = (textMuted || '#888') + '0d';
        ctx.fillRect(16 + c * (CARD_W0 + 28) - 14, 0, CARD_W0 + 28, this.layout.height);
      }
    }

    // 连线（列表模式下连线会互相重叠，改为不画，靠阶段分组体现顺序）
    const byId = new Map(this.tree.nodes.map((n) => [n.id, n]));
    if (!this.layout.vertical) {
      for (const n of this.tree.nodes) {
        for (const p of n.prereqIds || []) {
          const a = positions[p], b2 = positions[n.id];
          if (!a || !b2) continue;
          if (this.filterBranch) {
            const pa = byId.get(p);
            if (pa && pa.branch !== this.filterBranch && n.branch !== this.filterBranch) continue;
          }
          const x1 = a.x + CARD_W, y1 = a.y + CARD_H / 2;
          const x2 = b2.x, y2 = b2.y + CARD_H / 2;
          const dx = Math.max(20, (x2 - x1) * 0.4);
          ctx.strokeStyle = textMuted + '66';
          ctx.lineWidth = 1 / this.scale;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
          ctx.stroke();
        }
      }
    }

    // 节点
    const branches = this.tree.branches || [];
    for (const n of this.tree.nodes) {
      const p = positions[n.id];
      if (!p) continue;
      const b = branches.find((x) => x.id === n.branch);
      const dim = this.filterBranch && n.branch !== this.filterBranch;
      const st = this.statusOf(n);
      const isSel = n.id === this.selected;

      ctx.globalAlpha = dim ? 0.18 : 1;

      ctx.beginPath();
      const r = 5;
      ctx.roundRect(p.x, p.y, CARD_W, CARD_H, r);
      ctx.fillStyle = st === 'done' ? '#1e3a32' : isSel ? bgSecondary : bgSecondary;
      ctx.fill();
      ctx.strokeStyle = isSel ? accent : st === 'done' ? '#3d8b72' : (b && b.color) || '#444';
      ctx.lineWidth = (isSel ? 2 : 1) / this.scale;
      ctx.stroke();

      // 左侧色条
      ctx.fillStyle = st === 'done' ? '#6ad1ad' : st === 'ready' ? '#d5ad6c' : (b && b.color) || '#555';
      ctx.fillRect(p.x, p.y + 8, 2.5, CARD_H - 16);

      // 状态点
      ctx.beginPath();
      ctx.arc(p.x + CARD_W - 10, p.y + 12, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = st === 'done' ? '#6ad1ad' : st === 'ready' ? '#d5ad6c' : '#4a5568';
      ctx.fill();

      // 名称（列表模式可显示更长的名字）
      ctx.fillStyle = st === 'locked' ? textMuted : textNormal;
      ctx.font = this.layout.vertical ? '12.5px var(--font-interface, sans-serif)' : '12px var(--font-interface, sans-serif)';
      ctx.textBaseline = 'middle';
      const maxW = CARD_W - 26;
      let name = n.name || n.id;
      while (ctx.measureText(name).width > maxW && name.length > 1) {
        name = name.slice(0, -1);
      }
      if (name !== (n.name || n.id)) name = name.slice(0, -1) + '…';
      ctx.fillText(name, p.x + 10, p.y + CARD_H / 2 + (this.layout.vertical ? 0 : 0));

      // 列表模式：右侧显示分支色点
      if (this.layout.vertical && b) {
        ctx.beginPath();
        ctx.arc(p.x + CARD_W - 16, p.y + CARD_H / 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = b.color || '#666';
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.renderMini();
  }

  renderMini() {
    if (!this.miniCtx || !this.layout || !this.tree) return;
    // 列表模式下 minimap 无意义，直接隐藏
    if (this.layout.vertical) {
      if (this.mini) this.mini.style.display = 'none';
      return;
    }
    if (this.mini) this.mini.style.display = '';
    const w = 150, h = 94;
    this.mini.width = w;
    this.mini.height = h;
    const c = this.miniCtx;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#0a1422';
    c.fillRect(0, 0, w, h);
    const s = Math.min((w - 8) / this.layout.width, (h - 8) / this.layout.height);
    for (const n of this.tree.nodes) {
      const p = this.layout.positions[n.id];
      if (!p) continue;
      const b = (this.tree.branches || []).find((x) => x.id === n.branch);
      c.fillStyle = n.id === this.selected ? '#ffe5af' : (b && b.color) || '#888';
      c.fillRect(4 + p.x * s, 4 + p.y * s, Math.max(1.5, this.layout.CARD_W * s), Math.max(1.5, this.layout.CARD_H * s));
    }
    c.strokeStyle = '#d4bc91';
    c.lineWidth = 1;
    c.strokeRect(
      4 + (-this.panX / this.scale) * s,
      4 + (-this.panY / this.scale) * s,
      (this._cssW / this.scale) * s,
      (this._cssH / this.scale) * s
    );
  }

  renderDetail() {
    const host = this.detailEl;
    if (!host) return;
    host.empty();
    if (!this.tree) return;
    if (!this.selected) {
      host.createEl('p', { cls: 'lt-muted', text: '点击节点查看详情。' });
      return;
    }
    const n = this.tree.nodes.find((x) => x.id === this.selected);
    if (!n) return;
    const b = (this.tree.branches || []).find((x) => x.id === n.branch);
    const stages = this.tree.stages || [];

    const head = host.createDiv({ cls: 'lt-detail-head' });
    head.createEl('h3', { text: n.name });
    const tags = head.createDiv({ cls: 'lt-tags' });
    if (b) tags.createSpan({ cls: 'lt-tag', text: b.label, attr: { style: `border-color:${b.color}` } });
    if (typeof n.stage === 'number' && stages[n.stage]) tags.createSpan({ cls: 'lt-tag', text: stages[n.stage] });
    if (n.kind === 'optional') tags.createSpan({ cls: 'lt-tag lt-tag-optional', text: '可选' });
    if (n.kind === 'milestone') tags.createSpan({ cls: 'lt-tag lt-tag-milestone', text: '里程碑' });

    if (n.description) {
      host.createEl('h4', { text: '学习范围' });
      host.createEl('p', { text: n.description });
    }
    if (n.outcome) {
      host.createEl('h4', { text: '点亮任务' });
      host.createDiv({ cls: 'lt-task', text: n.outcome });
    }
    if (n.caution) host.createDiv({ cls: 'lt-caution', text: n.caution });

    // 进度按钮
    const done = this.isCompleted(n.id);
    const btn = host.createEl('button', {
      cls: 'lt-mark' + (done ? ' lt-mark-done' : ''),
      text: done ? '✓ 已掌握 · 点击撤销' : '＋ 自评已掌握',
    });
    btn.addEventListener('click', async () => {
      await this.plugin.toggleComplete(this.tree.id, n.id);
      this.render();
      this.renderDetail();
    });

    // 笔记入口
    const isTodo = /【待学习】/.test(n.name || '') || !!n.obsidianTodo;
    host.createEl('h4', { text: isTodo ? '待学习' : '笔记' });
    if (isTodo) {
      const root = normalizePath(this.plugin.settings.treeFolder);
      const target = n.obsidianNote
        ? normalizePath(n.obsidianNote)
        : `${root}/待学/${(n.name || n.id).replace(/【待学习】/g, '').trim()}.md`;
      const createBtn = host.createEl('button', { cls: 'lt-link-btn', text: '创建笔记并打开' });
      createBtn.addEventListener('click', () => this.plugin.createNoteForNode(target, n));
      host.createEl('div', { cls: 'lt-path', text: target });
      if (n.obsidianNote) host.createEl('div', { cls: 'lt-path', text: '已有笔记：' + n.obsidianNote });
    } else if (n.obsidianNote) {
      const a = host.createEl('a', { cls: 'lt-link-btn', text: '打开笔记 ↗' });
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.plugin.openNote(n.obsidianNote);
      });
      host.createEl('div', { cls: 'lt-path', text: n.obsidianNote });
    } else {
      host.createEl('div', { cls: 'lt-muted', text: '该节点未关联笔记。' });
    }

    // 前置 / 解锁
    const prog = this.plugin.settings.progress[this.tree.id] || {};
    const deps = n.prereqIds || [];
    host.createEl('h4', { text: `直接前置 · ${deps.length} 项` });
    if (deps.length) {
      const list = host.createDiv({ cls: 'lt-deps' });
      for (const id of deps) {
        const dn = this.tree.nodes.find((x) => x.id === id);
        if (!dn) continue;
        const item = list.createEl('button', { cls: 'lt-dep' + (prog[id] ? ' lt-dep-done' : '') });
        item.createSpan({ text: prog[id] ? '✓' : '○', cls: 'lt-dep-dot' });
        item.createSpan({ text: dn.name });
        item.addEventListener('click', () => this.selectNode(id));
      }
    } else {
      host.createEl('div', { cls: 'lt-muted', text: '没有硬性先修。' });
    }

    const children = this.tree.nodes.filter((x) => (x.prereqIds || []).includes(n.id));
    if (children.length) {
      host.createEl('h4', { text: `直接解锁 · ${children.length} 项` });
      const list = host.createDiv({ cls: 'lt-deps' });
      for (const c of children) {
        const item = list.createEl('button', { cls: 'lt-dep' });
        item.createSpan({ text: c.name });
        item.addEventListener('click', () => this.selectNode(c.id));
      }
    }
  }
}

/* ---------------------------------- 插件 ---------------------------------- */

class LearningTechTreePlugin extends Plugin {
  async onload() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved || {});
    this.settings.progress = this.settings.progress || {};
    this.trees = [];

    this.registerView(VIEW_TYPE_TREE, (leaf) => new TreeView(leaf, this, { sidebar: false }));
    this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new TreeView(leaf, this, { sidebar: true }));

    this.addRibbonIcon('network', '打开学习路线图', () => this.openTreeView());

    this.addCommand({
      id: 'open-tree-view',
      name: '打开主视图',
      callback: () => this.openTreeView(),
    });
    this.addCommand({
      id: 'open-sidebar',
      name: '打开侧边栏',
      callback: () => this.openSidebar(),
    });
    this.addCommand({
      id: 'reload-trees',
      name: '重新加载路线图数据',
      callback: async () => {
        await this.loadTrees();
        new Notice(`已加载 ${this.trees.length} 棵路线图`);
        this.refreshAllViews();
      },
    });

    this.addSettingTab(new TreeSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      await this.loadTrees();
      this.refreshAllViews();
    });

    // 监听树文件变化，自动重载
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'json' && file.path.startsWith(normalizePath(this.settings.treeFolder))) {
          this.loadTrees().then(() => this.refreshAllViews());
        }
      })
    );
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TREE);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SIDEBAR);
  }

  getTrees() {
    return this.trees || [];
  }

  async loadTrees() {
    const folder = normalizePath(this.settings.treeFolder);
    this.trees = [];
    const files = this.app.vault.getFiles();
    for (const f of files) {
      if (f.extension !== 'json') continue;
      if (!f.path.startsWith(folder + '/')) continue;
      try {
        const raw = await this.app.vault.read(f);
        const data = JSON.parse(raw);
        if (data && data.format === 'learning-tech-tree/v1' && Array.isArray(data.nodes)) {
          this.trees.push(data);
        }
      } catch (e) {
        console.warn('[lt] 无法读取', f.path, e);
      }
    }
    this.trees.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'));
    return this.trees;
  }

  async setActiveTree(treeId, sourceView) {
    this.settings.lastTreeId = treeId;
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TREE).concat(this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR))) {
      const v = leaf.view;
      if (v && typeof v.setTree === 'function') {
        v.setTree(this.trees.find((t) => t.id === treeId) || null);
      }
    }
  }

  async refreshView(view) {
    if (!this.trees.length) await this.loadTrees();
    const wanted = this.settings.lastTreeId;
    let tree = this.trees.find((t) => t.id === wanted) || this.trees[0] || null;
    view.setTree(tree);
  }

  refreshAllViews() {
    const leaves = this.app.workspace
      .getLeavesOfType(VIEW_TYPE_TREE)
      .concat(this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR));
    for (const leaf of leaves) {
      const v = leaf.view;
      if (!v || typeof v.setTree !== 'function') continue;
      const cur = v.tree && v.tree.id;
      v.setTree(this.trees.find((t) => t.id === cur) || this.trees[0] || null);
    }
  }

  async toggleComplete(treeId, nodeId) {
    const prog = this.settings.progress[treeId] || (this.settings.progress[treeId] = {});
    if (prog[nodeId]) delete prog[nodeId];
    else prog[nodeId] = true;
    await this.saveData(this.settings);
  }

  openNote(path) {
    const clean = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(clean);
    if (file instanceof TFile) {
      this.app.workspace.getLeaf(false).openFile(file);
    } else {
      const base = clean.split('/').pop().replace(/\.md$/, '');
      const target = this.app.metadataCache.getFirstLinkpathDest(base, '');
      if (target) this.app.workspace.getLeaf(false).openFile(target);
      else new Notice('找不到笔记：' + clean);
    }
  }

  async createNoteForNode(path, node) {
    const clean = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(clean);
    if (existing instanceof TFile) {
      this.app.workspace.getLeaf(false).openFile(existing);
      return;
    }
    const dir = clean.split('/').slice(0, -1).join('/');
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir).catch(() => {});
    }
    const body = [
      `# ${(node.name || node.id).replace(/【待学习】/g, '').trim()}`,
      '',
      node.outcome ? `> ${node.outcome}` : '',
      '',
      node.description ? node.description : '',
      '',
    ].join('\n');
    const file = await this.app.vault.create(clean, body);
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice('已创建笔记：' + clean);
  }

  async openTreeView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TREE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_TREE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async openSidebar() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}

/* --------------------------------- 设置页 --------------------------------- */

class TreeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: '学习路线图设置' });

    new Setting(containerEl)
      .setName('树文件目录')
      .setDesc('存放 learning-tech-tree JSON 的 vault 目录（相对 vault 根）')
      .addText((t) =>
        t.setValue(this.plugin.settings.treeFolder).onChange(async (v) => {
          this.plugin.settings.treeFolder = v.trim() || DEFAULT_SETTINGS.treeFolder;
          await this.plugin.saveData(this.plugin.settings);
          await this.plugin.loadTrees();
          this.plugin.refreshAllViews();
        })
      );

    const info = containerEl.createEl('div', { cls: 'lt-settings-info' });
    info.createEl('p', { text: `已发现 ${this.plugin.trees.length} 棵路线图：` });
    const ul = info.createEl('ul');
    for (const t of this.plugin.trees) {
      const prog = this.plugin.settings.progress[t.id] || {};
      const done = Object.keys(prog).length;
      ul.createEl('li', { text: `${t.title || t.id}（${(t.nodes || []).length} 节点，已完成 ${done}）` });
    }
    if (!this.plugin.trees.length) {
      info.createEl('p', {
        text: `在「${this.plugin.settings.treeFolder}」目录下放入 JSON 定义后再重新加载。`,
      });
    }

    new Setting(containerEl)
      .setName('重新加载')
      .addButton((b) =>
        b.setButtonText('重新加载').onClick(async () => {
          await this.plugin.loadTrees();
          this.plugin.refreshAllViews();
          this.display();
          new Notice(`已加载 ${this.plugin.trees.length} 棵路线图`);
        })
      );

    new Setting(containerEl)
      .setName('重置全部进度')
      .setDesc('清除所有树的学习进度记录，不可撤销。')
      .addButton((b) =>
        b.setButtonText('重置').setWarning().onClick(async () => {
          this.plugin.settings.progress = {};
          await this.plugin.saveData(this.plugin.settings);
          this.plugin.refreshAllViews();
          this.display();
          new Notice('进度已重置');
        })
      );
  }
}

module.exports = LearningTechTreePlugin;
