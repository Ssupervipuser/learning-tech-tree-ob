# Learning Tech Tree · Obsidian 知识树

把 Obsidian 笔记变成一张可缩放、可追溯的**阶段科技树**：用树看全局结构和学习顺序，用 Obsidian 记详细笔记，两边通过 `obsidian://` 协议一键跳转。

- 纯静态，无后端、无账号、无需 API key
- 打开 HTML 即可用，笔记数据不离开本机
- MIT 许可

## 快速开始

1. 双击 `index.html`（或 `examples/ai.html`、`examples/cv.html`）
2. 点击任意节点查看详情
3. 点「在 Obsidian 中打开 ↗」直接跳到对应笔记

当前内置两棵**学习路线图**，节点指向本机 Obsidian vault 中的笔记：

| 树 | 节点数 | 覆盖内容 | 待学节点 |
|---|---|---|---|
| `cv-roadmap` | 25 | CNN 基础 → 分类骨干 → 训练 → 目标检测 | 分割、ViT、部署 |
| `ai-roadmap` | 31 | Transformer → 预训练/微调 → 提示词 → Agent → RAG | LangChain、RAG 评估 |

**两种节点**：

- **已有笔记** → 点「在 Obsidian 中打开 ↗」直接跳转
- **待学习**（标记 `【待学习】`）→ 点「创建笔记并打开 ↗」，在 vault 里建好空白笔记并打开

路线图是人工编排的，不是从目录自动抓取，所以只包含过滤后的高质量笔记，不含 `未命名`、空笔记、Excalidraw 等噪音。

## 从 Obsidian 生成一棵新树

```sh
node scripts/obsidian-import.mjs <vault路径> <要导入的文件夹> <输出json> [vault名] [treeId]
```

例如：

```sh
node scripts/obsidian-import.mjs "C:\ob" "CV基础" "data/cv.json" "ob" "cv-basics"
```

这个脚本按目录自动生成（分支=子目录，节点=笔记），适合快速看全貌。**若要做严格的学习路线图，建议手写 JSON**，因为自动生成的先修关系只是文件顺序，没有教学意义。

## 处理 vault 噪音

自动生成时建议排除：空笔记（<200 字符）、名称含「未命名」、`.excalidraw.md` / `.canvas` / `.xmind`、资料库目录（`raw`、`others`、`templates`、`项目*`）、隐藏目录。

然后用浏览器打开生成的 JSON 预览，或直接构建成独立页面。

## 构建

```sh
# 构建 data/ 下全部定义到 examples/，并选主树写入根 index.html
node scripts/build.mjs

# 指定哪棵树作为首页
node scripts/build.mjs --main=ai-roadmap

# 只构建单个定义
node scripts/build.mjs data/xx.json examples/xx.html

# 跳过结构校验（不推荐）
node scripts/build.mjs --skip-validation
```

需要 Node.js 20+，无 npm 依赖。

## 结构校验

```sh
node scripts/validate.mjs            # 校验 data/ 下全部
node scripts/validate.mjs data/x.json # 校验单个
```

校验器检查：ID 与引用完整性、阶段越界、先修环、起点可达性、终点可达性、start 无入边、end 无出边、是否混入私人笔记字段。

**结构校验不等于内容正确**，先修关系是否合理仍需自己判断。

## 关系语义

| 关系 | 显示 | 含义 | 参与解锁 |
|---|---|---|---|
| 硬先修 `prereqIds` | 实线 | 目标节点真正需要的知识，多个值按 AND | 是 |
| 发展/应用 `applicationEdges` | 虚线 | 可选的学习延伸或成果汇入 | 否 |
| 推荐背景 `relatedIds` | 详情页链接 | 有帮助但不必要 | 否 |

## Obsidian 集成原理

每个节点可以带一个 `obsidianNote` 字段，指向 vault 内的笔记路径；顶层 `obsidianVault` 是 vault 名称。详情面板据此生成：

```
obsidian://open?vault=<vault名>&file=<编码后的笔记路径>
```

**页面本身零网络请求**，不读 vault、不上传任何东西，只知道笔记路径字符串。

两点注意：

- `obsidian://` 必须由**真实鼠标点击**触发，脚本调用会被浏览器以 `user gesture is required` 拒绝
- 不能把 `obsidian://` 放进 `sources[].url` —— 校验器和渲染都只接受 `http(s)://`

详见 [docs/obsidian-integration.md](docs/obsidian-integration.md)。

## 进度与笔记

- 在节点上点「自评已掌握」，进度存在当前浏览器 `localStorage`，按树 ID 隔离
- 「备份进度」导出 JSON，「恢复进度」读回；换浏览器、换地址、清缓存前请先备份
- **不自动同步**，也不写回 Obsidian

## 目录结构

```
repo/
├── index.html                 主树页面（默认 cv-roadmap）
├── data/                      树的定义 JSON
├── examples/                  生成的独立页面
├── src/                       查看器源码与图引擎
├── scripts/                   导入、构建、校验脚本
├── docs/                      格式与定制说明
├── schema/tree.schema.json    JSON Schema
├── LICENSE                    MIT
└── package.json
```

## 文档

- [数据格式](docs/data-format.md) —— 字段含义、ID 规则、边的关系
- [定制](docs/customization.md) —— 改阶段、分支、配色
- [Obsidian 集成](docs/obsidian-integration.md) —— 本方案的原理与限制
- [架构](docs/architecture.md) —— 查看器与图引擎的结构

## 限制

- 浏览器内**不能编辑**树，只能改 JSON 后重新构建
- 用「打开科技树」临时导入的 JSON **刷新就丢**，长期使用请认准生成的独立 HTML
- 界面文案为中文，`language` 字段只影响 `<html lang>`，不做界面翻译
- 画布节点只支持鼠标操作，键盘可达性有限

## 许可

代码与原创内容采用 [MIT License](LICENSE)。链接到的第三方资料保留各自权利。

本项目基于 [BOB0731/learning-tech-tree](https://github.com/BOB0731/learning-tech-tree) 改造，按 MIT 许可保留原版权声明，主要改动为 Obsidian 集成与仓库精简。
