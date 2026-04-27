'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

var bcrypt = require('bcryptjs');
var {
  sequelize,
  User, Profile, Degree, Certification, Licence,
  ProfessionalCourse, Employment, Bid, FeaturedAlumnus, ApiKey
} = require('../models');

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n) {
  var d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Data pools ────────────────────────────────────────────────────────────────

var programmes = [
  'BSc Computer Science',
  'BSc Software Engineering',
  'MEng Computer Science',
  'MSc Data Science',
  'MSc Artificial Intelligence',
  'BSc Information Technology',
  'MBA Business & Technology',
  'BSc Cybersecurity',
  'MSc Cloud Computing',
  'BSc Business Information Systems'
];

var universities = [
  'Eastminster University',
  'City University London',
  'University of Manchester',
  'King\'s College London',
  'University of Edinburgh'
];

var companies = [
  'Google', 'Microsoft', 'Amazon', 'Meta', 'Apple',
  'Deloitte', 'KPMG', 'Accenture', 'IBM', 'Capgemini',
  'Goldman Sachs', 'Barclays', 'HSBC', 'JP Morgan',
  'NHS Digital', 'GCHQ', 'BT Group', 'Vodafone',
  'StartupAI Ltd', 'TechVentures UK'
];

var roles = [
  'Software Engineer', 'Senior Software Engineer', 'Lead Developer',
  'Data Scientist', 'Machine Learning Engineer', 'AI Researcher',
  'Cloud Architect', 'DevOps Engineer', 'Site Reliability Engineer',
  'Product Manager', 'Technical Project Manager', 'Scrum Master',
  'Business Analyst', 'Systems Analyst', 'IT Consultant',
  'Cybersecurity Analyst', 'Security Engineer', 'Penetration Tester',
  'Full-Stack Developer', 'Backend Engineer'
];

var certifications = [
  { name: 'AWS Solutions Architect – Associate', issuingBody: 'Amazon Web Services' },
  { name: 'AWS Solutions Architect – Professional', issuingBody: 'Amazon Web Services' },
  { name: 'AWS Cloud Practitioner', issuingBody: 'Amazon Web Services' },
  { name: 'Microsoft Azure Fundamentals (AZ-900)', issuingBody: 'Microsoft' },
  { name: 'Microsoft Azure Administrator (AZ-104)', issuingBody: 'Microsoft' },
  { name: 'Google Professional Cloud Architect', issuingBody: 'Google Cloud' },
  { name: 'Google Associate Cloud Engineer', issuingBody: 'Google Cloud' },
  { name: 'Certified Kubernetes Administrator (CKA)', issuingBody: 'CNCF' },
  { name: 'Certified Ethical Hacker (CEH)', issuingBody: 'EC-Council' },
  { name: 'CompTIA Security+', issuingBody: 'CompTIA' },
  { name: 'CISSP', issuingBody: 'ISC2' },
  { name: 'PMP', issuingBody: 'PMI' },
  { name: 'Scrum Master (CSM)', issuingBody: 'Scrum Alliance' },
  { name: 'Tableau Desktop Specialist', issuingBody: 'Tableau' },
  { name: 'Salesforce Administrator', issuingBody: 'Salesforce' }
];

var courses = [
  { name: 'Machine Learning Specialization', provider: 'Coursera (Stanford)' },
  { name: 'Deep Learning Specialization', provider: 'Coursera (DeepLearning.AI)' },
  { name: 'Data Science Professional Certificate', provider: 'IBM / Coursera' },
  { name: 'Full-Stack Web Development Bootcamp', provider: 'Udemy' },
  { name: 'React & Node.js Complete Course', provider: 'Udemy' },
  { name: 'Python for Data Science and AI', provider: 'edX (IBM)' },
  { name: 'Applied Data Science with Python', provider: 'Coursera (Michigan)' },
  { name: 'Cloud Computing Fundamentals', provider: 'edX (IBM)' },
  { name: 'Docker & Kubernetes: The Complete Guide', provider: 'Udemy' },
  { name: 'Natural Language Processing Specialization', provider: 'Coursera (DeepLearning.AI)' },
  { name: 'Business Intelligence Analyst Course', provider: 'Udemy' },
  { name: 'Agile Project Management', provider: 'Google / Coursera' },
  { name: 'Cybersecurity Fundamentals', provider: 'edX (IBM)' },
  { name: 'Blockchain Basics', provider: 'Coursera (SUNY)' }
];

var licences = [
  { name: 'Chartered IT Professional (CITP)', awardingBody: 'BCS' },
  { name: 'Chartered Engineer (CEng)', awardingBody: 'Engineering Council' },
  { name: 'PRINCE2 Practitioner', awardingBody: 'AXELOS' },
  { name: 'ITIL 4 Foundation', awardingBody: 'AXELOS' }
];

// ── Alumni profile data ───────────────────────────────────────────────────────

var alumniData = [
  {
    firstName: 'Alice', lastName: 'Thompson',
    bio: 'Senior software engineer specialising in distributed systems and cloud architecture.',
    linkedin: 'https://linkedin.com/in/alice-thompson',
    programme: 'BSc Computer Science', gradYear: 2019, university: 'Eastminster University',
    employer: 'Google', role: 'Senior Software Engineer',
    certs: [0, 6, 8], courseIdxs: [0, 4], licenceIdx: 0
  },
  {
    firstName: 'Ben', lastName: 'Kaur',
    bio: 'Data scientist with expertise in NLP and recommendation systems.',
    linkedin: 'https://linkedin.com/in/ben-kaur',
    programme: 'MSc Data Science', gradYear: 2021, university: 'Eastminster University',
    employer: 'Amazon', role: 'Data Scientist',
    certs: [1, 13], courseIdxs: [1, 6], licenceIdx: null
  },
  {
    firstName: 'Clara', lastName: 'Osei',
    bio: 'Cloud architect leading migration projects for enterprise clients.',
    linkedin: 'https://linkedin.com/in/clara-osei',
    programme: 'MSc Cloud Computing', gradYear: 2020, university: 'Eastminster University',
    employer: 'Microsoft', role: 'Cloud Architect',
    certs: [4, 5, 7], courseIdxs: [3, 8], licenceIdx: 1
  },
  {
    firstName: 'Dan', lastName: 'Reeves',
    bio: 'Cybersecurity professional with a focus on ethical hacking and penetration testing.',
    linkedin: 'https://linkedin.com/in/dan-reeves',
    programme: 'BSc Cybersecurity', gradYear: 2020, university: 'City University London',
    employer: 'GCHQ', role: 'Cybersecurity Analyst',
    certs: [8, 9, 10], courseIdxs: [12], licenceIdx: null
  },
  {
    firstName: 'Eva', lastName: 'Martinez',
    bio: 'ML engineer working on large language models and computer vision.',
    linkedin: 'https://linkedin.com/in/eva-martinez',
    programme: 'MSc Artificial Intelligence', gradYear: 2022, university: 'Eastminster University',
    employer: 'Meta', role: 'Machine Learning Engineer',
    certs: [0, 2], courseIdxs: [0, 1, 9], licenceIdx: null
  },
  {
    firstName: 'Finn', lastName: 'O\'Brien',
    bio: 'Product manager with background in agile delivery for fintech products.',
    linkedin: 'https://linkedin.com/in/finn-obrien',
    programme: 'MBA Business & Technology', gradYear: 2019, university: 'Eastminster University',
    employer: 'Goldman Sachs', role: 'Product Manager',
    certs: [11, 12], courseIdxs: [11], licenceIdx: 2
  },
  {
    firstName: 'Grace', lastName: 'Liu',
    bio: 'Full-stack developer with strong React and Node.js skills.',
    linkedin: 'https://linkedin.com/in/grace-liu',
    programme: 'BSc Software Engineering', gradYear: 2021, university: 'Eastminster University',
    employer: 'Accenture', role: 'Full-Stack Developer',
    certs: [2, 12], courseIdxs: [4, 5], licenceIdx: null
  },
  {
    firstName: 'Hassan', lastName: 'Ali',
    bio: 'DevOps engineer automating CI/CD pipelines across multi-cloud environments.',
    linkedin: 'https://linkedin.com/in/hassan-ali',
    programme: 'BSc Computer Science', gradYear: 2020, university: 'University of Manchester',
    employer: 'IBM', role: 'DevOps Engineer',
    certs: [0, 4, 7], courseIdxs: [7, 8], licenceIdx: 3
  },
  {
    firstName: 'Isla', lastName: 'Patel',
    bio: 'Business analyst bridging the gap between technology and operations in the NHS.',
    linkedin: 'https://linkedin.com/in/isla-patel',
    programme: 'BSc Business Information Systems', gradYear: 2018, university: 'Eastminster University',
    employer: 'NHS Digital', role: 'Business Analyst',
    certs: [3, 11], courseIdxs: [2, 10], licenceIdx: null
  },
  {
    firstName: 'Jack', lastName: 'Morris',
    bio: 'AI researcher focused on reinforcement learning and robotics.',
    linkedin: 'https://linkedin.com/in/jack-morris',
    programme: 'MEng Computer Science', gradYear: 2023, university: 'Eastminster University',
    employer: 'DeepMind', role: 'AI Researcher',
    certs: [6], courseIdxs: [0, 1, 9], licenceIdx: null
  },
  {
    firstName: 'Karen', lastName: 'Nguyen',
    bio: 'Senior consultant specialising in digital transformation for financial services.',
    linkedin: 'https://linkedin.com/in/karen-nguyen',
    programme: 'MBA Business & Technology', gradYear: 2017, university: 'King\'s College London',
    employer: 'Deloitte', role: 'IT Consultant',
    certs: [11, 12, 14], courseIdxs: [11], licenceIdx: 2
  },
  {
    firstName: 'Liam', lastName: 'Walker',
    bio: 'Backend engineer building high-throughput APIs for a telecommunications provider.',
    linkedin: 'https://linkedin.com/in/liam-walker',
    programme: 'BSc Software Engineering', gradYear: 2022, university: 'Eastminster University',
    employer: 'BT Group', role: 'Backend Engineer',
    certs: [2, 3], courseIdxs: [4, 7], licenceIdx: null
  },
  {
    firstName: 'Maya', lastName: 'Singh',
    bio: 'Data engineer building scalable data pipelines on AWS and Spark.',
    linkedin: 'https://linkedin.com/in/maya-singh',
    programme: 'MSc Data Science', gradYear: 2021, university: 'Eastminster University',
    employer: 'KPMG', role: 'Data Scientist',
    certs: [0, 1, 13], courseIdxs: [6, 10], licenceIdx: null
  },
  {
    firstName: 'Noah', lastName: 'Chen',
    bio: 'Security engineer designing zero-trust architectures for enterprise networks.',
    linkedin: 'https://linkedin.com/in/noah-chen',
    programme: 'BSc Cybersecurity', gradYear: 2019, university: 'Eastminster University',
    employer: 'Barclays', role: 'Security Engineer',
    certs: [9, 10], courseIdxs: [12, 13], licenceIdx: null
  },
  {
    firstName: 'Olivia', lastName: 'Brown',
    bio: 'Scrum master and agile coach helping teams deliver faster and more reliably.',
    linkedin: 'https://linkedin.com/in/olivia-brown',
    programme: 'BSc Information Technology', gradYear: 2018, university: 'University of Edinburgh',
    employer: 'Capgemini', role: 'Scrum Master',
    certs: [12, 11], courseIdxs: [11], licenceIdx: 2
  },
  {
    firstName: 'Peter', lastName: 'Dubois',
    bio: 'Site reliability engineer maintaining 99.99% uptime for global payment systems.',
    linkedin: 'https://linkedin.com/in/peter-dubois',
    programme: 'MEng Computer Science', gradYear: 2020, university: 'Eastminster University',
    employer: 'JP Morgan', role: 'Site Reliability Engineer',
    certs: [4, 7], courseIdxs: [8, 7], licenceIdx: 3
  },
  {
    firstName: 'Quinn', lastName: 'Adams',
    bio: 'Full-stack developer working on consumer-facing mobile and web applications.',
    linkedin: 'https://linkedin.com/in/quinn-adams',
    programme: 'BSc Computer Science', gradYear: 2023, university: 'Eastminster University',
    employer: 'StartupAI Ltd', role: 'Full-Stack Developer',
    certs: [2, 12], courseIdxs: [4, 5], licenceIdx: null
  },
  {
    firstName: 'Rachel', lastName: 'Ford',
    bio: 'Cloud engineer streamlining infrastructure with Terraform and Ansible.',
    linkedin: 'https://linkedin.com/in/rachel-ford',
    programme: 'MSc Cloud Computing', gradYear: 2022, university: 'Eastminster University',
    employer: 'Vodafone', role: 'Cloud Architect',
    certs: [5, 6, 7], courseIdxs: [7, 8], licenceIdx: 1
  },
  {
    firstName: 'Sam', lastName: 'Hughes',
    bio: 'Data analyst producing BI dashboards and KPI reports for retail operations.',
    linkedin: 'https://linkedin.com/in/sam-hughes',
    programme: 'BSc Business Information Systems', gradYear: 2020, university: 'Eastminster University',
    employer: 'HSBC', role: 'Business Analyst',
    certs: [13, 3], courseIdxs: [10, 2], licenceIdx: null
  },
  {
    firstName: 'Tara', lastName: 'Kowalski',
    bio: 'ML engineer building fraud detection models for a leading investment bank.',
    linkedin: 'https://linkedin.com/in/tara-kowalski',
    programme: 'MSc Artificial Intelligence', gradYear: 2023, university: 'Eastminster University',
    employer: 'Goldman Sachs', role: 'Machine Learning Engineer',
    certs: [0, 1], courseIdxs: [0, 1], licenceIdx: null
  }
];

// ── Seed function ─────────────────────────────────────────────────────────────

async function seed() {
  try {
    console.log('Connecting to MySQL...');
    await sequelize.authenticate();
    console.log('Connected. Dropping and recreating all tables...');
    await sequelize.sync({ force: true });
    console.log('Tables ready.\n');

    var hashedPassword = await bcrypt.hash('Password1!', 12);

    // ── Developer account ──────────────────────────────────────────────────────
    var devUser = await User.create({
      email: 'dev.user@eastminster.ac.uk',
      password: hashedPassword,
      role: 'developer',
      isVerified: true
    });
    await Profile.create({ userId: devUser.id, firstName: 'Dev', lastName: 'User' });

    // Generate a ready-to-use API key with all scopes so the dashboard works immediately
    var crypto = require('crypto');
    var rawApiKey = crypto.randomBytes(32).toString('hex');
    await ApiKey.create({
      developerId: devUser.id,
      key: rawApiKey,
      name: 'Analytics Dashboard (auto-seeded)',
      permissions: ['read:alumni', 'read:analytics', 'read:alumni_of_day'],
      isRevoked: false
    });

    // ── Create all 20 alumni ───────────────────────────────────────────────────
    var createdProfiles = [];

    for (var i = 0; i < alumniData.length; i++) {
      var a = alumniData[i];

      var gradYearOffset = new Date().getFullYear() - a.gradYear;
      var completionDate = monthsAgo(gradYearOffset * 12 + Math.floor(Math.random() * 6));

      var user = await User.create({
        email: a.firstName.toLowerCase() + '.' + a.lastName.toLowerCase().replace(/[^a-z]/g, '') + '@eastminster.ac.uk',
        password: hashedPassword,
        role: 'alumnus',
        isVerified: true,
        appearanceCount: Math.floor(Math.random() * 3)
      });

      var profile = await Profile.create({
        userId: user.id,
        firstName: a.firstName,
        lastName: a.lastName,
        biography: a.bio,
        linkedInUrl: a.linkedin,
        profileComplete: true
      });

      // Degree
      await Degree.create({
        profileId: profile.id,
        name: a.programme,
        university: a.university,
        completionDate: completionDate
      });

      // Certifications
      for (var ci = 0; ci < a.certs.length; ci++) {
        var cert = certifications[a.certs[ci]];
        await Certification.create({
          profileId: profile.id,
          name: cert.name,
          issuingBody: cert.issuingBody,
          completionDate: monthsAgo(Math.floor(Math.random() * 18) + 1)
        });
      }

      // Professional courses
      for (var ki = 0; ki < a.courseIdxs.length; ki++) {
        var course = courses[a.courseIdxs[ki]];
        await ProfessionalCourse.create({
          profileId: profile.id,
          name: course.name,
          provider: course.provider,
          completionDate: monthsAgo(Math.floor(Math.random() * 24) + 1)
        });
      }

      // Licence (optional)
      if (a.licenceIdx !== null) {
        var lic = licences[a.licenceIdx];
        await Licence.create({
          profileId: profile.id,
          name: lic.name,
          awardingBody: lic.awardingBody,
          completionDate: monthsAgo(Math.floor(Math.random() * 12) + 1)
        });
      }

      // Employment — previous job + current job
      var prevStartOffset = gradYearOffset * 12 + 3;
      var prevEndOffset   = Math.floor(prevStartOffset / 2);
      var prevCompany     = rand(companies.filter(function(c) { return c !== a.employer; }));
      await Employment.create({
        profileId: profile.id,
        company: prevCompany,
        role: rand(roles),
        startDate: monthsAgo(prevStartOffset),
        endDate: monthsAgo(prevEndOffset)
      });

      await Employment.create({
        profileId: profile.id,
        company: a.employer,
        role: a.role,
        startDate: monthsAgo(prevEndOffset - 1),
        endDate: null
      });

      createdProfiles.push({ user: user, profile: profile });
      process.stdout.write('  Created ' + a.firstName + ' ' + a.lastName + '\n');
    }

    // ── Featured Alumni history (30 days, one per day) ────────────────────────
    console.log('\nCreating 30 days of Featured Alumni history...');
    for (var day = 0; day < 30; day++) {
      var picked = createdProfiles[day % createdProfiles.length];
      await FeaturedAlumnus.create({
        userId: picked.user.id,
        profileId: picked.profile.id,
        featuredDate: daysAgo(day),
        winningBidAmount: (50 + Math.random() * 200).toFixed(2),
        activatedAt: new Date()
      }).catch(function() {
        // Ignore duplicate featuredDate (same alumni featured twice) — just skip
      });
    }

    // ── Bids (historical) ─────────────────────────────────────────────────────
    console.log('Creating historical bids...');
    for (var b = 0; b < 40; b++) {
      var bidder = createdProfiles[b % createdProfiles.length];
      await Bid.create({
        userId: bidder.user.id,
        amount: (20 + Math.random() * 180).toFixed(2),
        bidDate: daysAgo(Math.floor(Math.random() * 14) + 1),
        status: rand(['won', 'lost', 'cancelled'])
      });
    }

    // ── Print summary ─────────────────────────────────────────────────────────
    console.log('\n✅  Seed completed successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(' ACCOUNTS (all passwords: Password1!)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(' Developer:  dev.user@eastminster.ac.uk');
    for (var pi = 0; pi < alumniData.length; pi++) {
      var ad = alumniData[pi];
      var em = ad.firstName.toLowerCase() + '.' + ad.lastName.toLowerCase().replace(/[^a-z]/g, '') + '@eastminster.ac.uk';
      console.log(' Alumni:     ' + em);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(' ANALYTICS DASHBOARD API KEY (all scopes)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(' ' + rawApiKey);
    console.log('\n Add this to your .env file:');
    console.log(' ANALYTICS_API_KEY=' + rawApiKey);
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
