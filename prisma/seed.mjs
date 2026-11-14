import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

// Minimal .env loader so `node prisma/seed.mjs` works without extra tooling.
try {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    if (process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
} catch {
  // .env is optional; the caller may provide DATABASE_URL directly.
}

const prisma = new PrismaClient();

const students = [
  {
    id: 'stu-001', universityId: 'UG/22/0418', bimsNumber: null, firstName: 'Amarachi', lastName: 'Miebaka',
    gender: 'Female', email: 'amiebaka@example.edu.ng', phone: '+234 80X XXX 1248', campusId: 'imgbi',
    recordType: 'Student', status: 'Verified', completeness: 96, dateOfBirth: '12 March 2004', lga: 'Yenagoa',
    programme: 'Medicine and Surgery (MBBS)', faculty: 'Clinical Sciences', currentLevel: '400', admissionSession: '2022 / 2023',
    history: ['Record verified · Registry Officer · 07 Nov 2026, 10:42', 'Photo updated · Student Services · 16 Aug 2026', 'Record created · Admissions · 08 Sep 2022'],
  },
  {
    id: 'stu-002', universityId: 'UG/21/0231', bimsNumber: null, firstName: 'Timi', lastName: 'Koroye',
    gender: 'Male', campusId: 'imgbi', recordType: 'Student', status: 'Verified', completeness: 100,
    programme: 'Nursing Science', faculty: 'Nursing', currentLevel: '300', admissionSession: '2021 / 2022', history: [],
  },
  {
    id: 'stu-003', universityId: 'UG/23/0082', bimsNumber: null, firstName: 'Owei', lastName: 'Kuro',
    gender: 'Male', campusId: 'sampou', recordType: 'Student', status: 'Needs review', completeness: 78,
    programme: 'Medical Laboratory Science', faculty: 'Allied Health Sciences', currentLevel: '200', admissionSession: '2023 / 2024', history: [],
  },
  {
    id: 'stu-004', universityId: 'UG/24/0106', bimsNumber: null, firstName: 'Ebiere', lastName: 'Diri',
    gender: 'Female', campusId: 'sampou', recordType: 'Student', status: 'Verified', completeness: 88,
    programme: 'Public Health', faculty: 'Public Health', currentLevel: '100', admissionSession: '2024 / 2025', history: [],
  },
];

const staff = [
  {
    id: 'staff-001', universityId: 'BMU/PFN/REG/APPT/086', bimsNumber: null, firstName: 'Ebiowei', lastName: 'Otonye',
    gender: 'Male', campusId: 'sampou', recordType: 'Staff', status: 'Review due', completeness: 70,
    staffCategory: 'Academic', department: 'Clinical Sciences', jobTitle: 'Senior Lecturer', email: 'e.otonye@example.edu.ng',
    history: ['Appointment update submitted · HR Administrator · 07 Nov 2026, 09:18'],
  },
  {
    id: 'staff-002', universityId: 'BMU/PFN/REG/214', bimsNumber: null, firstName: 'Faith', lastName: 'Biobele',
    gender: 'Female', campusId: 'sampou', recordType: 'Staff', status: 'Verified', completeness: 70,
    staffCategory: 'Non-academic', department: 'Registry', jobTitle: 'Senior Executive Officer', email: 'f.biobele@example.edu.ng',
    history: ['Profile updated · HR Administrator · 06 Nov 2026, 16:05'],
  },
  {
    id: 'staff-003', universityId: 'BMU/PFN/REG/038', bimsNumber: null, firstName: 'Josephine', lastName: 'Nengi',
    gender: 'Female', campusId: 'imgbi', recordType: 'Staff', status: 'Verified', completeness: 70,
    staffCategory: 'Academic', department: 'Nursing Science', jobTitle: 'Lecturer I', email: 'j.nengi@example.edu.ng',
    history: ['Record viewed · Faculty Administrator · 06 Nov 2026, 14:32'],
  },
];

const documents = [
  { id: 'doc-001', universityId: 'UG/22/0418', title: 'Admission letter', filename: 'admission-letter-2022.pdf', classification: 'Restricted', type: 'PDF', mimeType: 'application/pdf', size: '2.4 MB', added: '08 Sep 2022' },
  { id: 'doc-002', universityId: 'BMU/PFN/REG/APPT/086', title: 'Appointment letter', filename: 'appointment-otonye.docx', classification: 'HR only', type: 'DOCX', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: '814 KB', added: '07 Nov 2026' },
  { id: 'doc-003', universityId: 'UG/21/0231', title: 'Profile photograph', filename: 'koroye-profile.jpg', classification: 'Internal', type: 'JPG', mimeType: 'image/jpeg', size: '1.1 MB', added: '16 Aug 2026' },
];

const reviews = [
  { id: 'rev-001', universityId: 'UG/23/0082', name: 'Owei Kuro', recordId: 'UG/23/0082', group: 'Student', issue: 'Missing certified result scan', campusId: 'sampou', submitted: '04 Nov 2026', priority: 'Due today' },
  { id: 'rev-002', universityId: 'BMU/PFN/REG/APPT/086', name: 'Dr. Ebiowei Otonye', recordId: 'BMU/PFN/REG/APPT/086', group: 'Academic staff', issue: 'Appointment update awaiting verification', campusId: 'sampou', submitted: '05 Nov 2026', priority: 'Normal' },
  { id: 'rev-003', universityId: null, name: 'Seiyefa Douye', recordId: 'BMU/24/MBBS/0118', group: 'Student', issue: 'Identity document needs confirmation', campusId: 'imgbi', submitted: '06 Nov 2026', priority: 'Normal' },
];

const audit = [
  { action: 'Verified', record: 'Amarachi Miebaka · Student', actor: 'Registry Officer', campusId: 'imgbi', when: '07 Nov 2026 · 10:42', ref: 'BMU/22/MBBS/0418' },
  { action: 'Document added', record: 'Dr. Ebiowei Otonye · Staff', actor: 'HR Administrator', campusId: 'sampou', when: '07 Nov 2026 · 09:18', ref: 'BMU/STA/0086' },
  { action: 'Profile updated', record: 'Faith Biobele · Staff', actor: 'HR Administrator', campusId: 'sampou', when: '06 Nov 2026 · 16:05', ref: 'BMU/STA/0214' },
  { action: 'Record viewed', record: 'Josephine Nengi · Staff', actor: 'Faculty Administrator', campusId: 'imgbi', when: '06 Nov 2026 · 14:32', ref: 'BMU/STA/0038' },
];

async function main() {
  await prisma.campus.upsert({ where: { id: 'imgbi' }, update: { name: 'Yenagoa', location: 'Bayelsa State' }, create: { id: 'imgbi', name: 'Yenagoa', location: 'Bayelsa State' } });
  await prisma.campus.upsert({ where: { id: 'sampou' }, update: { name: 'Sampou', location: 'Kolokuma/Opokuma LGA, Bayelsa State' }, create: { id: 'sampou', name: 'Sampou', location: 'Kolokuma/Opokuma LGA, Bayelsa State' } });

  // Reset registry demo data but keep user accounts and sessions.
  await prisma.document.deleteMany();
  await prisma.reviewItem.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.person.deleteMany();

  // Seed default academic sessions.
  const defaultSessions = [
    { name: '2024 / 2025', startDate: '2024-09-01', endDate: '2025-08-31', isCurrent: false },
    { name: '2025 / 2026', startDate: '2025-09-01', endDate: '2026-08-31', isCurrent: false },
    { name: '2026 / 2027', startDate: '2026-09-01', endDate: '2027-08-31', isCurrent: true },
  ];
  for (const session of defaultSessions) {
    await prisma.academicSession.upsert({
      where: { name: session.name },
      update: session,
      create: session,
    });
  }

  for (const person of [...students, ...staff]) {
    const { history, ...rest } = person;
    await prisma.person.create({ data: { ...rest, history: JSON.stringify(history ?? []) } });
  }

  const peopleByRecord = new Map((await prisma.person.findMany()).map((person) => [person.universityId, person]));
  for (const doc of documents) {
    const person = peopleByRecord.get(doc.universityId);
    if (!person) continue;
    await prisma.document.create({
      data: {
        id: doc.id, personId: person.id, title: doc.title, filename: doc.filename, classification: doc.classification,
        type: doc.type, mimeType: doc.mimeType, size: doc.size, added: doc.added, scanStatus: 'Clean',
      },
    });
  }

  for (const item of reviews) {
    const person = item.universityId ? peopleByRecord.get(item.universityId) : null;
    const { universityId, ...rest } = item;
    await prisma.reviewItem.create({ data: { ...rest, personId: person?.id ?? null } });
  }

  for (const event of audit) {
    await prisma.auditEvent.create({ data: event });
  }

  const token = process.env.BMU_BOOTSTRAP_TOKEN?.trim() || randomBytes(32).toString('base64url');
  await prisma.setting.upsert({
    where: { key: 'bootstrapTokenHash' },
    update: { value: createHash('sha256').update(token).digest('hex') },
    create: { key: 'bootstrapTokenHash', value: createHash('sha256').update(token).digest('hex') },
  });

  const userCount = await prisma.user.count();
  console.log(`Seeded ${students.length} students, ${staff.length} staff, ${documents.length} documents.`);
  if (userCount === 0) {
    console.log('');
    console.log('One-time BMU Registry setup token:');
    console.log(token);
    console.log('');
    console.log('Use it on the /setup screen to create the first system administrator.');
  } else {
    console.log('Existing user accounts were preserved.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
