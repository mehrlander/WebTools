// utils/kits/leg.js - Washington Legislature bill data fetching kit

// Lazy load Luxon for date parsing
let DateTime;
const loadDeps = async () => {
  if (!DateTime) {
    const m = await import('https://cdn.jsdelivr.net/npm/luxon/+esm');
    DateTime = m.DateTime;
  }
  return DateTime;
};

// Build URL for WA Legislature file server
const buildUrl = (chamber, format, biennium, type) => {
  const base = `https://lawfilesext.leg.wa.gov/Biennium/${biennium}/${format}/Bills/`;
  return type === 'Bills'
    ? `${base}${chamber}%20Bills/`
    : `${base}Session%20Laws/${chamber}/`;
};

// Parse directory listing HTML from legislature server
const parseDirectoryListing = async (html, chamber, biennium, type) => {
  const DateTime = await loadDeps();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const pre = doc.querySelector('pre');
  if (!pre) return [];

  const lines = pre.innerHTML.split('<br>').filter(Boolean);
  return lines.map(line => {
    // Create temp element to parse HTML entities and extract text
    const temp = document.createElement('div');
    temp.innerHTML = line;
    const text = temp.textContent;

    // Match pattern: date time size filename
    const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+\d{1,2}:\d{2}\s+[AP]M\s+(\S+)\s+(.+)/);
    if (!match) return null;

    const fullFileName = match[3].trim();
    const name = fullFileName.split('.')[0];
    const fileName = fullFileName.replace(/\.(xml|htm)$/i, '');

    // Extract URL from anchor tag
    const anchor = temp.querySelector('a');
    const href = anchor?.getAttribute('href') || '';
    const urlXml = new URL(href, 'https://lawfilesext.leg.wa.gov/').href;

    const billNo = name.slice(0, 4);
    return {
      docId: `${biennium}_${type}_${name}`,
      billId: `${biennium}_${billNo}`,
      billNo,
      date: DateTime.fromFormat(match[1], 'M/d/yyyy').toFormat('yyyy-MM-dd'),
      size: Math.round(parseInt(match[2].replace(/,/g, '')) / 1024) || 0,
      compressedSize: null,
      name,
      fileName,
      urlXml,
      chamber,
      biennium,
      kind: type,
      totalDollarAmount: null,
      description: null
    };
  }).filter(Boolean);
};

// Build tree structure for bills (groups by bill number with children)
const buildTree = (data) => {
  const map = new Map();
  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  data.forEach(item => {
    const id = item.billNo;
    if (!map.has(id)) {
      map.set(id, { ...item, _children: [] });
    } else {
      map.get(id)._children.push(item);
    }
  });

  return [...map.values()].map(row => {
    if (row._children?.length) {
      row._children.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      delete row._children;
    }
    return row;
  });
};

// Fetch bills for a biennium from both chambers
const fetchBiennium = async (biennium, options = {}) => {
  const { types = ['Bills', 'Session Laws'], tree = true } = options;
  const results = [];

  for (const type of types) {
    const [houseResponse, senateResponse] = await Promise.all([
      fetch(buildUrl('House', 'Xml', biennium, type)).then(r => r.text()),
      fetch(buildUrl('Senate', 'Xml', biennium, type)).then(r => r.text())
    ]);

    let data = [
      ...await parseDirectoryListing(houseResponse, 'House', biennium, type),
      ...await parseDirectoryListing(senateResponse, 'Senate', biennium, type)
    ];

    if (type === 'Bills' && tree) {
      data = buildTree(data);
    } else {
      data.sort((a, b) => b.size - a.size);
    }

    results.push(...data);
  }

  return results;
};

// Parse bill XML for summary information
const parseBillXml = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const dollarAmounts = [...doc.querySelectorAll('DollarAmount')].map(el =>
    parseFloat(el.textContent.replace(/[$,]/g, '')) || 0
  );
  const totalDollarAmount = dollarAmounts.length ? dollarAmounts.reduce((a, b) => a + b, 0) : null;
  const description = doc.querySelector('BriefDescription')?.textContent || null;

  return { description, totalDollarAmount, dollarAmounts };
};

// Fetch and parse bill summary from URL
const fetchBillSummary = async (urlXml) => {
  const xml = await fetch(urlXml).then(r => r.text());
  const summary = parseBillXml(xml);
  return { ...summary, xml };
};

// Main leg object
const leg = Object.assign(fetchBiennium, {
  buildUrl,
  parseDirectoryListing,
  buildTree,
  parseBillXml,
  fetchBillSummary,
  bienniums: ['2025-26', '2023-24', '2021-22', '2019-20', '2017-18', '2015-16', '2013-14', '2011-12', '2009-10', '2007-08', '2005-06', '2003-04'],
  types: ['Bills', 'Session Laws']
});

export { leg };
