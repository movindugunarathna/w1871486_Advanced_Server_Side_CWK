'use strict'

var nodemailer = require('nodemailer');
var env = require('../config/env');

var transporter = null;

// Create transporter (supports Ethereal for dev)
async function getTransporter() {
  if (transporter) return transporter;

  if (env.email.user && env.email.pass) {
    transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465,
      auth: {
        user: env.email.user,
        pass: env.email.pass
      }
    });
  } else {
    // Use Ethereal for development
    var testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log('Using Ethereal test email account:', testAccount.user);
  }

  return transporter;
}

// Send an email
exports.sendEmail = async function(to, subject, htmlBody) {
  var transport = await getTransporter();

  var info = await transport.sendMail({
    from: env.email.from,
    to: to,
    subject: subject,
    html: htmlBody
  });

  // Log Ethereal preview URL in development
  if (env.nodeEnv === 'development') {
    console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
  }

  return info;
};
