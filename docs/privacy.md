# Privacy and public examples

The public package contains independently authored, non-personal examples. It does not include a real learner's academic history, advisor, school affiliation, fixed personal program, local file paths, notes or progress.

## Application behavior

- Public tree data is embedded in standalone HTML or read from a JSON file selected by the user.
- Notes and progress remain in browser local storage, separated by tree ID.
- Exported tree definitions contain curriculum data; progress backups contain private self-assessment and notes. Keep the two file types separate.
- The application has no backend, account system, telemetry code, remote model request or data-sync service.
- It does not encrypt browser storage. Other software or pages with the same origin may be able to access it; do not store credentials or confidential research in learning notes.
- Clearing browser data can remove progress. Moving from a file to a hosted origin, changing browser profiles or using another device may not share storage; export and restore a backup.
- Clicking a source link visits an external website. If hosted online, the hosting provider has its own logging and privacy rules. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## Before adding a public example

Use fictional or generic profiles unless disclosure is explicitly intended and authorized. Omit identities, student IDs, real advisors, private correspondence, credentials, raw progress, personal notes, unpublished work and private machine paths. Public source titles and public institutional requirements can be cited when relevant, without implying the learner belongs to that institution.

The `.gitignore` helps avoid common private files, but it does not redact tracked files or authorize disclosure. Inspect your own intended publication scope. The included validator rejects personal progress fields on public nodes; it cannot detect every form of sensitive free text.
