/**
 * Small formatters shared by every project workspace tab.
 *
 * Kept in one module rather than duplicated per tab because the two detail
 * pages (Admin/ProjectWorkspace and User/MyProjectDetail) both mount the same
 * tabs — a date that reads differently between them would look like two
 * different products.
 */

/** dd/mm/yyyy, the format the rest of the app uses. */
export const fmtDate = (value) => (
    value ? new Date(value).toLocaleDateString('en-GB') : '—'
);

/** "3h ago" — for feeds and last-activity lines, where exactness is noise. */
export const timeAgo = (value) => {
    if (!value) return '';

    const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return 'just now';

    const steps = [
        [60, 'm'],
        [3600, 'h'],
        [86400, 'd']
    ];

    if (seconds < 3600) return `${Math.floor(seconds / steps[0][0])}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / steps[1][0])}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / steps[2][0])}d ago`;

    return new Date(value).toLocaleDateString('en-GB');
};

/** Status/priority text to the pill class in styles/project.css. */
export const pillClass = (value = '') =>
    String(value).toLowerCase().replace(/\s+/g, '-');

/**
 * Is this task past its deadline and still open?
 *
 * Reads `overdueAt`, the field the server computes and every other task view
 * already sorts on — recomputing it from dueDate + dueTime here would give the
 * workspace a second, subtly different definition of "late".
 */
export const isOverdue = (task) => Boolean(
    task?.overdueAt &&
    task.status !== 'Completed' &&
    new Date(task.overdueAt) < new Date()
);
