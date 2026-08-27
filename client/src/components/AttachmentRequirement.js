import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperclip, faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import '../styles/attachmentRequirement.css';

/**
 * "Does finishing this task require proof?" — the assigner's switch
 * (TaskPlan.md §19).
 *
 * Off by default, and deliberately a plain switch rather than a collapsing
 * panel like TaskTimeWindow: there is nothing to configure underneath it, so
 * the extra affordance would be a step with no destination.
 *
 * `noun` names what the schedule/task generates, so the recurring form can
 * say "every day of this task" where a one-off says "this task".
 */
const AttachmentRequirement = ({ value, onChange, noun = 'this task', disabled = false }) => (
    <button
        type="button"
        className={`atr-toggle ${value ? 'is-on' : ''}`}
        onClick={() => onChange(!value)}
        disabled={disabled}
        aria-pressed={value}
    >
        <span className="atr-icon">
            <FontAwesomeIcon icon={value ? faCircleCheck : faPaperclip} />
        </span>

        <span className="atr-text">
            <span className="atr-label">Attachment needed to complete</span>
            <span className="atr-hint">
                {value
                    ? `${noun[0].toUpperCase()}${noun.slice(1)} can't be marked completed without a file.`
                    : 'Optional — the assignee can still attach something if they want to.'}
            </span>
        </span>

        <span className="atr-switch" aria-hidden="true"><span className="atr-knob" /></span>
    </button>
);

export default AttachmentRequirement;
