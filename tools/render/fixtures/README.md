# tools/render/fixtures/

Captured GitHub API responses, so a `--script` render can exercise a page's real
network path instead of stubbing over it.

The sandbox cannot reach `api.github.com` (the render harness resolves own-code
contents calls to local files and everything else fails) and holds no token, so
a page that reads the API had to be tested by replacing its own methods. That
tests the page below the call and asserts nothing about the call itself: the
response shape was whatever the test author imagined.

These files are the real thing instead. A `--script` routes the API URL to the
fixture with `page.route`, which registers after the harness's catch-all and so
takes precedence, and the page's own `gh.repos()` / `gh.req()` / `fetch` chain
runs unmodified. What stays unverified is the wire and the token, which no
sandbox test can cover.

| File | What it is | Captured |
|---|---|---|
| `user-repos.json` | `GET /user/repos?sort=updated&per_page=100`, the listing behind `gh.repos()`. Trimmed to the fields the code reads plus `visibility`/`archived`/`pushed_at` for realism. | 2026-07-30, via the session's repo-listing tool |
| `tree-web-tools.json` | `GET /repos/mehrlander/web-tools/git/trees/HEAD?recursive=1`, the call behind `pathPicker.loadRepo()`. Generated from `git ls-tree -r -t HEAD` in this repo, which is the same shape the API returns. | 2026-07-30, from the working tree |

Re-capture when a shape question comes up, not on a schedule: a fixture that
drifts in irrelevant ways is churn, and these are shape tests, not data tests.

Two things the first run of this turned up, both invisible while the page's own
methods were being stubbed:

- **`gh.repos()` has two endpoints, and which one fires depends on the token.**
  `/user/repos` when authenticated, `/users/<owner>/repos` when not. The sandbox
  holds no token, so it is the public one that fires here, and a route matching
  only the authenticated form came back 404 and left the picker on its
  one-repo fallback. It also means a token-less viewer gets a PUBLIC listing,
  which is a narrower list than "every repo you can see".
- **One tree fixture answers every tree call.** A consuming script should
  therefore descend into the repo the fixture came from, or the rows on screen
  belong to one repo while the crumb names another.
