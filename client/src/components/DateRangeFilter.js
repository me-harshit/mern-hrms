import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter } from '@fortawesome/free-solid-svg-icons';

/**
 * The Today/Yesterday/Week/Month/All/Custom bar the attendance and expense
 * screens already use, lifted out so the task lists present the same control
 * instead of a third hand-rolled copy of it.
 *
 * The preset names are also the values sent to the API — the server reads them
 * in utils/taskDateFilter.js — so renaming a button here means renaming it
 * there too. Week and Month are rolling 7- and 30-day windows, matching what
 * those labels already mean everywhere else in the app.
 */
const PRESETS = ['Today', 'Yesterday', 'Week', 'Month', 'All', 'Custom'];

/**
 * `inline` drops the card chrome -- the white background, padding and bottom
 * margin -- so the control can sit inside another toolbar as a plain group of
 * buttons. Off by default, because every other screen using this wants the
 * card and none of them should shift because the task board asked for a
 * tighter layout.
 */
const DateRangeFilter = ({ value, onChange, custom, onCustomChange, presets = PRESETS, inline = false }) => (
    <div className={inline ? 'filter-bar-inline' : 'filter-bar-card fade-in'}>
        <div className="filter-buttons">
            {presets.map(type => (
                <button
                    key={type}
                    type="button"
                    className={`gts-btn filter-btn ${value === type ? 'primary active' : 'warning inactive'}`}
                    onClick={() => onChange(type)}
                >
                    {type === 'Custom' && <FontAwesomeIcon icon={faFilter} className="filter-icon" />}
                    {type}
                </button>
            ))}
        </div>

        {value === 'Custom' && (
            <div className="custom-date-filters fade-in">
                <div className="date-input-group">
                    <span className="date-label">From:</span>
                    <input
                        type="date"
                        className="swal2-input date-picker-small"
                        value={custom.from}
                        max={custom.to || undefined}
                        onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
                    />
                </div>
                <div className="date-input-group">
                    <span className="date-label">To:</span>
                    <input
                        type="date"
                        className="swal2-input date-picker-small"
                        value={custom.to}
                        min={custom.from || undefined}
                        onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
                    />
                </div>
            </div>
        )}
    </div>
);

export default DateRangeFilter;
