'use strict'

var cron = require('node-cron');

var sequelize = require('../models').sequelize;
var { Op } = require('sequelize');
var { Bid, FeaturedAlumnus, User, Profile } = require('../models');
var { sendEmail } = require('./email');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateOnlyLocal(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function getTomorrowDateOnly() {
  var t = new Date();
  t.setDate(t.getDate() + 1);
  return toDateOnlyLocal(t);
}

function getTodayDateOnly() {
  return toDateOnlyLocal(new Date());
}

async function runDailyWinnerSelection(bidDate) {
  // Only consider active bids for the date.
  var activeBids = await Bid.findAll({
    where: { bidDate: bidDate, status: 'active' },
    order: [['amount', 'DESC'], ['createdAt', 'ASC']]
  });

  if (!activeBids || activeBids.length === 0) {
    return;
  }

  var winnerBid = activeBids[0];
  var loserBids = activeBids.slice(1);

  // Pick winner + resolve statuses atomically.
  var createdFeatured = false;
  await sequelize.transaction(async function(t) {
    // Track whether this date was already resolved.
    var existingFeatured = await FeaturedAlumnus.findOne({
      where: { featuredDate: bidDate },
      transaction: t
    });

    // Mark the winner as won.
    await Bid.update(
      { status: 'won' },
      { where: { id: winnerBid.id }, transaction: t }
    );

    // Mark everyone else as lost.
    if (loserBids.length > 0) {
      await Bid.update(
        { status: 'lost' },
        {
          where: {
            bidDate: bidDate,
            status: 'active',
            id: { [Op.ne]: winnerBid.id }
          },
          transaction: t
        }
      );
    }

    // Create featured record idempotently (featuredDate is unique).
    if (!existingFeatured) {
      var winnerProfile = await Profile.findOne({
        where: { userId: winnerBid.userId },
        transaction: t
      });

      if (winnerProfile) {
        await FeaturedAlumnus.create({
          userId: winnerBid.userId,
          profileId: winnerProfile.id,
          featuredDate: bidDate,
          winningBidAmount: winnerBid.amount,
          activatedAt: new Date()
        }, { transaction: t });

        createdFeatured = true;
      }
    }

    // Increment appearance count for the winner only for the first resolution.
    if (createdFeatured) {
      await User.increment(
        { appearanceCount: 1 },
        { where: { id: winnerBid.userId }, transaction: t }
      );
    }
  });

  // Email notifications (outside the transaction).
  if (!createdFeatured) return;

  try {
    var winnerUser = await User.findByPk(winnerBid.userId);
    if (winnerUser && winnerUser.email) {
      await sendEmail(
        winnerUser.email,
        'Congratulations! You are tomorrow\'s Alumni of the Day!',
        '<p>Congratulations! You are tomorrow\'s Alumni of the Day!</p>' +
          '<p>Thanks for participating in the blind bidding system.</p>'
      );
    }

    // Losers: notify distinct users from all losing bids.
    var loserUserIds = loserBids.map(function(b) { return b.userId; });
    loserUserIds = Array.from(new Set(loserUserIds));

    if (loserUserIds.length > 0) {
      var losers = await User.findAll({ where: { id: { [Op.in]: loserUserIds } } });
      await Promise.all(losers.map(function(u) {
        if (!u.email) return Promise.resolve();
        return sendEmail(
          u.email,
          'Your bid was not successful. Try again!',
          '<p>Your bid was not successful. Try again!</p>'
        );
      }));
    }
  } catch (err) {
    // Never crash the cron job due to email issues.
    console.error('[Scheduler] Email notification failed:', err.message);
  }
}

async function runMonthlyReset() {
  try {
    await User.update(
      { appearanceCount: 0, attendedEvent: false, lastAppearanceReset: new Date() },
      { where: {} }
    );
  } catch (err) {
    console.error('[Scheduler] Monthly reset failed:', err.message);
  }
}

exports.start = function() {
  // Winner selection aligned to bidding close time.
  // Bids are placed for the "tomorrow" date, and bidding closes at 6 PM today.
  // So: at 6 PM we resolve bids whose `bidDate` equals tomorrow.
  cron.schedule('0 18 * * *', async function() {
    console.log('[Scheduler] Running daily winner selection (6 PM)...');
    var tomorrowDateOnly = getTomorrowDateOnly();
    try {
      await runDailyWinnerSelection(tomorrowDateOnly);
    } catch (err) {
      console.error('[Scheduler] Daily winner selection (6 PM) failed:', err.message);
    }
  });

  // Safety net: also run at midnight to catch any edge cases.
  // If the 6 PM resolution already happened, the second run will no-op
  // because there will be no remaining active bids for that date.
  cron.schedule('0 0 * * *', async function() {
    console.log('[Scheduler] Running daily winner selection (midnight)...');
    var todayDateOnly = getTodayDateOnly();
    try {
      await runDailyWinnerSelection(todayDateOnly);
    } catch (err) {
      console.error('[Scheduler] Daily winner selection (midnight) failed:', err.message);
    }
  });

  // Monthly reset — first day of each month at 00:01
  cron.schedule('1 0 1 * *', async function() {
    console.log('[Scheduler] Running monthly reset...');
    await runMonthlyReset();
  });

  console.log('Scheduler started');
};

// Export for test/sanity checks without waiting for cron.
exports.runDailyWinnerSelection = runDailyWinnerSelection;
