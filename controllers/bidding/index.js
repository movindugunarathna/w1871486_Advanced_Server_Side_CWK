'use strict'

var express = require('express');
var router = express.Router();

var { Op } = require('sequelize');

var { isAlumnus } = require('../../middleware/auth');
var { bidRules, validate } = require('../../middleware/validators');
var { bidLimiter } = require('../../middleware/rateLimiter');

var { Bid, FeaturedAlumnus, User, sequelize } = require('../../models');

exports.name = 'bidding';
exports.prefix = '/api/bidding';
exports.router = router;

// All routes require isAlumnus middleware.
router.use(isAlumnus);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateOnlyLocal(d) {
  // MySQL DATEONLY expects YYYY-MM-DD in local time.
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function getTomorrowDateOnly() {
  var t = new Date();
  t.setDate(t.getDate() + 1);
  return toDateOnlyLocal(t);
}

function isBiddingOpenNow() {
  // Bidding closes at 6 PM today (server local time) for tomorrow's slot.
  var now = new Date();
  var closing = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0);
  return now < closing;
}

function getMonthRange(date) {
  var d = date || new Date();
  var first = new Date(d.getFullYear(), d.getMonth(), 1);
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    firstDateOnly: toDateOnlyLocal(first),
    lastDateOnly: toDateOnlyLocal(last)
  };
}

async function getWinsThisMonth(userId, now) {
  var range = getMonthRange(now);
  return FeaturedAlumnus.count({
    where: {
      userId: userId,
      featuredDate: { [Op.between]: [range.firstDateOnly, range.lastDateOnly] }
    }
  });
}

// GET /api/bidding/slot
router.get('/slot', function(req, res) {
  var tomorrowDateOnly = getTomorrowDateOnly();
  var biddingOpen = isBiddingOpenNow();

  Promise.all([
    Bid.count({ where: { bidDate: tomorrowDateOnly } }),
    Bid.findOne({
      where: {
        userId: req.session.userId,
        bidDate: tomorrowDateOnly,
        status: { [Op.in]: ['active', 'won', 'lost'] }
      },
      order: [['createdAt', 'DESC']]
    })
  ]).then(function(results) {
    var totalBids = results[0];
    var currentBid = results[1];
    res.json({
      success: true,
      data: {
        date: tomorrowDateOnly,
        biddingOpen: biddingOpen,
        // Include bidId to enable PUT updates in the UI.
        currentUserBid: currentBid ? {
          bidId: currentBid.id,
          status: currentBid.status
        } : null,
        totalBids: totalBids
      }
    });
  }).catch(function(err) {
    console.error('Get slot error:', err);
    res.status(500).json({ success: false, message: 'Failed to load slot info' });
  });
});

// POST /api/bidding/bid
router.post('/bid', bidLimiter, bidRules, validate, async function(req, res) {
  var tomorrowDateOnly = getTomorrowDateOnly();
  var userId = req.session.userId;
  var biddingOpen = isBiddingOpenNow();
  var amount = Number(req.body.amount);

  if (!biddingOpen) {
    return res.status(400).json({ success: false, message: 'Bidding for tomorrow is closed.' });
  }

  try {
    // Only allow one active bid per user per tomorrow's date.
    var existing = await Bid.findOne({
      where: { userId: userId, bidDate: tomorrowDateOnly, status: 'active' }
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active bid. Use PUT to increase.'
      });
    }

    var user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
    }

    var winsThisMonth = await getWinsThisMonth(userId);
    var maxAllowed = user.attendedEvent ? 4 : 3;
    if (winsThisMonth >= maxAllowed) {
      return res.status(403).json({ success: false, message: 'Monthly feature limit reached.' });
    }

    var bid = await Bid.create({
      userId: userId,
      amount: amount,
      bidDate: tomorrowDateOnly,
      status: 'active'
    });

    // Do NOT reveal whether the user is currently winning.
    res.status(201).json({ success: true, message: 'Bid placed', bidId: bid.id });
  } catch (err) {
    console.error('Place bid error:', err);
    res.status(500).json({ success: false, message: 'Failed to place bid' });
  }
});

// PUT /api/bidding/bid/:bidId
router.put('/bid/:bidId', bidRules, validate, async function(req, res) {
  var tomorrowDateOnly = getTomorrowDateOnly();
  var userId = req.session.userId;
  var biddingOpen = isBiddingOpenNow();
  var bidId = req.params.bidId;
  var amount = Number(req.body.amount);

  if (!biddingOpen) {
    return res.status(400).json({ success: false, message: 'Bidding for tomorrow is closed.' });
  }

  try {
    var bid = await Bid.findOne({
      where: {
        id: bidId,
        userId: userId,
        bidDate: tomorrowDateOnly,
        status: 'active'
      }
    });

    if (!bid) {
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }

    var currentAmount = Number(bid.amount);
    if (!(amount > currentAmount)) {
      return res.status(400).json({ success: false, message: 'You can only increase your bid.' });
    }

    await bid.update({ amount: amount });
    res.json({ success: true, message: 'Bid updated' });
  } catch (err) {
    console.error('Update bid error:', err);
    res.status(500).json({ success: false, message: 'Failed to update bid' });
  }
});

// DELETE /api/bidding/bid/:bidId
router.delete('/bid/:bidId', async function(req, res) {
  var tomorrowDateOnly = getTomorrowDateOnly();
  var userId = req.session.userId;
  var bidId = req.params.bidId;

  try {
    var bid = await Bid.findOne({
      where: { id: bidId, userId: userId, bidDate: tomorrowDateOnly, status: 'active' }
    });
    if (!bid) {
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }

    await bid.update({ status: 'cancelled' });
    res.json({ success: true, message: 'Bid cancelled' });
  } catch (err) {
    console.error('Cancel bid error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel bid' });
  }
});

// GET /api/bidding/bid/:bidId/status
router.get('/bid/:bidId/status', async function(req, res) {
  var tomorrowDateOnly = getTomorrowDateOnly();
  var userId = req.session.userId;
  var bidId = req.params.bidId;

  try {
    var bid = await Bid.findOne({
      where: { id: bidId, userId: userId, bidDate: tomorrowDateOnly }
    });

    if (!bid) {
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }

    var highestActiveAmount = await Bid.max('amount', {
      where: { bidDate: tomorrowDateOnly, status: 'active' }
    });

    var position = 'not winning';
    if (highestActiveAmount !== null && Number(bid.amount) === Number(highestActiveAmount)) {
      position = 'winning';
    }

    res.json({
      success: true,
      data: {
        bidId: bid.id,
        status: bid.status,
        position: position
      }
    });
  } catch (err) {
    console.error('Bid status error:', err);
    res.status(500).json({ success: false, message: 'Failed to load bid status' });
  }
});

// GET /api/bidding/history?page=1&limit=10
router.get('/history', async function(req, res) {
  var userId = req.session.userId;
  var page = parseInt(req.query.page, 10) || 1;
  var limit = parseInt(req.query.limit, 10) || 10;
  limit = Math.min(limit, 50);
  var offset = (page - 1) * limit;

  try {
    var result = await Bid.findAndCountAll({
      where: { userId: userId },
      attributes: ['id', 'bidDate', 'status'],
      order: [['bidDate', 'DESC'], ['createdAt', 'DESC']],
      offset: offset,
      limit: limit
    });

    res.json({
      success: true,
      data: result.rows,
      meta: {
        page: page,
        limit: limit,
        total: result.count
      }
    });
  } catch (err) {
    console.error('Bid history error:', err);
    res.status(500).json({ success: false, message: 'Failed to load bid history' });
  }
});

// GET /api/bidding/monthly-status
router.get('/monthly-status', async function(req, res) {
  var userId = req.session.userId;
  var now = new Date();
  var user = null;

  try {
    user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
    }

    var winsThisMonth = await getWinsThisMonth(userId, now);
    var maxAllowed = user.attendedEvent ? 4 : 3;
    var remainingSlots = Math.max(0, maxAllowed - winsThisMonth);

    var monthName = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    var monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1) + ' ' + now.getFullYear();

    res.json({
      success: true,
      data: {
        month: monthLabel,
        winsThisMonth: winsThisMonth,
        maxAllowed: maxAllowed,
        attendedEvent: !!user.attendedEvent,
        remainingSlots: remainingSlots
      }
    });
  } catch (err) {
    console.error('Monthly status error:', err);
    res.status(500).json({ success: false, message: 'Failed to load monthly status' });
  }
});
