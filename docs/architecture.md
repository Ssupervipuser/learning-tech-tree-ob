# Architecture

## Source and generated pages

`data/*.json` is the public curriculum source of truth. `src/template.html`, `src/style.css`, `src/engine.cjs` and `src/app.js` define the generic viewer. `scripts/build.mjs` embeds those files with one tree into standalone HTML. Generated pages need no package runtime, CDN, fetch request or web server.

`index.html` loads the CS example. `examples/*.html` provides standalone examples. The example selector navigates between these generated pages; opening a local custom JSON mounts it in the current viewer.

## Engine

The engine exports structural validation, progress parsing, hard-prerequisite closures and layout. Layout uses both hard and development/application edges to keep all arrows directed toward the right. Lock status uses only hard prerequisites.

Progress parsing requires the same tree ID. The current tree's node IDs filter restored entries. User content is rendered as text; source URLs must use HTTP or HTTPS. Tree data is escaped before it is embedded in HTML.

## Viewer lifecycle

Opening a custom definition validates it before replacing the existing tree. Each mounted viewer owns its layout, selection, progress and rendering state. Its resize observer, keyboard handler, wheel guard, animation frame and pending notification are cleaned up when replacing it. Event-property handlers are replaced on mount.

The browser validator is structural protection for opened data. It does not establish academic correctness. The authoring CLI uses the same validator unless `--skip-validation` is explicitly requested.

## Storage and publication

Only public definitions and generic code belong in the repository. Progress lives in browser storage and user-exported backups. The project does not create or publish repositories. GitHub Pages can serve the checked-in standalone HTML directly.
