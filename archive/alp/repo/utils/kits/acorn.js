// utils/kits/acorn.js - JavaScript parser kit
let mod;

const acorn = async () => mod ??= await import('https://unpkg.com/acorn@8.11.3/dist/acorn.mjs');

acorn.parse = async (text, opts) => (await acorn()).parse(text, { ecmaVersion: 2022, ...opts });

acorn.isJS = async text => { try { await acorn.parse(text); return true } catch { return false } };

export { acorn };
