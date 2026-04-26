// kits/component.js — thin Alpine + custom-element wrapper.
//
// Lets you write reusable components without inheriting Alp's framework
// (no path registry, no Dexie, no implicit message bus). A component is
// a custom-element tag whose body is rendered from a template function
// and animated by an Alpine `x-data` factory.
//
//   <script src=".../kits/component.js"></script>
//   window.component.defineComponent('my-counter',
//     attrs => `<button @click="inc()" x-text="count"></button>`,
//     attrs => ({ count: Number(attrs.start ?? 0), inc() { this.count++ } })
//   );
//   <my-counter start="5"></my-counter>
//
// After Alpine initializes, the component's reactive data object is
// stashed on the host element as `host.__data`, so other code can call
// `document.querySelector('my-counter').__data.inc()` from outside.
//
// Lifecycle: if the data factory returns an object with an `onMount(host)`
// method, it's invoked once after Alpine binds.
//
// Custom-element rules: the tag name must contain a hyphen (browser
// requirement). No prefix is imposed — pick whatever is meaningful.

(() => {
  const registry = new Map(); // name -> { tplFn, dataFactory }

  const defineComponent = (name, tplFn, dataFactory = () => ({})) => {
    name = String(name).toLowerCase();
    if (!name.includes('-')) {
      throw new Error(`component: tag name "${name}" needs a hyphen`);
    }
    if (customElements.get(name)) {
      console.warn(`component: <${name}> already defined; ignoring`);
      return;
    }
    registry.set(name, { tplFn, dataFactory });

    class C extends HTMLElement {
      connectedCallback() {
        if (this._kitMounted) return;
        this._kitMounted = true;
        const attrs = {};
        for (const a of this.attributes) attrs[a.name] = a.value;
        this.innerHTML =
          `<div x-data="window.component.mk($el.closest('${name}'))"
                x-init="window.component.bind($el.closest('${name}'), $data)">
            ${tplFn(attrs)}
          </div>`;
        const init = () => window.Alpine.initTree(this);
        window.Alpine ? init() : document.addEventListener('alpine:init', init, { once: true });
      }
    }
    customElements.define(name, C);
  };

  const mk = (host) => {
    const name = host.tagName.toLowerCase();
    const entry = registry.get(name);
    if (!entry) throw new Error(`component: no factory registered for <${name}>`);
    const attrs = {};
    for (const a of host.attributes) attrs[a.name] = a.value;
    return { ...entry.dataFactory(attrs), $attrs: attrs };
  };

  const bind = (host, data) => {
    host.__data = data;
    if (typeof data.onMount === 'function') {
      try { data.onMount(host); } catch (e) { console.error(`component: onMount for <${host.tagName.toLowerCase()}> threw`, e); }
    }
  };

  // Convenience finder — querySelector + return the bound data object.
  const find = (selector, root = document) => root.querySelector(selector)?.__data ?? null;

  window.component = { defineComponent, mk, bind, find };
})();
