# Tree data format

The canonical public format is `learning-tech-tree/v1`. See [the JSON Schema](../schema/tree.schema.json) and the definitions under [`data/`](../data).

## Top-level fields

| Field | Meaning |
|---|---|
| `format` | Exactly `learning-tech-tree/v1` |
| `id` | Stable unique tree ID; scopes browser progress and backup identity |
| `title`, `subtitle`, `description` | Public presentation text; no personal data by default |
| `language` | HTML content-language hint; does not translate the fixed viewer interface |
| `education` | Optional descriptive path/duration/note; not used as a completion gate |
| `stages` | Any nonempty ordered list of stage labels; no fixed subject, sequence or duration |
| `branches` | Arbitrary tracks with stable `id`, `label`, optional `en`, and six-digit hex `color` |
| `sources` | Public source IDs, titles, HTTP(S) URLs or empty strings, and honest evidence `scope` |
| `nodes` | Capability definitions; 2–2500 per tree in the current viewer |
| `applicationEdges` | Directed non-gating development/application edges |
| `startId`, `endId` | One declared entry and goal, referring to nodes |

Stable IDs use ASCII letters, digits, `_` and `-`, start with a letter, and have at most 96 characters. Avoid JavaScript built-in property names such as `constructor` and `toString`. Human-readable labels may use Unicode.

## Node fields

Each node has `id`, `name`, `branch`, `stage`, `kind`, `prereqIds`, `relatedIds`, `description`, `outcome`, `caution`, `sourceIds`. `stage` is a zero-based integer into `stages`.

- `kind`: `core`, `optional`, or `milestone`. This is a display/authoring label, not an institutional requirement.
- `prereqIds`: hard prerequisites, all required for the stated scope. A completed node is still a self-assessment; the application does not automatically complete its prerequisites.
- `relatedIds`: recommended background. These links do not lock a node, affect layout or satisfy start/end connectivity.
- `outcome`: an observable task, proof, work product, analysis or practice record that can demonstrate understanding.
- `sourceIds`: references into `sources`; distinguish public evidence from independently authored educational design.

Personal `notes`, `completedOn`, completion dates and identities do not belong in public definitions. They are not used to build examples.

## Application edges

```json
{
  "source": "selected_tool",
  "target": "research_artifact",
  "relation": "application",
  "reason": "If selected for this study, this tool produces evidence for the artifact."
}
```

`relation` is `development` or `application`. These are dashed directed edges with a concrete reason. They express a learning continuation or actual use, not a compulsory prerequisite. An output node can gather alternative methods without turning them into an AND gate.

All solid and dashed edges together must form a DAG. Every node must be reachable from `startId` and able to reach `endId`. The start has no incoming edges; the end has no outgoing edges. Do not add meaningless arrows simply to satisfy the validator.

## Progress is a separate format

```json
{
  "format": "learning-tech-progress/v1",
  "treeId": "my-tree",
  "completed": {"some_node": true},
  "notes": {"some_node": "Private evidence or learning notes"}
}
```

Progress is stored under `learning-tech-tree:progress:<tree-id>`. A backup with a different tree ID is rejected. Unknown node IDs are ignored when restoring a matching-tree backup. Restore replaces current completion and notes for that tree. The application does not upload backups.

Keep IDs stable across revisions. Changing a tree ID starts a separate progress record; changing a node ID disconnects its old self-assessment. Files and HTTP pages can have different browser-storage origins, so export a backup before moving between them.
