class GH {
  constructor(conf = {}) {
    this.token = conf.token || '';
    this.repo = conf.repo || ''; 
    this.ref = conf.ref || 'main'; 
  }

  get headers() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token && !this.token.includes('🎟')) {
      h.Authorization = `Bearer ${this.token.trim()}`;
    }
    return h;
  }

  async req(path, opts = {}) {
    const base = path.startsWith('/') 
      ? 'https://api.github.com' 
      : `https://api.github.com/repos/${this.repo}`;
    
    const url = path.startsWith('http') 
      ? path 
      : `${base}/${path.replace(/^\//, '')}`;

    const res = await fetch(url, { headers: this.headers, ...opts });
    
    if (!res.ok) {
      const limit = res.headers.get('x-ratelimit-remaining');
      throw new Error(`GitHub Error ${res.status} (Rate Rem: ${limit})`);
    }
    return res.json();
  }

  async repos(user = 'anthropics') {
    const endpoint = this.headers.Authorization ? '/user/repos' : `/users/${user}/repos`;
    return this.req(`${endpoint}?sort=updated&per_page=100`);
  }

  async ls(path = '') {
    const data = await this.req(`contents/${path}?ref=${this.ref}`);
    if (!Array.isArray(data)) throw new Error('Path is not a directory');
    
    return data.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'dir' ? -1 : 1;
    });
  }

  async get(path) {
    const data = await this.req(`contents/${path}?ref=${this.ref}`);
    if (Array.isArray(data)) throw new Error('Path is a directory');
    return {
      text: this.decode(data.content),
      sha: data.sha,
      size: data.size,
      url: data.html_url
    };
  }

  async history(path, limit = 20) {
    const data = await this.req(`commits?path=${encodeURIComponent(path)}&sha=${this.ref}&per_page=${limit}`);
    return data.map(c => ({
      sha: c.sha,
      msg: c.commit.message.split('\n')[0].slice(0, 80),
      date: c.commit.committer.date,
      ago: this.ago(c.commit.committer.date),
      author: c.commit.author.name
    }));
  }

  decode(str) {
    const binString = atob(str.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binString, c => c.charCodeAt(0)));
  }

  ago(dateStr) {
    const s = (Date.now() - new Date(dateStr)) / 1000;
    const intervals = { y: 31536000, mo: 2592000, d: 86400, h: 3600, m: 60 };
    for (const [unit, v] of Object.entries(intervals)) {
      if (s >= v) return `${Math.floor(s/v)}${unit} ago`;
    }
    return 'just now';
  }

  parseUrl(url) {
    const m = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/(?:tree|blob)\/([^\/]+))?(?:\/(.+))?/);
    if (!m) return null;
    return { 
      repo: `${m[1]}/${m[2]}`, 
      ref: m[3] || 'main', 
      path: (m[4] || '').replace(/\/$/, '') 
    };
  }
}
