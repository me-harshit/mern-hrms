import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faChevronDown, faUserPlus } from '@fortawesome/free-solid-svg-icons';

const initials = (name = '') =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

/**
 * Select2-style picker: a compact control that shows the picked people as chips
 * and opens a searchable, checkbox-driven list instead of eating a whole screen
 * of the form.
 */
const EmployeeMultiSelect = ({
    employees = [],
    selected = [],
    onChange,
    placeholder = 'Search and select employees...',
    emptyText = 'No employees available.'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapRef = useRef(null);
    const searchRef = useRef(null);

    // Close on outside click / Escape so the panel never traps the form.
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
        };
        const handleEscape = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && searchRef.current) searchRef.current.focus();
    }, [isOpen]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return employees;
        return employees.filter(emp =>
            (emp.name || '').toLowerCase().includes(term) ||
            (emp.employeeId || '').toLowerCase().includes(term) ||
            (emp.role || '').toLowerCase().includes(term)
        );
    }, [employees, search]);

    const selectedEmployees = useMemo(
        () => employees.filter(emp => selected.includes(emp._id)),
        [employees, selected]
    );

    const toggle = (id) => {
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
    };

    const selectAllFiltered = () => {
        const ids = filtered.map(e => e._id);
        onChange([...new Set([...selected, ...ids])]);
    };

    if (employees.length === 0) {
        return <p className="text-muted ms-none">{emptyText}</p>;
    }

    const allFilteredPicked = filtered.length > 0 && filtered.every(e => selected.includes(e._id));

    return (
        <div className="ms-wrap" ref={wrapRef}>
            <div
                className={`ms-control ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(o => !o)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsOpen(o => !o);
                    }
                }}
            >
                {selectedEmployees.length === 0 ? (
                    <span className="ms-placeholder">
                        <FontAwesomeIcon icon={faUserPlus} /> {placeholder}
                    </span>
                ) : (
                    selectedEmployees.map(emp => (
                        <span key={emp._id} className="ms-chip">
                            <span className="ms-chip-avatar">{initials(emp.name)}</span>
                            <span className="ms-chip-name">{emp.name}</span>
                            <button
                                type="button"
                                className="ms-chip-x"
                                aria-label={`Remove ${emp.name}`}
                                onClick={(e) => { e.stopPropagation(); toggle(emp._id); }}
                            >
                                ✕
                            </button>
                        </span>
                    ))
                )}
                <FontAwesomeIcon icon={faChevronDown} className={`ms-caret ${isOpen ? 'flip' : ''}`} />
            </div>

            {isOpen && (
                <div className="ms-panel">
                    <div className="ms-panel-search">
                        <FontAwesomeIcon icon={faSearch} />
                        <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            placeholder="Type a name or employee ID..."
                            onChange={(e) => setSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    <div className="ms-panel-actions">
                        <span>{selected.length} selected</span>
                        <span className="ms-panel-links">
                            <button
                                type="button"
                                className="ms-link-btn"
                                disabled={allFilteredPicked}
                                onClick={selectAllFiltered}
                            >
                                Select all{search ? ' shown' : ''}
                            </button>
                            <button
                                type="button"
                                className="ms-link-btn danger"
                                disabled={selected.length === 0}
                                onClick={() => onChange([])}
                            >
                                Clear
                            </button>
                        </span>
                    </div>

                    <div className="ms-options">
                        {filtered.map(emp => {
                            const isPicked = selected.includes(emp._id);
                            return (
                                <label key={emp._id} className={`ms-option ${isPicked ? 'selected' : ''}`}>
                                    <input type="checkbox" checked={isPicked} onChange={() => toggle(emp._id)} />
                                    <div className="assignee-avatar">{initials(emp.name)}</div>
                                    <div className="assignee-meta">
                                        <span className="assignee-name">{emp.name}</span>
                                        <span className="assignee-role">{emp.employeeId || emp.role}</span>
                                    </div>
                                </label>
                            );
                        })}
                        {filtered.length === 0 && (
                            <p className="ms-empty">No one matches "{search}".</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeMultiSelect;
