'use strict'

var cron = require('node-cron');

// Winner selection — every day at 6 PM
// Bid resolution and monthly resets will be implemented in Module 4
exports.start = function() {
  // Daily winner selection at 6 PM
  cron.schedule('0 18 * * *', async function() {
    console.log('[Scheduler] Running daily winner selection...');
    // TODO: Implement in Module 4
  });

  // Monthly reset — first day of each month at 00:01
  cron.schedule('1 0 1 * *', async function() {
    console.log('[Scheduler] Running monthly reset...');
    // TODO: Implement in Module 4
  });

  console.log('Scheduler started');
};
