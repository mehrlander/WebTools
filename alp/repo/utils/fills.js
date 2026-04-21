// utils/fills.js - Template fill helpers for alp components

const mc = (prefix, mods) => mods.map(m => `${prefix}-${m}`).join(' ');
const sz = mods => ['xs', 'sm', 'md', 'lg', 'xl'].find(s => mods.includes(s));
const pos = mods => ['top', 'bottom', 'left', 'right'].find(p => mods.includes(p)) || 'bottom';
const gap = mods => ['gap-0', 'gap-1', 'gap-2', 'gap-3', 'gap-4'].find(g => mods.includes(g)) || 'gap-0';

const txt = mods => [
  sz(mods) && `text-${sz(mods)}`,
  ['left', 'center', 'right'].find(a => mods.includes(a)) && `text-${['left', 'center', 'right'].find(a => mods.includes(a))}`,
  mods.includes('bold') && 'font-bold',
  mods.includes('semibold') && 'font-semibold',
  mods.includes('italic') && 'italic',
  mods.includes('mono') && 'font-mono',
  mods.includes('muted') && 'opacity-60'
].filter(Boolean).join(' ');

export const fills = {
  pathInput: () => `
    <input x-model="_path"
      @blur="path = $el.value"
      @keydown.enter.prevent="$el.blur()"
      class="input input-xs input-ghost text-xs text-right w-48"
      placeholder="path">`,

  saveIndicator: () => `<span x-show="saving" class="loading loading-spinner loading-xs"></span>`,

  toolbar: (mods, ...items) => `<div class="flex gap-2 items-center justify-between mb-2">${items.join('')}</div>`,

  btn: (mods, label, click, iconClasses = '', extraClasses = '') => `
    <button @click="${click}" class="btn ${mc('btn', mods)} ${extraClasses}">
      ${iconClasses ? `<i class="ph ${iconClasses} ${sz(mods) ? `text-${sz(mods)}` : ''}"></i>` : ''}
      ${label ? `<span>${label}</span>` : ''}
    </button>`,

  modal: (inner) => `
    <dialog class="modal">
      <div class="modal-box w-full max-w-[95%] h-[80vh] p-0 shadow-lg flex flex-col overflow-hidden rounded-lg">
        ${inner}
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>`,

  tip: (mods, trigger, content) => {
    const cls = ['tooltip-content bg-base-100 text-base-content border border-base-300 rounded-box shadow-lg p-3 text-left',
      txt(mods) || 'text-xs'].filter(Boolean).join(' ');
    return `<div class="tooltip tooltip-${pos(mods)}"><div class="${cls}">${content}</div>${trigger}</div>`;
  },

  lines: (mods, arr) => {
    const cls = ['flex flex-col', gap(mods), txt(mods)].filter(Boolean).join(' ');
    return `<div class="${cls}">${arr.map(s => `<div>${s}</div>`).join('')}</div>`;
  }
};
