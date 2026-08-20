import { SERVER_URL } from './api';

export const STATUS_OPTIONS = ['Pending', 'In Progress', 'On Hold', 'Completed'];
export const TASK_TYPES = ['Project Task', 'Regular Office Task'];

// Office tasks have no project, so show what they are instead of a blank.
export const taskContextLabel = (task) =>
    task?.taskType === 'Regular Office Task'
        ? 'Regular Office'
        : (task?.projectId?.name || 'No project');

// "In Progress" -> "inprogress", used for status/priority CSS modifiers.
export const slug = (str) => (str || '').toLowerCase().replace(/[^a-z]/g, '');

export const initials = (name) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

// Videos live on the VPS until the nightly job moves them to S3, so their urls
// are server-relative until then. S3 urls are absolute and pass straight through.
export const resolveMediaUrl = (url) => (url || '').startsWith('/uploads')
    ? `${SERVER_URL}${url}`
    : url;

export const timeAgo = (date) => {
    const secs = Math.floor((Date.now() - new Date(date)) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
};

// "12 Aug 2026" — unambiguous at a glance, unlike 08/12/2026, which reads as a
// different day depending on who is looking at it.
export const shortDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// "3 days left" reads better than a bare date when triaging your own work.
export const dueLabel = (dueDate, isDone) => {
    const due = new Date(dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / 86400000);

    if (isDone) return { text: due.toLocaleDateString(), tone: 'done' };
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'overdue' };
    if (days === 0) return { text: 'Due today', tone: 'today' };
    if (days === 1) return { text: 'Due tomorrow', tone: 'soon' };
    if (days <= 3) return { text: `${days}d left`, tone: 'soon' };
    return { text: due.toLocaleDateString(), tone: 'normal' };
};
