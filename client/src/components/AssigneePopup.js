import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faUsers } from '@fortawesome/free-solid-svg-icons';
import Avatar from './Avatar';
import '../styles/assigneePopup.css';

/**
 * Who is working on a task, at a size you can actually recognise someone at.
 *
 * The avatar stacks in the task tables are 26px and clipped to four, which is
 * enough to say "three people" and not enough to say *which* three. This is
 * what a click on one opens.
 *
 * The photo is the content here and the name is the caption, so the layout is
 * a grid of large pictures rather than a list with thumbnails — a 46px avatar
 * in a row of text is still too small to identify a face, which was the whole
 * reason for opening it.
 *
 * Avatar already falls back to initials when there is no photo and when a
 * photo fails to load, so someone without a picture gets large initials in the
 * same box rather than a blank square.
 */
const AssigneePopup = ({ open, onClose, title, people = [], subtitle, captions = true }) => {
    const closeRef = useRef(null);

    // Escape closes it, and focus starts on the close button so the dialog is
    // operable without a mouse.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        closeRef.current?.focus();
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const list = people.filter(Boolean);
    // One person gets the whole width rather than a half-empty grid row.
    const single = list.length === 1;

    return (
        <div
            className="ap-overlay"
            /* These rows sit inside table rows that navigate on click, so every
               handler here stops propagation — otherwise dismissing the popup
               would open the task behind it. */
            onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
            <div
                className={`ap-modal ${single ? 'is-single' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={title || 'People on this task'}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="ap-head">
                    <div className="ap-head-text">
                        <h3>
                            <FontAwesomeIcon icon={faUsers} /> {title || 'Working on this'}
                            {list.length > 1 && <span className="ap-count">{list.length}</span>}
                        </h3>
                        {subtitle && <p className="ap-sub" title={subtitle}>{subtitle}</p>}
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        className="ap-close"
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        aria-label="Close"
                    >
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </header>

                {list.length === 0 ? (
                    <p className="ap-empty">Nobody is assigned to this yet.</p>
                ) : (
                    <div className="ap-grid">
                        {list.map((p, i) => (
                            <figure key={p._id || i} className="ap-person">
                                <Avatar
                                    name={p.name}
                                    profilePic={p.profilePic}
                                    className="ap-person-avatar"
                                />
                                {captions && (
                                    <figcaption className="ap-person-text">
                                        <span className="ap-person-name" title={p.name}>
                                            {p.name || 'Unknown'}
                                        </span>
                                        {[p.employeeId, p.jobTitle || p.role, p.email].filter(Boolean)[0] && (
                                            <span className="ap-person-meta">
                                                {[p.employeeId, p.jobTitle || p.role, p.email].filter(Boolean)[0]}
                                            </span>
                                        )}
                                    </figcaption>
                                )}
                            </figure>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AssigneePopup;
