const ViewRegistry = {
  _loadedAssets: new Set(),
  
  // Internal helper to load CSS or JS on demand
  loadAsset(url) {
    if (this._loadedAssets.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const isCSS = url.includes('.css');
      const el = document.createElement(isCSS ? 'link' : 'script');
      if (isCSS) {
        Object.assign(el, { rel: 'stylesheet', href: url });
      } else {
        Object.assign(el, { src: url, async: true });
      }
      el.onload = () => { this._loadedAssets.add(url); resolve(); };
      el.onerror = () => reject(new Error(`Load failed: ${url}`));
      document.head.appendChild(el);
    });
  },

  // Helper to escape HTML to prevent breakage within <pre> tags
  esc: (s) => new Option(String(s ?? '')).innerHTML,

  modules: [
    {
      id: 'raw',
      label: 'Raw',
      icon: 'ph-text-t',
      test: () => true, // Fallback for all files
      render: (f) => `<pre class="m-0 p-4 h-full overflow-auto text-xs leading-5 font-mono whitespace-pre-wrap text-base-content">${ViewRegistry.esc(f.content)}</pre>`
    },
    {
      id: 'code',
      label: 'Code',
      icon: 'ph-code',
      assets: [
        'https://cdn.jsdelivr.net/combine/npm/prismjs/themes/prism.min.css',
        'https://cdn.jsdelivr.net/combine/npm/prismjs/prism.min.js,npm/prismjs/plugins/autoloader/prism-autoloader.min.js'
      ],
      test: (f) => ['js','ts','py','sh','html','md','json','yml','css','rb','rs','go','java','cpp','c','sql','xml'].includes(f.ext),
      render: (f) => `<div class="bg-[#f5f2f0] h-full overflow-hidden"><pre class="!m-0 !p-4 !bg-transparent h-full overflow-auto !text-xs leading-5"><code class="language-${f.ext}">${ViewRegistry.esc(f.content)}</code></pre></div>`,
      after: () => {
        if (window.Prism) {
          Prism.plugins.autoloader.languages_path = 'https://cdnjs.cloudflare.com/ajax/libs/prism/components/';
          Prism.highlightAll();
        }
      }
    },
    {
      id: 'preview',
      label: 'Preview',
      icon: 'ph-eye',
      test: (f) => ['md', 'html'].includes(f.ext),
      assets: ['https://cdn.jsdelivr.net/npm/marked/marked.min.js'],
      render: (f) => {
        if (f.ext === 'html') {
          const blob = new Blob([f.content], { type: 'text/html' });
          return `<iframe src="${URL.createObjectURL(blob)}" class="w-full h-full bg-white" sandbox="allow-scripts allow-modals"></iframe>`;
        }
        return `<div class="overflow-auto prose prose-sm max-w-none px-6 py-4 bg-base-100 h-full w-full">${marked.parse(f.content)}</div>`;
      }
    },
    {
      id: 'table',
      label: 'Table',
      icon: 'ph-table',
      assets: [
        'https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator_simple.min.css',
        'https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js'
      ],
      test: (f) => f.ext === 'json' && f.content.trim().startsWith('['),
      render: () => `<div id="tab-target" class="h-full w-full"></div>`,
      after: (f) => {
        try {
          new Tabulator("#tab-target", {
            data: JSON.parse(f.content),
            autoColumns: true,
            layout: "fitColumns",
            pagination: "local",
            paginationSize: 20
          });
        } catch (e) {
          document.getElementById('tab-target').innerHTML = `<div class="p-4 text-error font-mono text-xs">Invalid JSON Array for Table View</div>`;
        }
      }
    },
    {
      id: 'codepen',
      label: 'CodePen',
      icon: 'ph-codepen-logo',
      test: (f) => ['html', 'js', 'css'].includes(f.ext),
      assets: ['https://public.codepenassets.com/embed/index.js'],
      render: (f) => {
        const lang = ['html','css','js'].includes(f.ext) ? f.ext : 'html';
        return `<div id="cpBox" class="h-full w-full bg-base-100">
          <div class="codepen" 
               data-version="2" 
               data-prefill 
               data-height="100%" 
               data-theme-id="light" 
               data-default-tab="${lang},result" 
               style="height:100%; display:flex; align-items:center; justify-content:center;">
            <pre data-lang="${lang}">${ViewRegistry.esc(f.content)}</pre>
          </div>
        </div>`;
      },
      after: () => {
        if (window.__CPEmbed) {
          const box = document.getElementById('cpBox');
          if (box) {
            // Recalculate pixel height based on the actual container to prevent "short iframe" bug
            const h = box.offsetHeight || box.parentElement.offsetHeight;
            const embed = box.querySelector('.codepen');
            if (h > 0) embed.setAttribute('data-height', h);
            __CPEmbed('#cpBox .codepen');
          }
        }
      }
    }
  ],

  // Utility to find valid modes for a specific file
  getModes(file) {
    return this.modules.filter(m => m.test(file));
  },

  // Handles asset loading before a module is activated
  async prepare(moduleId) {
    const mod = this.modules.find(m => m.id === moduleId);
    if (mod?.assets) {
      await Promise.all(mod.assets.map(asset => this.loadAsset(asset)));
    }
    return mod;
  }
};
