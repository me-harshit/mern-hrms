import React, { useState } from 'react';
import Avatar from './Avatar';
import AssigneePopup from './AssigneePopup';

/**
 * An employee's picture, anywhere their name appears, that opens full size
 * when clicked.
 *
 * This exists so rolling the behaviour out across the app is a one-line change
 * per site rather than four: it owns its own popup state, stops the click from
 * reaching whatever the surrounding row does (most tables navigate on click),
 * and falls back to initials through Avatar when there is no photo.
 *
 * `person` is any object with { name, profilePic } — the shape every list
 * endpoint already returns. Extra fields (employeeId, jobTitle, role) are used
 * for the caption when present and ignored when not.
 */
const EmployeeAvatar = ({ person, className = 'table-avatar', title, subtitle }) => {
    const [open, setOpen] = useState(false);

    if (!person) return null;

    const meta = subtitle !== undefined
        ? subtitle
        : [person.employeeId, person.jobTitle || person.role].filter(Boolean).join(' · ');

    const show = (e) => {
        // The row underneath usually navigates; opening the photo must not
        // also open the page behind it.
        e.stopPropagation();
        setOpen(true);
    };

    return (
        <>
            <Avatar
                name={person.name}
                profilePic={person.profilePic}
                className={`${className} emp-avatar-clickable`}
                title={title || `View ${person.name || 'this employee'}'s photo`}
                onClick={show}
            />
            <AssigneePopup
                open={open}
                onClose={() => setOpen(false)}
                title={person.name || 'Employee'}
                subtitle={meta}
                people={[person]}
                /* The header already names them, so the caption under the
                   picture would just say it twice. */
                captions={false}
            />
        </>
    );
};

export default EmployeeAvatar;
