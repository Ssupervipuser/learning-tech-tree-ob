# Obsidian 插件：Learning Tech Tree

把学习路线图直接放进 Obsidian。**不需要浏览器、不需要 `obsidian://` 协议授权**——所有操作都在 Obsidian 内部完成。

## 安装

插件已经安装在你的 vault 里：

```
C:\ob\.obsidian\plugins\learning-tech-tree\
├── main.js        插件主体
├── manifest.json  插件清单
└── styles.css     样式
```

**启用方式**：Obsidian → 设置 → 第三方插件 → 找到 `Learning Tech Tree` → 打开开关。

若列表中没有，点「刷新」或重启 Obsidian。

## 使用

### 打开路线图

三种入口：

| 方式 | 操作 |
|---|---|
| 左侧栏图标 | 点击 ribbon 上的「网络」图标 |
| 命令面板 | `Ctrl+P` → 输入「学习路线图」 |
| 命令面板 | `Ctrl+P` → 「打开侧边栏」 |

### 两种视图

- **主标签页**：宽屏，阶段=列，横向展开成图，带 minimap
- **侧边栏**：窄屏，自动切换成单列列表，1:1 清晰可读，可滚动

布局会根据视口宽度**自动切换**（阈值 620px）。

### 操作

- **点击节点** → 右侧看详情（学习范围、点亮任务、前置依赖）
- **「＋ 自评已掌握」** → 打勾，下游节点自动解锁
- **「打开笔记 ↗」** → 在 Obsidian 内跳到对应笔记
- **「创建笔记并打开」** → 待学节点一键建笔记
- **滚轮** → 侧边栏模式滚动 / 主视图缩放
- **拖动** → 平移画布

## 数据存放

### 树定义

放在 vault 的 `学习路线图/` 目录下（可在插件设置中改）：

```
ob/
└── 学习路线图/
    ├── ai.json    大模型应用路线图（31 节点）
    └── cv.json    计算机视觉路线图（25 节点）
```

插件会扫描该目录下所有 `format: "learning-tech-tree/v1"` 的 JSON，自动加载。**修改 JSON 后会自动重载**（监听文件变化）。

### 学习进度

存在 `.obsidian/plugins/learning-tech-tree/data.json`：

```json
{
  "treeFolder": "学习路线图",
  "progress": {
    "ai-roadmap": { "py_anchor": true },
    "cv-roadmap": { "resnet": true }
  },
  "lastTreeId": "ai-roadmap"
}
```

**进度跟着 vault 走**——换电脑、备份 vault 都不会丢，还能用 git 同步。

## 与网页版的关系

网页版（`index.html`）和插件**读同一套 JSON 格式**，可以并存：

| | 网页版 | 插件 |
|---|---|---|
| 打开方式 | 双击 HTML | Obsidian 内 |
| 跳转笔记 | `obsidian://`（需一次授权） | 直接调用 Obsidian API |
| 进度存储 | 浏览器 localStorage | 插件 data.json |
| 布局 | 固定横向 | 自适应横/纵 |

**推荐用插件**：无浏览器授权问题，进度跟 vault 走，体验更连贯。

## 开发说明

- 单文件实现，无构建步骤，无外部依赖
- 使用 Obsidian 主题变量（`--background-primary`、`--text-accent` 等），自动适配明暗主题
- Canvas 2D 渲染，视口裁剪
- 主要 API：`registerView`、`ItemView`、`loadData`/`saveData`、`workspace.getLeaf().openFile`

### 修改后重载

```
Ctrl+P → "重新加载应用"（或重启 Obsidian）
```

## 已知限制

- 尚未发布到 Obsidian 社区插件库，需手动安装
- 不支持在插件内编辑树结构（改 JSON 后自动重载）
- 画布节点不支持键盘导航（可用侧边栏列表模式配合搜索）
