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
| the pointer | [`bookmarklets/courier.js`](../bookmarklets/courier.js) | almost never; it names one URL and decides whether to open a window |
| the body | [`run.js`](run.js) | freely: routing, panel, gate, delivery |
| the errand list | [`errands.json`](errands.json) | per errand |
| the errand script | `sites/<hostname>/courier/<id>.js` | per errand, then frozen when it closes |

**The panel names what it is connected to**, in its header: `mehrlander/web-tools@main`,
linked to this folder. That is a constant, not a setting. A courier you could
aim at another repo is a courier somebody else can aim, and the trust story here
is that the code and the errand list come from one public place you can read
before you tap. The unauthenticated allowance, 60 GitHub reads an hour against
two per run, appears beside it once it is down to ten, so a 403 arrives as a
countdown rather than as a bug. Whether it appears at all is GitHub's call: a
cross-origin reader sees only the headers the server exposes.

**Every part but the pointer is read at `main`, so a change is live when it
merges and not when it is pushed.** Tapping the bookmark from a branch gets you
whatever `main` served that minute. There is no ref switch on purpose: a
bookmark that could be aimed at a branch is a bookmark that can be aimed
anywhere.

Install the pointer once, as a bookmark whose URL is the whole file. It fetches
`run.js` and runs it. `run.js` reads `location.hostname`, finds the open errands
for that host, shows what it is about to run, and runs it on your tap.

## Where there is an interface, it is a popup, and only the pointer can open one

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

## On our own pages it opens nothing and takes you there

On `mehrlander.github.io` the pointer opens no window and passes `home` true.
With one errand open, `run.js` sets `location.href` to it and stops: no popup,
no panel, nothing to read and nothing to dismiss. Reading about the errand was
never the point; standing on its page is. With more than one open there is no
single place to go, so the list is the answer after all and the in-page panel
carries it.

**`home` is a separate argument rather than `w === null`**, and that distinction
is the whole safety of this. A blocked popup on somebody else's page arrives as
`w === null` too, and navigating a page you were reading is the one thing a
bookmarklet must not do. So the tab is only ever taken on pages that are ours.

## Anywhere else, every page is the directory

A host with no open errand does not dead-end. The panel becomes the same form
over **every** open errand, with each one's host beside its title, and the verb
becomes Open that page. So the courier answers "what is waiting, and where do I
go" from anywhere, and there is no separate helper page to remember to visit.

The one thing a page on the Web Tools origin could add is **results already
landed**, since it holds the token that reads the private results folder and the
courier deliberately holds none. That is a status view rather than a directory,
and it is not built.

**The bookmark is a pointer on purpose, and the trade is worth naming.** The
mechanism lived in the bookmark first, which put the confirm gate beyond this
repo's reach: no commit could remove the step that shows you a script before it
runs. Moving it out makes every part revisable without a reinstall, and moves
the trust anchor from "this bookmark's own code" to "whatever
`mehrlander/web-tools` main serves at `courier/run.js`". That is a smaller
guarantee, stated rather than quietly lost, and it buys two things: reinstalling
becomes rare rather than routine, and the mechanism becomes readable source
instead of the single line a bookmarklet is obliged to be.

**Rare is not never, and the reinstalls are predictable.** The pointer has to
change when a decision must be made before the first `await`, since that is the
only ground it holds alone. Two are made there today: whether to open a window,
and what to pass in. Everything after the fetch belongs in `run.js`.

It adds no new capability requirement. `run.js` reaches the page through
`new Function`, which is how an errand script already ran, so a page whose
Content-Security-Policy would refuse the loader would have refused the errand
too.

## An errand

**The panel is a form over this record, and shows all of it**: a radio per open
errand, then `url`, `script`, `result`, `for` and `opened` as labelled rows for
whichever is selected. The picker is drawn for a single errand too, because
hiding the choice when there is one leaves a reader unable to tell whether there
could be more. Adding a field here means adding a row to `FIELDS` in `run.js`.

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
content prefilled, on your signed-in session, and you tap Commit changes there.
The 7,500-character prefill limit is known before the tap rather than after it,
so past that Commit arrives disabled and reading Too long to commit, with the
count in the header and Copy the route. Neither route needs a token in the
bookmark.

**Nothing tells the courier the result landed.** The errand stays `open` until
someone edits `errands.json`, which is the session's job on reading the result,
not yours. Closing that loop from the browser would need a token to check the
private results folder, and the courier holds none by design.

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
