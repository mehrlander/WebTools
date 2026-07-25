// Drive the data-view demo through its envelope's three items, so one shot
// proves the item strip switches and each item's declared `view` wins:
// contributions.csv → table, shape.json → tree, README.md → preview.
export default async (page) => {
  const shots = [];
  for (const [i, label] of [[1, 'tree'], [2, 'preview']]) {
    await page.evaluate((n) => window.Alpine.$data(document.querySelector('[x-data^="app"]')).open(n), i);
    await page.waitForTimeout(1800);
    shots.push(label);
  }
  // Land on the markdown preview for the shot itself.
};
