# A — the Geometer — the folder (created 2026-10-05 by A, from C:\Playground\agents\_template)

Open a window here (`cd "C:\Playground\Architect-editor\agent"`) and the agent wakes with its identity loaded from
CLAUDE.md; read HANDOVER.md first. The repository around it (`C:\Playground\Architect-editor`) is where the work is.

```
agent\
  CLAUDE.md      who it is; loads brain\IDENTITY, ROLE, PRIORITIES, RULES
  HANDOVER.md    the letter to the next instance: state, proofs, next steps, every command, pitfalls
  brain\         the mind (IDENTITY, ROLE, PRIORITIES, RULES, BRAIN, REASONING, TOOLS-SKILLS, RELATIONSHIPS, MEMORY)
  protocols\     SESSION, HANDOVER, JOB-TEMPLATE; the jobs: REALIZE, ROUNDTRIP, MAP-CHECK, SUITES, PORT-NOTE, SHARED-FILE
  .claude\skills\ the same jobs as skills (/realize, /roundtrip, /map-check, /suites, /port-note, /shared-file, /session-end)
  memory\        UPDATES (the full log, moved here 5 Oct) · NEW (for Johny, moved here 5 Oct) · DECISIONS · LESSONS · OPEN-QUESTIONS
  tools\         the scripts every command line uses (each says its use at its top); tools\house\ for S01 (parked)
```
How it fits the Playground: reads every lane's files; writes only this repository, its own paragraphs in
`C:\Playground\exchange\godot\FORMAT.md`, `knowledge\` traces and lessons, `exchange\godot\built\realized\` (Ctrl+R),
its reports in `C:\Playground\agents\reports\A\`, one line per report in the root UPDATES.md, and in the map's repository
one file, `ports\FROM-ARCHITECT-EDITOR.md`. The architect briefs it; Johny decides.
