import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faCalendarDays, faUsers } from '@fortawesome/free-solid-svg-icons';
import api from '../../utils/api';
import TaskReportCalendar from '../../components/TaskReportCalendar';
import EmployeeTaskBoard from '../../components/EmployeeTaskBoard';
import '../../styles/App.css';
import '../../styles/tasks.css';

/**
 * Company/team-wide visibility into who has what, and when it's due —
 * distinct from Regular Tasks (assign-and-track) and from My Tasks
 * (an employee's own work). Two ways of asking the same question: the
 * Calendar answers "what's due when", the Workload tab answers "who's
 * carrying what right now". Both use the same scoping as everything else —
 * a Team Lead sees only their own team.
 *
 * The project filter (feature draft F1.9) lives here rather than inside either
 * tab, because it is the same question of both of them — "show me everything on
 * Spectra" instead of only "show me my team" — and holding it in the shell
 * keeps the selection when the reader switches tabs, which is exactly when they
 * are comparing the two views of one project.
 */
const TaskReport = () => {
    const [tab, setTab] = useState('calendar');
    const [projectId, setProjectId] = useState('All');
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        api.get('/tasks/assignable-projects')
            .then(res => setProjects(res.data || []))
            .catch(() => setProjects([]));
    }, []);

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faChartLine} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Task Report
                </h1>

                <div className="task-view-group">
                    <select
                        className={`task-filter-select ${projectId !== 'All' ? 'is-active' : ''}`}
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                    >
                        <option value="All">All Projects</option>
                        {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>

                    <div className="type-toggle view-toggle">
                        <button
                            type="button"
                            className={`type-toggle-btn ${tab === 'calendar' ? 'active' : ''}`}
                            onClick={() => setTab('calendar')}
                        >
                            <FontAwesomeIcon icon={faCalendarDays} /> Calendar
                        </button>
                        <button
                            type="button"
                            className={`type-toggle-btn ${tab === 'workload' ? 'active' : ''}`}
                            onClick={() => setTab('workload')}
                        >
                            <FontAwesomeIcon icon={faUsers} /> Workload
                        </button>
                    </div>
                </div>
            </div>

            {tab === 'calendar'
                ? <TaskReportCalendar projectId={projectId} />
                : <EmployeeTaskBoard projectId={projectId} />}
        </div>
    );
};

export default TaskReport;
