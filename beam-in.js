(() => {
  const UID = `beam-${Date.now()}`;

  customElements.define(UID, class extends HTMLElement {
    constructor() {
      super().attachShadow({
        mode: "open"
      }).innerHTML = `
      <style>
        * { box-sizing: border-box; }
        :host { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: transparent; pointer-events: none; font-family: -apple-system, system-ui, sans-serif; }
        .modal { width: 95%; max-width: 500px; background: #fff; border-radius: 16px; padding: 12px; text-align: center; pointer-events: auto; }
        h2 { font-size: 2rem; margin: 0 0 12px; font-weight: 800; color: #000; }
        #row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; width: 100%; }
        button { appearance: none; border: none; cursor: pointer; min-width: 0; background: #ff5722; color: #fff; font-weight: 700; padding: 6px 2px; border-radius: 99px; font-size: 18px; white-space: nowrap; overflow: hidden; }
        button:active { opacity: .7; transform: scale(.95); }
        input { position: absolute; opacity: 0; pointer-events: none; width: 1px; height: 1px; }
      </style>
      <div class="modal">
        <h2>Actions</h2>
        <div id="row">
          <button data-m="run">Run</button>
          <button data-m="body">Body</button>
          <button data-m="doc">Doc</button>
        </div>
        <input type="text" id="p">
      </div>`;

      this.shadowRoot.onclick = (e) => e.target.closest(".modal") ? 0 : this.remove();
    }

    connectedCallback() {
      const inp = this.shadowRoot.querySelector("#p");

      this.shadowRoot.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (btn) {
          this.mode = btn.dataset.m;
          inp.focus();
          document.execCommand("paste");
        }
      });

      inp.onpaste = (e) => {
        const val = (e.clipboardData || window.clipboardData).getData("text");

        if (this.mode === "run") {
          try {
            eval(val);
          } catch (err) {
            console.error(err);
          }
        } else if (this.mode === "body") {
          document.body.innerHTML = val;
        } else if (this.mode === "doc") {
          document.open();
          document.write(val);
          document.close();
        }
        this.remove();
      };
    }
  });

  document.body.appendChild(document.createElement(UID));
})();