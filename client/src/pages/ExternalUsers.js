import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPlus, faMagnifyingGlass, faPen, faTrash, faArrowLeft,
    faBuilding, faEnvelope, faPhone, faComments, faToggleOn, faToggleOff
} from '@fortawesome/free-solid-svg-icons';

import api from '../utils/api';
import '../styles/externalUsers.css';

/**
 * The directory of people outside the company — feature draft Module 2.
 *
 * Exists because a vendor is a person, not a row in one group. Before this,
 * adding the same supplier to a second project meant typing their name and
 * email again, which gave one human two records that could disagree about who
 * they were and no way to see everywhere they had access.
 *
 * So this page owns the person — name, company, what kind of outsider they are,
 * notes — and the chat owns their access to any particular group. Nothing here
 * grants access to anything; that still happens per group, with its own link
 * and its own expiry.
 */

const TYPES = ['VENDOR', 'CLIENT', 'CONSULTANT', 'CONTRACTOR', 'OTHER'];

const TYPE_LABEL = {
    VENDOR: 'Vendor',
    CLIENT: 'Client',
    CONSULTANT: 'Consultant',
    CONTRACTOR: 'Contractor',
    OTHER: 'Other'
};

const blank = {
    name: '', email: '', company: '', phone: '', type: 'VENDOR', notes: ''
};

const ExternalUsers = () => {
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [showInactive, setShowInactive] = useState(false);

    // null = closed, {} = adding, {_id…} = editing
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(blank);
    const [saving, setSaving] = useState(false);

    const [detail, setDetail] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/external-users', {
                params: {
                    q: query || undefined,
                    type: typeFilter || undefined,
                    includeInactive: showInactive ? 1 : undefined
                }
            });
            setRows(res.data);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not load external users.', 'error');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [query, typeFilter, showInactive]);

    // Debounced, so typing into the search box is not one request per keystroke.
    useEffect(() => {
        const t = setTimeout(load, query ? 300 : 0);
        return () => clearTimeout(t);
    }, [load, query]);

    const openAdd = () => { setForm(blank); setEditing({}); };

    const openEdit = (u) => {
        setForm({
            name: u.name, email: u.email, company: u.company || '',
            phone: u.phone || '', type: u.type || 'VENDOR', notes: u.notes || ''
        });
        setEditing(u);
    };

    const save = async () => {
        if (!form.name.trim() || (!editing._id && !form.email.trim())) return;
        setSaving(true);
        try {
            if (editing._id) {
                // The email is deliberately not sent — it is the identity every
                // live invitation was mailed to, and the server refuses it.
                await api.put(`/external-users/${editing._id}`, {
                    name: form.name, company: form.company,
                    phone: form.phone, type: form.type, notes: form.notes
                });
            } else {
                await api.post('/external-users', form);
            }
            setEditing(null);
            load();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not save.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (u) => {
        try {
            await api.put(`/external-users/${u._id}`, { isActive: !u.isActive });
            load();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not change that.', 'error');
        }
    };

    const remove = async (u) => {
        const ok = await Swal.fire({
            title: `Remove ${u.name}?`,
            html: u.groupCount
                ? `They are in <b>${u.groupCount}</b> conversation${u.groupCount === 1 ? '' : 's'}. `
                  + 'Their record and their messages are kept, and their access is switched off everywhere.'
                : 'They have never been added to a conversation, so their record will be deleted.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Remove'
        });
        if (!ok.isConfirmed) return;

        try {
            const res = await api.delete(`/external-users/${u._id}`);
            if (res.data.deactivated) {
                Swal.fire({ icon: 'info', title: 'Access switched off', text: res.data.message });
            }
            load();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not remove them.', 'error');
        }
    };

    const openDetail = async (u) => {
        try {
            const res = await api.get(`/external-users/${u._id}`);
            setDetail(res.data);
        } catch (err) {
            Swal.fire('Error', 'Could not load that profile.', 'error');
        }
    };

    return (
        <div className="exu">
            <div className="exu-head">
                <button className="exu-back" onClick={() => navigate('/chats')}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back to chats
                </button>

                <div className="exu-title">
                    <h2>External users</h2>
                    <p>
                        People outside the company — vendors, clients and consultants. Add
                        somebody here once, then add them to as many conversations as the work
                        needs. Being listed here grants no access on its own.
                    </p>
                </div>

                <button className="exu-add" onClick={openAdd}>
                    <FontAwesomeIcon icon={faPlus} /> Add external user
                </button>
            </div>

            <div className="exu-toolbar">
                <div className="exu-search">
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                    <input
                        value={query}
                        placeholder="Search by name, email or company"
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>

                <div className="exu-filters">
                    <button
                        className={!typeFilter ? 'active' : ''}
                        onClick={() => setTypeFilter('')}
                    >
                        All
                    </button>
                    {TYPES.map((t) => (
                        <button
                            key={t}
                            className={typeFilter === t ? 'active' : ''}
                            onClick={() => setTypeFilter(t)}
                        >
                            {TYPE_LABEL[t]}
                        </button>
                    ))}
                </div>

                <label className="exu-toggle">
                    <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={(e) => setShowInactive(e.target.checked)}
                    />
                    Show switched off
                </label>
            </div>

            {loading && <div className="exu-empty">Loading…</div>}

            {!loading && !rows.length && (
                <div className="exu-empty">
                    {query || typeFilter
                        ? 'Nobody matches that.'
                        : 'No external users yet. Add the first one to get started.'}
                </div>
            )}

            <div className="exu-grid">
                {rows.map((u) => (
                    <div className={`exu-card ${u.isActive ? '' : 'off'}`} key={u._id}>
                        <div className="exu-card-top">
                            <div className="exu-avatar">
                                {u.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div className="exu-card-id">
                                <h4 onClick={() => openDetail(u)}>{u.name}</h4>
                                <span className="exu-code">{u.externalId}</span>
                            </div>
                            <span className={`exu-type t-${u.type}`}>{TYPE_LABEL[u.type]}</span>
                        </div>

                        <div className="exu-card-meta">
                            {u.company && (
                                <span><FontAwesomeIcon icon={faBuilding} /> {u.company}</span>
                            )}
                            <span><FontAwesomeIcon icon={faEnvelope} /> {u.email}</span>
                            {u.phone && <span><FontAwesomeIcon icon={faPhone} /> {u.phone}</span>}
                        </div>

                        <div className="exu-card-foot">
                            <button className="exu-link" onClick={() => openDetail(u)}>
                                <FontAwesomeIcon icon={faComments} />
                                {u.groupCount
                                    ? `In ${u.groupCount} conversation${u.groupCount === 1 ? '' : 's'}`
                                    : 'Not in any conversation'}
                            </button>

                            <div className="exu-card-actions">
                                <button
                                    onClick={() => toggleActive(u)}
                                    title={u.isActive ? 'Switch off access everywhere' : 'Switch access back on'}
                                >
                                    <FontAwesomeIcon icon={u.isActive ? faToggleOn : faToggleOff} />
                                </button>
                                <button onClick={() => openEdit(u)} title="Edit">
                                    <FontAwesomeIcon icon={faPen} />
                                </button>
                                <button className="danger" onClick={() => remove(u)} title="Remove">
                                    <FontAwesomeIcon icon={faTrash} />
                                </button>
                            </div>
                        </div>

                        {!u.isActive && <div className="exu-off-flag">Access switched off everywhere</div>}
                    </div>
                ))}
            </div>

            {/* ------------------------- ADD / EDIT ------------------------- */}
            {editing && (
                <div className="exu-modal-back" onClick={() => setEditing(null)}>
                    <div className="exu-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>{editing._id ? `Edit ${editing.name}` : 'Add an external user'}</h3>

                        <label>Name</label>
                        <input
                            value={form.name}
                            autoFocus
                            placeholder="Ramesh Kumar"
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />

                        <label>Email</label>
                        <input
                            type="email"
                            value={form.email}
                            disabled={Boolean(editing._id)}
                            placeholder="ramesh@vendor.com"
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                        {editing._id && (
                            <p className="exu-note">
                                The email cannot be changed — it is what every invitation link
                                already sent to this person was addressed to. Somebody who has
                                genuinely changed address needs a new record.
                            </p>
                        )}

                        <label>They are a</label>
                        <div className="exu-typepick">
                            {TYPES.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    className={form.type === t ? 'active' : ''}
                                    onClick={() => setForm({ ...form, type: t })}
                                >
                                    {TYPE_LABEL[t]}
                                </button>
                            ))}
                        </div>

                        <label>Company</label>
                        <input
                            value={form.company}
                            placeholder="VendorCo Pvt Ltd"
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                        />

                        <label>Phone (optional)</label>
                        <input
                            value={form.phone}
                            placeholder="+91 98765 43210"
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />

                        <label>Notes (optional)</label>
                        <textarea
                            rows={3}
                            value={form.notes}
                            placeholder="What they supply, who owns the relationship, anything the next person should know."
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        />

                        <div className="exu-modal-foot">
                            <button className="exu-btn" onClick={() => setEditing(null)}>Cancel</button>
                            <button
                                className="exu-btn primary"
                                onClick={save}
                                disabled={saving || !form.name.trim() || (!editing._id && !form.email.trim())}
                            >
                                {saving ? 'Saving…' : (editing._id ? 'Save changes' : 'Add them')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --------------------------- PROFILE --------------------------- */}
            {detail && (
                <div className="exu-modal-back" onClick={() => setDetail(null)}>
                    <div className="exu-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>{detail.person.name}</h3>
                        <p className="exu-note" style={{ marginTop: 0 }}>
                            {detail.person.company ? `${detail.person.company} · ` : ''}
                            {detail.person.email} · {detail.person.externalId}
                        </p>

                        {detail.person.notes && (
                            <p className="exu-notes-body">{detail.person.notes}</p>
                        )}

                        <h5>
                            {detail.memberships.length
                                ? `In ${detail.memberships.length} conversation${detail.memberships.length === 1 ? '' : 's'}`
                                : 'Not in any conversation yet'}
                            {detail.messageCount > 0 && ` · ${detail.messageCount} message${detail.messageCount === 1 ? '' : 's'}`}
                        </h5>

                        {detail.memberships.map((m) => (
                            <div className="exu-membership" key={m._id}>
                                <div>
                                    <strong>{m.conversation?.name || 'A conversation'}</strong>
                                    <span>
                                        Invited by {m.invitedBy?.name || 'someone'}
                                        {m.invitedAt && ` on ${new Date(m.invitedAt).toLocaleDateString('en-GB')}`}
                                    </span>
                                </div>
                                <span className={`exu-status ${m.isActive ? 'ok' : 'off'}`}>
                                    {m.isActive ? 'Active' : m.status}
                                </span>
                            </div>
                        ))}

                        <div className="exu-modal-foot">
                            <button className="exu-btn" onClick={() => setDetail(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExternalUsers;
