// The same seed as activity-pr-state.mjs, opened on the Abandoned chip: the
// scope that collects branches whose PR was closed without merging. Composed
// rather than copied, since the seed is the subject in both shots and two
// copies of it would drift.
import seedPrState from './activity-pr-state.mjs';

export default async (page, ctx) => {
  await page.evaluate(() => { window.__scenarioScope = 'abandoned'; });
  await seedPrState(page, ctx);
};
