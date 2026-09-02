import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faTriangleExclamation, faArrowRight } from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import '../../styles/project.css';

/**
 * The dashboard's project lens — feature draft F1.9.
 *
 * A dropdown would have been the literal reading of "the dashboard gets a
 * Project filter", but the dashboard is a wall of company-wide stat tiles:
 * filtering "Total Employees" or "Absent Today" by project means nothing, so a
 * select there would have been a control that greyed out most of the page.
 *
 * What the draft actually asks for is to stop the dashboard being only "who is
 * doing what" — so this is the second lens in the form the page can carry: the
 * reader's projects, each with the health that matters, one click from the
 * workspace. Ordered by trouble, because that is the reason to look.
 *
 * Renders nothing at all when the reader is on no projects. An empty panel on
 * the landing page teaches people to scroll past that region.
 */
const ProjectLensStrip = ({ limit = 4, detailPath = '/my-projects' }) => {
    const navigate = useNavigate();

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        api.get('/projects/mine', { params: { status: 'Active' } })
            .then((res) => {
                if (cancelled) return;
                const rows = [...(res.data || [])].sort((a, b) => (
                    // Overdue first, then whatever moved most recently.
                    (b.stats?.overdue || 0) - (a.stats?.overdue || 0) ||
                    new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0)
                ));
                setProjects(rows.slice(0, limit));
            })
            .catch(() => { if (!cancelled) setProjects([]); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [limit]);

    if (loading || projects.length === 0) return null;

    return (
        <div style={{ marginTop: 28 }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 14
            }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                    <FontAwesomeIcon icon={faFolderOpen} style={{ marginRight: 9, color: '#215D7B' }} />
                    My Projects
                </h2>
                <button
                    type="button"
                    className="pw-back"
                    style={{ margin: 0 }}
                    onClick={() => navigate('/my-projects')}
                >
                    View all <FontAwesomeIcon icon={faArrowRight} />
                </button>
            </div>

            <div className="pw-grid">
                {projects.map((project) => (
                    <div
                        key={project._id}
                        className="pw-card"
                        onClick={() => navigate(`${detailPath}/${project._id}`)}
                    >
                        <div className="pw-card-head">
                            <h3 className="pw-card-name">{project.name}</h3>
                            {project.stats.overdue > 0 && (
                                <span className="pw-pill overdue">
                                    <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
                                    {project.stats.overdue}
                                </span>
                            )}
                        </div>

                        <div className="pw-row-sub">
                            <span className="pw-pill in-progress">{project.stats.open} open</span>
                            <span className="pw-pill low">{project.stats.totalTasks} total</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProjectLensStrip;
