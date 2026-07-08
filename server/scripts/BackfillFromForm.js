const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');

/**
 * BackfillFromForm.js — fill the new profile fields (workLocation, jobTitle,
 * department, employmentType, bloodGroup, workEmail, emergency name/relation,
 * permanent/current address) on EXISTING users from Employee_Details_Form.csv.
 *
 *   node scripts/BackfillFromForm.js            # DRY RUN
 *   node scripts/BackfillFromForm.js --commit   # apply
 */

const norm = (v) => (v ? String(v).trim() : '');
const lc = (v) => norm(v).toLowerCase();
const normName = (v) => lc(v).replace(/\s+/g, ' ').trim();
const digits = (v) => norm(v).replace(/\D/g, '');
const FILE = path.join(__dirname, '../../Employee_Details_Form.csv');
const COMMIT = process.argv.includes('--commit');
const read = (f) => new Promise((res, rej) => { const rows = []; fs.createReadStream(f).pipe(csv()).on('data', (r) => rows.push(r)).on('end', () => res(rows)).on('error', rej); });
const get = (r, sub) => { const k = Object.keys(r).find((h) => h.toLowerCase().includes(sub)); return norm(r[k]); };
const workLoc = (w) => { const s = lc(w); return s.includes('wfh') || s.includes('home') ? 'WFH' : s.includes('hybrid') ? 'HYBRID' : s.includes('wfo') || s.includes('office') ? 'WFO' : ''; };

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Mode: ${COMMIT ? '🚨 COMMIT' : '🔎 DRY RUN'}\n`);

    const rows = await read(FILE);
    // index sheet rows by personal email, work email, and name
    const byEmail = new Map(), byName = new Map();
    for (const r of rows) {
        const pe = lc(get(r, 'email address')), we = lc(get(r, 'work email')), nm = normName(get(r, 'full name'));
        if (pe) byEmail.set(pe, r);
        if (we) byEmail.set(we, r);
        if (nm) byName.set(nm, r);
    }

    const users = await User.find({}).lean();
    let updated = 0; const unmatched = [];
    for (const u of users) {
        const r = byEmail.get(lc(u.email)) || byEmail.get(lc(u.workEmail)) || byName.get(normName(u.name));
        if (!r) { unmatched.push(`${u.employeeId || '(no id)'} ${u.name} <${u.email}>`); continue; }

        const cur = get(r, 'current address'), perm = get(r, 'permanent address');
        const set = {
            workLocation: workLoc(get(r, 'work location')),
            jobTitle: get(r, 'job title'),
            department: get(r, 'department'),
            employmentType: get(r, 'employment type'),
            bloodGroup: get(r, 'blood group'),
            workEmail: lc(get(r, 'work email')),
            emergencyContactName: get(r, 'emergency contact - full name'),
            emergencyContactRelation: get(r, 'emergency contact - relationship'),
            emergencyContact: digits(get(r, 'emergency contact - phone')) || u.emergencyContact || '',
            permanentAddress: perm,
            currentAddress: cur,
            address: cur || perm || u.address || '',
        };
        // only count fields that actually change
        const changed = Object.entries(set).filter(([k, v]) => norm(u[k]) !== norm(v));
        if (!changed.length) continue;

        if (COMMIT) await User.updateOne({ _id: u._id }, { $set: set });
        updated++;
        if (updated <= 60)
            console.log(`  ${(u.employeeId || '—').padEnd(8)} ${u.name.padEnd(22)} loc:${set.workLocation || '—'} | ${set.jobTitle || '—'} / ${set.department || '—'} | ${set.employmentType || '—'}`);
    }

    console.log(`\n${COMMIT ? 'Updated' : 'Would update'}: ${updated} user(s)`);
    console.log(`\nNOT in the form (left unchanged — no sheet data): ${unmatched.length}`);
    unmatched.forEach((s) => console.log('  ' + s));
    if (!COMMIT) console.log('\n(DRY RUN — re-run with --commit to apply.)');
    await mongoose.connection.close();
    process.exit(0);
})().catch((e) => { console.error('❌', e); process.exit(1); });
