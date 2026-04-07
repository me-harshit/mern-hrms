import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faChevronDown } from '@fortawesome/free-solid-svg-icons';

const SearchSelect = ({
    options = [],
    value = '',
    onChange,
    placeholder = 'Search...',
    displayKey = 'name',
    secondaryKey = '',
    valueKey = '_id',
    icon = faSearch,
    disabled = false
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Check if options are just flat strings instead of objects
    const isStringArray = options.length > 0 && typeof options[0] === 'string';

    const selectedOption = isStringArray
        ? options.find(opt => opt === value)
        : options.find(opt => opt[valueKey] === value);

    // 👇 FIXED: Wrapped in useCallback to satisfy React's exhaustive-deps
    const getPrimaryText = useCallback((opt) => {
        if (!opt) return '';
        if (isStringArray) return String(opt);
        return typeof displayKey === 'function' ? displayKey(opt) : String(opt[displayKey] || '');
    }, [isStringArray, displayKey]);

    // 👇 FIXED: Wrapped in useCallback
    const getSecondaryText = useCallback((opt) => {
        if (isStringArray || !secondaryKey || !opt) return '';
        return String(opt[secondaryKey] || '');
    }, [isStringArray, secondaryKey]);

    // Auto-fill input if a value is pre-selected (like on Edit Pages)
    useEffect(() => {
        if (selectedOption && !isOpen) {
            setSearchTerm(getPrimaryText(selectedOption));
        } else if (!selectedOption && !isOpen) {
            setSearchTerm('');
        }
    }, [isOpen, selectedOption, getPrimaryText]); // 👇 FIXED: Added correct dependencies

    // Handle clicking outside the dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                if (selectedOption) {
                    setSearchTerm(getPrimaryText(selectedOption));
                } else {
                    setSearchTerm('');
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedOption, getPrimaryText]); // 👇 FIXED: Added correct dependencies

    const filteredOptions = options.filter(opt => {
        const primaryText = getPrimaryText(opt).toLowerCase();
        const secondaryText = getSecondaryText(opt).toLowerCase();
        const search = searchTerm.toLowerCase();
        return primaryText.includes(search) || secondaryText.includes(search);
    });

    return (
        <div style={{ position: 'relative', width: '100%' }} ref={dropdownRef}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <FontAwesomeIcon icon={icon} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
                <input
                    type="text"
                    className="custom-input m-0"
                    placeholder={placeholder}
                    disabled={disabled}
                    style={{
                        paddingLeft: '35px', paddingRight: '30px',
                        borderColor: value ? '#16a34a' : '#cbd5e1',
                        background: disabled ? '#f1f5f9' : 'white',
                        cursor: disabled ? 'not-allowed' : 'text'
                    }}
                    value={isOpen ? searchTerm : (selectedOption ? getPrimaryText(selectedOption) : searchTerm)}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        onChange(''); // Clear selection immediately when typing to force re-selection
                        setIsOpen(true);
                    }}
                    onFocus={() => {
                        if (!disabled) { 
                            setIsOpen(true); 
                            setSearchTerm(''); // Clear to show all options
                        }
                    }}
                />
                <FontAwesomeIcon icon={faChevronDown} style={{ position: 'absolute', right: '12px', color: '#94a3b8', pointerEvents: 'none' }} />
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px',
                    maxHeight: '220px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}>
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map(opt => {
                            const val = isStringArray ? opt : opt[valueKey];
                            const isSelected = value === val;
                            
                            return (
                                <div
                                    key={val}
                                    style={{
                                        padding: '10px 15px', cursor: 'pointer',
                                        borderBottom: '1px solid #f8fafc', fontSize: '14px',
                                        background: isSelected ? '#f0fdf4' : 'white'
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Prevents input blur from firing before click registers
                                        onChange(val);
                                        setSearchTerm(getPrimaryText(opt));
                                        setIsOpen(false);
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? '#f0fdf4' : 'white'}
                                >
                                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{getPrimaryText(opt)}</div>
                                    {!isStringArray && getSecondaryText(opt) && (
                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                            {secondaryKey === 'gstNumber' ? 'GST: ' : ''}{getSecondaryText(opt)}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div style={{ padding: '15px', color: '#64748b', fontSize: '14px', textAlign: 'center' }}>No matches found</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchSelect;