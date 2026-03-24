import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faPlus, faEdit, faSearch, faCalendarAlt, faUserTie } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const Projects = () => {
    const [projects, setProjects] = useState([]);
    const [filteredProjects, setFilteredProjects] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // Fetch users for the Project Lead dropdown
            const userRes = await api.get('/employees');
            setUsersList(userRes.data);

            const projRes = await api.get('/projects/all');
            setProjects(projRes.data);
            setFilteredProjects(projRes.data);
        } catch (err) {
            Swal.fire('Error', 'Failed to load projects', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            setFilteredProjects(projects.filter(p => 
                p.name.toLowerCase().includes(term) || 
                (p.description && p.description.toLowerCase().includes(term)) ||
                (p.projectLead?.name && p.projectLead.name.toLowerCase().includes(term))
            ));
        } else {
            setFilteredProjects(projects);
        }
    }, [searchTerm, projects]);

    // Helper to generate the Lead options dropdown
    const generateUserOptions = (selectedId) => {
        return usersList.map(u => 
            `<option value="${u._id}" ${selectedId === u._id ? 'selected' : ''}>${u.name}</option>`
        ).join('');
    };

    const handleAddProject = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Create New Project',
            width: '700px',
            html: `
                <div style="text-align: left; padding: 0 10px;">
                    <div style="display:flex; gap:15px;">
                        <div style="flex:1;">
                            <label class="swal-custom-label">Project Name *</label>
                            <input id="proj-name" class="swal2-input" placeholder="e.g. Q4 Expansion" required>
                        </div>
                        <div style="flex:1;">
                            <label class="swal-custom-label">Project Lead</label>
                            <select id="proj-lead" class="swal2-select">
                                <option value="">-- Select Lead --</option>
                                ${generateUserOptions()}
                            </select>
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:15px; margin-top: 10px;">
                        <div style="flex:1;">
                            <label class="swal-custom-label">Start Date</label>
                            <input id="proj-start" type="date" class="swal2-input">
                        </div>
                        <div style="flex:1;">
                            <label class="swal-custom-label">Target End Date</label>
                            <input id="proj-end" type="date" class="swal2-input">
                        </div>
                    </div>

                    <div style="display:flex; gap:15px; margin-top: 10px;">
                        <div style="flex:1;">
                            <label class="swal-custom-label">Total Budget (₹)</label>
                            <input id="proj-budget" type="number" class="swal2-input" placeholder="0">
                        </div>
                        <div style="flex:1;">
                            <label class="swal-custom-label">Status</label>
                            <select id="proj-status" class="swal2-select">
                                <option value="Active">Active</option>
                                <option value="On Hold">On Hold</option>
                                <option value="Completed">Completed</option>
                            </select>
                        </div>
                    </div>

                    <label class="swal-custom-label" style="margin-top: 15px;">Project Description</label>
                    <textarea id="proj-desc" class="swal2-input" style="height: 60px; padding: 10px; width: 100%; box-sizing: border-box;" placeholder="Brief details..."></textarea>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Create Project',
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                const name = document.getElementById('proj-name').value;
                if (!name) { Swal.showValidationMessage('Project Name is required'); return false; }
                return {
                    name,
                    projectLead: document.getElementById('proj-lead').value,
                    startDate: document.getElementById('proj-start').value,
                    endDate: document.getElementById('proj-end').value,
                    totalBudget: document.getElementById('proj-budget').value,
                    status: document.getElementById('proj-status').value,
                    description: document.getElementById('proj-desc').value,
                }
            }
        });

        if (formValues) {
            try {
                await api.post('/projects', formValues);
                Swal.fire('Success', 'Project created!', 'success');
                fetchInitialData();
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Failed to create project', 'error');
            }
        }
    };

    const handleEditProject = async (project) => {
        const startVal = project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '';
        const endVal = project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : '';
        const leadVal = project.projectLead?._id || '';

        const { value: formValues } = await Swal.fire({
            title: 'Edit Project',
            width: '700px',
            html: `
                <div style="text-align: left; padding: 0 10px;">
                    <div style="display:flex; gap:15px;">
                        <div style="flex:1;">
                            <label class="swal-custom-label">Project Name *</label>
                            <input id="edit-name" class="swal2-input" value="${project.name}" required>
                        </div>
                        <div style="flex:1;">
                            <label class="swal-custom-label">Project Lead</label>
                            <select id="edit-lead" class="swal2-select">
                                <option value="">-- Select Lead --</option>
                                ${generateUserOptions(leadVal)}
                            </select>
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:15px; margin-top: 10px;">
                        <div style="flex:1;">
                            <label class="swal-custom-label">Start Date</label>
                            <input id="edit-start" type="date" class="swal2-input" value="${startVal}">
                        </div>
                        <div style="flex:1;">
                            <label class="swal-custom-label">Target End Date</label>
                            <input id="edit-end" type="date" class="swal2-input" value="${endVal}">
                        </div>
                    </div>

                    <div style="display:flex; gap:15px; margin-top: 10px;">
                        <div style="flex:1;">
                            <label class="swal-custom-label">Total Budget (₹)</label>
                            <input id="edit-budget" type="number" class="swal2-input" value="${project.totalBudget || 0}">
                        </div>
                        <div style="flex:1;">
                            <label class="swal-custom-label">Status</label>
                            <select id="edit-status" class="swal2-select">
                                <option value="Active" ${project.status === 'Active' ? 'selected' : ''}>Active</option>
                                <option value="On Hold" ${project.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
                                <option value="Completed" ${project.status === 'Completed' ? 'selected' : ''}>Completed</option>
                            </select>
                        </div>
                    </div>

                    <label class="swal-custom-label" style="margin-top: 15px;">Project Description</label>
                    <textarea id="edit-desc" class="swal2-input" style="height: 60px; padding: 10px; width: 100%; box-sizing: border-box;">${project.description || ''}</textarea>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Save Changes',
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                const name = document.getElementById('edit-name').value;
                if (!name) { Swal.showValidationMessage('Project Name is required'); return false; }
                return {
                    name,
                    projectLead: document.getElementById('edit-lead').value,
                    startDate: document.getElementById('edit-start').value,
                    endDate: document.getElementById('edit-end').value,
                    totalBudget: document.getElementById('edit-budget').value,
                    status: document.getElementById('edit-status').value,
                    description: document.getElementById('edit-desc').value,
                }
            }
        });

        if (formValues) {
            try {
                await api.put(`/projects/${project._id}`, formValues);
                Swal.fire('Success', 'Project updated!', 'success');
                fetchInitialData(); // Refresh to pull updated aggregated stats
            } catch (err) {
                Swal.fire('Error', 'Failed to update project', 'error');
            }
        }
    };

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faFolderOpen} className="btn-icon" /> Project Registry
                </h1>
                <button className="action-btn-primary btn-small" onClick={handleAddProject}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Add Project
                </button>
            </div>

            <div className="filter-bar-card fade-in">
                <div className="search-wrapper" style={{ maxWidth: '400px' }}>
                    <FontAwesomeIcon icon={faSearch} className="search-icon" />
                    <input 
                        type="text" 
                        placeholder="Search projects or leads..." 
                        className="swal2-input search-input" 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                </div>
            </div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Project Details</th>
                            <th>Lead & Dates</th>
                            <th>Budget vs Spent</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" className="empty-table-message">Loading projects...</td></tr>
                        ) : filteredProjects.length === 0 ? (
                            <tr><td colSpan="5" className="empty-table-message">No projects found.</td></tr>
                        ) : (
                            filteredProjects.map(proj => {
                                // Calculate burn rate percentage
                                const budget = proj.totalBudget || 0;
                                const spent = proj.totalSpent || 0;
                                const burnRate = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                                const isOverBudget = spent > budget && budget > 0;

                                return (
                                <tr key={proj._id}>
                                    <td data-label="Project Details">
                                        <div className="fw-bold text-primary" style={{ fontSize: '15px' }}>{proj.name}</div>
                                        <div className="text-small text-muted" style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {proj.description || 'No description provided.'}
                                        </div>
                                    </td>
                                    
                                    <td data-label="Lead & Dates">
                                        <div className="fw-600 text-dark-blue">
                                            <FontAwesomeIcon icon={faUserTie} style={{ color: '#94a3b8', marginRight: '5px' }} />
                                            {proj.projectLead?.name || 'Unassigned'}
                                        </div>
                                        <div className="text-small text-muted" style={{ marginTop: '4px' }}>
                                            <FontAwesomeIcon icon={faCalendarAlt} style={{ marginRight: '5px' }} />
                                            {proj.startDate ? new Date(proj.startDate).toLocaleDateString() : 'TBD'} 
                                            &nbsp;→&nbsp; 
                                            {proj.endDate ? new Date(proj.endDate).toLocaleDateString() : 'TBD'}
                                        </div>
                                    </td>
                                    
                                    <td data-label="Budget vs Spent">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                                            <span style={{ color: '#64748b' }}>Spent: <strong>₹ {spent.toLocaleString('en-IN')}</strong></span>
                                            <span style={{ color: '#215D7B' }}>Budget: ₹ {budget.toLocaleString('en-IN')}</span>
                                        </div>
                                        {/* Progress Bar UI */}
                                        <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${burnRate}%`, height: '100%', background: isOverBudget ? '#dc2626' : (burnRate > 80 ? '#f59e0b' : '#16a34a') }}></div>
                                        </div>
                                        {isOverBudget && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', fontWeight: 'bold' }}>OVER BUDGET!</div>}
                                    </td>

                                    <td data-label="Status">
                                        <span className={`status-badge ${proj.status === 'Active' ? 'success' : proj.status === 'Completed' ? 'primary' : 'warning'}`}>
                                            {proj.status}
                                        </span>
                                    </td>
                                    
                                    <td data-label="Action">
                                        <button className="gts-btn primary btn-small" onClick={() => handleEditProject(proj)}>
                                            <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Edit
                                        </button>
                                    </td>
                                </tr>
                            )})
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Projects;