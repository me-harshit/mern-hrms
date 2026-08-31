import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCheck, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import Avatar from '../Avatar';

/**
 * Choose colleagues — used for adding to a group and for starting a new chat.
 *
 * Everyone active is listed, unscoped. Task assignment is scoped by team
 * (utils/taskScoping.js), but management's rule for chat is deliberately flat:
 * anyone may message anyone. A picker that hid people would quietly contradict
 * that, and the person you cannot find is the reason someone reaches for
 * WhatsApp instead.
 */
const PeoplePicker = ({
    title = 'Select people',
    excludeIds = [],
    multi = true,
    confirmLabel,
    onConfirm,
    onCancel
}) => {
    const [people, setPeople] = useState([]);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        // Debounced: a request per keystroke against a 500-person directory is
        // a lot of round trips for a list that barely changes.
        const t = setTimeout(async () => {
            try {
                const res = await api.get('/conversations/contacts', { params: { q: query } });
                if (!cancelled) setPeople(res.data || []);
            } catch {
                if (!cancelled) setPeople([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, query ? 250 : 0);

        return () => { cancelled = true; clearTimeout(t); };
    }, [query]);

    const exclude = new Set(excludeIds.map(String));
    const visible = people.filter((p) => !exclude.has(String(p._id)));

    const toggle = (id) => {
        if (!multi) { onConfirm([id]); return; }
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    return (
        <div className="msgr-modal-back" onClick={onCancel}>
            <div className="msgr-modal" onClick={(e) => e.stopPropagation()}>
                <div className="msgr-modal-head">
                    <h4>{title}</h4>
                    <button className="msgr-icon-btn" onClick={onCancel}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>

                <div className="msgr-modal-body">
                    <div className="msgr-search" style={{ marginBottom: 12 }}>
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="msgr-search-icon" />
                        <input
                            autoFocus
                            placeholder="Search by name, ID or department"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            style={{ border: '1px solid #e4e6eb' }}
                        />
                    </div>

                    <div className="msgr-picklist">
                        {loading && <div className="msgr-empty">Loading…</div>}
                        {!loading && !visible.length && (
                            <div className="msgr-empty">Nobody matches that.</div>
                        )}
                        {visible.map((p) => (
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

                {multi && (
                    <div className="msgr-modal-foot">
                        <button className="msgr-btn" onClick={onCancel}>Cancel</button>
                        <button
                            className="msgr-btn primary"
                            disabled={!selected.length}
                            onClick={() => onConfirm(selected)}
                        >
                            {confirmLabel || `Add ${selected.length || ''}`.trim()}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PeoplePicker;
