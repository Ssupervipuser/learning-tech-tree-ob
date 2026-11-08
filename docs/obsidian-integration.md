# 用 Obsidian 记笔记 + 用科技树看全局

把 `learning-tech-tree` 当成**学习路线图**，把 Obsidian 当成**笔记仓库**。两边各司其职，靠 `obsidian://` 协议打通。

## 两种节点，两种行为

| 节点类型 | 判定 | 点击行为 |
|---|---|---|
| 已有笔记 | 带 `obsidianNote` 字段 | `obsidian://open` 打开该笔记 |
| 待学习 | 名称含 `【待学习】` 或带 `obsidianTodo: true` | `obsidian://new` 在 `obsidianNoteRoot` 下创建空白笔记并打开 |

待学节点不需要预先存在笔记文件：点击时才创建，路径由 `obsidianNoteRoot` + 节点名自动推导。这样路线图可以覆盖还没开始学的内容，而不是只反映已有笔记。

## 已验证的事实

以下结论来自本机实测（Windows + Edge + Obsidian 已注册 `obsidian://`）：

| 结论 | 证据 |
|---|---|
| `obsidian://open` 能从页面点击拉起 Obsidian 并精确打开指定笔记 | 浏览器日志 `Launched external handler`，活动笔记由 AlexNet 切到 GoogLeNet |
| `obsidian://new` 能创建笔记 | 实测在 `Notes/CV/99-待学/语义分割.md` 成功生成文件 |
| 额外字段能通过校验器 | `obsidianVault` / `obsidianNote` / `obsidianNoteRoot` 不在 schema 的 `required` 里 |
| `obsidian://` **不能**放进 `sources[].url` | `app.js` 的 `safeSource()` 只放行 `http(s)://` |
| 必须真实鼠标点击 | 脚本 `a.click()` 或赋值 `location.href` 会被拒绝：`user gesture is required` |

## 字段说明

顶层：

```json
{
  "obsidianVault": "MyVault",
  "obsidianNoteRoot": "Notes/CV/99-待学"
}
```

节点级：

```json
{ "id": "resnet", "obsidianNote": "Notes/CV/01-图像分类/05-ResNet.md" }
{ "id": "seg_todo", "name": "语义分割【待学习】", "obsidianTodo": true }
```

- `obsidianVault`：vault 名称（Obsidian 中显示的名字，不是路径）。省略时用 `obsidian://open?file=...`
- `obsidianNote`：笔记相对 vault 根的路径
- `obsidianNoteRoot`：待学节点创建笔记的默认目录
- `obsidianTodo`：显式标记待学（也可用名称含「【待学习】」判断）

## 处理 vault 噪音

从目录自动生成树时，以下内容应排除：

- 空笔记（少于 200 字符，多为临时碎片）
- 名称含「未命名」的
- `.excalidraw.md` / `.canvas` / `.xmind` 等非文本产物
- 资料库或项目记录目录（`raw`、`others`、`templates`、`项目*`）
- 隐藏目录（`.trash`、`.obsidian`、`.git`）

本仓库的 `cv-roadmap` 与 `ai-roadmap` 是**人工编排的路线图**，只引用过滤后的高质量笔记，不含上述噪音。

## 两个已知限制

1. **导入的树刷新就丢**。用「打开科技树」加载 JSON 是临时的；长期使用请打开生成好的独立 HTML。
2. **笔记只读**。科技树不写回 Obsidian，进度存在浏览器 localStorage，与 vault 是两套数据。

