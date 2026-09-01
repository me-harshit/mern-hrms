import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUserPlus, faCopy, faCheck, faPaperPlane, faBan,
    faClock, faCircleCheck, faHourglassHalf
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import InviteExternalModal from './InviteExternalModal';

/**
 * The external participants of one group, inside the details pane
 * (feature draft F2.4, F2.6, and the request-to-join half of F2.2).
 *
 * Every member can see this list, not just the people who can manage it.
 * Knowing an outsider is in the room changes what you say in it, so hiding
 * that from ordinary members would defeat the purpose of announcing it in the
 * thread at all — the actions are what is gated, not the knowledge.
 */

const STATUS = {
    invited: { label: 'Invited', icon: faClock, tone: 'wait' },
    pending: { label: 'Waiting for approval', icon: faHourglassHalf, tone: 'wait' },
    active: { label: 'Active', icon: faCircleCheck, tone: 'ok' },
    declined: { label: 'Declined', icon: faBan, tone: 'off' },
    revoked: { label: 'Access withdrawn', icon: faBan, tone: 'off' }
};

const when = (iso) => (iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '');

const ExternalParticipants = ({ conversation, canManage }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    const [copiedId, setCopiedId] = useState(null);

    const conversationId = conversation._id;

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/conversations/${conversationId}/externals`);
            setRows(res.data);
        } catch {
            // A group with no external access is the normal case and the panel
            // should not shout about it; an error here just means an empty list.
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [conversationId]);

    useEffect(() => { load(); }, [load]);

    const copyLink = (p) => {
        navigator.clipboard?.writeText(p.link);
        setCopiedId(p._id);
        setTimeout(() => setCopiedId(null), 1800);
    };

    const resend = async (p) => {
        try {
            const res = await api.post(`/conversations/${conversationId}/externals/${p._id}/resend`);
            await load();
            Swal.fire({
                icon: res.data.emailed ? 'success' : 'warning',
                title: res.data.emailed ? 'Invitation resent' : 'Could not email it',
                text: res.data.emailed
                    ? `A fresh link is on its way to ${p.email}.`
                    : 'The link has been renewed — copy it and send it another way.',
                timer: res.data.emailed ? 1800 : undefined,
                showConfirmButton: !res.data.emailed
            });
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not resend.', 'error');
        }
    };

    const decide = async (p, approve) => {
        try {
            await api.post(`/conversations/${conversationId}/externals/${p._id}/${approve ? 'approve' : 'decline'}`);
            await load();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not save that.', 'error');
        }
    };

    const revoke = async (p) => {
        const ok = await Swal.fire({
            title: `Withdraw access for ${p.name}?`,
            text: 'Their link stops working immediately. What they have already said stays in the conversation.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Withdraw access'
        });
        if (!ok.isConfirmed) return;

        try {
            await api.delete(`/conversations/${conversationId}/externals/${p._id}`);
            await load();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not withdraw access.', 'error');
        }
    };

    if (loading) return null;

    // Nothing to show and nothing you could do about it.
    if (!rows.length && !canManage) return null;

    const live = rows.filter((p) => ['invited', 'pending', 'active'].includes(p.status));

    return (
        <div className="msgr-info-section">
            <h5>
                External participants
                {live.length > 0 && <span className="ext-count">{live.length}</span>}
            </h5>

            {canManage && (
                <button
                    className="msgr-btn block"
                    style={{ marginBottom: 10 }}
                    onClick={() => setInviting(true)}
                >
                    <FontAwesomeIcon icon={faUserPlus} /> Invite someone from outside
                </button>
            )}

            {!rows.length && (
                <p className="ext-hint" style={{ margin: 0 }}>
                    Nobody outside the company can see this group.
                </p>
            )}

            {rows.map((p) => {
                const s = STATUS[p.status] || STATUS.invited;
                const expired = p.status === 'active' && !p.isActive;

                return (
                    <div className="ext-row" key={p._id}>
                        <div className="ext-row-head">
                            <div className="ext-row-id">
                                <span className="ext-badge">External</span>
                                <span className="ext-row-name">{p.name}</span>
                            </div>
                            <span className={`ext-status ${expired ? 'off' : s.tone}`}>
                                <FontAwesomeIcon icon={expired ? faClock : s.icon} />
                                {expired ? 'Access expired' : s.label}
                            </span>
                        </div>

                        <div className="ext-row-meta">
                            {p.company && <span>{p.company}</span>}
                            <span>{p.email}</span>
                            <span>{p.externalId}</span>
                        </div>

                        <div className="ext-row-meta">
                            <span>
                                Invited by {p.invitedBy?.name || 'someone'} on {when(p.invitedAt)}
                            </span>
                            {p.status === 'active' && !expired && (
                                <span>Access until {when(p.expiresAt)}</span>
                            )}
                        </div>

                        {canManage && (
                            <div className="ext-row-actions">
                                {p.status === 'pending' && (
                                    <>
                                        <button className="msgr-btn primary" onClick={() => decide(p, true)}>
                                            Approve
                                        </button>
                                        <button className="msgr-btn" onClick={() => decide(p, false)}>
                                            Decline
                                        </button>
                                    </>
                                )}

                                {p.link && p.status !== 'revoked' && (
                                    <button className="msgr-btn" onClick={() => copyLink(p)}>
                                        <FontAwesomeIcon icon={copiedId === p._id ? faCheck : faCopy} />
                                        {copiedId === p._id ? 'Copied' : 'Copy link'}
                                    </button>
                                )}

                                {p.status !== 'revoked' && (
                                    <button className="msgr-btn" onClick={() => resend(p)}>
                                        <FontAwesomeIcon icon={faPaperPlane} />
                                        {expired ? 'Renew & resend' : 'Resend'}
                                    </button>
                                )}

                                {p.status !== 'revoked' && p.status !== 'declined' && (
                                    <button className="msgr-btn danger" onClick={() => revoke(p)}>
                                        <FontAwesomeIcon icon={faBan} /> Withdraw
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {inviting && (
                <InviteExternalModal
                    conversation={conversation}
                    onClose={() => { setInviting(false); load(); }}
                    onInvited={load}
                />
            )}
        </div>
    );
};

export default ExternalParticipants;
