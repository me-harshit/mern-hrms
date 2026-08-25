import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import VoiceCommandBar from '../../components/VoiceCommandBar';
import VoiceTaskDraftList from '../../components/VoiceTaskDraftList';
import '../../styles/App.css';
import '../../styles/tasks.css';
import '../../styles/recurring.css';
import '../../styles/voiceTask.css';

/**
 * Dedicated page for voice-driven task creation (BulkVoiceTask.md).
 *
 * Kept separate from AddTask.js rather than folded into it: a voice command
 * can produce several unrelated tasks at once ("assign Rahul the report,
 * and separately have Priya update the site"), which needs a review screen
 * built around a *list* of drafts, not a single-task form. Once drafts
 * exist, each is its own card in VoiceTaskDraftList with its own Edit and
 * Create — a manager can fix one and create it immediately without waiting
 * on the rest.
 */
const VoiceAssignTask = () => {
    const navigate = useNavigate();

    const [projectsList, setProjectsList] = useState([]);
    const [employeesList, setEmployeesList] = useState([]);
    const [drafts, setDrafts] = useState(null);

    useEffect(() => {
        const fetchDropdowns = async () => {
            try {
                const [projRes, empRes] = await Promise.all([
                    api.get('/tasks/assignable-projects'),
                    api.get('/tasks/assignable-employees')
                ]);
                setProjectsList(projRes.data || []);
                setEmployeesList(empRes.data || []);
            } catch (err) {
                console.error('Could not fetch task dropdowns', err);
                Swal.fire('Error', 'Could not load projects or your team list.', 'error');
            }
        };
        fetchDropdowns();
    }, []);

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <button className="gts-btn secondary" onClick={() => navigate('/tasks')}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faWandMagicSparkles} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Voice Assign Tasks
                </h1>
            </div>

            {!drafts && (
                <VoiceCommandBar
                    onParsed={(parsed) => setDrafts(parsed)}
                    onClose={() => navigate('/add-task')}
                />
            )}

            {drafts && (
                <VoiceTaskDraftList
                    drafts={drafts}
                    employeesList={employeesList}
                    projectsList={projectsList}
                    onAllDone={() => navigate('/tasks')}
                    onDiscard={() => setDrafts(null)}
                />
            )}
        </div>
    );
};

export default VoiceAssignTask;
