import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faUserTie, faCalendarAlt, faListCheck, faComments
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import EmployeeAvatar from '../../components/EmployeeAvatar';
import ProjectBudgetCard from '../../components/project/ProjectBudgetCard';
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
 * The project workspace as management sees it — feature draft F1.2.
 *
 * The registry's other half. Admin/Projects answers "what is this project worth
 * and who runs it"; this answers "what is happening on it". They are reached
 * from each other — the registry's Open button lands here, and the back link
 * goes there — but they stay separate pages because their audiences arrive with
 * different questions.
 *
 * The only differences from the employee shell (User/MyProjectDetail) are in
 * this file's chrome: the spend card and the two shortcuts into the assignment
 * screens. Every tab below the header is the same component, so the two views
 * cannot drift apart on the substance.
 */
const ProjectWorkspace = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('tasks');
    const [counts, setCounts] = useState({});

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
                Swal.fire(
                    'Not available',
                    err.response?.data?.message || 'Could not open that project.',
                    'info'
                );
                navigate('/projects', { replace: true });
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

    const { project, budget } = overview;

    return (
        <div className="settings-container fade-in">
            <div className="pw-header">
                <div className="pw-header-main">
                    <button type="button" className="pw-back" onClick={() => navigate('/projects')}>
                        <FontAwesomeIcon icon={faArrowLeft} /> Project registry
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

                    {/* Straight into the assignment screens, pre-filtered to
                        this project — the workspace is read-only, and this is
                        where a manager goes once it has told them something
                        needs doing. */}
                    <div className="pw-header-actions" style={{ marginTop: 14 }}>
                        <button
                            className="gts-btn primary btn-small"
                            onClick={() => navigate(`/tasks?projectId=${project._id}`)}
                        >
                            <FontAwesomeIcon icon={faListCheck} className="btn-icon" /> Manage tasks
                        </button>
                        <button className="gts-btn btn-small" onClick={() => navigate('/chats')}>
                            <FontAwesomeIcon icon={faComments} className="btn-icon" /> Open chats
                        </button>
                    </div>
                </div>

                <ProjectBudgetCard budget={budget} />
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

export default ProjectWorkspace;
