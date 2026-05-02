'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

var bcrypt = require('bcryptjs');
var {
  sequelize,
  User,
  Profile,
  Degree,
  Certification,
  ProfessionalCourse,
  Employment,
  Licence
} = require('../models');

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateYearsAgo(yearsBack, monthJitter) {
  var d = new Date();
  d.setFullYear(d.getFullYear() - yearsBack);
  d.setMonth(Math.max(0, d.getMonth() - monthJitter));
  return d.toISOString().slice(0, 10);
}

var firstNames = [
  'Amara', 'Nikhil', 'Priya', 'Owen', 'Leila', 'Marcus', 'Sana', 'Ethan', 'Mila', 'Haris',
  'Ava', 'Ravi', 'Isabel', 'Noel', 'Farah', 'Joel', 'Nadia', 'Theo', 'Mina', 'Dylan',
  'Zara', 'Aiden', 'Riya', 'Kian', 'Elena', 'Yusuf', 'Anya', 'Lucas', 'Mariam', 'Adam',
  'Sofia', 'Kabir', 'Lena', 'Ryan', 'Aisha', 'Daniel', 'Sara', 'Hugo', 'Nina', 'Arjun',
  'Maya', 'Samir', 'Hana', 'Leo', 'Iris', 'Rohan', 'Jade', 'Rafael', 'Nora', 'Bilal'
];

var lastNames = [
  'Perera', 'Fernando', 'Silva', 'Patel', 'Khan', 'Liu', 'Walker', 'Nielsen', 'Costa', 'Reid',
  'Ahmed', 'Santos', 'Mendes', 'Taylor', 'Rahman', 'Wijesinghe', 'Navaratne', 'Brown', 'Cooper', 'Dias',
  'Iqbal', 'Harris', 'Nguyen', 'Das', 'Rodriguez', 'Morris', 'Ford', 'Garcia', 'Ali', 'Pinto'
];

var programmes = [
  'BSc Computer Science',
  'BSc Software Engineering',
  'MSc Data Science',
  'MSc Artificial Intelligence',
  'BSc Information Technology',
  'BSc Cybersecurity',
  'MSc Cloud Computing',
  'BSc Business Information Systems'
];

var companies = [
  'Google', 'Microsoft', 'Amazon', 'Meta', 'IBM', 'Accenture', 'Deloitte', 'KPMG',
  'Barclays', 'HSBC', 'BT Group', 'Vodafone', 'NHS Digital', 'Capgemini',
  'TechNova Labs', 'BlueOrbit Solutions', 'Apex FinServe', 'Nimbus Digital'
];

var roles = [
  'Software Engineer', 'Full-Stack Developer', 'Backend Engineer', 'Data Scientist',
  'Machine Learning Engineer', 'Cloud Engineer', 'DevOps Engineer', 'Business Analyst',
  'Security Engineer', 'Product Analyst'
];

var certPool = [
  { name: 'AWS Cloud Practitioner', issuingBody: 'Amazon Web Services' },
  { name: 'Azure Fundamentals (AZ-900)', issuingBody: 'Microsoft' },
  { name: 'Google Associate Cloud Engineer', issuingBody: 'Google Cloud' },
  { name: 'CompTIA Security+', issuingBody: 'CompTIA' },
  { name: 'Scrum Master (CSM)', issuingBody: 'Scrum Alliance' }
];

var coursePool = [
  { name: 'Machine Learning Specialization', provider: 'Coursera' },
  { name: 'React and Node.js Complete Course', provider: 'Udemy' },
  { name: 'Data Science Professional Certificate', provider: 'IBM / Coursera' },
  { name: 'Docker and Kubernetes', provider: 'Udemy' },
  { name: 'Agile Project Management', provider: 'Google / Coursera' }
];

var licencePool = [
  { name: 'ITIL 4 Foundation', awardingBody: 'AXELOS' },
  { name: 'PRINCE2 Practitioner', awardingBody: 'AXELOS' },
  { name: 'Chartered IT Professional (CITP)', awardingBody: 'BCS' }
];

function buildBio(name, role, company) {
  return name + ' is an alumni professional working as a ' + role +
    ' at ' + company + ', focusing on delivery, collaboration, and measurable business impact.';
}

async function nextAvailableEmail(base) {
  var candidate = base;
  var idx = 1;
  while (await User.findOne({ where: { email: candidate } })) {
    candidate = base.replace('@', '+' + idx + '@');
    idx += 1;
  }
  return candidate;
}

async function run() {
  var requested = Number(process.argv[2] || 40);
  var count = Number.isInteger(requested) ? requested : 40;
  if (count < 30 || count > 50) {
    throw new Error('Count must be between 30 and 50. Example: node utils/seed-alumni-batch.js 40');
  }

  console.log('Connecting to DB...');
  await sequelize.authenticate();
  console.log('Connected. Creating ' + count + ' alumni (non-destructive)...');

  var hashedPassword = await bcrypt.hash('Password1!', 12);
  var created = 0;

  for (var i = 0; i < count; i += 1) {
    var firstName = firstNames[i % firstNames.length];
    var lastName = lastNames[(i * 3) % lastNames.length];
    var fullName = firstName + ' ' + lastName;
    var programme = rand(programmes);
    var company = rand(companies);
    var role = rand(roles);
    var graduationYearsAgo = randInt(2, 10);
    var cert = rand(certPool);
    var course = rand(coursePool);
    var shouldHaveLicence = Math.random() > 0.55;
    var lic = rand(licencePool);

    var emailBase = (firstName + '.' + lastName + '@eastminster.ac.uk')
      .toLowerCase()
      .replace(/[^a-z0-9.@]/g, '');
    var email = await nextAvailableEmail(emailBase);

    var tx = await sequelize.transaction();
    try {
      var user = await User.create({
        email: email,
        password: hashedPassword,
        role: 'alumnus',
        isVerified: true,
        appearanceCount: randInt(0, 2)
      }, { transaction: tx });

      var profile = await Profile.create({
        userId: user.id,
        firstName: firstName,
        lastName: lastName,
        biography: buildBio(fullName, role, company),
        linkedInUrl: 'https://linkedin.com/in/' + firstName.toLowerCase() + '-' + lastName.toLowerCase() + '-' + user.id,
        profileComplete: true
      }, { transaction: tx });

      await Degree.create({
        profileId: profile.id,
        name: programme,
        university: 'Eastminster University',
        completionDate: dateYearsAgo(graduationYearsAgo, randInt(0, 8))
      }, { transaction: tx });

      await Certification.create({
        profileId: profile.id,
        name: cert.name,
        issuingBody: cert.issuingBody,
        completionDate: dateYearsAgo(randInt(1, graduationYearsAgo), randInt(0, 8))
      }, { transaction: tx });

      await ProfessionalCourse.create({
        profileId: profile.id,
        name: course.name,
        provider: course.provider,
        completionDate: dateYearsAgo(randInt(1, graduationYearsAgo), randInt(0, 10))
      }, { transaction: tx });

      if (shouldHaveLicence) {
        await Licence.create({
          profileId: profile.id,
          name: lic.name,
          awardingBody: lic.awardingBody,
          completionDate: dateYearsAgo(randInt(1, graduationYearsAgo), randInt(0, 10))
        }, { transaction: tx });
      }

      var previousCompany = rand(companies.filter(function(c) { return c !== company; }));
      var startCurrentYearsAgo = randInt(0, Math.max(1, graduationYearsAgo - 1));

      await Employment.create({
        profileId: profile.id,
        company: previousCompany,
        role: rand(roles),
        startDate: dateYearsAgo(graduationYearsAgo, 2),
        endDate: dateYearsAgo(startCurrentYearsAgo, 6)
      }, { transaction: tx });

      await Employment.create({
        profileId: profile.id,
        company: company,
        role: role,
        startDate: dateYearsAgo(startCurrentYearsAgo, 5),
        endDate: null
      }, { transaction: tx });

      await tx.commit();
      created += 1;
      console.log('Created: ' + fullName + ' <' + email + '>');
    } catch (err) {
      await tx.rollback();
      console.error('Skipped one record due to error:', err.message);
    }
  }

  console.log('\nDone. Added ' + created + ' alumni users.');
  console.log('Default seeded password: Password1!');
  await sequelize.close();
}

run()
  .then(function() { process.exit(0); })
  .catch(function(err) {
    console.error('Seed alumni batch failed:', err);
    process.exit(1);
  });
