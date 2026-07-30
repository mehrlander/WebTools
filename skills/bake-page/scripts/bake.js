// bake.js  ::  node bake.js input.html output.html
// Convert a CDN-driven page into one self-contained file. Three buckets:
//   compile  -> Tailwind + daisyUI, pruned to the classes actually used
//   swap     -> Phosphor <i class="ph ph-x"> becomes inline <svg>
//   inline   -> Alpine and other runtime JS pasted in as-is
const fs = require('fs');
const { execSync } = require('child_process');

const [, , INPUT, OUTPUT] = process.argv;
const CORE = 'node_modules/@phosphor-icons/core/assets';
const WEIGHT = { ph: 'regular', 'ph-bold': 'bold', 'ph-fill': 'fill', 'ph-duotone': 'duotone', 'ph-light': 'light', 'ph-thin': 'thin' };

// runtime libraries we know how to inline: npm name -> dist file(s). Extend this map to add a library.
const RUNTIME = {
  alpinejs:            { js: 'node_modules/alpinejs/dist/cdn.min.js' },
  lodash:              { js: 'node_modules/lodash/lodash.min.js' },
  clipboard:           { js: 'node_modules/clipboard/dist/clipboard.min.js' },
  jszip:               { js: 'node_modules/jszip/dist/jszip.min.js' },
  'get-xpath':         { js: 'node_modules/get-xpath/dist/index.min.js' },
  winbox:              { js: 'node_modules/winbox/dist/winbox.bundle.min.js' },
  'tabulator-tables':  { js: 'node_modules/tabulator-tables/dist/js/tabulator.min.js', css: 'node_modules/tabulator-tables/dist/css/tabulator_simple.min.css' },
};

// swap bucket: <i class="ph ph-name ..."></i> -> inline svg, carrying any extra attrs (e.g. :class) onto the svg
function swapIcons(html) {
  return html.replace(/<i\s+([^>]*?)\s*><\/i>/g, (m, attrs) => {
    const cm = attrs.match(/class="([^"]*\bph\b[^"]*)"/);
    if (!cm) return m;
    const toks = cm[1].split(/\s+/);
    const weight = toks.find(t => t in WEIGHT) || 'ph';
    const folder = WEIGHT[weight];
    const nameTok = toks.find(t => t.startsWith('ph-') && !(t in WEIGHT));
    if (!nameTok) return m;
    const name = nameTok.slice(3);
    const file = `${CORE}/${folder}/${name}${folder === 'regular' ? '' : '-' + folder}.svg`;
    const carry = toks.filter(t => t !== weight && !t.startsWith('ph-')).concat('inline-block', 'size-[1em]').join(' ');
    const keep = attrs.replace(/class="[^"]*"/, `class="${carry}"`);
    return fs.readFileSync(file, 'utf8').trim().replace('<svg ', `<svg ${keep} `);
  });
}

// combine names we already handle (so they are not reported as unknown)
const COMBINE_KNOWN = new Set([...Object.keys(RUNTIME), '@tailwindcss/browser', '@phosphor-icons/web', 'daisyui']);

// figure out which libraries the page pulls in, plus combine names we have no recipe for
function detectLibs(html) {
  const libs = new Set();
  const unknown = new Set();
  const segs = (html.match(/cdn\.jsdelivr\.net\/combine\/([^"'\s]+)/g) || [])
    .flatMap(u => u.replace(/.*combine\//, '').split(','));
  segs.forEach(seg => {
    const s = seg.replace(/^\/?npm\//, '');
    const pkg = s.startsWith('@')
      ? s.split('/').slice(0, 2).join('/').replace(/@[\d.]+$/, '')
      : s.split('/')[0].replace(/@[\d.]+$/, '');
    if (RUNTIME[pkg]) libs.add(pkg);                    // inline-bucket libs come from the combine url
    else if (!COMBINE_KNOWN.has(pkg)) unknown.add(pkg); // a combine name with no recipe: report, do not drop
  });
  if (/unpkg\.com\/alpinejs/.test(html) || /\sx-data/.test(html)) libs.add('alpinejs');
  if (/@phosphor-icons\/web/.test(html) || /class="[^"]*\bph-/.test(html)) libs.add('@phosphor-icons/web');
  if (/daisyui/.test(html)) libs.add('daisyui');
  if (/@tailwindcss\/browser/.test(html) || /daisyui/.test(html)) libs.add('tailwindcss'); // only on real Tailwind/daisyUI presence
  return { libs, unknown };
}

let html = fs.readFileSync(INPUT, 'utf8');
const { libs, unknown } = detectLibs(html);

// strip the CDN tags we are about to replace
html = html
  .replace(/<script[^>]*src="https:\/\/cdn\.jsdelivr\.net\/combine\/[^"]*"[^>]*><\/script>\s*/g, '')
  .replace(/<link[^>]*href="https:\/\/cdn\.jsdelivr\.net\/combine\/[^"]*"[^>]*>\s*/g, '')
  .replace(/<script[^>]*src="https:\/\/unpkg\.com\/alpinejs[^"]*"[^>]*><\/script>\s*/g, '');

if (libs.has('@phosphor-icons/web')) html = swapIcons(html);

let styles = '';
if (libs.has('tailwindcss')) {
  fs.writeFileSync('_bake_src.html', html);
  const plugin = libs.has('daisyui') ? '@plugin "daisyui";\n' : '';
  fs.writeFileSync('_bake_in.css', `@import "tailwindcss" source(none);\n${plugin}@source "./_bake_src.html";\n`);
  execSync('npx @tailwindcss/cli -i _bake_in.css -o _bake_out.css --minify', { stdio: 'ignore' });
  styles += `<style>\n${fs.readFileSync('_bake_out.css', 'utf8')}\n</style>\n`;
}

let scripts = '';
for (const name of libs) {
  const r = RUNTIME[name];
  if (r && r.css) styles += `<style>\n${fs.readFileSync(r.css, 'utf8')}\n</style>\n`;
}
// inline runtime JS, Alpine last so any libraries it leans on already exist
const order = [...libs].filter(n => RUNTIME[n] && RUNTIME[n].js).sort((a, b) => (a === 'alpinejs') - (b === 'alpinejs'));
for (const name of order) scripts += `<script>\n${fs.readFileSync(RUNTIME[name].js, 'utf8')}\n</script>\n`;

// Function replacers, not strings. String.replace reads $$, $&, $`, $' and $1
// in a replacement STRING as patterns, and a minified bundle is full of them.
// Alpine registers every magic through Object.defineProperty(t, `$${n}`, ...);
// as a string replacement that becomes `${n}`, so $el, $refs, $dispatch, $watch
// and $nextTick all silently register without their $ and read as undefined in
// every expression. A function replacer is passed through verbatim.
html = html.includes('<!--CSS-->') ? html.replace('<!--CSS-->', () => styles) : html.replace('</head>', () => styles + '</head>');
html = html.includes('<!--JS-->') ? html.replace('<!--JS-->', () => scripts) : html.replace('</body>', () => scripts + '</body>');

fs.writeFileSync(OUTPUT, html);
console.log('baked:', [...libs].join(', '));
if (unknown.size) console.log('NOT baked, add a recipe:', [...unknown].join(', '));
console.log('bytes:', Buffer.byteLength(html));
