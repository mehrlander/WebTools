document.addEventListener('alpine:init', function() {
  Alpine.data('proposals', function() {
    // The Proposals view: pending cross-repo edits an agent session could not
    // make itself, waiting on the user's token and the user's say-so.
    //
    // The channel is lib/kits/repo-proposals.js (proposals/pending -> applied in the
    // registry repo); this is only the review surface. Two rules shape it:
    //
    //   Nothing applies without a confirm. The estate's other cached reads run
    //   on load because they read; this writes to a repo the session could not
    //   reach, so every apply is a two-tap gesture, the same one the stage's
    //   cross-repo copy uses.
    //   Show the bytes, not a description of them. Each row resolves against
    //   the target's current file and displays the exact content the write
    //   will send, so a reviewer confirms what happens rather than what was
    //   promised. For the JSON kinds that is a before/after on one key, which
    //   is the whole edit; for put-file it is a line diff via the shared
    //   text-diff kit (side-by-side panes when a diff cannot be computed). A
    //   removal reuses the JSON pane, with `(removed)` on the after side, since
    //   the edit it describes is the same shape.
    //
    // The view appears in the estate nav only while something is pending: an
    // empty channel should cost no attention (the shell's proposalCount gates
    // the entry).
    const REGISTRY = () => window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private';

    return {
      description: 'Proposals view: pending cross-repo edits from agent sessions, each resolved against the target file and applied only on a two-tap confirm. Reads proposals/pending in the registry, writes a record to proposals/applied.',

      items: [],
      loading: false,
      err: '',
      expanded: {},       // id -> is its detail prose open
      // Names this session has retired. The contents API is eventually
      // consistent, so a listing fetched right after the tombstone lands often
      // still reports the proposal pending; without this the row reappears on
      // the reload that follows an apply, which is exactly how "it didn't clear"
      // looked. Cleared naturally on the next page load, by which time the
      // listing agrees.
      retired: {},
      confirming: null,   // id awaiting its second tap
      armedMode: null,    // which delivery that second tap would perform
      applying: null,

      template: `
        <div class="w-full">
          <div class="flex items-center gap-2 mb-1">
            <h2 class="text-lg font-semibold">Proposals</h2>
            <span x-show="items.length" class="badge badge-ghost badge-sm font-mono" x-text="items.length"></span>
            <div class="grow"></div>
            <button class="btn btn-ghost btn-sm gap-1.5" @click="load()" :disabled="loading">
              <i class="ph ph-arrows-clockwise"></i><span class="hidden sm:inline">Refresh</span>
            </button>
          </div>
          <p class="text-sm text-base-content/50 mb-4">
            Edits proposed by a session that could not reach the target repo. Nothing here is applied until you apply it,
            and every comparison below is against the target file as it stands right now.
          </p>

          <div x-show="loading" class="flex justify-center py-12">
            <span class="loading loading-dots loading-md opacity-30"></span>
          </div>
          <div x-show="err" class="text-base text-error font-mono" x-text="err"></div>
          <div x-show="!loading && !err && !items.length" class="text-base text-base-content/50 italic py-8">
            Nothing pending.
          </div>

          <div class="flex flex-col gap-3">
            <template x-for="p in items" :key="p.name">
              <div class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="p-3 sm:p-4 flex flex-col gap-2">

                  <div class="flex items-start gap-2 flex-wrap">
                    <i class="ph text-lg mt-0.5" :class="p.kind === 'put-file' ? 'ph-file-plus' : p.kind === 'unset-json-field' ? 'ph-eraser' : 'ph-brackets-curly'"></i>
                    <div class="min-w-0">
                      <div class="font-mono text-sm break-all">
                        <span x-text="p.repo" class="opacity-60"></span><span class="opacity-40">:</span><span x-text="p.path"></span>
                      </div>
                      <!-- One line, always. The rest is a tap away, because four
                           cards of full prose is a wall on a phone and the
                           explanation is usually the same on every card. -->
                      <div class="text-sm text-base-content/80 mt-0.5" x-text="p.summary"></div>
                    </div>
                    <div class="grow"></div>
                    <span class="badge badge-ghost badge-sm font-mono" :title="kindHelp(p.kind)" x-text="p.kind"></span>
                  </div>

                  <div x-show="p.caution"
                       class="text-sm rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 flex gap-1.5">
                    <i class="ph ph-hand-palm mt-0.5 shrink-0"></i>
                    <span><span class="font-medium">Before applying:</span> <span x-text="p.caution"></span></span>
                  </div>

                  <div x-show="p.detail && expanded[p.id]" class="text-sm text-base-content/70 whitespace-pre-line"
                       x-text="p.detail"></div>

                  <!-- The premises, answered against the live target before any
                       write. A reviewer should be able to see that the change
                       is still needed and still safe without tapping. -->
                  <div x-show="p.checks && p.checks.length" class="flex flex-col gap-0.5">
                    <template x-for="c in p.checks" :key="c.key">
                      <div class="text-xs flex items-start gap-1.5"
                           :class="{ 'text-success': c.state==='pass', 'text-error': c.state==='fail',
                                     'text-base-content/40': c.state==='skip', 'text-info': c.state==='done' }">
                        <i class="ph mt-0.5 shrink-0"
                           :class="{ 'ph-check-circle': c.state==='pass', 'ph-x-circle': c.state==='fail',
                                     'ph-minus-circle': c.state==='skip', 'ph-seal-check': c.state==='done' }"></i>
                        <span><span x-text="c.label"></span><span x-show="c.note" class="opacity-70"> — <span x-text="c.note"></span></span></span>
                      </div>
                    </template>
                  </div>

                  <div x-show="p.resolveErr" class="text-sm text-error font-mono" x-text="p.resolveErr"></div>

                  <div x-show="p.stale || p.gone"
                       class="text-sm rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5">
                    <div class="font-medium" x-text="p.gone ? 'The target file no longer exists.' : 'The target changed after this was proposed.'"></div>
                    <div class="text-xs opacity-70" x-text="staleDetail(p)"></div>
                  </div>

                  <template x-if="p.resolved && p.kind !== 'put-file'">
                    <div class="text-sm font-mono bg-base-200/50 rounded-lg p-2 overflow-x-auto">
                      <div class="opacity-60" x-text="p.field + ':'"></div>
                      <div x-show="p.fieldBefore !== undefined" class="text-error/80 break-words">
                        - <span x-text="JSON.stringify(p.fieldBefore)"></span>
                      </div>
                      <div x-show="p.fieldBefore === undefined" class="opacity-40 italic">(not set)</div>
                      <div x-show="p.kind !== 'unset-json-field'" class="text-success/90 break-words">+ <span x-text="JSON.stringify(p.value)"></span></div>
                      <div x-show="p.kind === 'unset-json-field'" class="text-success/90 break-words">+ (removed)</div>
                    </div>
                  </template>

                  <!-- A real line diff when the text-diff kit can produce one
                       (rows styled as the stage's Diff lens); the side-by-side
                       panes stay as the fallback for a new file, a pair past
                       the diff cap, or a page that never loaded the kit. -->
                  <template x-if="p.resolved && p.kind === 'put-file' && p.diffRows">
                    <div>
                      <div class="text-xs opacity-50 mb-1" x-text="'current → proposed · ' + p.diffStat"></div>
                      <div class="text-xs font-mono bg-base-200/50 rounded-lg p-2 max-h-64 overflow-auto">
                        <template x-for="(r, i) in p.diffRows" :key="i">
                          <div class="whitespace-pre px-1"
                               :class="r.t === 'add' ? 'bg-success/10 text-success' : r.t === 'del' ? 'bg-error/10 text-error' : 'text-base-content/55'"
                               x-text="(r.t === 'add' ? '+ ' : r.t === 'del' ? '- ' : '  ') + r.line"></div>
                        </template>
                      </div>
                    </div>
                  </template>
                  <template x-if="p.resolved && p.kind === 'put-file' && !p.diffRows">
                    <div class="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div class="text-xs opacity-50 mb-1" x-text="p.exists ? 'current' : 'current (file does not exist)'"></div>
                        <pre class="text-xs font-mono bg-base-200/50 rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap" x-text="p.before"></pre>
                      </div>
                      <div>
                        <div class="text-xs opacity-50 mb-1">proposed</div>
                        <pre class="text-xs font-mono bg-base-200/50 rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap" x-text="p.after"></pre>
                      </div>
                    </div>
                  </template>

                  <div x-show="p.delivered" class="text-sm rounded-lg border border-success/40 bg-success/10 px-2 py-1.5">
                    <span x-text="p.delivered"></span>
                    <a x-show="p.deliveredUrl" :href="p.deliveredUrl" target="_blank" rel="noopener"
                       class="link link-hover font-medium">Open it</a>
                  </div>

                  <div x-show="p.by || p.session || p.authored"
                       class="text-xs text-base-content/40 flex items-center gap-1.5 flex-wrap">
                    <i class="ph ph-signature"></i>
                    <span x-text="p.by || 'unattributed'"></span>
                    <span x-show="p.authored" x-text="'\u00b7 ' + p.authored"></span>
                    <a x-show="p.session" :href="p.session" target="_blank" rel="noopener"
                       class="link link-hover">\u00b7 session</a>
                  </div>

                  <div class="flex items-center gap-2 flex-wrap">
                    <a :href="p.targetGh" target="_blank" rel="noopener"
                       class="flex items-center gap-1.5 text-sm text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                      <i class="ph ph-github-logo"></i><span>Target</span>
                    </a>
                    <a :href="p.proposalGh" target="_blank" rel="noopener"
                       class="flex items-center gap-1.5 text-sm text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                      <i class="ph ph-note"></i><span>Record</span>
                    </a>
                    <button x-show="p.detail" @click="expanded[p.id] = !expanded[p.id]"
                            class="flex items-center gap-1.5 text-sm text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                      <i class="ph" :class="expanded[p.id] ? 'ph-caret-up' : 'ph-caret-down'"></i>
                      <span x-text="expanded[p.id] ? 'Less' : 'Why'"></span>
                    </button>
                    <div class="grow"></div>
                    <span class="text-xs text-base-content/40 hidden sm:inline" x-text="kindHelp(p.kind)"></span>
                    <span x-show="applying === p.id" class="loading loading-dots loading-sm opacity-40"></span>
                    <!-- Two ways to land it, both always reachable. The record's
                         deliver hint only decides which one is the filled
                         button: the session suggests, the person holding the
                         token decides. A PR is the safer of the two, so it
                         never hides behind a menu. -->
                    <template x-if="p.done && applying !== p.id">
                      <button class="btn btn-sm btn-outline btn-info gap-1.5" @click="retire(p)">
                        <i class="ph ph-archive"></i><span>Already done, retire it</span>
                      </button>
                    </template>
                    <template x-if="!p.done && confirming !== p.id && applying !== p.id">
                      <div class="flex items-center gap-1.5">
                        <button class="btn btn-sm gap-1.5"
                                :class="prPrimary(p) ? 'btn-ghost' : ((p.stale || p.gone) ? 'btn-outline btn-warning' : 'btn-outline')"
                                :disabled="!p.resolved || p.blocked"
                                @click="arm(p, 'commit')">
                          <i class="ph" :class="(p.stale || p.gone) ? 'ph-warning-octagon' : 'ph-check'"></i>
                          <span x-text="(p.stale || p.gone) ? 'Commit anyway' : 'Commit'"></span>
                        </button>
                        <button class="btn btn-sm gap-1.5"
                                :class="prPrimary(p) ? 'btn-outline btn-primary' : 'btn-ghost'"
                                :disabled="!p.resolved || p.blocked"
                                @click="arm(p, 'pr')">
                          <i class="ph ph-git-pull-request"></i><span>Open PR</span>
                        </button>
                      </div>
                    </template>
                    <button x-show="confirming === p.id && applying !== p.id"
                            class="btn btn-sm gap-1.5"
                            :class="armedMode === 'pr' ? 'btn-primary' : 'btn-error'"
                            @click="apply(p)">
                      <i class="ph" :class="armedMode === 'pr' ? 'ph-git-pull-request' : 'ph-warning'"></i>
                      <span x-text="confirmLabel(p)"></span>
                    </button>
                    <button x-show="confirming === p.id && applying !== p.id"
                            class="btn btn-sm btn-ghost" @click="confirming = null">Cancel</button>
                  </div>

                </div>
              </div>
            </template>
          </div>
        </div>
      `,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
      },

      hasToken() { return !!window.__shell?.hasToken?.(); },

      // The kind names are the channel's vocabulary, not the reader's. A record
      // is an instruction, never a patch, and saying so where the badge sits is
      // cheaper than expecting anyone to remember which is which.
      // The record's suggestion, defaulting to a commit. It only sets which
      // button is filled; both stay live either way.
      prPrimary(p) { return (p.deliver || 'commit') !== 'commit'; },
      arm(p, mode) { this.armedMode = mode; this.confirming = p.id; },
      confirmLabel(p) {
        if (this.armedMode === 'pr') return 'Open a PR on ' + p.repo + '?';
        return (p.stale || p.gone) ? 'Overwrite ' + p.repo + '?' : 'Write to ' + p.repo + '?';
      },

      // What changed, in shas, since a reviewer overriding the guard deserves
      // the specifics rather than a warning colour.
      staleDetail(p) {
        if (p.gone) return 'It was written against ' + String(p.expectSha || '').slice(0, 7) + ', which is no longer there. Applying recreates the file.';
        return 'Written against ' + String(p.expectSha || '').slice(0, 7) +
          ', the file is now ' + String(p.sha || '').slice(0, 7) +
          (p.kind === 'put-file' ? '. Applying replaces it whole, so anything added since is lost.'
                                 : '. This kind merges into current content, so the change below still lands on top.');
      },

      kindHelp(kind) {
        return kind === 'put-file' ? 'replaces the whole file'
          : kind === 'set-json-field' ? 'sets one key in the JSON file'
          : kind === 'unset-json-field' ? 'removes one key from the JSON file'
          : '';
      },
      reg() { return new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' }); },

      // Read the pending set, then resolve each against its target so the row
      // can show real bytes. Resolution is per-proposal and failure-isolated:
      // one unreadable target must not blank the list.
      async load() {
        if (!this.hasToken() || !window.RepoProposals) { this.items = []; return; }
        const P = window.RepoProposals;
        this.loading = true; this.err = ''; this.confirming = null;
        try {
          let pend = [], done = [];
          try { pend = await this.reg().ls(P.PENDING_DIR); } catch {}   // 404 = no channel yet
          try { done = await this.reg().ls(P.APPLIED_DIR); } catch {}
          const names = P.pending(
            pend.filter(f => f.type === 'file').map(f => f.name),
            done.filter(f => f.type === 'file').map(f => f.name),
          ).filter(n => !this.retired[n]);
          const rows = [];
          for (const name of names) {
            let rec;
            try { rec = JSON.parse((await this.reg().get(P.PENDING_DIR + '/' + name)).text); }
            catch (e) { rows.push({ name, id: name, kind: '?', repo: '?', path: name, why: 'unreadable proposal record', resolveErr: String(e?.message || e) }); continue; }
            const row = { ...rec, name, resolved: false, resolveErr: '',
              summary: P.summaryOf(rec), detail: P.detailOf(rec) };
            // Honor the record's ref: a proposal against a branch must link to
            // that branch's copy, not to the default branch's. Blank means the
            // repo's default, which is what HEAD resolves to.
            row.targetGh = 'https://github.com/' + rec.repo + '/blob/' + (rec.ref || 'HEAD') + '/' + rec.path;
            row.proposalGh = 'https://github.com/' + REGISTRY() + '/blob/main/' + P.PENDING_DIR + '/' + name;
            const r = await P.resolve(rec, { GH: window.GH, token: window.TOKEN });
            if (!r.ok) { row.resolveErr = r.error; row.checks = P.checks(rec, r).list; row.blocked = true; }
            else {
              const pre = P.checks(rec, r);
              Object.assign(row, { resolved: true, exists: r.exists, before: r.before, after: r.after,
                fieldBefore: r.fieldBefore, sha: r.sha, stale: r.stale, gone: r.gone,
                checks: pre.list, blocked: pre.blocking, done: pre.done });
              // The put-file pane wants a real diff, not two files to eyeball.
              // Computed once here, at resolve time. textDiff.lines returns
              // null past its size cap, and a brand-new file has nothing to
              // diff against; both cases leave diffRows unset and the pane
              // falls back to the side-by-side panes.
              if (rec.kind === 'put-file' && r.exists && window.textDiff) {
                const a = String(r.before ?? '').split('\n'), b = String(r.after ?? '').split('\n');
                const ops = window.textDiff.lines(a, b);
                if (ops) {
                  row.diffRows = window.textDiff.rows(ops, a, b);
                  row.diffStat = '+' + row.diffRows.filter(x => x.t === 'add').length
                       + ' / -' + row.diffRows.filter(x => x.t === 'del').length;
                }
              }
            }
            rows.push(row);
          }
          this.items = rows;
        } catch (e) {
          this.err = 'Proposals load failed: ' + (e?.message || e);
        } finally { this.loading = false; }
      },

      // Retiring a proposal whose change is already in place. It writes the
      // tombstone and nothing else: the end state is what was asked for, so
      // there is nothing to do to the target.
      async retire(p) {
        const P = window.RepoProposals;
        this.applying = p.id;
        try {
          await this.reg().save(P.APPLIED_DIR + '/' + p.name, {
            id: p.id, kind: p.kind, repo: p.repo, path: p.path, ref: p.ref || '',
            appliedAt: new Date().toISOString(), ok: true, retired: true,
            note: 'the target already carried this exact change; retired without a write',
          }, `Retire proposal ${p.id} (already applied) via show-repo`);
          this.retired[p.name] = true;
          this.items = this.items.filter(x => x.name !== p.name);
          Alpine.store('toast')('archive', 'Retired ' + p.id, 'alert-success', 3000);
        } catch (e) {
          Alpine.store('toast')('warning', 'Could not retire: ' + (e?.message || e), 'alert-error', 6000);
        } finally {
          this.applying = null;
          window.__shell?.loadProposalCount?.();
        }
      },

      // The confirmed write. gh-transfer carries saveRaw (the stale-SHA retry),
      // and it is lazy-loaded here for the same reason the stage lazy-loads it:
      // most sessions never write cross-repo.
      async apply(p) {
        const P = window.RepoProposals;
        this.applying = p.id; this.confirming = null;
        try {
          if (typeof window.GH.prototype.saveRaw !== 'function') await window.gh.load('gh-transfer.js');
          // A stale row only reaches here through the "Apply anyway" label, so
          // the override is the user's, made against a card that said what had
          // changed. apply() stamps `forced` on the record either way.
          const mode = this.armedMode || p.deliver || 'commit';
          const result = await P.apply(p, { GH: window.GH, token: window.TOKEN,
            force: !!(p.stale || p.gone), deliver: mode });

          // ONLY A SUCCESS RETIRES A PROPOSAL. The tombstone used to be written
          // whatever happened, so a failed apply marked the record spent and it
          // vanished from the list without ever landing (one did: a 409 on
          // shortcut-tools). A failure is an attempt, kept beside the channel
          // for the record, and the proposal stays pending.
          if (result.ok) {
            await this.reg().save(P.APPLIED_DIR + '/' + p.name, result,
              `Apply proposal ${p.id} (${p.repo}:${p.path}) via show-repo`);
            // Drop the row now rather than trusting the reload: the contents
            // API is eventually consistent, so a listing fetched a second after
            // a write often does not show it yet, which is why applied rows
            // appeared to linger.
            this.retired[p.name] = true;
            this.items = this.items.filter(x => x.name !== p.name);
          } else {
            const stamp = String(result.appliedAt || '').replace(/[:.]/g, '-');
            try {
              await this.reg().save(P.ATTEMPT_DIR + '/' + p.id + '-' + stamp + '.json', result,
                `Record a failed apply of proposal ${p.id} via show-repo`);
            } catch {}
          }
          // A PR is a thing to go and read, so its result outlives the toast:
          // the row keeps the link until the list reloads without it.
          if (result.ok && result.pr) {
            p.delivered = 'Opened PR #' + result.prNumber + ' on ' + p.repo + '.';
            p.deliveredUrl = result.pr;
          } else if (result.ok && result.branch) {
            p.delivered = (result.prError ? 'Committed to ' + result.branch + ', but the PR could not be opened: ' + result.prError
                                          : 'Committed to ' + result.branch + '.');
            p.deliveredUrl = result.compare || ('https://github.com/' + p.repo + '/tree/' + result.branch);
          } else if (result.ok && result.commitUrl) {
            p.delivered = 'Committed to ' + p.repo + '.';
            p.deliveredUrl = result.commitUrl;
          }
          Alpine.store('toast')(
            result.ok ? 'check-circle' : 'warning',
            result.ok ? (result.pr ? `Opened PR #${result.prNumber}` : `Applied to ${p.repo}`)
                      : `Not applied: ${result.error}`,
            result.ok ? 'alert-success' : 'alert-error', result.ok ? 3000 : 6000);
        } catch (e) {
          Alpine.store('toast')('warning', 'Apply failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally {
          this.applying = null;
          this.armedMode = null;
          await this.load();
          window.__shell?.loadProposalCount?.();
        }
      },
    };
  });
});
