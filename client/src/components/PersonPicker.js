import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faChevronDown, faUser, faXmark } from '@fortawesome/free-solid-svg-icons';
import Avatar from './Avatar';
import '../styles/selftask.css';

/**
 * Pick exactly one person, by typing.
 *
 * A plain <select> of everyone in the company is unusable past a few dozen
 * names — you cannot scan it and you cannot search it. This is the single-select
 * counterpart to EmployeeMultiSelect, sharing its behaviour (search, click-away,
 * Escape) but with deliberately small rows so the list stays a dropdown rather
 * than taking over the dialog.
 */
const PersonPicker = ({
    people = [],
    value = '',
    onChange,
    placeholder = 'Search for a person...',
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapRef = useRef(null);
    const searchRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        const onDown = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setIsOpen(false); } };

        document.addEventListener('mousedown', onDown);
        // Capture phase: otherwise Escape closes the whole dialog behind this,
        // and the user loses the form rather than just the dropdown.
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && searchRef.current) searchRef.current.focus();
    }, [isOpen]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return people;
        return people.filter(p =>
            (p.name || '').toLowerCase().includes(term) ||
            (p.employeeId || '').toLowerCase().includes(term) ||
            (p.role || '').toLowerCase().includes(term)
        );
    }, [people, search]);

    const picked = useMemo(() => people.find(p => p._id === value) || null, [people, value]);

    const choose = (id) => {
        onChange(id);
        setIsOpen(false);
        setSearch('');
    };

    return (
        <div className="pp-wrap" ref={wrapRef}>
            <button
                type="button"
                className={`pp-control ${isOpen ? 'open' : ''} ${picked ? '' : 'is-empty'}`}
                onClick={() => !disabled && setIsOpen(o => !o)}
                disabled={disabled}
                aria-expanded={isOpen}
            >
                {picked ? (
                    <>
                        <Avatar name={picked.name} profilePic={picked.profilePic} className="pp-avatar" />
                        <span className="pp-name">{picked.name}</span>
                        <span className="pp-sub">{picked.employeeId || picked.role}</span>
                        <span
                            className="pp-clear"
                            role="button"
                            tabIndex={-1}
                            aria-label="Clear"
                            onClick={(e) => { e.stopPropagation(); onChange(''); }}
                        >
                            <FontAwesomeIcon icon={faXmark} />
                        </span>
                    </>
                ) : (
                    <>
                        <FontAwesomeIcon icon={faUser} className="pp-placeholder-icon" />
                        <span className="pp-placeholder">{placeholder}</span>
                    </>
                )}
                <FontAwesomeIcon icon={faChevronDown} className={`pp-caret ${isOpen ? 'flip' : ''}`} />
            </button>

            {isOpen && (
                <div className="pp-panel">
                    <div className="pp-search">
                        <FontAwesomeIcon icon={faSearch} />
                        <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            placeholder="Type a name or employee ID..."
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="pp-options">
                        {filtered.map(p => (
                            <button
                                type="button"
                                key={p._id}
                                className={`pp-option ${p._id === value ? 'selected' : ''}`}
                                onClick={() => choose(p._id)}
                            >
                                <Avatar name={p.name} profilePic={p.profilePic} className="pp-avatar" />
                                <span className="pp-option-name">{p.name}</span>
                                <span className="pp-option-sub">{p.employeeId || p.role}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="pp-empty">No one matches “{search}”.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PersonPicker;
