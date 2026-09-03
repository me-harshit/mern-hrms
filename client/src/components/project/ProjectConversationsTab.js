import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faComments, faHandshake, faUserGroup } from '@fortawesome/free-solid-svg-icons';

import EmployeeAvatar from '../EmployeeAvatar';
import { timeAgo } from './projectShared';

/**
 * The project's conversations — F1.5 (Discussions) and F1.6 (Vendors).
 *
 * One component, two mountings, because they are the same data: a vendor
 * thread is an ordinary group that currently holds a live external membership,
 * not a separate kind of conversation.
 *
 * Note what `variant` does and does not control. It picks the empty state and
 * the framing — nothing else. Whether a row is drawn as a vendor thread is
 * decided per row, from whether that thread actually has externals in it. That
 * distinction matters: Discussions lists every conversation on the project,
 * vendor ones included, so a group with an outsider in it has to keep its amber
 * edge and its External badges there too. Styling off `variant` instead would
 * have made the same thread look internal on one tab and external on the other.
 */
const ProjectConversationsTab = ({ threads = [], variant = 'discussions', loading }) => {
    const navigate = useNavigate();
    const isVendorTab = variant === 'vendor';

    if (loading) {
        return <div className="pw-panel"><div className="pw-empty">Loading conversations…</div></div>;
    }

    if (!threads.length) {
        return (
            <div className="pw-panel">
                <div className="pw-empty">
                    <FontAwesomeIcon
                        icon={isVendorTab ? faHandshake : faComments}
                        className="pw-empty-icon"
                    />
                    {isVendorTab ? (
                        <>
                            <strong>No external participants</strong>
                            Nobody outside the company has been given access to this
                            project. Vendors are invited from inside a group chat, and
                            their threads appear here once they are.
                        </>
                    ) : (
                        <>
                            <strong>No group chat yet</strong>
                            {/* The common cause by far: projects that predate the
                                chat module never got a group, because one is only
                                created with a new project or on first task
                                assignment. Saying so beats an empty panel that
                                reads as broken. */}
                            Projects created before group chat existed do not have one
                            until somebody is assigned a task. Ask an admin to run the
                            project-group backfill, or start a group from Chats and tag
                            it to this project.
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="pw-panel">
            {threads.map((thread) => {
                // Per row, not per tab — see the note above.
                const hasExternals = (thread.externals || []).length > 0;

                return (
                    <div
                        key={thread._id}
                        className={`pw-row is-clickable pw-thread ${hasExternals ? 'is-vendor' : ''}`}
                        onClick={() => navigate(`/chats/${thread._id}`)}
                    >
                        <div className="pw-row-main">
                            <p className="pw-row-title">
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {thread.name || 'Untitled group'}
                                </span>
                                {thread.groupType === 'project' && (
                                    <span className="pw-pill medium">Project group</span>
                                )}
                            </p>

                            {/* The same denormalised preview line the chat sidebar
                                shows, so a thread reads identically in both. */}
                            <div className="pw-thread-preview">
                                {thread.lastMessage?.text
                                    ? `${thread.lastMessage.senderName ? `${thread.lastMessage.senderName}: ` : ''}${thread.lastMessage.text}`
                                    : 'No messages yet'}
                            </div>

                            <div className="pw-row-sub">
                                <span>
                                    <FontAwesomeIcon icon={faUserGroup} />
                                    {thread.memberCount} member{thread.memberCount === 1 ? '' : 's'}
                                </span>
                                {hasExternals && thread.externals.map((e) => (
                                    <span key={e._id} className="pw-pill external">
                                        {e.externalUser?.name || 'External'}
                                        {e.externalUser?.company ? ` · ${e.externalUser.company}` : ''}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="pw-row-side">
                            <div className="pw-avatars">
                                {(thread.members || []).slice(0, 3).map((m) => (
                                    m ? <EmployeeAvatar key={m._id} person={m} className="table-avatar" /> : null
                                ))}
                            </div>
                            <span className="pw-event-time">{timeAgo(thread.lastActivityAt)}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ProjectConversationsTab;
