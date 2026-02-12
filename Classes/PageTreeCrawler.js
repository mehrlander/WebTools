class PageTreeCrawler {
  constructor(options = {}) {
    this.options = { 
      domain: null, 
      includeExternal: false, 
      filter: null, 
      concurrency: 3, 
      delay: 0, 
      ...options 
    };
    this.clear();
  }

  clear() {
    this.urlMap = new Map();
    this.processed = new Set();
    this.tree = {};
    this.stats = {};
    this.urls = [];
  }

  async fetchPage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const base = doc.createElement('base');
    base.href = url;
    doc.head?.appendChild(base);
    this.options.domain ||= new URL(url).hostname;
    return doc;
  }

  extract(doc) {
    doc.querySelectorAll('a[href]').forEach(link => {
      try {
        const url = new URL(link.href, doc.baseURI);
        const isInternal = this._isInternal(url);
        if (!isInternal && !this.options.includeExternal) return;

        if (!this.urlMap.has(url.href)) {
          this.urlMap.set(url.href, {
            ...['href', 'pathname', 'search', 'hash', 'hostname', 'protocol'].reduce((obj, k) => ({ ...obj, [k]: url[k] }), {}),
            isInternal,
            depth: url.pathname.split('/').filter(Boolean).length,
            captions: new Map()
          });
        }
        const data = this.urlMap.get(url.href);
        const txt = link.textContent.trim() || url.href;
        data.captions.set(txt, (data.captions.get(txt) || 0) + 1);
      } catch {}
    });
  }

  _isInternal(url) {
    const norm = h => h.replace(/^www\./, '');
    return !this.options.domain || norm(url.hostname) === norm(this.options.domain);
  }

  refresh() {
    this.urls = Array.from(this.urlMap.values()).map(d => {
      const caps = Array.from(d.captions.entries()).map(([caption, count]) => ({ caption, count })).sort((a, b) => b.count - a.count);
      return { ...d, caption: caps[0]?.caption, allCaptions: caps, instanceCount: caps.reduce((s, c) => s + c.count, 0) };
    }).filter(this.options.filter || (() => true));

    this.tree = { '/': { path: '/', name: '/', children: [], urls: [], stats: { urlCount: 0, childUrls: 0 } } };
    this.urls.forEach(url => {
      let curr = '/';
      url.pathname.split('/').filter(Boolean).forEach(part => {
        const prev = curr;
        curr += (curr.endsWith('/') ? '' : '/') + part;
        if (!this.tree[curr]) {
          this.tree[curr] = { path: curr, name: part, parent: prev, children: [], urls: [], stats: { urlCount: 0, childUrls: 0 } };
          this.tree[prev].children.push(curr);
        }
      });
      const node = this.tree[curr];
      node.urls.push(url);
      node.stats.urlCount++;
      let p = node;
      while (p) { p.stats.childUrls++; p = this.tree[p.parent]; }
    });

    const depths = this.urls.map(u => u.depth);
    this.stats = {
      pages: this.processed.size,
      total: this.urls.length,
      internal: this.urls.filter(u => u.isInternal).length,
      maxDepth: depths.length ? Math.max(...depths) : 0,
      types: this.urls.reduce((acc, u) => {
        const ext = u.pathname.split('.').pop().toLowerCase();
        if (ext && ext.length < 5 && ext !== u.pathname) acc[ext] = (acc[ext] || 0) + 1;
        return acc;
      }, {})
    };
  }

  async addPage(url) {
    if (this.processed.has(url)) return;
    try {
      this.extract(await this.fetchPage(url));
      this.processed.add(url);
      this.refresh();
    } catch (e) {
      console.error(`Failed ${url}: ${e.message}`);
    }
  }

  async crawl(start, max = 10) {
    await this.addPage(start);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    while (this.processed.size < max) {
      const queue = this.urls
        .filter(u => u.isInternal && !this.processed.has(u.href))
        .slice(0, Math.min(this.options.concurrency, max - this.processed.size));
      
      if (!queue.length) break;
      await Promise.all(queue.map(u => this.addPage(u.href)));
      if (this.options.delay) await sleep(this.options.delay);
    }
  }

  getSummary(max = 3) {
    const render = (path, depth = 0, pre = '') => {
      if (depth > max) return '';
      const n = this.tree[path];
      const icon = n.stats.urlCount > 0 ? '📄' : '📁';
      let res = path === '/' ? '' : `${pre}├── ${icon} ${n.name} (${n.stats.childUrls})\n`;
      n.children.sort().forEach(c => res += render(c, depth + 1, path === '/' ? '' : pre + '│   '));
      return res;
    };
    return render('/');
  }
}

if (typeof module !== 'undefined') module.exports = PageTreeCrawler;
window.PageTreeCrawler = PageTreeCrawler;
