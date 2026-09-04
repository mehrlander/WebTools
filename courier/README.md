# courier

A deferred read **from a page**, run by you in the browser you already have.

The mailbox is a deferred read from a repo, answered on load by a browser
holding your token. Proposals are a deferred write to a repo, answered on your
confirm. `ask` is a deferred read from you. The courier is the fourth: a read
from a **web page a session cannot reach**, answered when you visit that page
and tap one bookmark.

## Why it works where a background fetch does not

CORS is the **server's** decision. A page on `mehrlander.github.io` cannot read
`wsldocs.sos.wa.gov`, because that host sends no
`Access-Control-Allow-Origin`. Nothing in the app can fix that, and a mailbox
kind that fetched arbitrary URLs would hit the same wall while giving up the
property that makes the existing kinds safe to auto-fulfil.

Turn the request around and the wall is not there:

| Direction | Verdict |
| --- | --- |
| Web Tools page reads a state website | blocked, no `Access-Control-Allow-Origin` |
| script **on** the state website reads its own host | same-origin, nothing to refuse |
| script on the state website reads `api.github.com` | allowed, that host sends `*` |

So the courier runs **on the target page**. Its own code and its errand list
come from `api.github.com`, which answers any origin. Not the raw CDN: it caches
five minutes at the edge and `cache: no-store` defeats only the browser's copy,
so an errand added a moment ago could be invisible. The API answers current, at
the cost of the unauthenticated rate limit, 60 an hour per address, which is
about twenty courier runs. A 403 says which it was. Two things follow that no
other route here gets:

- **Cloudflare is already satisfied.** You cleared the interstitial by
  navigating like a person, so a same-origin `fetch()` from the errand script
  carries the clearance cookie. A sandboxed session gets a 403.
- **No token is anywhere near it.** The errand list is public, the script is
  public, and the result travels by clipboard or by a prefilled GitHub form you
  submit while signed in. Nothing stores a credential on a third-party origin,
  which is the failure this design is built to avoid: a bookmarklet's code runs
  inside the visited page's JavaScript context, so a hostile page could shim
  `fetch` and read an Authorization header straight off it.

## The parts

| Part | Where | Changes |
| --- | --- | --- |
| the pointer | [`bookmarklets/courier.js`](../bookmarklets/courier.js) | never; it opens the window and names one URL |
| the body | [`run.js`](run.js) | freely: routing, panel, gate, delivery |
| the errand list | [`errands.json`](errands.json) | per errand |
| the errand script | `sites/<hostname>/courier/<id>.js` | per errand, then frozen when it closes |

Install the pointer once, as a bookmark whose URL is the whole file. It opens a
window, fetches `run.js` and runs it. `run.js` reads `location.hostname`, finds
the open errands for that host, shows what it is about to run in that window,
and runs it on your tap.

## The interface is a popup, and the pointer has to open it

A panel injected into somebody else's document loses fights it should not be in:
a host stylesheet, a focus trap, `overflow:hidden` on `html`, `position:fixed`
behaving oddly inside a transformed ancestor. Shadow DOM answers the styling
half and none of the rest. A separate window answers all of it, and this repo
already runs that pattern in
[`bookmarklets/popup-launcher.js`](../bookmarklets/popup-launcher.js) and
[`popups/`](../popups).

**The window is opened by the pointer, synchronously, before its first `await`.**
That is not a style choice. A popup is permitted only while the user-gesture
token is live, and the first `await` spends it; by the time `run.js` has been
fetched the gesture is gone. So the one thing the pointer does besides naming a
URL is open the window, because it is the only place in the chain that still
can. A test that fires the bookmarklet with `evaluate()` rather than a real
click will not notice this, and will pass on code that fails in a browser.

**A window opened with an empty URL inherits the opener's origin**, so `run.js`
can script its document and `window.opener` survives. That gives the split the
design needs: the errand script keeps running in the **host page**, where the
DOM it must read actually is, and only the interface moves. Running the script
inside the popup would hand it a blank document.

**If the popup was blocked**, `w` arrives as null and a plain in-page panel runs
instead: a shadow root, no scrim animation, the same markup and wiring. It is
the fallback rather than the design, so it is kept simple deliberately.

**The bookmark is a pointer on purpose, and the trade is worth naming.** The
mechanism lived in the bookmark first, which put the confirm gate beyond this
repo's reach: no commit could remove the step that shows you a script before it
runs. Moving it out makes every part revisable without a reinstall, and moves
the trust anchor from "this bookmark's own code" to "whatever
`mehrlander/web-tools` main serves at `courier/run.js`". That is a smaller
guarantee, stated rather than quietly lost, and it buys two things: you install
once and never again, and the mechanism becomes readable source instead of the
single line a bookmarklet is obliged to be.

It adds no new capability requirement. `run.js` reaches the page through
`new Function`, which is how an errand script already ran, so a page whose
Content-Security-Policy would refuse the loader would have refused the errand
too.

## An errand

```json
{
  "id": "wsl-drs-cafr-index",
  "host": "wsldocs.sos.wa.gov",
  "status": "open",
  "opened": "2026-09-04",
  "title": "shown as the panel heading",
  "note": "one or two sentences: what it collects and why the session cannot",
  "url": "where you go to run it",
  "script": "sites/<hostname>/courier/<id>.js",
  "result": { "repo": "owner/repo", "branch": "main", "path": "courier/results/<id>.md" },
  "for": "who is waiting on it"
}
```

`host` is matched against `location.hostname` exactly, with no normalisation, so
`www.example.com` and `example.com` are different errands. `status` is `open`
until the result lands, then `done`. Close an errand by setting it rather than
deleting the record, so the list stays a history of what was asked.

## An errand script

The body of a function called with one argument, `ctx` (`{errand}`), returning a
string or a promise of one. It **reads and returns**: it does not navigate,
submit a form, or write. That is a rule about what belongs here rather than a
sandbox, since the script has the page's full authority while it runs; the
protection is that you read it in the panel before it runs, which is the
Proposals rule ("show the bytes, not a description of them") applied to code.

Two habits earn their place. Report the shape of what was found, not only the
findings, since the caller cannot see the page: the DRS script returns a count
of links per host, which is what decides whether the session can fetch the
documents itself. And **make an empty result diagnostic**: a page that yields
nothing should say how many anchors and frames it had, so "the links are built
after load" and "the links are in a child document" arrive as answers rather
than as silence.

## Getting the result back

The panel offers Copy and Commit. Commit opens GitHub's new-file form with the
content prefilled, on your signed-in session, and you tap Commit changes; the
courier refuses past 7,500 characters, where the prefill gets unreliable, and
tells you to copy instead. Neither route needs a token in the bookmark.

## What it is not for

A page you can read from a session already. A file behind a login you would not
otherwise open. Anything where the honest answer is to download it and hand it
over, which for a few large binaries is faster than any mechanism here: a
result travels as text through a form, so bulk PDFs want the Stage's upload
intake instead.

## Testing an errand before it ships

The sandbox browser cannot reach external hosts, so both halves are exercised
against a fixture with the `api.github.com` reads routed to the local
checkout. That tests the real fetch path rather than stubbing it out of the code
under test. Run the errand script alone first, then the courier end to end.
