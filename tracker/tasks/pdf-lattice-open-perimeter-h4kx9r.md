---
id: pdf-lattice-open-perimeter-h4kx9r
title: Close open table perimeters in the pdf kit's lattice
status: backlog
opened: 2026-07-25
---
# Close open table perimeters in the pdf kit's lattice

The one named gap in `lattice` as shipped in PR #294.

## The failure

Many tables omit their outer borders: interior rules divide the columns, but
nothing is drawn down the left and right edges, or across the top and
bottom. The cell walk starts from a junction taken as a top-left corner, so
where the perimeter is missing there is no corner to start from, and the
table yields nothing at all. Not a degraded result, an empty one.

This is common in government forms and is the reason a stream reading is
often the only one that works on them, which costs the cross-method control
the kit exists to provide.

## The approach

Where a ruled region is found but its perimeter does not close, take the
bounding box of the text that overlaps the discovered interior rules and use
those bounds as virtual outer edges. The interior geometry is real and stays
authoritative; only the outer boundary is inferred.

A second, related case worth handling in the same pass: a header row with a
rule above and below it but no vertical separators. The walk correctly
reports one wide cell, and the logical structure of the header is lost. The
mitigation is to project the body's column separators upward to subdivide it.

## Why it is not already done

Both fixes invent geometry that the document does not contain, which is a
different kind of claim from anything else in `lattice`. Everything the
lattice currently reports traces to a mark on the page. So the inferred
edges need to be marked as inferred in the output, and the shape of that
marking is the actual design question, not the geometry.

That question is shared with the Python side (tracker task
`document-structure-harness-4mz7wk`), which needs to express several
readings of one region with their provenance. Worth settling once, for both.

## Progress log
- 2026-07-25: Filed from PR #294 as the kit's main known gap.
