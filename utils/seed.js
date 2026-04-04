'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

var bcrypt = require('bcryptjs');
var { sequelize, User, Profile, Degree, Employment } = require('../models');

async function seed() {
  try {
    console.log('Connecting to XAMPP MySQL...');
    await sequelize.authenticate();
    console.log('Connected. Syncing tables (force: true)...');
    await sequelize.sync({ force: true });
    console.log('Tables created.\n');

    var hashedPassword = await bcrypt.hash('Password1!', 12);

    // ── Alumni Users ──
    var alumni1 = await User.create({
      email: 'john.doe@eastminster.ac.uk',
      password: hashedPassword,
      role: 'alumnus',
      isVerified: true
    });
    var profile1 = await Profile.create({
      userId: alumni1.id,
      firstName: 'John',
      lastName: 'Doe',
      biography: 'Software engineer with 5 years of experience.',
      linkedInUrl: 'https://linkedin.com/in/johndoe',
      profileComplete: true
    });
    await Degree.create({
      profileId: profile1.id,
      name: 'BSc Computer Science',
      university: 'Eastminster University',
      completionDate: '2020-06-15'
    });
    await Employment.create({
      profileId: profile1.id,
      company: 'Tech Corp',
      role: 'Software Engineer',
      startDate: '2020-07-01',
      endDate: null
    });

    var alumni2 = await User.create({
      email: 'jane.smith@eastminster.ac.uk',
      password: hashedPassword,
      role: 'alumnus',
      isVerified: true
    });
    var profile2 = await Profile.create({
      userId: alumni2.id,
      firstName: 'Jane',
      lastName: 'Smith',
      biography: 'Data scientist specialising in machine learning.',
      linkedInUrl: 'https://linkedin.com/in/janesmith',
      profileComplete: true
    });
    await Degree.create({
      profileId: profile2.id,
      name: 'MSc Data Science',
      university: 'Eastminster University',
      completionDate: '2021-09-20'
    });
    await Employment.create({
      profileId: profile2.id,
      company: 'Data Inc',
      role: 'Data Scientist',
      startDate: '2021-10-01',
      endDate: null
    });

    var alumni3 = await User.create({
      email: 'bob.wilson@eastminster.ac.uk',
      password: hashedPassword,
      role: 'alumnus',
      isVerified: true
    });
    await Profile.create({
      userId: alumni3.id,
      firstName: 'Bob',
      lastName: 'Wilson',
      biography: 'Product manager at a fintech startup.',
      profileComplete: false
    });

    // ── Developer User ──
    var dev = await User.create({
      email: 'dev.user@eastminster.ac.uk',
      password: hashedPassword,
      role: 'developer',
      isVerified: true
    });
    await Profile.create({
      userId: dev.id,
      firstName: 'Dev',
      lastName: 'User'
    });

    console.log('Seed data created successfully!\n');
    console.log('Test accounts (password: Password1!):');
    console.log('  Alumni:    john.doe@eastminster.ac.uk');
    console.log('  Alumni:    jane.smith@eastminster.ac.uk');
    console.log('  Alumni:    bob.wilson@eastminster.ac.uk');
    console.log('  Developer: dev.user@eastminster.ac.uk');

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();