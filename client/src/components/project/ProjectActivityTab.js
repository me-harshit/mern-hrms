import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faWaveSquare, faListCheck, faCircleCheck, faArrowsRotate,
    faComments, faHandshake, faUserPlus, faUserMinus, faPaperclip
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import { timeAgo } from './projectShared';

/**
 * Recent events on this project — feature draft F1.8.
 *
 * Rows carry no message text. That the Design group was busy is what a project
 * feed is for; reproducing what was said would make this a second copy of the
 * conversation, readable by everyone on the project rather than only the
 * group's members.
 *
 * The feed starts the day the module ships — nothing backfills it, so it reads
 * as "what has happened recently", never as a complete history of the project.
 */

const FILTERS = [
    { key: 'All', label: 'Everything' },
    { key: 'task_created', label: 'New tasks' },
    { key: 'task_status', label: 'Status changes' },
    { key: 'task_completed', label: 'Completions' },
    { key: 'message', label: 'Messages' },
    { key: 'vendor_message', label: 'Vendor replies' }
];

// Icon and colour per event type. The vendor family shares the amber the
// vendor tab uses, so an outsider's activity is recognisable at a glance.
const LOOK = {
    task_created:   { icon: faListCheck,    tone: 'task' },
    task_status:    { icon: faArrowsRotate, tone: 'task' },
    task_completed: { icon: faCircleCheck,  tone: 'done' },
    task_attachment:{ icon: faPaperclip,    tone: 'task' },
    message:        { icon: faComments,     tone: 'chat' },
    group_created:  { icon: faComments,     tone: 'chat' },
    vendor_message: { icon: faHandshake,    tone: 'vendor' },
    vendor_invited: { icon: faUserPlus,     tone: 'vendor' },
    vendor_joined:  { icon: faUserPlus,     tone: 'vendor' },
    vendor_revoked: { icon: faUserMinus,    tone: 'vendor' }
};

const ProjectActivityTab = ({ projectId }) => {
    const navigate = useNavigate();

    const [events, setEvents] = useState([]);
    const [cursor, setCursor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [type, setType] = useState('All');

    const load = useCallback(async (before = null) => {
        if (before) setLoadingMore(true); else setLoading(true);

        try {
            const res = await api.get(`/projects/${projectId}/activity`, {
                params: { type, before: before || undefined, limit: 30 }
            });
            // Appending on "load more", replacing on a filter change — the
            // cursor is what tells the two apart.
            setEvents((prev) => (before ? [...prev, ...(res.data.data || [])] : (res.data.data || [])));
            setCursor(res.data.nextCursor || null);
        } catch {
            if (!before) setEvents([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [projectId, type]);

    useEffect(() => { load(null); }, [load]);

    if (loading) {
        return <div className="pw-panel"><div className="pw-empty">Loading activity…</div></div>;
    }

    return (
        <>
            <div className="pw-toolbar">
                <select
                    className={`pw-select ${type !== 'All' ? 'is-active' : ''}`}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                >
                    {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
            </div>

            <div className="pw-panel">
                {events.length === 0 ? (
                    <div className="pw-empty">
                        <FontAwesomeIcon icon={faWaveSquare} className="pw-empty-icon" />
                        <strong>No activity recorded yet</strong>
                        New tasks, status changes, messages and vendor replies
                        appear here as they happen. The feed starts from when this
                        module went live — it does not reach back over old work.
                    </div>
                ) : (
                    <div className="pw-feed">
                        {events.map((event) => {
                            const look = LOOK[event.type] || { icon: faWaveSquare, tone: '' };
                            const count = event.meta?.count;

                            return (
                                <div
                                    key={event._id}
                                    className={`pw-event ${event.link ? 'is-clickable' : ''}`}
                                    onClick={() => event.link && navigate(event.link)}
                                >
                                    <div className={`pw-event-icon ${look.tone}`}>
                                        <FontAwesomeIcon icon={look.icon} />
                                    </div>

                                    <div className="pw-event-body">
                                        <p className="pw-event-text">
                                            {event.text}
                                            {/* A collapsed burst says how many it
                                                stands for, so the feed never
                                                understates a busy thread. */}
                                            {count > 1 && (
                                                <span className="pw-pill low" style={{ marginLeft: 8 }}>
                                                    ×{count}
                                                </span>
                                            )}
                                            {event.externalActor && (
                                                <span className="pw-pill external" style={{ marginLeft: 8 }}>
                                                    External
                                                </span>
                                            )}
                                        </p>
                                        <div className="pw-event-time">{timeAgo(event.at)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {cursor && (
                    <button
                        type="button"
                        className="pw-more"
                        disabled={loadingMore}
                        onClick={() => load(cursor)}
                    >
                        {loadingMore ? 'Loading…' : 'Load older activity'}
                    </button>
                )}
            </div>
        </>
    );
};

export default ProjectActivityTab;
