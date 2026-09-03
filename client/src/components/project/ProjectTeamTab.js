import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserGroup } from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import EmployeeAvatar from '../EmployeeAvatar';

/**
 * Who is on this project — feature draft F1.4.
 *
 * There is no "add member" button, and that is the design rather than an
 * omission: project membership is derived, never declared (see
 * server/utils/projectAccess.js). You join a project by being given work on it
 * or by being added to one of its groups, both of which are screens that
 * already exist. A button here would create a fourth list that could disagree
 * with the three that decide the answer.
 *
 * The workload numbers are project-wide and identical for every viewer — a
 * team tab that showed different totals to different colleagues would be worse
 * than useless for spotting who is overloaded.
 */
const ProjectTeamTab = ({ projectId, onCount }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const res = await api.get(`/projects/${projectId}/team`);
                if (cancelled) return;
                setRows(res.data || []);
                if (onCount) onCount((res.data || []).length);
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    if (loading) return <div className="pw-panel"><div className="pw-empty">Loading team…</div></div>;

    if (!rows.length) {
        return (
            <div className="pw-panel">
                <div className="pw-empty">
                    <FontAwesomeIcon icon={faUserGroup} className="pw-empty-icon" />
                    <strong>Nobody on this project yet</strong>
                    People join by being assigned work on it, or by being added
                    to its group chat — there is no separate member list to fill in.
                </div>
            </div>
        );
    }

    return (
        <div className="pw-panel">
            {rows.map((person) => (
                <div key={person._id} className="pw-row">
                    <EmployeeAvatar person={person} className="table-avatar" />

                    <div className="pw-row-main">
                        <p className="pw-row-title">
                            {person.name}
                            {person.status !== 'ACTIVE' && (
                                <span className="pw-pill low" style={{ marginLeft: 8 }}>Inactive</span>
                            )}
                        </p>
                        <div className="pw-row-sub">
                            <span>{person.projectRole}</span>
                            {person.jobTitle && <span>{person.jobTitle}</span>}
                            {person.employeeId && <span>{person.employeeId}</span>}
                        </div>
                    </div>

                    <div className="pw-row-side">
                        {person.overdueTasks > 0 && (
                            <span className="pw-pill overdue">{person.overdueTasks} overdue</span>
                        )}
                        <span className="pw-pill in-progress">{person.openTasks} open</span>
                        <span className="pw-pill completed">{person.completedTasks} done</span>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ProjectTeamTab;
