# App source snapshots (private backup)
Saved 2026-10-20 per Amber's rule: tabletrepo is the save location. Source only —
`node_modules`, `dist`, `.git`, build outputs and APKs excluded. Secret-scanned before commit (no keys, no .env files).

- `tablet-build/` — the Sunday add-day build + Editions Layer v1.
  Origin: local clone `off-script-life-os-tablet-build`, branch `tablet/sunday-add-day`, through commit 40e73ac (editions layer).
  Contains: logo login screen, consent toggles (default OFF), Gemini chat, Field Wall, voice calling, I-Spy, and the Q4 2026 editions endpoints in server.ts.
- `intent-branch/` — The Intent, bespoke intelligence layers 1–5.
  Origin: local clone `off-script-life-os`, branch `intent/bespoke-intelligence`, commit 0fc3334. Torque-approved design; NOT merged anywhere — this is a backup copy only.
