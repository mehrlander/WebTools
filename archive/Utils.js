export default class Utils {
  constructor() {
    this.loaded = false;
  }

  async loadDeps() {
    if (this.loaded) return;

    const head = document.head;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5';
    head.appendChild(link);

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web,npm/clipboard';
      script.onload = resolve;
      script.onerror = reject;
      head.appendChild(script);
    });

    this.loaded = true;
  }

  copy(text) {
    if (window.ClipboardJS) {
      const btn = document.createElement('button');
      btn.setAttribute('data-clipboard-text', text);
      const clipboard = new ClipboardJS(btn);
      btn.click();
      clipboard.destroy();
    } else {
      navigator.clipboard.writeText(text);
    }
  }

  hello() {
    return 'Environment loaded! Tailwind & DaisyUI are active.';
  }
}
