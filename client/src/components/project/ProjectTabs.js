import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faListCheck, faUserGroup, faComments, faHandshake,
    faFolderOpen, faWaveSquare
} from '@fortawesome/free-solid-svg-icons';

/**
 * The workspace tab bar — F1.3 through F1.8 in the order the draft lists them.
 *
 * The tab set is defined here rather than in each page so the two shells cannot
 * drift into offering different tabs. A shell that should not show a tab passes
 * its key in `hide`; nothing else about the bar changes between them.
 */

export const PROJECT_TABS = [
    { key: 'tasks', label: 'Tasks', icon: faListCheck },
    { key: 'team', label: 'Team', icon: faUserGroup },
    { key: 'discussions', label: 'Discussions', icon: faComments },
    { key: 'vendors', label: 'Vendors', icon: faHandshake },
    { key: 'documents', label: 'Documents', icon: faFolderOpen },
    { key: 'activity', label: 'Activity', icon: faWaveSquare }
];

const ProjectTabs = ({ active, onChange, counts = {}, hide = [] }) => (
    <div className="pw-tabs" role="tablist">
        {PROJECT_TABS.filter((t) => !hide.includes(t.key)).map((tab) => (
            <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active === tab.key}
                className={`pw-tab ${active === tab.key ? 'is-active' : ''}`}
                onClick={() => onChange(tab.key)}
            >
                <FontAwesomeIcon icon={tab.icon} />
                <span>{tab.label}</span>
                {/* Zero is worth showing — an empty Vendors tab is information.
                    Undefined is not: the count simply has not loaded yet. */}
                {counts[tab.key] !== undefined && (
                    <span className="pw-tab-count">{counts[tab.key]}</span>
                )}
            </button>
        ))}
    </div>
);

export default ProjectTabs;
