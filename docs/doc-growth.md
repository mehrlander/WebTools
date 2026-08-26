# Doc growth

[⭐ Doc Growth](https://mehrlander.github.io/web-tools/pages/doc-growth.html)

A Gapminder-style animated bubble chart of a repository's markdown over time.
Every file is a bubble: **x** is its length in words on a log scale, bubble area
is lifetime edit count, and the play control sweeps the whole history week by
week. **y** answers one of three questions:

| Mode | y is | Reads |
| --- | --- | --- |
| Effort | edits per month | up is actively worked |
| Net change | words gained that week | the zero line, and how little crosses below it |
| Settled | days since last touched | up is a monument, down is contested |

Settled is the thinnest of the three at the newest frame, since an active repo
has touched most of its files inside one sample and they pile on the zero line.
That is the honest reading, not a defect, and the mode earns its place two ways:
the few bubbles that float clear are the large documents nobody is maintaining,
which neither other mode surfaces, and under playback a file climbs as it goes
quiet and drops the moment it is edited. It is derived from the churn array
rather than carried in the payload, since it is the same fact counted backwards. [`scripts/doc-growth.py`](../scripts/doc-growth.py) produces the
payload; [`pages/doc-growth.html`](../pages/doc-growth.html) reads it.

It exists because documentation length is easy to worry about and hard to see.
The first run against this repo answered the worry: of the 60 markdown files
edited in five or more commits, the great majority end larger than they started,
and `docs/show-repo.md` alone went from 5,279 words to 28,397 across 181 commits.

## Pointing it at a repository

```bash
python3 scripts/doc-growth.py <clone> -o data/doc-growth/<name>.json --name owner/repo
```

`--days` changes the sampling interval, `--ext` the file type, and `--min-edits`
drops files below an edit count. That last one matters on a repo carrying
generated markdown: `mehrlander/home` has 4,314 markdown files but 2,907 of them
were committed once and never revised, so `--min-edits 2` cuts the payload from
2.1 MB to 679 KB and removes nothing anyone would look at.

The page takes its data three ways, cheapest first: `#gz=<payload>` inline,
`?url=<address>`, or `?src=owner/repo[@ref]:path` read through the viewer's
stored `ghToken`, which is the only route that reaches a private repo.

**Empty frames are trimmed, and that is load-bearing.** The extractor drops
leading and trailing samples holding none of the kept files. web-tools spent its
first eleven months as a scratch repo whose whole tree was one `TestNew.txt`, so
48 of its 67 weekly frames held no markdown at all. A player that opens on one of
those shows an empty plot, which is indistinguishable from a player that never
finished loading, and that is exactly how it was first reported. The page also
opens paused on the last frame rather than autoplaying from the first, for the
same reason: the opening view should be the fullest one, not the sparsest.

**A shallow clone will quietly lie.** Claude Code web checks out shallow, so the
history looks like a week no matter how old the repo is. `git fetch --unshallow`
first, and without `--filter=blob:none`: the partial-clone filter turns every
diff into a lazy blob fetch over the network, which takes this from seconds to
longer than anyone will wait.

## Two word counts, and why

`w` counts every token; `r` skips fenced code blocks and YAML frontmatter. They
diverge exactly where the authored and mechanical halves of a corpus divide, so
a file whose two numbers are far apart is mostly table and snippet rather than
prose. The page toggles between them.

## Why it is not on the commit hook

Every commit shifts the last frame, so a hook that regenerated the payload would
make every commit touch it, and the artifact could never be byte-deterministic in
the way [`tools/README.md`](../tools/README.md#the-refresh-model) requires. It is
refreshed on demand instead, and `generated` in the payload says when. This is
also why it is neither a registry ([registries.md](registries.md): a registry
carries assertions, and this carries measurements) nor a projection of one.

## The bug worth remembering

The extractor reads blob contents through one `git cat-file --batch`. Writing the
whole request list before reading any output deadlocks as soon as the batch
outgrows a pipe buffer: git blocks writing content nobody is draining, so the
write never returns. A repo small enough to fit both sides in 64K runs clean and
hides it, which is exactly what happened here, and the failure looks like a hang
rather than an error. The request list is fed from a thread.

## In the app

Both web-tools and home promote this page as an app view through their
`.web-tools.json` manifests, and they differ only in which payload it reads:
`?app=doc-growth` opens web-tools' own, `?app=home-growth` opens home's. That
needed `pages[].query` on a promoted page, since a manifest could previously
name a page but not its subject, and the query is part of the view's identity
key so the two promotions are two entries rather than one.

The slugs differ on purpose. Slug uniqueness is not enforced across repos, and
a collision resolves to whichever entry sorts first rather than erroring.

## In the Map view

The Map view's Docs tab reads `docs/docs.csv`, whose `words` field is a
snapshot. It now reads the growth payload as a second carrier and renders that
same measure as a trend: a sparkline and a net delta per row, a delta per
folder in the rail, and the movement behind the registry's word total.

The sparkline is normalized to each file's own range rather than the
registry's, so it reports shape (grew, held, was cut) and never size. Size is
already the number beside it, and one mark cannot carry both without lying
about one of them.

**The delta is text, so it wears an ink token.** The first cut coloured the
numbers in warning and success tones at 70 to 80 percent opacity, which on a
phone in daylight washed out completely: every figure was on the page and none
of it was readable, which is worse than absent because it looks deliberate. The
dataviz rule covers this exactly (values and labels stay in primary, secondary
or muted ink; a coloured mark beside them carries identity), and the sign
already says which direction the number went. Colour lives on the sparkline,
which is a mark.

The chart itself is deliberately not in Map. It is already an app view, a peer
of Repos and Stage, so putting it in a tab as well would be a second door to
one thing. What Map adds is what the chart cannot do from its own view: the
trend in place, on the table where the question is actually asked.

The payload is optional here. It is refreshed on demand rather than by a hook,
so a missing or stale one costs the sparklines and nothing else; the tab is the
registry, and the trend is a column on it.

## Verifying it against the real CDN

`npm run shot` mirrors CDN requests from `node_modules` through
`tools/render/cdn.mjs`, and that mirror rewrites a bare `npm/alpinejs` spec to
the browser build. jsDelivr's `/combine/` route does not: it resolves through
package.json `main`, which is CommonJS for both Alpine and fflate. So this page
loaded perfectly in every headless shot while being inert in an actual browser,
and the combine URL names explicit file paths now for exactly that reason.

A page whose dependencies come from a CDN is only verified when the bytes came
from the CDN. Fetch the combine URL with `curl`, serve those bytes to a real
browser, and assert a global exists. See the `combine-serves-cjs` entry in
[SNAGS.md](SNAGS.md).

## Colors

A bubble chart is scored on the dataviz all-pairs pairlist, where only three
categorical slots clear the separation floors. So three folder groups carry hue
at a time and the rest fold into a recessive gray; the legend swaps which three.
The light-mode aqua slot sits under 3:1 contrast, which obliges relief, and the
table view and the always-on tooltip are it.
