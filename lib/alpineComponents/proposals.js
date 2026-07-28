document.addEventListener('alpine:init', function() {
  Alpine.data('proposals', function() {
    // The Proposals view: pending cross-repo edits an agent session could not
    // make itself, waiting on the user's token and the user's say-so.
    //
    // The channel is lib/repo-proposals.js (proposals/pending -> applied in the
    // registry repo); this is only the review surface. Two rules shape it:
    //
    //   Nothing applies without a confirm. The estate's other cached reads run
    //   on load because they read; this writes to a repo the session could not
    //   reach, so every apply is a two-tap gesture, the same one the stage's
    //   cross-repo copy uses.
    //   Show the bytes, not a description of them. Each row resolves against
    //   the target's current file and displays the exact content the write
    //   will send, so a reviewer confirms what happens rather than what was
    //   promised. For set-json-field that is a before/after on one key, which
    //   is the whole edit; for put-file it is the two files side by side.
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
      confirming: null,   // id awaiting its second tap
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
            Edits proposed by a session that could not reach the target repo. Nothing here is applied until you apply it.
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
                    <i class="ph text-lg mt-0.5" :class="p.kind === 'put-file' ? 'ph-file-plus' : 'ph-brackets-curly'"></i>
                    <div class="min-w-0">
                      <div class="font-mono text-sm break-all">
                        <span x-text="p.repo" class="opacity-60"></span><span class="opacity-40">:</span><span x-text="p.path"></span>
                      </div>
                      <div class="text-sm text-base-content/70 mt-0.5" x-text="p.why"></div>
                    </div>
                    <div class="grow"></div>
                    <span class="badge badge-ghost badge-sm font-mono" :title="kindHelp(p.kind)" x-text="p.kind"></span>
                  </div>

                  <div x-show="p.resolveErr" class="text-sm text-error font-mono" x-text="p.resolveErr"></div>

                  <div x-show="p.resolved" class="text-xs text-base-content/40">
                    Compared against the target file as it stands right now, not against a stored copy.
                  </div>

                  <div x-show="p.stale || p.gone"
                       class="text-sm rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5">
                    <div class="font-medium" x-text="p.gone ? 'The target file no longer exists.' : 'The target changed after this was proposed.'"></div>
                    <div class="text-xs opacity-70" x-text="staleDetail(p)"></div>
                  </div>

                  <template x-if="p.resolved && p.kind === 'set-json-field'">
                    <div class="text-sm font-mono bg-base-200/50 rounded-lg p-2 overflow-x-auto">
                      <div class="opacity-60" x-text="p.field + ':'"></div>
                      <div x-show="p.fieldBefore !== undefined" class="text-error/80 break-words">
                        - <span x-text="JSON.stringify(p.fieldBefore)"></span>
                      </div>
                      <div x-show="p.fieldBefore === undefined" class="opacity-40 italic">(not set)</div>
                      <div class="text-success/90 break-words">+ <span x-text="JSON.stringify(p.value)"></span></div>
                    </div>
                  </template>

                  <template x-if="p.resolved && p.kind === 'put-file'">
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
                    <div class="grow"></div>
                    <span class="text-xs text-base-content/40 hidden sm:inline" x-text="kindHelp(p.kind)"></span>
                    <span x-show="applying === p.id" class="loading loading-dots loading-sm opacity-40"></span>
                    <button x-show="confirming !== p.id && applying !== p.id"
                            class="btn btn-sm gap-1.5"
                            :class="(p.stale || p.gone) ? 'btn-outline btn-warning' : 'btn-outline'"
                            :disabled="!p.resolved"
                            @click="confirming = p.id">
                      <i class="ph" :class="(p.stale || p.gone) ? 'ph-warning-octagon' : 'ph-check'"></i>
                      <span x-text="(p.stale || p.gone) ? 'Apply anyway' : 'Apply'"></span>
                    </button>
                    <button x-show="confirming === p.id && applying !== p.id"
                            class="btn btn-sm btn-error gap-1.5" @click="apply(p)">
                      <i class="ph ph-warning"></i>
                      <span x-text="(p.stale || p.gone) ? 'Overwrite ' + p.repo + '?' : 'Write to ' + p.repo + '?'"></span>
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
          );
          const rows = [];
          for (const name of names) {
            let rec;
            try { rec = JSON.parse((await this.reg().get(P.PENDING_DIR + '/' + name)).text); }
            catch (e) { rows.push({ name, id: name, kind: '?', repo: '?', path: name, why: 'unreadable proposal record', resolveErr: String(e?.message || e) }); continue; }
            const row = { ...rec, name, resolved: false, resolveErr: '' };
            // Honor the record's ref: a proposal against a branch must link to
            // that branch's copy, not to the default branch's. Blank means the
            // repo's default, which is what HEAD resolves to.
            row.targetGh = 'https://github.com/' + rec.repo + '/blob/' + (rec.ref || 'HEAD') + '/' + rec.path;
            row.proposalGh = 'https://github.com/' + REGISTRY() + '/blob/main/' + P.PENDING_DIR + '/' + name;
            const r = await P.resolve(rec, { GH: window.GH, token: window.TOKEN });
            if (!r.ok) row.resolveErr = r.error;
            else Object.assign(row, { resolved: true, exists: r.exists, before: r.before, after: r.after,
              fieldBefore: r.fieldBefore, sha: r.sha, stale: r.stale, gone: r.gone });
            rows.push(row);
          }
          this.items = rows;
        } catch (e) {
          this.err = 'Proposals load failed: ' + (e?.message || e);
        } finally { this.loading = false; }
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
          const result = await P.apply(p, { GH: window.GH, token: window.TOKEN, force: !!(p.stale || p.gone) });
          await this.reg().save(P.APPLIED_DIR + '/' + p.name, result,
            `Apply proposal ${p.id} (${p.repo}:${p.path}) via show-repo`);
          Alpine.store('toast')(
            result.ok ? 'check-circle' : 'warning',
            result.ok ? `Applied to ${p.repo}` : `Not applied: ${result.error}`,
            result.ok ? 'alert-success' : 'alert-error', result.ok ? 3000 : 6000);
        } catch (e) {
          Alpine.store('toast')('warning', 'Apply failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally {
          this.applying = null;
          await this.load();
          window.__shell?.loadProposalCount?.();
        }
      },
    };
  });
});
