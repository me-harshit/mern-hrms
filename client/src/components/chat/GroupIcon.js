import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faDiagramProject } from '@fortawesome/free-solid-svg-icons';
import { SERVER_URL } from '../../utils/api';

/**
 * A group's picture, with the coloured letter-badge as its fallback.
 *
 * One component rather than the same conditional in the list, the chat header
 * and the info panel: a group icon that renders three different ways in three
 * places is how "I changed it but it still shows the old one" bugs happen.
 *
 * The fallback is deliberately not a generic silhouette — a project group is
 * blue with a project glyph and a custom group is grey with a people glyph, so
 * the two kinds stay distinguishable at a glance even before anyone sets a
 * picture.
 */
const GroupIcon = ({ conversation, className = 'msgr-avatar', onClick }) => {
    const [failed, setFailed] = useState(false);

    const isProject = conversation?.groupType === 'project';
    const src = conversation?.avatar;

    if (src && !failed) {
        const url = src.startsWith('http') ? src : `${SERVER_URL}${src}`;
        return (
            <img
                src={url}
                alt={conversation.name || 'Group'}
                className={className}
                style={{ objectFit: 'cover' }}
                onClick={onClick}
                // A broken S3 url must degrade to the badge, not to a broken
                // image glyph in the middle of the chat list.
                onError={() => setFailed(true)}
            />
        );
    }

    return (
        <div className={`${className} ${isProject ? 'project' : 'group'}`} onClick={onClick}>
            <FontAwesomeIcon icon={isProject ? faDiagramProject : faUsers} />
        </div>
    );
};

export default GroupIcon;
