# SHARED-FILE — writing into a file other lanes write too   (`/shared-file`)

Files: `C:\Playground\exchange\godot\FORMAT.md` (LF), `C:\Playground\knowledge\…`, `C:\Playground\agents\…`, the root
`C:\Playground\UPDATES.md`.

1. List the folder and read the file now (another lane may have written in the last minute; a Write that says "updated"
   replaced something).
2. Write the new text into a file of its own and the anchor into another; then
   `python C:\Playground\Architect-editor\agent\tools\patch_shared.py <file> <anchor file> <text file> before|after|replace`
   (exact-once anchor, line ends kept, no control characters; it refuses when anything is off).
3. Never a shell here-document (it turned `\f` and `\r` in Windows paths into control characters once), never a
   whole-file rewrite, never another lane's rows: my paragraphs are additive and say "(A, <date>)".
4. Read the result back (the lines around the anchor) and say in the report what changed.
