// Pure assessment of a repo's alignment with the web-tools coordination
// surface: which of the environmental hooks that spread the portable set (the
// plugin-marketplace subscription, the enabled plugins, a conventions-wired
// CLAUDE.md, a .web-tools.json) a repo actually carries. Inputs are the raw
// artifacts as fetched (parsed settings JSON, CLAUDE.md text, parsed config,
// null where a file is absent); output is a flat signal object plus a one-word
// verdict. Pure builders so they unit-test with no network; the fetch loop and
// the roster live in the Portable view (alpineComponents/portable.js), the
// same split as repo-config-cache.js. Attaches to window.PortableAlign.
(() => {
  const HUB = 'mehrlander/web-tools';

  // Does .claude/settings.json subscribe to the hub's plugin marketplace?
  // Entry shape (key name is the consumer's choice):
  //   extraKnownMarketplaces: { "web-tools": { source: { source: "github", repo: "mehrlander/web-tools" } } }
  // A plain-string source is tolerated for robustness.
  function marketplaceSubscribed(settings, hub = HUB) {
    return Object.values(settings?.extraKnownMarketplaces || {}).some(e => {
      const src = e?.source;
      if (typeof src === 'string') return src.includes(hub);
      return src?.repo === hub || (typeof src?.source === 'string' && src.source.includes(hub));
    });
  }

  // Plugins from the hub's marketplace a repo enables ("<name>@web-tools": true).
  function enabledHubPlugins(settings) {
    return Object.entries(settings?.enabledPlugins || {})
      .filter(([name, on]) => on && name.endsWith('@web-tools'))
      .map(([name]) => name.slice(0, name.indexOf('@')));
  }

  // Does the repo's CLAUDE.md wire the conventions in (an @-import, a standing
  // run-/web-tools instruction, or naming the plugin)? Text heuristic on
  // purpose: presence of intent, not proof of invocation.
  function conventionsWired(claudeMd) {
    return /CONVENTIONS\.md|\/web-tools\b|portable@web-tools|web-tools skill/i.test(claudeMd || '');
  }

  // role: 'hub' (the source repo) and 'registry' (the private sister) hold
  // standing parts in the ecosystem, so they get named verdicts rather than
  // being graded on subscriptions they would never carry.
  function assess({ repo, role = null, settings = null, claudeMd = null, config = null }, hub = HUB) {
    const out = {
      repo,
      role,
      hasSettings: settings != null,
      marketplace: marketplaceSubscribed(settings, hub),
      plugins: enabledHubPlugins(settings),
      hookEvents: Object.keys(settings?.hooks || {}),
      hasClaudeMd: claudeMd != null,
      conventionsWired: conventionsWired(claudeMd),
      hasConfig: config != null,
      estate: config?.estate === true,
      optout: config?.conventions === 'optout',
    };
    out.verdict =
      role === 'hub' ? 'source' :
      role === 'registry' ? 'registry' :
      out.optout ? 'optout' :
      (out.marketplace && out.plugins.length > 0 && out.conventionsWired) ? 'aligned' :
      (out.marketplace || out.plugins.length > 0 || out.conventionsWired || out.hasConfig) ? 'partial' :
      'unaligned';
    return out;
  }

  window.PortableAlign = { HUB, assess, marketplaceSubscribed, enabledHubPlugins, conventionsWired };
})();
