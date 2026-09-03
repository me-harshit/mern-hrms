import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faUserTie, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import EmployeeAvatar from '../../components/EmployeeAvatar';
import ProjectTabs from '../../components/project/ProjectTabs';
import ProjectTasksTab from '../../components/project/ProjectTasksTab';
import ProjectTeamTab from '../../components/project/ProjectTeamTab';
import ProjectConversationsTab from '../../components/project/ProjectConversationsTab';
import ProjectDocumentsTab from '../../components/project/ProjectDocumentsTab';
import ProjectActivityTab from '../../components/project/ProjectActivityTab';
import useProjectConversations from '../../components/project/useProjectConversations';
import { fmtDate } from '../../components/project/projectShared';
import '../../styles/project.css';

/**
 * The project workspace as a team member sees it — feature draft F1.2.
 *
 * The employee half of the two shells. It shares every tab below the header
 * with Admin/ProjectWorkspace and shares none of its chrome: no budget card, no
 * management actions, and a back link to /my-projects rather than to the
 * registry.
 *
 * The shells are separate so each can carry the framing its audience needs;
 * the tabs are shared so a change to how tasks or documents are listed lands in
 * both without being written twice.
 */
const MyProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('tasks');
    const [counts, setCounts] = useState({});

    // Threads load on first visit to either conversation tab, not on open.
    const conversationsWanted = tab === 'discussions' || tab === 'vendors';
    const { discussions, vendor, loading: threadsLoading } =
        useProjectConversations(id, conversationsWanted);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const res = await api.get(`/projects/${id}/overview`);
                if (!cancelled) setOverview(res.data);
            } catch (err) {
                if (cancelled) return;
                // A 403 here is the normal case for a stale link to a project
                // somebody has come off, so it is answered by going back to the
                // list rather than by leaving a broken page on screen.
                Swal.fire(
                    'Not available',
                    err.response?.data?.message || 'You do not have access to this project.',
                    'info'
                );
                navigate('/my-projects', { replace: true });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [id, navigate]);

    if (loading) {
        return (
            <div className="settings-container fade-in">
                <div className="pw-panel"><div className="pw-empty">Loading project…</div></div>
            </div>
        );
    }

    if (!overview) return null;

    const { project } = overview;

    return (
        <div className="settings-container fade-in">
            <div className="pw-header">
                <div className="pw-header-main">
                    <button type="button" className="pw-back" onClick={() => navigate('/my-projects')}>
                        <FontAwesomeIcon icon={faArrowLeft} /> All my projects
                    </button>

                    <h1 className="pw-title">
                        {project.name}
                        <span className={`status-badge ${project.status === 'Active' ? 'success'
                            : project.status === 'Completed' ? 'primary' : 'warning'}`}>
                            {project.status}
                        </span>
                    </h1>

                    {project.description && (
                        <p className="pw-subtitle">{project.description}</p>
                    )}

                    <div className="pw-meta">
                        {project.projectLead ? (
                            <span className="pw-meta-chip">
                                <EmployeeAvatar person={project.projectLead} className="table-avatar" />
                                {project.projectLead.name}
                            </span>
                        ) : (
                            <span className="pw-meta-chip is-plain">
                                <FontAwesomeIcon icon={faUserTie} /> Lead unassigned
                            </span>
                        )}
                        <span className="pw-meta-chip is-plain">
                            <FontAwesomeIcon icon={faCalendarAlt} />
                            {fmtDate(project.startDate)} → {fmtDate(project.endDate)}
                        </span>
                    </div>
                </div>
            </div>

            <ProjectTabs
                active={tab}
                onChange={setTab}
                counts={{
                    ...counts,
                    ...(conversationsWanted && !threadsLoading
                        ? { discussions: discussions.length, vendors: vendor.length }
                        : {})
                }}
            />

            {tab === 'tasks' && (
                <ProjectTasksTab
                    projectId={id}
                    onCount={(n) => setCounts((c) => (c.tasks === n ? c : { ...c, tasks: n }))}
                />
            )}
            {tab === 'team' && (
                <ProjectTeamTab
                    projectId={id}
                    onCount={(n) => setCounts((c) => (c.team === n ? c : { ...c, team: n }))}
                />
            )}
            {tab === 'discussions' && (
                <ProjectConversationsTab threads={discussions} variant="discussions" loading={threadsLoading} />
            )}
            {tab === 'vendors' && (
                <ProjectConversationsTab threads={vendor} variant="vendor" loading={threadsLoading} />
            )}
            {tab === 'documents' && (
                <ProjectDocumentsTab
                    projectId={id}
                    onCount={(n) => setCounts((c) => (c.documents === n ? c : { ...c, documents: n }))}
                />
            )}
            {tab === 'activity' && <ProjectActivityTab projectId={id} />}
        </div>
    );
};

export default MyProjectDetail;
