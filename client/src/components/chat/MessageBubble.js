import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCheck, faCheckDouble, faReply, faPen, faTrash,
    faFilePdf, faFileWord, faFileExcel, faFilePowerpoint,
    faFileZipper, faFileLines, faFile
} from '@fortawesome/free-solid-svg-icons';

import { SERVER_URL } from '../../utils/api';
import AudioNote from '../AudioNote';
import MediaLightbox from '../MediaLightbox';

/**
 * One message in the thread.
 *
 * Renders bubbles the way WhatsApp does — own messages green and right, others
 * white and left, the time and ticks tucked onto the last line of text — so the
 * people moving off WhatsApp do not have to relearn how to read a conversation.
 */

const fileIcon = (name = '') => {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return faFilePdf;
    if (['doc', 'docx'].includes(ext)) return faFileWord;
    if (['xls', 'xlsx', 'csv'].includes(ext)) return faFileExcel;
    if (['ppt', 'pptx'].includes(ext)) return faFilePowerpoint;
    if (['zip'].includes(ext)) return faFileZipper;
    if (['txt'].includes(ext)) return faFileLines;
    return faFile;
};

const clockTime = (iso) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * Draw @mentions as highlighted text.
 *
 * Split on the mention pattern rather than injecting HTML: the message body is
 * whatever a colleague typed, and dangerouslySetInnerHTML on it would make
 * every chat box in the company an XSS vector.
 */
const renderText = (text, mentions = []) => {
    if (!text) return null;
    const names = mentions.map((m) => m?.name).filter(Boolean);
    if (!names.length) return text;

    const escaped = names
        .sort((a, b) => b.length - a.length)   // longest first, so "Amit Kumar" wins over "Amit"
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // A capturing group keeps the delimiters in the split output, so the parts
    // alternate text / mention / text. Whether a part IS a mention is then
    // decided by set membership — NOT by re-running the regex: a /g regex
    // carries lastIndex between .test() calls and would match every other one.
    const parts = text.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
    const nameSet = new Set(names);

    return parts.map((part, i) => (
        part.startsWith('@') && nameSet.has(part.slice(1))
            ? <span key={i} className="msgr-mention">{part}</span>
            : <React.Fragment key={i}>{part}</React.Fragment>
    ));
};

const MessageBubble = ({
    id,
    message,
    mine,
    showAuthor,
    firstOfRun,
    memberCount,
    onReply,
    onEdit,
    onDelete,
    onJumpTo
}) => {
    const [lightbox, setLightbox] = useState(null);

    /*
     * `id` lands on the root element, not on a wrapper the caller supplies.
     *
     * The thread is a flex column and side is chosen with align-self, which
     * only works on a direct flex child — so wrapping this in a plain <div> to
     * carry the anchor id makes that div the flex child, and every message
     * renders left-aligned and full width regardless of who sent it.
     */

    // Membership changes render as centred grey pills, not bubbles.
    if (message.systemEvent?.type) {
        return <div id={id} className="msgr-system">{message.text}</div>;
    }

    const attachments = message.attachments || [];
    const visual = attachments.filter((a) => a.type === 'image' || a.type === 'video');

    const url = (u) => (u?.startsWith('http') ? u : `${SERVER_URL}${u}`);

    /*
     * Ticks (F3.8).
     *
     * One tick sent, two ticks delivered-and-read. readBy is seeded with the
     * sender, so "everyone else has read it" means readBy covers the whole
     * membership — which is why memberCount is passed in rather than inferred.
     */
    const readCount = (message.readBy || []).length;
    const allRead = memberCount > 0 && readCount >= memberCount;

    return (
        <div
            id={id}
            className={`msgr-msg ${mine ? 'out' : 'in'} ${firstOfRun ? 'first-of-run' : ''}`}
        >
            <div className="msgr-bubble">
                {!mine && showAuthor && (
                    <div className="msgr-bubble-author">{message.sender?.name || 'Unknown'}</div>
                )}

                {message.replyTo?.messageId && (
                    <div
                        className="msgr-quote"
                        onClick={() => onJumpTo?.(message.replyTo.messageId)}
                        title="Go to the original message"
                    >
                        <strong>{message.replyTo.senderName || 'Message'}</strong>
                        <span>{message.replyTo.text || 'Attachment'}</span>
                    </div>
                )}

                {!message.deletedAt && attachments.length > 0 && (
                    <div className="msgr-attachments">
                        {attachments.map((a, i) => {
                            if (a.type === 'image') {
                                return (
                                    <img
                                        key={a._id || i}
                                        src={url(a.url)}
                                        alt={a.fileName || 'photo'}
                                        className="msgr-media-img"
                                        loading="lazy"
                                        onClick={() => setLightbox(visual.findIndex((v) => v._id === a._id))}
                                    />
                                );
                            }

                            if (a.type === 'video') {
                                return (
                                    <div key={a._id || i}>
                                        <video
                                            src={url(a.url)}
                                            className="msgr-media-video"
                                            controls
                                            preload="metadata"
                                        />
                                        {/* A screen recording plays from the VPS until the night
                                            job moves it to S3 — say so rather than leaving people
                                            wondering why it looks heavier than it will be. */}
                                        {a.status === 'processing_compression' && (
                                            <span className="msgr-media-processing">Optimising…</span>
                                        )}
                                    </div>
                                );
                            }

                            if (a.type === 'audio') {
                                return <AudioNote key={a._id || i} media={a} mine={mine} />;
                            }

                            return (
                                <a
                                    key={a._id || i}
                                    className="msgr-file"
                                    href={url(a.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={a.fileName}
                                >
                                    <FontAwesomeIcon icon={fileIcon(a.fileName)} className="msgr-file-icon" />
                                    <div style={{ minWidth: 0 }}>
                                        <div className="msgr-file-name">{a.fileName || 'File'}</div>
                                        <div className="msgr-file-kind">
                                            {(a.fileName || '').split('.').pop()}
                                        </div>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                )}

                {(message.text || message.deletedAt) && (
                    <div className={`msgr-bubble-text ${message.deletedAt ? 'deleted' : ''}`}>
                        {message.deletedAt
                            ? 'This message was deleted'
                            : renderText(message.text, message.mentions)}
                    </div>
                )}

                <div className="msgr-meta">
                    {message.editedAt && !message.deletedAt && <span>edited</span>}
                    <span>{clockTime(message.createdAt)}</span>
                    {mine && !message.deletedAt && (
                        <FontAwesomeIcon
                            className={`msgr-ticks ${allRead ? 'read' : ''}`}
                            icon={readCount > 1 ? faCheckDouble : faCheck}
                            title={allRead ? 'Read by everyone' : `Read by ${Math.max(readCount - 1, 0)}`}
                        />
                    )}
                </div>
                <div style={{ clear: 'both' }} />

                {!message.deletedAt && (
                    <div className="msgr-msg-actions">
                        <button onClick={() => onReply?.(message)} title="Reply">
                            <FontAwesomeIcon icon={faReply} />
                        </button>
                        {mine && (
                            <button onClick={() => onEdit?.(message)} title="Edit">
                                <FontAwesomeIcon icon={faPen} />
                            </button>
                        )}
                        {onDelete && (
                            <button className="danger" onClick={() => onDelete(message)} title="Delete">
                                <FontAwesomeIcon icon={faTrash} />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {lightbox !== null && lightbox >= 0 && (
                <MediaLightbox
                    items={visual.map((v) => ({ ...v, url: url(v.url) }))}
                    index={lightbox}
                    onClose={() => setLightbox(null)}
                    onIndexChange={setLightbox}
                />
            )}
        </div>
    );
};

export default MessageBubble;
