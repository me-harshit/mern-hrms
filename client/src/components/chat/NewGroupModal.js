import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCheck, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import Avatar from '../Avatar';

/**
 * Create a custom group (F3.1).
 *
 * Any employee may do this — that is what F3.4's "Diwali Committee" means: a
 * group that needs no manager's involvement to exist. Attaching it to a project
 * is optional and only affects where its files are filed and what the group is
 * listed under; the auto-created project group is a separate thing this cannot
 * make a second copy of.
 */
const NewGroupModal = ({ onClose, onCreated }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [projectId, setProjectId] = useState('');
    const [projects, setProjects] = useState([]);
    const [people, setPeople] = useState([]);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/projects').then((r) => setProjects(r.data || [])).catch(() => setProjects([]));
    }, []);

    useEffect(() => {
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const res = await api.get('/conversations/contacts', { params: { q: query } });
                if (!cancelled) setPeople(res.data || []);
            } catch {
                if (!cancelled) setPeople([]);
            }
        }, query ? 250 : 0);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query]);

    const toggle = (id) => setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

    const create = async () => {
        if (!name.trim()) {
            Swal.fire('Name it', 'A group needs a name.', 'info');
            return;
        }
        setSaving(true);
        try {
            const res = await api.post('/conversations/group', {
                name: name.trim(),
                description: description.trim(),
                projectId: projectId || null,
                memberIds: selected
            });
            onCreated(res.data);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not create the group.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="msgr-modal-back" onClick={onClose}>
            <div className="msgr-modal" onClick={(e) => e.stopPropagation()}>
                <div className="msgr-modal-head">
                    <h4>New group</h4>
                    <button className="msgr-icon-btn" onClick={onClose}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>

                <div className="msgr-modal-body">
                    <div className="msgr-field">
                        <label>Group name</label>
                        <input
                            autoFocus
                            placeholder="e.g. Design — Spectra"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={80}
                        />
                    </div>

                    <div className="msgr-field">
                        <label>Description (optional)</label>
                        <textarea
                            rows={2}
                            placeholder="What is this group for?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={300}
                        />
                    </div>

                    <div className="msgr-field">
                        <label>Link to a project (optional)</label>
                        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                            <option value="">No project — a standalone group</option>
                            {projects.map((p) => (
                                <option key={p._id} value={p._id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="msgr-field">
                        <label>Members {selected.length > 0 && `(${selected.length} selected)`}</label>
                        <div className="msgr-search" style={{ marginBottom: 8 }}>
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="msgr-search-icon" />
                            <input
                                placeholder="Search people"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                style={{ border: '1px solid #e4e6eb' }}
                            />
                        </div>

                        <div className="msgr-picklist">
                            {!people.length && <div className="msgr-empty">Nobody matches that.</div>}
                            {people.map((p) => (
                                <div
                                    key={p._id}
                                    className={`msgr-pick ${selected.includes(p._id) ? 'selected' : ''}`}
                                    onClick={() => toggle(p._id)}
                                >
                                    <Avatar name={p.name} profilePic={p.profilePic} className="msgr-avatar" />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                                        <div style={{ fontSize: 11.5, color: '#667781' }}>
                                            {[p.jobTitle || p.role, p.department].filter(Boolean).join(' · ')}
                                        </div>
                                    </div>
                                    {selected.includes(p._id) && (
                                        <FontAwesomeIcon icon={faCheck} style={{ color: '#128c7e' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="msgr-modal-foot">
                    <button className="msgr-btn" onClick={onClose}>Cancel</button>
                    <button className="msgr-btn primary" onClick={create} disabled={saving || !name.trim()}>
                        {saving ? 'Creating…' : 'Create group'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewGroupModal;
