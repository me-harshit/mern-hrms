import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faSpinner, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import { onSocket } from '../utils/socket';
import '../styles/nudge.css';

/**
 * "Somebody is waiting on an answer" — every unanswered check-in for the
 * current user, across all their tasks, answerable without leaving the page.
 *
 * The task page already carries a per-task version of this. It exists twice on
 * purpose: a nudge is a question with a deadline of "now", and expecting
 * someone to notice it only by opening the right task is how it goes unanswered
 * for two days and stops being worth sending.
 *
 * Renders nothing at all when there is nothing pending, so it costs a quiet
 * page nothing but one request.
 */

const PRESETS = [
    { key: '30m', label: '30 min' },
    { key: '2h', label: '2 hours' },
    { key: 'today', label: 'End of today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'blocked', label: "I'm blocked" }
];

const PendingNudges = ({ onOpen }) => {
    const [nudges, setNudges] = useState([]);
    const [busy, setBusy] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get('/tasks/nudges/pending');
            setNudges(res.data || []);
        } catch (err) {
            setNudges([]);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // A nudge that arrives while this page is open should appear on it.
    useEffect(() => onSocket('nudge:new', (incoming) => {
        setNudges(prev => (prev.some(n => n._id === incoming._id) ? prev : [incoming, ...prev]));
    }), []);

    const answer = async (nudge, preset) => {
        const taskId = nudge.taskId?._id || nudge.taskId;
        setBusy(nudge._id);
        try {
            await api.post(`/tasks/${taskId}/nudges/${nudge._id}/respond`, { preset });
            setNudges(prev => prev.filter(n => n._id !== nudge._id));
            Swal.fire({
                icon: 'success', title: 'Reply sent', toast: true,
                position: 'top-end', timer: 1800, showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Could not reply', err.response?.data?.message || 'Please try again.', 'error');
        } finally {
            setBusy(null);
        }
    };

    if (nudges.length === 0) return null;

    return (
        <div className="pn-strip">
            <div className="pn-head">
                <FontAwesomeIcon icon={faBell} />
                <strong>
                    {nudges.length} check-in{nudges.length === 1 ? '' : 's'} waiting on you
                </strong>
            </div>

            {nudges.map(n => {
                const taskId = n.taskId?._id || n.taskId;
                return (
                    <div key={n._id} className="pn-row">
                        <div className="pn-row-text">
                            <span className="pn-task" title={n.taskId?.title}>
                                {n.taskId?.title || 'A task'}
                            </span>
                            <span className="pn-ask">
                                {n.nudgedBy?.name || 'Someone'}: “{n.message || 'How long will this take to complete?'}”
                            </span>
                        </div>

                        <div className="pn-actions">
                            {PRESETS.map(p => (
                                <button
                                    key={p.key} type="button"
                                    className={`nudge-preset ${p.key === 'blocked' ? 'is-blocked' : ''}`}
                                    onClick={() => answer(n, p.key)}
                                    disabled={busy === n._id}
                                >
                                    {busy === n._id ? <FontAwesomeIcon icon={faSpinner} spin /> : p.label}
                                </button>
                            ))}
                            {onOpen && (
                                <button
                                    type="button" className="pn-open"
                                    onClick={() => onOpen(taskId)}
                                >
                                    Open <FontAwesomeIcon icon={faArrowRight} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default PendingNudges;
