// kits/dispatch.js — mint a link that starts a new session somewhere else.
//
// The estate is full of surfaces that KNOW something and then stop: a session
// row naming the repos a session worked in, a FAB rendering a page at a ref, a
// dictation page holding words you just spoke. In every one of them the next
// move is the same, "go do something about this," and until now the only route
// was to open claude.ai/code in another tab and re-say by hand what the page
// already had on screen. This kit is the last hop, and nothing else: it turns
// facts a caller already holds into an address.
//
// It mints links. It does not open them, does not read the DOM, and has no
// opinion about what the prompt says. Callers supply `owner/repo` slugs; the
// checkout-name to slug join belongs to whoever holds the repo list (the estate
// does it in sessionFileUrl and guideRenderFor already), not here.
//
//   dispatch.code(o)      -> { url, carried, dropped }   Claude Code, new session
//   dispatch.chat(o)      -> { url, carried, dropped }   ChatGPT, new chat
//   dispatch.url(t, o)    -> the same, by target key
//   dispatch.targets      -> the row per destination, including the ones that
//                            cannot be reached and why
//   dispatch.fits(text)   -> does this prompt ride inline
//
// ── The parameters, and where they come from ───────────────────────────────
//
// Claude Code's are documented, which is the reason this kit leads with it and
// the reason it is the only target that can take a repository at all:
// code.claude.com/docs/en/web-quickstart#pre-fill-sessions names `prompt` (alias
// `q`), `prompt_url`, `repositories` (alias `repo`) and `environment`. The
// canonical spellings are used here; the aliases are read by the same endpoint
// and buy nothing.
//
// THE LINK PREFILLS AND NEVER SUBMITS. That is the documented behaviour and it
// is also the only reason this is safe to put behind a one-tap control: the
// worst a mis-tap can do is open a form. Nothing here should ever be changed to
// a target that fires on arrival without the caller saying so out loud, which
// is why the ChatGPT row below carries `submits: true` as a field rather than a
// footnote.
//
// ── The one thing that cannot travel: a branch per repo ─────────────────────
//
// `repositories` is a comma-separated list of slugs and carries no branch. The
// app-route deep link (claude://code/new) takes `repo` singular plus `branch`,
// so the two routes trade off: many repos without branches, or one repo with
// one. A session scope is routinely mixed (a live record from this repo's own
// store: shortcut-tools and web-tools-private on a feature branch, web-tools on
// main), so the multi-repo case is the common one and the branch is the thing
// that gets left behind.
//
// It is left behind LOUDLY. `dropped` names every input that could not ride,
// and the caller is expected to say so rather than let a reader assume the
// branch went with it. A silently narrowed scope is the failure this whole kit
// exists to remove, so reintroducing it one field down would be the worst
// possible bug to ship here.
//
// Whether `branch` is honoured on the https route at all is UNVERIFIED. It is
// documented for the app deep link and absent from the web table, and https
// links open the app when it is installed, so a single-repo link carrying it
// may be honoured on a phone and ignored in a browser. It is emitted for the
// single-repo case on that reasoning: an ignored parameter costs nothing, and a
// missing one cannot be honoured anywhere.
//
// ── The size ceiling, chosen rather than measured ──────────────────────────
//
// A prompt over PROMPT_MAX does not ride in the query string. The number is a
// judgement, and saying which kind of number it is matters more than the digit:
// the one PUBLISHED truncation point is ~14,000 characters, and that is
// documented for Claude Desktop's `q`, not for the web `prompt`. Nothing states
// the web ceiling.
//
// 6,000 leaves room for the encoding rather than for the text. Percent-encoding
// prose runs well over one byte per character once newlines, quotes and any
// non-ASCII are in it, so 6,000 characters of spoken notes can reach 9-10K
// encoded and still sit under the only ceiling anyone has written down.
//
// To replace the guess with a measurement, send a prompt of known length
// carrying position markers and read off where it cut. Until someone does,
// this stays a conservative default and says so.
//
// ── prompt_url, and why nothing here reaches for it ────────────────────────
//
// The documented escape hatch for a long prompt is `prompt_url`, a URL the
// composer fetches, which must allow cross-origin requests. raw.githubusercontent,
// jsDelivr, this repo's Pages origin and gist.githubusercontent all send
// `access-control-allow-origin: *`, so the mechanism works.
//
// This kit will PASS one through and will never MINT one, and the division is
// deliberate. A private repo has no CORS-open raw URL (its raw links carry a
// short-lived token and expire), so minting one from private material means
// publishing that material to an unlisted gist, which is world-readable to
// anyone holding the address. That is a disclosure decision and it belongs to a
// caller that can put it in front of a person, never to a link minter.
//
// The pressure to reach for it is also lower than it looks. Claude Code CLONES
// the repository, so a prompt aimed there wants ADDRESSES, not content: a path,
// a ref, a selector, a line range, and the session fetches the rest with
// credentials the link never had. Carrying a payload is the CHAT case, where
// there is no repo access, and the chat targets have no prompt_url at all.
(() => {
  const CODE_BASE = 'https://claude.ai/code';
  const CHAT_BASE = 'https://chatgpt.com/';

  // See "The size ceiling" above. Chosen, not measured.
  const PROMPT_MAX = 6000;

  // One row per destination. A UI renders these rather than hard-coding a list,
  // so a destination that cannot be reached is still SOMETHING on screen with a
  // reason attached, the way the estate dims a session that names no id instead
  // of dropping the row.
  //
  // Gemini is here and unreachable on purpose. gemini.google.com accepts no
  // prompt parameter, which is why browser extensions exist to fake one, and AI
  // Studio takes `model` and `grounding` but not a prompt. Recording that here
  // is worth more than omitting the row: a later session asking "why is there no
  // Gemini button" gets the answer instead of re-running the search.
  const TARGETS = [
    {
      key: 'code',
      label: 'Claude Code',
      hint: 'New cloud session, repositories preselected',
      icon: 'ph-terminal-window',
      available: true,
      submits: false,
      takesRepos: true,
      promptMax: PROMPT_MAX,
    },
    {
      key: 'chat',
      label: 'ChatGPT',
      hint: 'New chat. Sends on arrival.',
      icon: 'ph-chat-circle-dots',
      available: true,
      // Reported to submit rather than prefill, which is why a caller offering
      // it owes the reader that word before the tap. Unverified here; the
      // observation is second-hand and no OpenAI document states it.
      submits: true,
      takesRepos: false,
      promptMax: PROMPT_MAX,
    },
    {
      key: 'gemini',
      label: 'Gemini',
      hint: 'No URL parameter exists. Copy and paste instead.',
      icon: 'ph-sparkle',
      available: false,
      reason: 'gemini.google.com accepts no prompt parameter, and AI Studio '
            + 'takes only model and grounding.',
      submits: false,
      takesRepos: false,
      promptMax: 0,
    },
  ];

  const str = (v) => (typeof v === 'string' ? v : '');
  const trimmed = (v) => str(v).trim();

  // Slugs, normalized and deduped in the order given. A caller handing over a
  // bare checkout name has not done its join yet, and passing that through
  // would build a link that silently preselects nothing, so it is dropped and
  // named rather than emitted.
  const slugs = (repos, dropped) => {
    const out = [];
    for (const r of (Array.isArray(repos) ? repos : [repos])) {
      const s = trimmed(typeof r === 'string' ? r : (r && r.slug));
      if (!s) continue;
      if (!/^[\w.-]+\/[\w.-]+$/.test(s)) { dropped.push('repo "' + s + '" is not owner/repo'); continue; }
      if (!out.includes(s)) out.push(s);
    }
    return out;
  };

  const fits = (text) => trimmed(text).length <= PROMPT_MAX;

  // A new Claude Code session, prefilled.
  //
  // o: { prompt, promptUrl, repos, branch, environment }
  //
  // `carried` and `dropped` are the whole reason this returns an object. A
  // caller that wants only the address takes `.url`, but it cannot do so
  // without having had the losses in hand first.
  const code = (o) => {
    const opt = o || {};
    const dropped = [];
    const carried = [];
    const q = new URLSearchParams();

    const prompt = trimmed(opt.prompt);
    const promptUrl = trimmed(opt.promptUrl);
    if (prompt && prompt.length > PROMPT_MAX) {
      // Not truncated. A prompt cut at a character boundary reads as a
      // complete instruction that happens to end mid-sentence, which is worse
      // than no prompt at all: the session acts on the half it was given.
      dropped.push('prompt is ' + prompt.length + ' characters, over the '
                 + PROMPT_MAX + ' the link carries');
    } else if (prompt) {
      q.set('prompt', prompt);
      carried.push('prompt');
    }
    // Documented as ignored when `prompt` is also set, so it is only offered
    // where the prompt did not ride.
    if (promptUrl && !q.has('prompt')) {
      q.set('prompt_url', promptUrl);
      carried.push('prompt_url');
    } else if (promptUrl) {
      dropped.push('prompt_url is ignored when prompt is set');
    }

    const repos = slugs(opt.repos, dropped);
    if (repos.length) {
      q.set('repositories', repos.join(','));
      carried.push(repos.length === 1 ? '1 repository' : repos.length + ' repositories');
    }

    // See "The one thing that cannot travel" above.
    const branch = trimmed(opt.branch);
    if (branch && repos.length === 1) {
      q.set('branch', branch);
      carried.push('branch (unverified on this route)');
    } else if (branch && repos.length > 1) {
      dropped.push('branch "' + branch + '": the link carries one branch and '
                 + 'this scope has ' + repos.length + ' repositories');
    } else if (branch) {
      dropped.push('branch "' + branch + '" needs a repository beside it');
    }

    const env = trimmed(opt.environment);
    if (env) { q.set('environment', env); carried.push('environment'); }

    const qs = q.toString();
    return { url: CODE_BASE + (qs ? '?' + qs : ''), carried, dropped };
  };

  // A new ChatGPT chat. No repo, no prompt_url: the payload is all it takes.
  //
  // o: { prompt, temporary, hints }
  const chat = (o) => {
    const opt = o || {};
    const dropped = [];
    const carried = [];
    const q = new URLSearchParams();

    const prompt = trimmed(opt.prompt);
    if (prompt && prompt.length > PROMPT_MAX) {
      dropped.push('prompt is ' + prompt.length + ' characters, over the '
                 + PROMPT_MAX + ' the link carries');
    } else if (prompt) {
      q.set('q', prompt);
      carried.push('prompt');
    }
    if (opt.temporary) { q.set('temporary-chat', 'true'); carried.push('temporary chat'); }
    const hints = trimmed(opt.hints);
    if (hints) { q.set('hints', hints); carried.push('hint: ' + hints); }
    if (opt.repos && (Array.isArray(opt.repos) ? opt.repos.length : true))
      dropped.push('repositories: this target takes no repository');

    const qs = q.toString();
    return { url: CHAT_BASE + (qs ? '?' + qs : ''), carried, dropped };
  };

  const BY_KEY = { code, chat };

  // By target key, so a UI driven by `targets` needs no switch of its own. An
  // unavailable target returns a null url with the row's reason as the drop,
  // rather than throwing: a caller rendering every row should be able to ask
  // each one for a link and get an honest no from the ones that have none.
  const url = (key, o) => {
    const fn = BY_KEY[key];
    if (fn) return fn(o);
    const row = TARGETS.find((t) => t.key === key);
    return { url: '', carried: [], dropped: [row ? row.reason : 'unknown target "' + key + '"'] };
  };

  window.dispatch = { CODE_BASE, CHAT_BASE, PROMPT_MAX, targets: TARGETS, code, chat, url, fits };
})();
