import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartPie, faListUl, faChartLine, faHourglassHalf, faRupeeSign, faFilter } from '@fortawesome/free-solid-svg-icons';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import '../../styles/App.css';
import '../../styles/expenses.css';

const AdminExpenses = () => {
    const navigate = useNavigate();

    const [chartData, setChartData] = useState({
        stats: { totalVal: 0, pendingCount: 0, approvedVal: 0 },
        types: [], categories: [], projects: [], vendors: []
    });
    
    const [projectsList, setProjectsList] = useState([]);
    const [loading, setLoading] = useState(true);

    // Global Dashboard Filters
    const [dashboardFilter, setDashboardFilter] = useState('All'); // 'All', 'Project Expense', 'Regular Office Expense'
    const [dashboardProject, setDashboardProject] = useState('');

    const COLORS = ['#215D7B', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#0ea5e9', '#ec4899'];

    // 1. Fetch Dropdown Data (Once on load)
    useEffect(() => {
        const fetchDropdowns = async () => {
            try {
                const projRes = await api.get('/projects');
                setProjectsList(projRes.data);
            } catch (e) {
                console.log("Projects API not ready yet. Skipping.");
            }
        };
        fetchDropdowns();
    }, []);

    // 2. Fetch Chart Data (Whenever filters change)
    useEffect(() => {
        const fetchAnalytics = async () => {
            setLoading(true);
            try {
                // 👇 HIGH PERFORMANCE FIX: Ask backend to do the math and return a tiny JSON object
                const params = {};
                if (dashboardFilter !== 'All') params.expenseType = dashboardFilter;
                if (dashboardFilter === 'Project Expense' && dashboardProject) params.projectName = dashboardProject;

                const res = await api.get('/expenses/admin-charts', { params });
                setChartData(res.data);
            } catch (err) {
                Swal.fire('Error', 'Failed to load company analytics', 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, [dashboardFilter, dashboardProject]);

    // Interactive Click Handler - navigates to AllExpenses with query params
    const handleChartClick = (filterKey, value) => {
        navigate(`/all-expenses?${filterKey}=${encodeURIComponent(value)}`);
    };

    if (loading && chartData.stats.totalVal === 0) return <div className="main-content">Loading Analytics Dashboard...</div>;

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row mb-20" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faChartPie} className="btn-icon" /> Financial Analytics
                </h1>

                <button
                    className="gts-btn primary"
                    onClick={() => navigate('/all-expenses')}
                >
                    <FontAwesomeIcon icon={faListUl} style={{ marginRight: '6px' }} /> View All Records
                </button>
            </div>

            {/* Global Dashboard Filter Bar */}
            <div className="dashboard-filter-bar fade-in">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600', color: '#475569', fontSize: '14px' }}>
                    <FontAwesomeIcon icon={faFilter} style={{ color: '#94a3b8' }} /> Scope:
                </div>

                <div className="expense-type-toggle" style={{ margin: 0, width: 'auto', minWidth: '280px' }}>
                    <label className={dashboardFilter === 'All' ? 'active' : ''} style={{ padding: '6px 12px' }}>
                        <input type="radio" checked={dashboardFilter === 'All'} onChange={() => { setDashboardFilter('All'); setDashboardProject(''); }} /> All
                    </label>
                    <label className={dashboardFilter === 'Project Expense' ? 'active' : ''} style={{ padding: '6px 12px' }}>
                        <input type="radio" checked={dashboardFilter === 'Project Expense'} onChange={() => setDashboardFilter('Project Expense')} /> Project
                    </label>
                    <label className={dashboardFilter === 'Regular Office Expense' ? 'active' : ''} style={{ padding: '6px 12px' }}>
                        <input type="radio" checked={dashboardFilter === 'Regular Office Expense'} onChange={() => { setDashboardFilter('Regular Office Expense'); setDashboardProject(''); }} /> Office
                    </label>
                </div>

                {dashboardFilter === 'Project Expense' && (
                    <div style={{ minWidth: '200px' }}>
                        <select className="swal2-select custom-select m-0" value={dashboardProject} onChange={(e) => setDashboardProject(e.target.value)}>
                            <option value="">-- All Projects --</option>
                            {projectsList.map(p => <option key={p._id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* Top KPIs */}
            <div className="stats-grid" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                <div className="stat-card theme-blue">
                    <div className="stat-icon"><FontAwesomeIcon icon={faChartLine} /></div>
                    <div className="stat-info">
                        <p>Total Processed Value</p>
                        <h3>₹ {chartData.stats.totalVal.toLocaleString('en-IN')}</h3>
                    </div>
                </div>
                <div className="stat-card theme-yellow">
                    <div className="stat-icon"><FontAwesomeIcon icon={faHourglassHalf} /></div>
                    <div className="stat-info">
                        <p>Pending Approvals</p>
                        <h3>{chartData.stats.pendingCount} Requests</h3>
                    </div>
                </div>
                <div className="stat-card theme-green">
                    <div className="stat-icon"><FontAwesomeIcon icon={faRupeeSign} /></div>
                    <div className="stat-info">
                        <p>Total Approved</p>
                        <h3>₹ {chartData.stats.approvedVal.toLocaleString('en-IN')}</h3>
                    </div>
                </div>
            </div>

            {/* Interactive Charts */}
            <div className="dashboard-charts-grid fade-in" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>

                {/* 1. Category Breakdown */}
                <div className="chart-card">
                    <div className="chart-header">Top Spending Categories <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>Click to filter</span></div>
                    <div className="chart-container">
                        {chartData.categories.length === 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px' }}>No data available</div>
                        ) : (
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={chartData.categories} cx="40%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onClick={(data) => handleChartClick('category', data.name)} style={{ cursor: 'pointer', outline: 'none' }}>
                                        {chartData.categories.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <RechartsTooltip formatter={(value) => `₹ ${value.toLocaleString('en-IN')}`} />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', right: 0, width: '45%' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 2. Office vs Project Split */}
                <div className="chart-card">
                    <div className="chart-header">Expense Source Distribution <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>Click to filter</span></div>
                    <div className="chart-container">
                        {chartData.types.length === 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px' }}>No data available</div>
                        ) : (
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={chartData.types} cx="40%" cy="50%" innerRadius={0} outerRadius={80} dataKey="value" onClick={(data) => handleChartClick('expenseType', data.name)} style={{ cursor: 'pointer', outline: 'none' }}>
                                        {chartData.types.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />)}
                                    </Pie>
                                    <RechartsTooltip formatter={(value) => `₹ ${value.toLocaleString('en-IN')}`} />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', right: 0, width: '45%' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 3. Top Projects Bar Chart */}
                <div className="chart-card grid-span-2" style={{ gridColumn: '1 / -1' }}>
                    <div className="chart-header">Highest Cost Projects <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>Click bar to filter</span></div>
                    <div className="chart-container">
                        {chartData.projects.length === 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px' }}>No data available</div>
                        ) : (
                            <ResponsiveContainer>
                                <BarChart data={chartData.projects} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `₹${value / 1000}k`} />
                                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => `₹ ${value.toLocaleString('en-IN')}`} />
                                    <Bar
                                        dataKey="value"
                                        fill="#215D7B"
                                        radius={[4, 4, 0, 0]}
                                        onClick={(data) => handleChartClick('projectName', data.name)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 4. Top Vendors Bar Chart */}
                <div className="chart-card grid-span-2" style={{ gridColumn: '1 / -1' }}>
                    <div className="chart-header">Top Vendor Payouts <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>Click bar to filter</span></div>
                    <div className="chart-container">
                        {chartData.vendors.length === 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px' }}>No data available</div>
                        ) : (
                            <ResponsiveContainer>
                                <BarChart data={chartData.vendors} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `₹${value / 1000}k`} />
                                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => `₹ ${value.toLocaleString('en-IN')}`} />
                                    <Bar
                                        dataKey="value"
                                        fill="#16a34a"
                                        radius={[4, 4, 0, 0]}
                                        onClick={(data) => handleChartClick('vendorName', data.name)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default AdminExpenses;