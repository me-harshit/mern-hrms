const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');

/**
 * ImportFromForm.js — create HRMS users from Employee_Details_Form.csv.
 *
 * Maps the Google-Form column names to the User schema, assigns the Employee ID
 * already written in the sheet, and creates only rows that HAVE an Employee ID and
 * are NOT already in the DB. (WFH rows are left blank for now, so this imports the
 * WFO batch first.) Dates come from the clean backup to avoid Excel's date mangling.
 *
 *   node scripts/ImportFromForm.js            # DRY RUN (default) — shows what would happen
 *   node scripts/ImportFromForm.js --commit   # actually create the users
 */

const norm = (v) => (v ? String(v).trim() : '');
const lc = (v) => norm(v).toLowerCase();
const normName = (v) => lc(v).replace(/\s+/g, ' ').trim();
const digits = (v) => norm(v).replace(/\D/g, '');
const ROOT = path.join(__dirname, '../..');
const FILE = path.join(ROOT, 'Employee_Details_Form.csv');
const BAK = path.join(ROOT, 'Employee_Details_Form.backup.csv');
const COMMIT = process.argv.includes('--commit');

const read = (f) => new Promise((res, rej) => { const rows = []; fs.createReadStream(f).pipe(csv()).on('data', (r) => rows.push(r)).on('end', () => res(rows)).on('error', rej); });
const get = (r, sub) => { const k = Object.keys(r).find((h) => h.toLowerCase().includes(sub)); return norm(r[k]); };
const workLoc = (w) => { const s = lc(w); return s.includes('wfh') || s.includes('home') ? 'WFH' : s.includes('hybrid') ? 'HYBRID' : s.includes('wfo') || s.includes('office') ? 'WFO' : ''; };
// original form dates are M/D/YYYY; build at UTC midnight so the calendar day never shifts
const parseDate = (s) => { s = norm(s); if (!s) return null; const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); let d; if (m) d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])); else { const t = Date.parse(s); d = isNaN(t) ? new Date(NaN) : new Date(t); } return isNaN(d) ? null : d; };

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Mode: ${COMMIT ? '🚨 COMMIT (will write)' : '🔎 DRY RUN (no writes)'}\n`);

    const dbUsers = await User.find({}).select('employeeId name email').lean();
    const dbEmail = new Set(dbUsers.map((u) => lc(u.email)));
    const dbId = new Set(dbUsers.map((u) => norm(u.employeeId).toUpperCase()).filter(Boolean));
    const dbName = new Set(dbUsers.map((u) => normName(u.name)));

    const [rows, bakRows] = await Promise.all([read(FILE), read(BAK)]);
    // backup dates by email
    const bak = new Map();
    for (const b of bakRows) { const e = lc(get(b, 'email address')); if (e) bak.set(e, { dob: get(b, 'date of birth'), doj: get(b, 'date of joining') }); }

    const toCreate = [], skipped = [];
    for (const r of rows) {
        const id = get(r, 'employee id');
        const name = get(r, 'full name');
        const email = lc(get(r, 'email address'));
        if (!id) continue; // no ID yet (e.g. WFH rows) -> not this batch
        if (!name || !email) { skipped.push(`${id} ${name || '(no name)'} — missing name/email`); continue; }
        if (dbEmail.has(email)) { skipped.push(`${id} ${name} — email already in DB`); continue; }
        if (dbId.has(id.toUpperCase())) { skipped.push(`${id} ${name} — employeeId already in DB`); continue; }
        if (dbName.has(normName(name))) { skipped.push(`${id} ${name} — name already in DB (verify)`); continue; }

        const bd = bak.get(email) || {};
        const curAddr = get(r, 'current address');
        const permAddr = get(r, 'permanent address');
        toCreate.push({
            employeeId: id,
            name,
            email,
            workEmail: lc(get(r, 'work email')),
            phoneNumber: digits(get(r, 'primary phone')),
            address: curAddr || permAddr,
            currentAddress: curAddr,
            permanentAddress: permAddr,
            aadhaar: get(r, 'aadhar'),
            bloodGroup: get(r, 'blood group'),
            dateOfBirth: parseDate(bd.dob) || parseDate(get(r, 'date of birth')),
            joiningDate: parseDate(bd.doj) || parseDate(get(r, 'date of joining')),
            reportingManagerName: get(r, 'reporting manager'),
            emergencyContact: digits(get(r, 'emergency contact - phone')),
            emergencyContactName: get(r, 'emergency contact - full name'),
            emergencyContactRelation: get(r, 'emergency contact - relationship'),
            jobTitle: get(r, 'job title'),
            department: get(r, 'department'),
            workLocation: workLoc(get(r, 'work location')),
            employmentType: get(r, 'employment type'),
            _jobTitle: get(r, 'job title'), _dept: get(r, 'department'), _loc: get(r, 'work location'),
        });
    }

    console.log(`WILL CREATE (${toCreate.length}):`);
    for (const u of toCreate)
        console.log(`  ${u.employeeId.padEnd(8)} ${u.name.padEnd(22)} ${u.email.padEnd(30)} DOJ:${u.joiningDate ? u.joiningDate.toISOString().slice(0, 10) : '—'}  [${u._jobTitle}/${u._dept}]`);
    console.log(`\nSKIPPED (${skipped.length}):`);
    skipped.forEach((s) => console.log('  ' + s));
    console.log('\nNote: Job Title & Department have NO field in the User schema and will NOT be stored.');
    console.log('      Default password for every new user: "1234" (bcrypt-hashed).');

    if (COMMIT) {
        let ok = 0;
        for (const u of toCreate) {
            const salt = await bcrypt.genSalt(10);
            const password = await bcrypt.hash('1234', salt);
            const { _jobTitle, _dept, _loc, ...doc } = u;
            await new User({ ...doc, password, role: 'EMPLOYEE', status: 'ACTIVE' }).save();
            console.log(`  ✅ created ${u.employeeId} ${u.name}`);
            ok++;
        }
        console.log(`\n🎉 Created ${ok} user(s).`);
    } else {
        console.log('\n(DRY RUN — re-run with --commit to create these users.)');
    }
    await mongoose.connection.close();
    process.exit(0);
})().catch((e) => { console.error('❌', e); process.exit(1); });
