#!/usr/bin/env node
'use strict';

/**
 * One-off dummy alumni seed for a VM (uses .env in project root).
 * Default: 45 users (30–50 allowed by seed-alumni-batch).
 *
 *   node utils/vm-seed-dummies.js
 *   node utils/vm-seed-dummies.js 40
 */
var n = parseInt(process.argv[2], 10);
if (!Number.isFinite(n) || n < 30 || n > 50) {
  process.argv[2] = '45';
} else {
  process.argv[2] = String(n);
}
require('./seed-alumni-batch.js');
