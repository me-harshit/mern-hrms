import React, { useState } from 'react';
import { SERVER_URL } from '../utils/api';

const Avatar = ({ name, profilePic, className, style = {}, title }) => {
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
                onError={() => setImgError(true)}
            />
        );
    }

    return (
        <div className={className} style={style} title={title || name}>
            {initials}
        </div>
    );
};

export default Avatar;
