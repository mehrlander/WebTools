// utils/kit.js - Third-party library loaders and utilities
import { brotli } from './kits/brotli.js';
import { gzip } from './kits/gzip.js';
import { acorn } from './kits/acorn.js';
import { jse } from './kits/jse.js';
import { text } from './kits/text.js';
import { tb } from './kits/tb.js';
import { leg } from './kits/leg.js';
import { dexie } from './kits/dexie.js';

export const kit = { brotli, gzip, text, acorn, jse, tb, leg, dexie };
