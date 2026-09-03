import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUsers,
    faListCheck,
    faWallet,
    faBoxes,
    faComments,
    faUserShield,
    faRightToBracket,
    faClock,
    faBolt,
    faMicrophone
} from '@fortawesome/free-solid-svg-icons';
import '../styles/home.css';

/**
 * The only route a logged-out visitor can reach.
 *
 * Everything described below sits behind the login, so this page is a
 * description of the product rather than a window into it -- no counts, no
 * names, nothing pulled from the API. It renders identically to a crawler and
 * to a member of staff.
 */

const FEATURES = [
    {
        icon: faUsers,
        title: 'People & time',
        items: [
            <><strong>Employee directory</strong> with full profiles, reporting managers and team-lead chains</>,
            <><strong>Attendance</strong> across day and night shifts, with raw punch logs and a live absence view</>,
            <><strong>Leave</strong> — casual and earned balances, half-days, approved straight from an email</>,
            <><strong>Work from home</strong> requests on the same approval flow</>,
            <><strong>Yearly calendar</strong> and holiday management</>
        ]
    },
    {
        icon: faListCheck,
        title: 'Tasks & projects',
        items: [
            <><strong>One shared status</strong> per task — whoever moves it, moves it for everyone assigned</>,
            <><strong>Kanban board</strong> with drag-to-change-status, plus a list view</>,
            <><strong>Discussion thread</strong> on every task, with images, audio notes and video proof</>,
            <><strong>Recurring tasks</strong> that generate themselves on a schedule</>,
            <><strong>Projects</strong> with budgets, spend roll-ups and a shared workspace</>
        ]
    },
    {
        icon: faWallet,
        title: 'Money',
        items: [
            <><strong>Expenses</strong> across categories with per-category fields, receipts and GST tracking</>,
            <><strong>Wallets & ledger</strong> — a running balance per employee with full history</>,
            <><strong>Reimbursements</strong> settled against approved claims</>,
            <><strong>Payroll</strong> with attendance-driven deductions and payslip generation</>,
            <><strong>Vendors</strong> and purchase records</>
        ]
    },
    {
        icon: faBoxes,
        title: 'Operations',
        items: [
            <><strong>Inventory</strong> — assignable assets, kept in step with approved purchases</>,
            <><strong>Documents</strong> distributed to staff with click-wrap acknowledgement and versioning</>,
            <><strong>Task reports</strong> and attendance exports for any period</>,
            <><strong>Admin controls</strong> for shifts, holidays and company-wide settings</>
        ]
    },
    {
        icon: faComments,
        title: 'Communication',
        items: [
            <><strong>Team chat</strong> with groups, file attachments, voice notes and read receipts</>,
            <><strong>External portal</strong> — bring a client or vendor into one project without giving them a login</>,
            <><strong>WhatsApp notifications</strong> for the things that should not wait for an inbox</>,
            <><strong>Live notifications</strong> pushed the moment something changes</>
        ]
    },
    {
        icon: faUserShield,
        title: 'Access & control',
        items: [
            <><strong>Six roles</strong>, each seeing exactly what it should</>,
            <><strong>Scoping enforced on the server</strong>, never merely hidden in the interface</>,
            <>A team lead assigns within their team; a manager assigns company-wide</>,
            <>Everyone else sees their own records and nobody else's</>
        ]
    }
];

const ROLES = ['Admin', 'HR', 'Manager', 'Team Lead', 'Accounts', 'Employee'];

const Home = () => (
    <div className="hm">
        <header className="hm-header">
            <img src="/GTS.png" alt="GTS" className="hm-logo" />
            <Link to="/login" className="hm-btn hm-btn-sm">
                <FontAwesomeIcon icon={faRightToBracket} />
                Sign in
            </Link>
        </header>

        <main className="hm-hero">
            <span className="hm-eyebrow">GTS Portal</span>
            <h1 className="hm-title">People, work and money in one place</h1>
            <p className="hm-sub">
                Attendance, leave, tasks, projects, expenses, payroll and everything
                in between — the single system the team runs on, day to day.
            </p>

            <div className="hm-cta">
                <Link to="/login" className="hm-btn hm-btn-lg">
                    <FontAwesomeIcon icon={faRightToBracket} />
                    Sign in to continue
                </Link>
            </div>

            <div className="hm-hero-meta">
                <span><FontAwesomeIcon icon={faBolt} /> Live updates, no refresh</span>
                <span><FontAwesomeIcon icon={faClock} /> Shift-aware attendance</span>
                <span><FontAwesomeIcon icon={faMicrophone} /> Assign a task by voice</span>
            </div>
        </main>

        <section className="hm-section">
            <div className="hm-section-head">
                <h2 className="hm-h2">Everything the team runs on</h2>
                <p>One login, one record of the day — instead of a spreadsheet for each of these.</p>
            </div>

            <div className="hm-grid">
                {FEATURES.map(f => (
                    <article className="hm-card" key={f.title}>
                        <div className="hm-card-icon"><FontAwesomeIcon icon={f.icon} /></div>
                        <h3>{f.title}</h3>
                        <ul>
                            {f.items.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="hm-roles">
            <div className="hm-roles-inner">
                <h2 className="hm-h2">Built for six roles</h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '560px', margin: '0 auto', lineHeight: 1.6 }}>
                    What you can see, assign and approve follows from your role — decided
                    on the server, on every request.
                </p>
                <div className="hm-role-list">
                    {ROLES.map(r => <span className="hm-role" key={r}>{r}</span>)}
                </div>
            </div>
        </section>

        <footer className="hm-footer">
            <span>GTS Portal — internal use only</span>
            <span>&copy; {new Date().getFullYear()} GTS</span>
        </footer>
    </div>
);

export default Home;
