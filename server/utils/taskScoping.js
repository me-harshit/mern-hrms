const User = require('../models/User');
const Project = require('../models/Project');

/**
 * Shared authorisation + scoping rules for task assignment.
 *
 * Extracted out of routes/tasks.js so the recurring-schedule routes enforce the
 * *same* rules rather than a second copy that quietly drifts. Nothing here
 * changed in the move — see TaskPlan.md §4 and §11 for why the roles sit where
 * they do.
 */

const CAN_ASSIGN = ['MANAGER', 'TEAM LEAD', 'ADMIN', 'HR'];
// Sees and edits every task, not just their own.
const IS_PRIVILEGED = ['ADMIN', 'HR'];
// May hand work to anyone in the company. Team Leads are deliberately absent —
// they stay scoped to their own team members.
const CAN_ASSIGN_ANYONE = ['ADMIN', 'HR', 'MANAGER'];

// Which employees this user is allowed to see/assign. Managers run work across
// the whole company, so they get everyone; a Team Lead only gets the people who
// list them as their team lead. Returns null when the user record is gone.
const getScopedEmployeeFilter = async (reqUser) => {
    if (CAN_ASSIGN_ANYONE.includes(reqUser.role)) {
        return { status: 'ACTIVE' };
    }

    const me = await User.findById(reqUser.id).select('email');
    if (!me) return null;

    return { status: 'ACTIVE', teamLeadsEmail: me.email.toLowerCase() };
};

// Who this user is allowed to hand work to.
const getScopedEmployees = async (reqUser) => {
    const filter = await getScopedEmployeeFilter(reqUser);
    if (!filter) return [];

    return User.find(filter).select('name email role employeeId').sort({ name: 1 });
};

// Which projects this user may file tasks against. Any Active project is fair
// game for anyone who can assign — Team Leads don't own projects, so limiting
// this to projects you lead would lock the whole role out of the feature.
// The real guardrail is the team scoping above, which limits *who* you can
// hand work to.
const getScopedProjects = async () => {
    return Project.find({ status: 'Active' }).select('name status').sort({ name: 1 });
};

module.exports = {
    CAN_ASSIGN,
    IS_PRIVILEGED,
    CAN_ASSIGN_ANYONE,
    getScopedEmployeeFilter,
    getScopedEmployees,
    getScopedProjects
};
