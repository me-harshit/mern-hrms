import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faCalendarDays, faUsers } from '@fortawesome/free-solid-svg-icons';
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
 */
const TaskReport = () => {
    const [tab, setTab] = useState('calendar');

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faChartLine} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Task Report
                </h1>

                <div className="task-view-group">
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

            {tab === 'calendar' ? <TaskReportCalendar /> : <EmployeeTaskBoard />}
        </div>
    );
};

export default TaskReport;
