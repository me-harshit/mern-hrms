import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faXmark, faUserPlus, faLink,
    faBell, faBellSlash, faRightFromBracket, faTrash, faPen, faCopy, faCamera
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import Avatar from '../Avatar';
import ImageEditor from '../ImageEditor';
import PeoplePicker from './PeoplePicker';
import GroupIcon from './GroupIcon';

/**
 * The details pane: who is in here, and the things you can do about it.
 *
 * Membership is rendered from what the server chose to send. A hidden admin is
 * filtered out server-side (utils/conversationAccess.js → visibleMembers), so
 * this component has no notion of hidden members and cannot leak one by
 * accident.
 */

const GroupInfoPanel = ({ conversation, myId, myRole, onClose, onChanged, onLeft }) => {
    const [addingPeople, setAddingPeople] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(conversation.name || '');
    const [description, setDescription] = useState(conversation.description || '');
    const [invite, setInvite] = useState(null);
    const [busy, setBusy] = useState(false);
    // Set between choosing a file and uploading it, so the picture that
    // reaches S3 is the one the person actually framed.
    const [pendingIcon, setPendingIcon] = useState(null);

    const isGroup = conversation.kind === 'group';
    const members = conversation.members || [];
    const canManage = ['owner', 'admin'].includes(conversation.myRole)
        || ['ADMIN', 'HR'].includes(myRole);

    const saveDetails = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            const res = await api.put(`/conversations/${conversation._id}`, {
                name: name.trim(),
                description
            });
            onChanged?.(res.data);
            setEditingName(false);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not save.', 'error');
        } finally {
            setBusy(false);
        }
    };

    /**
     * Same crop-then-upload path as a profile photo, and the same `avatar`
     * field name, so ImageEditor and the server route are both reused rather
     * than re-implemented for groups.
     */
    const uploadIcon = async (file) => {
        setPendingIcon(null);
        const data = new FormData();
        data.append('avatar', file);

        Swal.fire({
            title: 'Updating group icon…',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const res = await api.put(`/conversations/${conversation._id}/avatar`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            Swal.close();
            onChanged?.(res.data);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not update the icon.', 'error');
        }
    };

    const removeIcon = async () => {
        const data = new FormData();
        data.append('remove', 'true');
        try {
            const res = await api.put(`/conversations/${conversation._id}/avatar`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onChanged?.(res.data);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not remove the icon.', 'error');
        }
    };

    const addMembers = async (ids) => {
        if (!ids.length) return;
        try {
            const res = await api.post(`/conversations/${conversation._id}/members`, {
                memberIds: ids
            });
            onChanged?.(res.data);
            setAddingPeople(false);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not add them.', 'error');
        }
    };

    const removeMember = async (user) => {
        const ok = await Swal.fire({
            title: `Remove ${user.name}?`,
            text: 'They will lose access to this group.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Remove'
        });
        if (!ok.isConfirmed) return;

        try {
            await api.delete(`/conversations/${conversation._id}/members/${user._id}`);
            onChanged?.({ ...conversation, refetch: true });
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not remove them.', 'error');
        }
    };

    const leave = async () => {
        const ok = await Swal.fire({
            title: 'Leave this group?',
            text: 'You will stop receiving its messages.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Leave'
        });
        if (!ok.isConfirmed) return;

        try {
            await api.delete(`/conversations/${conversation._id}/members/${myId}`);
            onLeft?.(conversation._id);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not leave.', 'error');
        }
    };

    const toggleMute = async () => {
        try {
            const res = await api.put(`/conversations/${conversation._id}/mute`, {
                muted: !conversation.muted
            });
            onChanged?.({ ...conversation, muted: res.data.muted });
        } catch (err) {
            Swal.fire('Error', 'Could not update notifications.', 'error');
        }
    };

    const makeInvite = async () => {
        try {
            const res = await api.post(`/conversations/${conversation._id}/invite`, { days: 7 });
            setInvite(res.data);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not create a link.', 'error');
        }
    };

    const inviteUrl = invite?.token
        ? `${window.location.origin}/chats/join/${invite.token}`
        : '';

    return (
        <div className="msgr-info">
            <div className="msgr-info-head">
                <button
                    className="msgr-icon-btn"
                    style={{ position: 'absolute', right: 12, top: 12 }}
                    onClick={onClose}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>

                {isGroup ? (
                    <div className="msgr-icon-edit">
                        <GroupIcon conversation={conversation} className="msgr-avatar" />
                        {canManage && (
                            <>
                                <label
                                    className="msgr-icon-camera"
                                    title="Change group icon"
                                    htmlFor="msgr-group-icon"
                                >
                                    <FontAwesomeIcon icon={faCamera} />
                                </label>
                                <input
                                    id="msgr-group-icon"
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) setPendingIcon(f);
                                        e.target.value = '';
                                    }}
                                />
                            </>
                        )}
                    </div>
                ) : (
                    <Avatar
                        name={conversation.title}
                        profilePic={conversation.avatarUrl}
                        className="msgr-avatar"
                    />
                )}

                {editingName ? (
                    <>
                        <div className="msgr-field">
                            <input value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="msgr-field">
                            <textarea
                                rows={2}
                                placeholder="Description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button className="msgr-btn" onClick={() => setEditingName(false)}>Cancel</button>
                            <button className="msgr-btn primary" onClick={saveDetails} disabled={busy}>
                                Save
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h4>
                            {conversation.title}
                            {isGroup && canManage && (
                                <button
                                    className="msgr-icon-btn"
                                    style={{ width: 26, height: 26, marginLeft: 6 }}
                                    onClick={() => setEditingName(true)}
                                    title="Edit"
                                >
                                    <FontAwesomeIcon icon={faPen} style={{ fontSize: 11 }} />
                                </button>
                            )}
                        </h4>
                        <p>
                            {isGroup
                                ? `${members.length} member${members.length === 1 ? '' : 's'}`
                                : (conversation.otherUser?.jobTitle || conversation.otherUser?.role || '')}
                        </p>
                        {conversation.description && (
                            <p style={{ marginTop: 8 }}>{conversation.description}</p>
                        )}
                        {isGroup && canManage && conversation.avatar && (
                            <button
                                className="msgr-btn"
                                style={{ marginTop: 10 }}
                                onClick={removeIcon}
                            >
                                <FontAwesomeIcon icon={faTrash} /> Remove icon
                            </button>
                        )}
                    </>
                )}
            </div>

            {conversation.groupType === 'project' && conversation.projectId && (
                <div className="msgr-info-section">
                    <h5>Project</h5>
                    <div style={{ fontSize: 13.5 }}>
                        {conversation.projectId.name}
                        {conversation.projectId.status && (
                            <span className="msgr-tag" style={{ marginLeft: 8 }}>
                                {conversation.projectId.status}
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: 12, color: '#667781', marginTop: 8, marginBottom: 0 }}>
                        People are added here automatically when they are assigned a task
                        on this project.
                    </p>
                </div>
            )}

            <div className="msgr-info-section">
                <button className="msgr-btn block" onClick={toggleMute}>
                    <FontAwesomeIcon icon={conversation.muted ? faBellSlash : faBell} />
                    {conversation.muted ? 'Unmute notifications' : 'Mute notifications'}
                </button>
            </div>

            {isGroup && (
                <div className="msgr-info-section">
                    <h5>{members.length} Members</h5>

                    {canManage && (
                        <button
                            className="msgr-btn block"
                            style={{ marginBottom: 10 }}
                            onClick={() => setAddingPeople(true)}
                        >
                            <FontAwesomeIcon icon={faUserPlus} /> Add people
                        </button>
                    )}

                    {members.map((m) => {
                        const u = m.user || {};
                        return (
                            <div className="msgr-member" key={u._id || m.user}>
                                <Avatar name={u.name} profilePic={u.profilePic} className="msgr-avatar" />
                                <div className="msgr-member-body">
                                    <div className="msgr-member-name">
                                        {u.name}{String(u._id) === String(myId) ? ' (You)' : ''}
                                    </div>
                                    <div className="msgr-member-role">{u.jobTitle || u.role}</div>
                                </div>
                                {m.role !== 'member' && <span className="msgr-pill">{m.role}</span>}
                                {canManage && String(u._id) !== String(myId) && m.role !== 'owner' && (
                                    <button
                                        className="msgr-icon-btn"
                                        onClick={() => removeMember(u)}
                                        title={`Remove ${u.name}`}
                                    >
                                        <FontAwesomeIcon icon={faTrash} style={{ fontSize: 12 }} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {isGroup && canManage && (
                <div className="msgr-info-section">
                    <h5>Invite link</h5>
                    {inviteUrl ? (
                        <>
                            <div style={{ fontSize: 12, wordBreak: 'break-all', marginBottom: 8 }}>
                                {inviteUrl}
                            </div>
                            <button
                                className="msgr-btn block"
                                onClick={() => {
                                    navigator.clipboard?.writeText(inviteUrl);
                                    Swal.fire({
                                        icon: 'success', title: 'Link copied',
                                        timer: 1200, showConfirmButton: false
                                    });
                                }}
                            >
                                <FontAwesomeIcon icon={faCopy} /> Copy link
                            </button>
                            <p style={{ fontSize: 11.5, color: '#667781', marginTop: 8, marginBottom: 0 }}>
                                Expires in 7 days. Anyone logged into the HRMS with this link can join.
                            </p>
                        </>
                    ) : (
                        <button className="msgr-btn block" onClick={makeInvite}>
                            <FontAwesomeIcon icon={faLink} /> Create an invite link
                        </button>
                    )}
                </div>
            )}

            {isGroup && conversation.isMember && (
                <div className="msgr-info-section">
                    <button className="msgr-btn danger block" onClick={leave}>
                        <FontAwesomeIcon icon={faRightFromBracket} /> Leave group
                    </button>
                </div>
            )}

            {pendingIcon && (
                <ImageEditor
                    file={pendingIcon}
                    onCancel={() => setPendingIcon(null)}
                    onConfirm={uploadIcon}
                />
            )}

            {addingPeople && (
                <PeoplePicker
                    title="Add people"
                    excludeIds={members.map((m) => String(m.user?._id || m.user))}
                    onCancel={() => setAddingPeople(false)}
                    onConfirm={addMembers}
                />
            )}
        </div>
    );
};

export default GroupInfoPanel;
