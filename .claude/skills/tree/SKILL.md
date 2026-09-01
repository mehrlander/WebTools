---
name: tree
description: >-
  Render a repository file tree in chat as a linked markdown table: folders
  and files as tappable GitHub blob/tree links, depth carried by an inline
  code-span connector prefix (the classic box art) or by invisible braille
  indentation, filetype icons as anchors, an optional gloss column. Table-
  first because nested bullets balloon vertically on mobile. Use when the
  user says "tree", "show the repo structure", "file tree", "map the repo",
  "lay out the folders", "/tree", or names a subtree/depth to render.
  Answers "what is here" (structure); the caption skill answers "what
  moved" (change).
---

# tree

An orientation view: the shape of a repo or a subtree, rendered for a chat
reader on a phone. It is the structural sibling of the `caption` skill. The
boundary, worth stating so the two do not drift:

- **caption** answers *what moved* this session (axis: the git diff;
  `[new]/[main]/[diff]` links, render lines).
- **tree** answers *what is here* (axis: the filesystem; folders and files
  as links, depth shown visually).

They share DNA (tappable GitHub links at a ref) but answer different
questions. When the ask is about change, use `caption`; about structure,
use this.

Substitute the current repo into all URL templates. The rendering rules
below are the applied form of [`docs/markdown-in-chat.md`](../../../docs/markdown-in-chat.md);
read that for *why* tables beat bullets and which characters survive a
table cell.

## The generator

Hand-building nested links with correct blob/tree URLs is exactly the
tedious, error-prone work to script. [`scripts/build-tree.py`](../../../scripts/build-tree.py)
(python3 stdlib, argv-parameterized, raw-URL fetchable) emits the table.
It produces structure, links, and icons; it leaves the gloss column empty,
because a one-line "what this is" needs judgement the walker lacks (same
split as `build-board.py`: the tool rolls up, the human writes the prose).

```
python3 scripts/build-tree.py <root> [--repo owner/repo] [--ref REF]
    [--depth N] [--mode codespan|braille|ascii] [--all]
    [--ignore GLOB] [--gloss] [--indent N]
```

Defaults: `--mode codespan`, `--ref main`, repo inferred from
`git remote get-url origin`, tracked files only (`git ls-files`),
`.git`/`node_modules`/`dist` always pruned, depth unlimited. Fetch it in
another repo from
`https://raw.githubusercontent.com/mehrlander/web-tools/main/scripts/build-tree.py`.

The flow: run the script for the skeleton (the skill passes `--depth 1` for
the bare view), then append the curated **Major folders** block below it
(next section). The gloss column is a separate, per-row option; for a plain
subtree with neither block nor gloss, the raw output is the deliverable.

## Parameterization

Bare `/tree` renders a **dense default**: the repo root as the table
header, its top level one deep, and a curated **Major folders** block
beneath (see below). Depth is opt-in from there; ask to go deeper.
Free-form arguments refine it; interpret them into these dimensions (same
preset-plus-free-form model as `caption`'s sizes):

| Dimension | Bare default | Example phrasing |
|---|---|---|
| scope | repo root | "tree of `lib`", "the pages folder" |
| depth | 1 (top level) | "depth 3", "expand", "go deeper", "all the way down" |
| filter | tracked, noise pruned | "only markdown", "include untracked" |
| mode | codespan | "braille", "as ascii", "pasteable" |
| ref | main | "on my branch", "at `<sha>`" |
| major | on | "just the tree", "skip the notes" |
| gloss | off | "annotate it", "with a note per folder" |

## The two recorded formats

The root is the table **header**: the repo (or subtree) name, linked, no
folder icon and no literal "Tree" label. A header cell renders bold and
still holds a link, so the reader stands in that folder with its contents
listed below. Everything under it is one node per table row, filetype icon
as the color anchor, name linked to its GitHub blob (files) or tree
(folders) URL. The two formats differ only in how depth is drawn: codespan
keeps the box-art rail, so the first level hangs off the header the way a
classic `tree` hangs off its root; braille indents it one step.

### A. codespan (default) — box art in an inline code span

The connector prefix (`├─ │ └─`, the exact string `tree` already emits)
goes inside backticks. A code span preserves its whitespace and renders
monospace, so the rails align column-to-column and the corner art survives
the cell trim; the icon and link sit outside the span, so they stay
tappable. This is the most capable format: full box art, perfect
alignment, links, icons, optional gloss.

| [.claude](https://github.com/mehrlander/web-tools/tree/main/.claude) | What it is |
|---|---|
| `├─ `📁 [hooks](https://github.com/mehrlander/web-tools/tree/main/.claude/hooks) | commit + session hooks |
| `│  └─ `📄 [build-on-commit.sh](https://github.com/mehrlander/web-tools/blob/main/.claude/hooks/build-on-commit.sh) | regenerates derived files |
| `└─ `📁 [skills](https://github.com/mehrlander/web-tools/tree/main/.claude/skills) | the portable bag |
| `   └─ `📁 [markers](https://github.com/mehrlander/web-tools/tree/main/.claude/skills/markers) | the status system |

### B. braille — invisible indent + icons

No connectors: depth is pure indentation built from the braille blank
(U+2800), which survives the cell trim where ASCII space, nbsp, and tab do
not. The icon carries the folder-vs-file signal. Cleaner and quieter than
box art; best for shallow trees where the eye does not need a rail to peg
depth.

| [.claude](https://github.com/mehrlander/web-tools/tree/main/.claude) |
|---|
| ⠀⠀⠀📁 [skills](https://github.com/mehrlander/web-tools/tree/main/.claude/skills) |
| ⠀⠀⠀⠀⠀⠀📁 [markers](https://github.com/mehrlander/web-tools/tree/main/.claude/skills/markers) |
| ⠀⠀⠀⠀⠀⠀⠀⠀⠀📄 [SKILL.md](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/markers/SKILL.md) |

Pick A when depth or alignment matters, or a gloss column is wanted; pick B
for a quiet, shallow orientation view. When unsure, A is the default.

## The Major folders block

The dense default closes with a short curated block naming the folders
worth knowing, appended as rows in the **same** table (a second table would
spend the vertical margin a table exists to avoid). It is the judged tier:
the script emits the tree, this block is authored from what the tree shows.

Form: a `🧳 **Major folders**` header row, then one row per folder as
`**[name](url)** › Headline`. The chevron reads as "leads to"; the bold
name is its own left anchor, so no bullet is needed.

The note describes **structure, not content**: the shape of the subtree
(`One Folder Per Skill`, `Flat, Two Shell Scripts`), not what the folder is
for. Structure is exactly what a depth-1 view stops short of showing, and
it sits nearer the deterministic tier, so it is harder to get wrong than a
content judgement. Content, the "what it is for," goes in the gloss column
when a caller wants it.

Curate, do not enumerate: name the few folders that orient a newcomer, cite
one anywhere in the tree (not only the top level), and drop the block when
the tree is small enough to read whole or the caller asks for the bare
tree.

| [.claude](https://github.com/mehrlander/web-tools/tree/main/.claude) |
|---|
| `├─ `📁 [hooks](https://github.com/mehrlander/web-tools/tree/main/.claude/hooks) |
| `├─ `📁 [skills](https://github.com/mehrlander/web-tools/tree/main/.claude/skills) |
| `└─ `⚙️ [settings.json](https://github.com/mehrlander/web-tools/blob/main/.claude/settings.json) |
| 🧳 **Major folders** |
| **[hooks](https://github.com/mehrlander/web-tools/tree/main/.claude/hooks)** › Two Shell Scripts, Flat |
| **[skills](https://github.com/mehrlander/web-tools/tree/main/.claude/skills)** › One Folder Per Skill |

The `└─ ` last row separates cleanly from the `🧳` header below; the note
rows carry no connector, so they read as a distinct block, not tree nodes.

## The fallback: ascii code block

`--mode ascii` emits a plain fenced code block: aligned box art, no links.
For when links are noise, or the reader wants something pasteable into a
terminal or another editor. It is a fallback, not a default, because it
drops the navigation that is the point of rendering in chat.

## Rendering rules (why this shape)

These are load-bearing, established empirically (full account in
[`docs/markdown-in-chat.md`](../../../docs/markdown-in-chat.md)):

- **Never nested bullets.** Chat renders each list item with paragraph
  margin, and nesting compounds it, so a deep bullet tree is mostly
  whitespace on a phone. Tables (and code blocks) render vertically tight.
- **A table cell trims leading whitespace,** including ASCII space, nbsp
  (U+00A0), and tab, and collapses internal runs of spaces. So depth can
  never ride on plain indentation; it needs a surviving character.
- **What survives as a leading indent:** a visible glyph (the `│` rail, an
  icon), a code span (its whitespace is preserved), or the braille blank
  U+2800 (a printable non-space).
- **A code span cannot hold a link,** so the structure prefix goes in
  backticks and the name/icon stay outside it.

## Icon legend

Folders 📁; markdown/text/other 📄; python 🐍; js/ts 📜; html 🌐; css 🎨;
json/toml/yaml/sh/config ⚙️; images 🖼️. The map lives in
`build-tree.py`; extend it there, not per-render.

## Boundary with caption and web-tools

This skill owns structure rendering. `caption` owns change surfacing
(`[new]/[main]/[diff]`, render lines) and `web-tools` owns the conventions
(PR bodies, the merge guide). A tree is not a caption: it carries no change
state and no diff links. If the ask is "what did I touch," route to
`caption`; a tree that also marks change is a deliberate combined view,
not the default.
