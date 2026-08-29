import React, { useState } from 'react';
import { SERVER_URL } from '../utils/api';

// `onClick` is passed through so an avatar can open something (the assignee
// popup, in the task tables) without every caller having to wrap it in a
// span just to catch the event.
const Avatar = ({ name, profilePic, className, style = {}, title, onClick }) => {
    const [imgError, setImgError] = useState(false);

    const initials = name
        ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : '??';

    if (profilePic && !imgError) {
        const picUrl = profilePic.startsWith('http') ? profilePic : `${SERVER_URL}${profilePic}`;
        return (
            <img 
                src={picUrl} 
                alt={name} 
                title={title || name}
                className={className} 
                style={{ objectFit: 'cover', ...style }}
                onClick={onClick}
                onError={() => setImgError(true)}
            />
        );
    }

    return (
        <div className={className} style={style} title={title || name} onClick={onClick}>
            {initials}
        </div>
    );
};

export default Avatar;
