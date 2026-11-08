# 用 Obsidian 记笔记 + 用科技树看全局

把 `learning-tech-tree` 当成**阶段地图**，把 Obsidian 当成**笔记仓库**。两边各司其职，靠 `obsidian://` 协议打通。

## 一句话原理

科技树的每个节点带一个自定义字段 `obsidianNote`，指向 vault 里的笔记路径。详情面板据此生成一个 `obsidian://open?vault=...&file=...` 链接，点一下 Obsidian 就打开对应笔记。

**页面本身零网络请求**，不读 vault、不上传任何东西。它只知道笔记路径。

## 已验证的事实

以下结论来自本机实测（Windows + Edge 157 + Obsidian 已注册 `obsidian://` 协议）：

| 结论 | 证据 |
|---|---|
| `obsidian://` 能从浏览器页面点击拉起 Obsidian 并精确打开指定笔记 | 浏览器日志 `Launched external handler for 'obsidian://open?...'`，Obsidian 活动笔记由 AlexNet 切换为 GoogLeNet |
| 额外字段能通过官方校验器 | `obsidianVault` / `obsidianNote` 不在 schema 的 `required` 里，`validate.mjs` 通过 |
| `obsidian://` **不能**放进 `sources[].url` | `app.js` 的 `safeSource()` 只放行 `http(s)://`，会被渲染成纯文本 |
| 必须真实鼠标点击 | 脚本 `a.click()` / 赋值 `location.href` 会被浏览器拒绝：`Not allowed to launch ... because a user gesture is required` |

## 三步上手

### 1. 生成树

```sh
node scripts/obsidian-import.mjs <vault绝对路径> <要导入的文件夹> <输出json> [vault名]
```

例如：

```sh
node scripts/obsidian-import.mjs "C:\ob" "CV基础" "data/obsidian-cv.json" "ob"
node scripts/obsidian-import.mjs "C:\ob" "06-AI大模型" "data/obsidian-ai.json" "ob"
```

生成规则（可按需改脚本）：

- `stages` = 笔记层级深度，固定四级：入门 / 基础 / 进阶 / 实战
- `branches` = 顶层子目录，每个目录一条轨道，自动配色
- 节点 = 每篇 `.md`，名称优先取 frontmatter 里的 `title`，否则用文件名（去掉 `01-` 这类前缀）
- 同一目录内按文件名顺序链式相连；`00-overview` / `课程介绍` / `总结` 优先作该目录入口
- 子目录入口挂在父目录入口下；所有末端汇入一个「知识收束与复盘」终点

### 2. 校验并构建

```sh
node scripts/validate.mjs data/obsidian-cv.json
node scripts/build.mjs data/obsidian-cv.json examples/obsidian-cv.html
```

### 3. 打开生成的 HTML

**直接双击 `examples/obsidian-cv.html`**（或从本地服务器打开也行）。点任意节点 → 右侧详情 → 「在 Obsidian 中打开 ↗」。

## 两个已知限制

1. **导入的树刷新就丢**。用「打开科技树」加载 JSON 只是临时的；要持久使用，认准生成好的独立 HTML 文件。
2. **笔记只读**。科技树不会写回 Obsidian——进度和笔记文本框存在浏览器 localStorage，和你的 vault 是两套东西。想记笔记就回 Obsidian 记。

## 与官方数据格式的关系

改动完全向后兼容：

- 新增 `obsidianVault`（顶层）和 `obsidianNote`（节点级）两个可选字段
- 不填这两个字段时，行为与原版完全一致（不会渲染任何 Obsidian 相关 UI）
- `obsidian://` 链接用 `encodeURIComponent` 处理中文路径，反斜杠统一转正斜杠

## 换个方向用

同一套机制不止能连笔记目录，也可以：

- 一个节点指向多篇笔记：把 `obsidianNote` 扩展成数组
- 反向索引：从笔记的 frontmatter `tags` 生成节点，实现「打了 CV 标签的笔记自动进树」
- 进度回写：用 Obsidian 的 Dataview 读取科技树导出的进度 JSON

需要哪一种，改 `scripts/obsidian-import.mjs` 即可，查看器不用动。
