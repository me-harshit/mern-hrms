const User = require('../models/User');
const Project = require('../models/Project');

/**
 * One search box, everything visible in the row.
 *
 * The task lists show a title, a project (or "Regular Office"), the people on
 * it and who assigned it — so typing any of those should find the row. Matching
 * only title and description meant searching a colleague's name returned
 * nothing, which reads as the search being broken rather than narrow.
 */

/**
 * Escape user input before it becomes a RegExp.
 *
 * Without this, a search for "C++", "(draft)" or "50%" is a syntax error that
 * throws inside the route and surfaces as a 500 — the user types a perfectly
 * ordinary string and the page breaks. Every task list shared that bug.
 */
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The visible labels in the Type/Project column, searched like any other text.
const TASK_TYPES = ['Project Task', 'Regular Office Task'];

/**
 * How many matching people/projects to fold into the query.
 *
 * A two-letter search can match most of the company, and an unbounded $in of
 * every user id is a query nobody wants. 200 is far beyond what a useful search
 * returns — past that the term is too vague to be worth widening further.
 */
const REF_MATCH_LIMIT = 200;

/**
 * Build the `$or` fragment for a task search, or null when there is no term.
 *
 * Resolves people and projects to ids first, because they live in other
 * collections and Mongo cannot match across them in one query without an
 * aggregation the rest of these routes are not written as.
 *
 * @returns {Promise<object|null>} a filter fragment to push onto $and
 */
const buildTaskSearchFilter = async (search) => {
    const term = String(search || '').trim();
    if (!term) return null;

    const rx = new RegExp(escapeRegex(term), 'i');

    // Both lookups are independent, so pay for one round trip rather than two.
    const [users, projects] = await Promise.all([
        User.find({
            $or: [{ name: rx }, { email: rx }, { employeeId: rx }]
        }).select('_id').limit(REF_MATCH_LIMIT),
        Project.find({ name: rx }).select('_id').limit(REF_MATCH_LIMIT)
    ]);

    const or = [{ title: rx }, { description: rx }];

    if (users.length > 0) {
        const ids = users.map(u => u._id);
        // Both directions: the people doing the work, and whoever handed it out.
        or.push({ assignees: { $in: ids } });
        or.push({ assignedBy: { $in: ids } });
    }

    if (projects.length > 0) {
        or.push({ projectId: { $in: projects.map(p => p._id) } });
    }

    // So "office" finds Regular Office tasks, matching what the row displays.
    const types = TASK_TYPES.filter(t => rx.test(t));
    if (types.length > 0) {
        or.push({ taskType: { $in: types } });
    }

    return { $or: or };
};

module.exports = { buildTaskSearchFilter, escapeRegex };
