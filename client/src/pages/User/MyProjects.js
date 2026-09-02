import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faSearch, faUserTie, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import EmployeeAvatar from '../../components/EmployeeAvatar';
import { fmtDate, timeAgo } from '../../components/project/projectShared';
import '../../styles/project.css';

/**
 * The project list as everyone but the finance side sees it — feature draft
 * F1.1.
 *
 * Separate from Admin/Projects (the registry) on purpose. That page is about
 * budgets, leads and dates — the record of a project as a commercial object,
 * with create and edit on it. This one is about work: which projects am I on,
 * and which of them is in trouble. They answer different questions for
 * different people, so they are different pages rather than one page with half
 * its columns hidden.
 *
 * The server decides the list: /projects/mine returns derived membership for
 * everyone else and every project for Admin/HR. No budget figure is sent here
 * at all, so there is nothing on this page to leak.
 */
const MyProjects = () => {
    const navigate = useNavigate();

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [status, setStatus] = useState('Active');

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/projects/mine', {
                params: { search: debounced || undefined, status }
            });
            setProjects(res.data || []);
        } catch {
            setProjects([]);
        } finally {
            setLoading(false);
        }
    }, [debounced, status]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faFolderOpen} className="btn-icon" /> My Projects
                </h1>
            </div>

            <div className="filter-bar-card fade-in">
                <div className="pw-toolbar" style={{ margin: 0 }}>
                    <div className="search-wrapper" style={{ maxWidth: '360px' }}>
                        <FontAwesomeIcon icon={faSearch} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search projects…"
                            className="swal2-input search-input"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className={`pw-select ${status !== 'Active' ? 'is-active' : ''}`}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        <option value="Active">Active</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                        <option value="All">All statuses</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="pw-panel"><div className="pw-empty">Loading your projects…</div></div>
            ) : projects.length === 0 ? (
                <div className="pw-panel">
                    <div className="pw-empty">
                        <FontAwesomeIcon icon={faFolderOpen} className="pw-empty-icon" />
                        {debounced || status !== 'Active' ? (
                            <>
                                <strong>No matches</strong>
                                No projects match this search.
                            </>
                        ) : (
                            <>
                                <strong>No active projects</strong>
                                You join a project by being assigned work on it, or by
                                being added to one of its groups.
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="pw-grid fade-in">
                    {projects.map((project) => (
                        <div
                            key={project._id}
                            className="pw-card"
                            onClick={() => navigate(`/my-projects/${project._id}`)}
                        >
                            <div className="pw-card-head">
                                <h3 className="pw-card-name">{project.name}</h3>
                                <span className={`status-badge ${project.status === 'Active' ? 'success'
                                    : project.status === 'Completed' ? 'primary' : 'warning'}`}>
                                    {project.status}
                                </span>
                            </div>

                            <p className="pw-card-desc">
                                {project.description || 'No description provided.'}
                            </p>

                            <div className="pw-card-lead">
                                {project.projectLead ? (
                                    <>
                                        <EmployeeAvatar person={project.projectLead} className="table-avatar" />
                                        <span>{project.projectLead.name}</span>
                                    </>
                                ) : (
                                    <>
                                        <FontAwesomeIcon icon={faUserTie} style={{ color: '#94a3b8' }} />
                                        <span className="text-muted">Lead unassigned</span>
                                    </>
                                )}
                            </div>

                            {/* State of the work, not a progress score — a
                                percentage of unweighted task rows told people
                                less than these two numbers do. */}
                            <div className="pw-row-sub">
                                <span className="pw-pill in-progress">
                                    {project.stats.open} open
                                </span>
                                {project.stats.overdue > 0 && (
                                    <span className="pw-pill overdue">
                                        <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
                                        {project.stats.overdue} overdue
                                    </span>
                                )}
                                <span className="pw-pill low">{project.stats.totalTasks} total</span>
                            </div>

                            <div className="pw-card-foot">
                                <span>Due {fmtDate(project.endDate)}</span>
                                <span>
                                    {project.lastActivityAt ? timeAgo(project.lastActivityAt) : 'No activity yet'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyProjects;
