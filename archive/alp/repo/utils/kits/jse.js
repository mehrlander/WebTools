// utils/kits/jse.js - JSON editor kit
let mod;

const jse = async opts => {
  mod ??= await import('https://unpkg.com/vanilla-jsoneditor/standalone.js');
  return mod.createJSONEditor(opts);
};

export { jse };
