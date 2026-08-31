import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBellSlash } from '@fortawesome/free-solid-svg-icons';
import EmployeeAvatar from '../EmployeeAvatar';
import GroupIcon from './GroupIcon';

/**
 * The left pane: every conversation, newest first, with unread badges.
 *
 * Ordering comes from the server's lastActivityAt so it survives a refresh and
 * matches on every device. Nothing is sorted here beyond what arrives.
 */

/**
 * WhatsApp's relative stamp: time today, "Yesterday", then a date.
 * Exported because the People tab renders the same rows for colleagues who
 * already have a thread, and two copies of this would drift.
 */
export const stamp = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const GroupAvatar = ({ conversation }) => {
    if (conversation.kind === 'direct') {
        // EmployeeAvatar stops the click reaching the row, so opening someone's
        // photo does not also open the chat behind it.
        return (
            <EmployeeAvatar
                person={conversation.otherUser || {
                    name: conversation.title,
                    profilePic: conversation.avatarUrl
                }}
                className="msgr-avatar"
            />
        );
    }
    return <GroupIcon conversation={conversation} className="msgr-avatar" />;
};

const ConversationList = ({ conversations, activeId, onSelect, onContextMenu, myId }) => {
    if (!conversations.length) {
        return (
            <div className="msgr-empty">
                No conversations yet.<br />
                Start one with the buttons above.
            </div>
        );
    }

    return (
        <div className="msgr-list">
            {conversations.map((c) => {
                const last = c.lastMessage || {};
                const unread = c.unread > 0;

                // "You: " only makes sense where more than one person could
                // have spoken — a DM preview reads better without it.
                const mine = last.sender && String(last.sender) === String(myId);
                const who = c.kind === 'group' && last.senderName
                    ? `${mine ? 'You' : last.senderName.split(' ')[0]}: `
                    : (mine ? 'You: ' : '');

                return (
                    <div
                        key={c._id}
                        className={`msgr-row ${activeId === c._id ? 'active' : ''} ${unread ? 'unread' : ''}`}
                        onClick={() => onSelect(c)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            onContextMenu?.(e, c);
                        }}
                    >
                        <GroupAvatar conversation={c} />

                        <div className="msgr-row-body">
                            <div className="msgr-row-top">
                                <span className="msgr-row-name">{c.title}</span>
                                <span className="msgr-row-time">{stamp(last.at || c.lastActivityAt)}</span>
                            </div>

                            <div className="msgr-row-bottom">
                                <span className="msgr-row-preview">
                                    {last.kind === 'system' ? last.text : `${who}${last.text || 'No messages yet'}`}
                                </span>

                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {c.muted && (
                                        <FontAwesomeIcon
                                            icon={faBellSlash}
                                            style={{ color: '#667781', fontSize: 11 }}
                                            title="Muted"
                                        />
                                    )}
                                    {c.groupType === 'project' && <span className="msgr-tag">Project</span>}
                                    {unread && <span className="msgr-badge">{c.unread > 99 ? '99+' : c.unread}</span>}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationList;
