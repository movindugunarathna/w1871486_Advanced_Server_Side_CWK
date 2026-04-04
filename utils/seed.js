'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

var bcrypt = require('bcryptjs');
var {
  sequelize,
  User,
  Profile,
  Degree,
  Certification,
  Licence,
  ProfessionalCourse,
  Employment
} = require('../models');

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
      biography: 'Full-stack software engineer with experience across cloud platforms, security, and agile delivery.',
      linkedInUrl: 'https://linkedin.com/in/johndoe',
      profileComplete: true
    });

    await Degree.bulkCreate([
      {
        profileId: profile1.id,
        name: 'BSc (Hons) Computer Science',
        university: 'Eastminster University',
        officialUrl: 'https://www.eastminster.ac.uk/cs',
        completionDate: '2018-07-20'
      },
      {
        profileId: profile1.id,
        name: 'MSc Advanced Software Engineering',
        university: 'Eastminster University',
        officialUrl: 'https://www.eastminster.ac.uk/msc-se',
        completionDate: '2020-06-15'
      },
      {
        profileId: profile1.id,
        name: 'PG Cert Innovation & Entrepreneurship',
        university: 'Eastminster University',
        completionDate: '2021-03-10'
      }
    ]);

    await Certification.bulkCreate([
      {
        profileId: profile1.id,
        name: 'AWS Certified Solutions Architect – Associate',
        issuingBody: 'Amazon Web Services',
        courseUrl: 'https://aws.amazon.com/certification/',
        completionDate: '2021-11-05'
      },
      {
        profileId: profile1.id,
        name: 'Microsoft Certified: Azure Developer Associate',
        issuingBody: 'Microsoft',
        courseUrl: 'https://learn.microsoft.com/certifications/',
        completionDate: '2022-04-18'
      },
      {
        profileId: profile1.id,
        name: 'Certified Kubernetes Application Developer (CKAD)',
        issuingBody: 'Cloud Native Computing Foundation',
        courseUrl: 'https://www.cncf.io/certification/ckad/',
        completionDate: '2023-02-28'
      },
      {
        profileId: profile1.id,
        name: 'Professional Scrum Master I (PSM I)',
        issuingBody: 'Scrum.org',
        courseUrl: 'https://www.scrum.org/courses',
        completionDate: '2019-09-12'
      }
    ]);

    await Licence.bulkCreate([
      {
        profileId: profile1.id,
        name: 'Chartered IT Professional (CITP)',
        awardingBody: 'BCS, The Chartered Institute for IT',
        licenceUrl: 'https://www.bcs.org/get-qualified/chartered-it-professional/',
        completionDate: '2022-01-15'
      },
      {
        profileId: profile1.id,
        name: 'PRINCE2 Practitioner',
        awardingBody: 'PeopleCert / AXELOS',
        licenceUrl: 'https://www.axelos.com/certifications/propath/prince2-project-management',
        completionDate: '2020-08-30'
      },
      {
        profileId: profile1.id,
        name: 'CompTIA Security+',
        awardingBody: 'CompTIA',
        licenceUrl: 'https://www.comptia.org/certifications/security',
        completionDate: '2021-06-22'
      }
    ]);

    await ProfessionalCourse.bulkCreate([
      {
        profileId: profile1.id,
        name: 'Machine Learning Specialization',
        provider: 'Coursera / Stanford Online',
        courseUrl: 'https://www.coursera.org/specializations/machine-learning-introduction',
        completionDate: '2019-12-01'
      },
      {
        profileId: profile1.id,
        name: 'System Design Interview Course',
        provider: 'Educative',
        courseUrl: 'https://www.educative.io/courses/grokking-the-system-design-interview',
        completionDate: '2022-07-14'
      },
      {
        profileId: profile1.id,
        name: 'Advanced React Patterns',
        provider: 'Frontend Masters',
        courseUrl: 'https://frontendmasters.com/',
        completionDate: '2023-05-08'
      },
      {
        profileId: profile1.id,
        name: 'Terraform Associate Bootcamp',
        provider: 'HashiCorp Learn',
        courseUrl: 'https://developer.hashicorp.com/terraform/tutorials',
        completionDate: '2022-11-20'
      }
    ]);

    await Employment.bulkCreate([
      {
        profileId: profile1.id,
        company: 'Eastminster Labs',
        role: 'Junior Software Developer',
        startDate: '2018-08-01',
        endDate: '2020-06-30'
      },
      {
        profileId: profile1.id,
        company: 'Tech Corp',
        role: 'Software Engineer',
        startDate: '2020-07-01',
        endDate: null
      }
    ]);

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
