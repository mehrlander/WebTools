export default class GH {
  constructor(config = {}) {
    const p = new URL(document.currentScript?.src || location.href).searchParams;
    this.token = config.token || p.get('token') || '';
    this.repo = config.repo || p.get('repo') || '';
    this.branch = config.branch || 'main';
    this.rate = { limit: 0, remaining: 0 };
  }

  get headers() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token && !this.token.includes('🎟')) h.Authorization = `Bearer ${this.token.trim()}`;
    return h;
  }

  async _req(path, query = '') {
    const res = await fetch(`https://api.github.com/repos/${this.repo}/${path}${query}`, { headers: this.headers });
    this.rate = { limit: res.headers.get('x-ratelimit-limit'), remaining: res.headers.get('x-ratelimit-remaining') };
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  decode(str) {
    const b = atob(str.replace(/\s/g, ''));
    return new TextDecoder().decode(new Uint8Array([...b].map(c => c.charCodeAt(0))));
  }

  url(path, type = 'blob', sha = null) {
    const ref = sha || this.branch;
    const urls = {
      blob: `https://github.com/${this.repo}/blob/${ref}/${path}`,
      raw: `https://raw.githubusercontent.com/${this.repo}/${ref}/${path}`,
      blame: `https://github.com/${this.repo}/blame/${ref}/${path}`,
      history: `https://github.com/${this.repo}/commits/${this.branch}/${path}`,
      cdn: `https://cdn.jsdelivr.net/gh/${this.repo}${sha ? '@'+sha : ''}/${path}`
    };
    return urls[type];
  }

  async ls(path = '') {
    const data = await this._req(`contents/${path}`);
    return data.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
  }

  async cat(path) {
    const data = await this._req(`contents/${path}`);
    return { text: this.decode(data.content), sha: data.sha };
  }

  async history(path, limit = 20) {
    const data = await this._req('commits', `?path=${encodeURIComponent(path)}&per_page=${limit}`);
    return data.map(c => ({
      sha: c.sha,
      msg: c.commit.message.split('\n')[0].slice(0, 60),
      date: c.commit.committer.date
    }));
  }

  parseUrl(url) {
    const m = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/(?:tree|blob)\/([^\/]+))?(?:\/(.+))?/);
    return m ? { owner: m[1], name: m[2], repo: `${m[1]}/${m[2]}`, branch: m[3], path: (m[4]||'').replace(/\/$/,'') } : null;
  }
}
