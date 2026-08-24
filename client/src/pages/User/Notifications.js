import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBell, faCheckDouble, faEnvelopeOpenText, faCircle, faSearch, faTimes,
    faCalendarDay, faPlaneDeparture, faMoneyBill, faCakeCandles, faGear,
    faLaptopHouse, faClock, faClipboardList
} from '@fortawesome/free-solid-svg-icons';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import Pagination from '../../components/Pagination';
import DatePickerField from '../../components/DatePickerField';
import { prettyDate, todayYmd, addDays } from '../../utils/scheduleDates';
import '../../styles/App.css';
import '../../styles/notifications.css';

// The type enum on the Notification model, with the icon and colour each one
// reads as elsewhere in the app.
const CATEGORIES = [
    { value: 'TASK', label: 'Tasks', icon: faClipboardList },
    { value: 'LEAVE', label: 'Leave', icon: faPlaneDeparture },
    { value: 'SHORT_LEAVE', label: 'Short Leave', icon: faClock },
    { value: 'WFH', label: 'Work From Home', icon: faLaptopHouse },
    { value: 'SALARY', label: 'Salary', icon: faMoneyBill },
    { value: 'BIRTHDAY', label: 'Birthdays', icon: faCakeCandles },
    { value: 'SYSTEM', label: 'System', icon: faGear }
];

// Ranges people actually ask for. "Custom" hands over to the calendar.
const DATE_PRESETS = [
    { value: 'all', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom range' }
];

const DEFAULTS = { type: 'All', isRead: 'All', datePreset: 'all' };

const Notifications = () => {
    const navigate = useNavigate();

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [countsByType, setCountsByType] = useState({});

    const [filters, setFilters] = useState(DEFAULTS);
    const [customDates, setCustomDates] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 450);
        return () => clearTimeout(t);
    }, [searchTerm]);

    useEffect(() => setCurrentPage(1), [debouncedSearch, filters, customDates]);

    // The preset and the custom range both resolve to the same from/to the API
    // takes, so the server never has to know about presets.
    const dateRange = useMemo(() => {
        const today = todayYmd();
        switch (filters.datePreset) {
            case 'today': return { from: today, to: today };
            case '7': return { from: addDays(today, -6), to: today };
            case '30': return { from: addDays(today, -29), to: today };
            case 'custom':
                if (customDates.length === 0) return {};
                return { from: customDates[0], to: customDates[customDates.length - 1] };
            default: return {};
        }
    }, [filters.datePreset, customDates]);

    const queryParams = useMemo(() => ({
        page: currentPage,
        limit: itemsPerPage,
        ...(filters.type !== 'All' ? { type: filters.type } : {}),
        ...(filters.isRead !== 'All' ? { isRead: filters.isRead } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...dateRange
    }), [currentPage, itemsPerPage, filters, debouncedSearch, dateRange]);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/notifications', { params: queryParams });
            setNotifications(res.data.data || []);
            setUnreadCount(res.data.unreadCount || 0);
            setCountsByType(res.data.countsByType || {});
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
        } catch (error) {
            console.error('Failed to fetch notifications', error);
            Swal.fire('Error', 'Could not load notifications', 'error');
        } finally {
            setLoading(false);
        }
    }, [queryParams]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const activeFilterCount =
        Object.keys(DEFAULTS).filter(k => filters[k] !== DEFAULTS[k]).length +
        (searchTerm ? 1 : 0);

    const clearFilters = () => {
        setFilters(DEFAULTS);
        setCustomDates([]);
        setSearchTerm('');
    };

    /**
     * Marks whatever is currently filtered, not blindly everything — clearing
     * task notices you have not read while looking at Leave would be a nasty
     * surprise. With no filters on, it behaves as it always did.
     */
    const markAllRead = async () => {
        try {
            const res = await api.put('/notifications/mark-all-read', {
                ...(filters.type !== 'All' ? { type: filters.type } : {}),
                ...(debouncedSearch ? { search: debouncedSearch } : {}),
                ...dateRange
            });
            Swal.fire({
                title: res.data.modified > 0
                    ? `Marked ${res.data.modified} as read`
                    : 'Nothing left to mark',
                icon: 'success', toast: true, position: 'top-end',
                timer: 2000, showConfirmButton: false
            });
            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark read', error);
        }
    };

    const handleNotificationClick = async (notif) => {
        try {
            if (!notif.isRead) {
                await api.put(`/notifications/read/${notif._id}`);
                setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, isRead: true } : n));
                setUnreadCount(c => Math.max(0, c - 1));
            }

            // An explicit link always wins, since it can point at a specific
            // record rather than just the section.
            let route = '/dashboard';
            if (notif.link) route = notif.link;
            else if (notif.type === 'SALARY') route = '/payroll';
            else if (notif.type === 'WFH') route = '/wfh';
            else if (notif.type === 'LEAVE') route = '/leaves';
            else if (notif.type === 'SHORT_LEAVE') route = '/attendance';
            else if (notif.type === 'TASK') route = '/my-tasks';

            navigate(route);
        } catch (error) {
            console.error('Failed to handle notification click', error);
        }
    };

    const categoryOf = (type) => CATEGORIES.find(c => c.value === type) || CATEGORIES[CATEGORIES.length - 1];

    const customLabel = () => {
        if (customDates.length === 0) return 'Pick a date range';
        if (customDates.length === 1) return prettyDate(customDates[0]);
        return `${prettyDate(customDates[0])} → ${prettyDate(customDates[customDates.length - 1])}`;
    };

    return (
        <div className="attendance-container fade-in">
            <div className="nf-header">
                <div>
                    <h1 className="page-title header-no-margin">
                        <FontAwesomeIcon icon={faBell} style={{ marginRight: '10px', color: '#215D7B' }} />
                        Notifications
                    </h1>
                    <p className="nf-subtitle">
                        {unreadCount > 0
                            ? `${unreadCount} unread`
                            : "You're all caught up."}
                    </p>
                </div>

                <button
                    className="gts-btn primary"
                    onClick={markAllRead}
                    disabled={unreadCount === 0}
                    title={activeFilterCount > 0 ? 'Marks only what matches your filters' : 'Marks everything as read'}
                >
                    <FontAwesomeIcon icon={faCheckDouble} style={{ marginRight: '6px' }} />
                    {activeFilterCount > 0 ? 'Mark These Read' : 'Mark All Read'}
                </button>
            </div>

            {/* ---------- filters ---------- */}
            <div className="nf-toolbar">
                <div className="nf-search">
                    <FontAwesomeIcon icon={faSearch} />
                    <input
                        type="text"
                        placeholder="Search notifications..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <select
                    className={`nf-select ${filters.type !== 'All' ? 'is-active' : ''}`}
                    value={filters.type}
                    onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                >
                    <option value="All">All categories</option>
                    {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>
                            {c.label}{countsByType[c.value] ? ` (${countsByType[c.value]})` : ''}
                        </option>
                    ))}
                </select>

                <select
                    className={`nf-select ${filters.isRead !== 'All' ? 'is-active' : ''}`}
                    value={filters.isRead}
                    onChange={(e) => setFilters(f => ({ ...f, isRead: e.target.value }))}
                >
                    <option value="All">Read &amp; unread</option>
                    <option value="false">Unread only</option>
                    <option value="true">Read only</option>
                </select>

                <select
                    className={`nf-select ${filters.datePreset !== 'all' ? 'is-active' : ''}`}
                    value={filters.datePreset}
                    onChange={(e) => {
                        setFilters(f => ({ ...f, datePreset: e.target.value }));
                        if (e.target.value !== 'custom') setCustomDates([]);
                    }}
                >
                    {DATE_PRESETS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>

                {filters.datePreset === 'custom' && (
                    <div className="nf-daterange">
                        <DatePickerField
                            displayValue={customLabel()}
                            isEmpty={customDates.length === 0}
                            mode="range"
                            selected={customDates}
                            onChange={setCustomDates}
                            // Notifications are history, so the picker has to
                            // reach backwards; the default floor is today.
                            minDate="2000-01-01"
                        />
                    </div>
                )}

                {activeFilterCount > 0 && (
                    <button className="nf-clear" onClick={clearFilters}>
                        <FontAwesomeIcon icon={faTimes} /> Clear ({activeFilterCount})
                    </button>
                )}
            </div>

            {!loading && totalRecords > 0 && (
                <p className="nf-result-count">
                    Showing {notifications.length} of {totalRecords}
                    {activeFilterCount > 0 ? ' matching' : ''} notification{totalRecords === 1 ? '' : 's'}
                </p>
            )}

            {loading ? (
                <div className="control-card text-center" style={{ padding: '50px 20px', color: '#64748b' }}>
                    Loading notifications...
                </div>
            ) : notifications.length === 0 ? (
                <div className="control-card text-center" style={{ padding: '60px 20px' }}>
                    <FontAwesomeIcon icon={faEnvelopeOpenText} style={{ fontSize: '3.5rem', color: '#cbd5e1', marginBottom: '15px' }} />
                    <h3 style={{ color: '#475569' }}>
                        {activeFilterCount > 0 ? 'Nothing matches those filters' : 'No notifications'}
                    </h3>
                    <p className="text-muted">
                        {activeFilterCount > 0 ? 'Try widening the date range or clearing filters.' : "You're all caught up!"}
                    </p>
                    {activeFilterCount > 0 && (
                        <button className="gts-btn secondary" style={{ marginTop: '12px' }} onClick={clearFilters}>
                            <FontAwesomeIcon icon={faTimes} /> Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="nf-list">
                    {notifications.map(notif => {
                        const cat = categoryOf(notif.type);
                        return (
                            <div
                                key={notif._id}
                                className={`nf-item ${notif.isRead ? '' : 'unread'}`}
                                onClick={() => handleNotificationClick(notif)}
                            >
                                <span className={`nf-icon ${(notif.type || 'SYSTEM').toLowerCase()}`}>
                                    <FontAwesomeIcon icon={cat.icon} />
                                </span>

                                <div className="nf-body">
                                    <div className="nf-line">
                                        <h4 className="nf-title">{notif.title}</h4>
                                        <span className="nf-time">
                                            <FontAwesomeIcon icon={faCalendarDay} />
                                            {new Date(notif.createdAt).toLocaleDateString('en-GB', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            })}
                                            {' · '}
                                            {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="nf-message">{notif.message}</p>
                                    <span className="nf-cat">{cat.label}</span>
                                </div>

                                {!notif.isRead && <FontAwesomeIcon icon={faCircle} className="nf-dot" />}
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && totalRecords > 0 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={totalRecords}
                    limit={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onLimitChange={(v) => { setItemsPerPage(v); setCurrentPage(1); }}
                />
            )}
        </div>
    );
};

export default Notifications;
