// utils/kits/jszip.js - ZIP file kit
let mod;

const jszip = async () => mod ??= await import('https://cdn.jsdelivr.net/npm/jszip/+esm').then(m => m.default);

export { jszip };
