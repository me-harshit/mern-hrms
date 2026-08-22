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

    return User.find(filter).select('name email role employeeId profilePic').sort({ name: 1 });
};

// Which projects this user may file tasks against. Any Active project is fair
// game for anyone who can assign — Team Leads don't own projects, so limiting
// this to projects you lead would lock the whole role out of the feature.
// The real guardrail is the team scoping above, which limits *who* you can
// hand work to.
const getScopedProjects = async () => {
    return Project.find({ status: 'Active' }).select('name status').sort({ name: 1 });
};

/**
 * Who may approve a self-assigned task for `employeeId` (TaskPlan.md §15).
 *
 * The employee's own chain of command, plus Admin/HR who can always step in.
 * `User.reportingManagerEmail[]` and `teamLeadsEmail[]` are the existing
 * mapping the rest of the app already scopes by, so this introduces no new
 * notion of "my manager".
 *
 * Deliberately not the person named in `assignedBy`: an employee can name any
 * colleague as having given them the work, and naming someone must not hand
 * them approval rights they don't otherwise have.
 */
const getApproversFor = async (employeeId) => {
    const employee = await User.findById(employeeId)
        .select('reportingManagerEmail teamLeadsEmail');
    if (!employee) return [];

    const chain = [
        ...(employee.reportingManagerEmail || []),
        ...(employee.teamLeadsEmail || [])
    ].filter(Boolean).map(e => e.toLowerCase());

    return User.find({
        status: 'ACTIVE',
        $or: [
            { email: { $in: chain } },
            { role: { $in: IS_PRIVILEGED } }
        ]
    }).select('_id name email role');
};

// Is this specific user allowed to decide on that employee's request?
const canApproveFor = async (employeeId, reqUser) => {
    if (IS_PRIVILEGED.includes(reqUser.role)) return true;

    const approvers = await getApproversFor(employeeId);
    return approvers.some(a => a._id.toString() === reqUser.id);
};

/**
 * What a user is allowed to *see* in the task lists.
 *
 * Distinct from getScopedEmployeeFilter, which answers "who may I assign to".
 * A Team Lead is responsible for their team's work whoever handed it out, so
 * they see anything assigned to one of their people — not merely what they
 * created themselves, which used to hide a task a Manager gave to their own
 * team member.
 *
 * Managers keep creator-based visibility deliberately: their assign scope is
 * the whole company, so scoping their *view* the same way would show them every
 * task in the business, which is not what this changes.
 *
 * @returns a Mongo filter fragment, or null for "no restriction".
 */
const getTaskVisibilityFilter = async (reqUser, { assigneeField = 'assignees' } = {}) => {
    if (IS_PRIVILEGED.includes(reqUser.role)) return null;

    if (reqUser.role === 'TEAM LEAD') {
        const me = await User.findById(reqUser.id).select('email');
        if (!me) return { assignedBy: reqUser.id };

        const team = await User.find({ teamLeadsEmail: me.email.toLowerCase() }).select('_id');
        return {
            $or: [
                { [assigneeField]: { $in: team.map(u => u._id) } },
                // Work they handed out themselves stays visible even if that
                // person has since moved off their team.
                { assignedBy: reqUser.id }
            ]
        };
    }

    return { assignedBy: reqUser.id };
};

module.exports = {
    CAN_ASSIGN,
    IS_PRIVILEGED,
    CAN_ASSIGN_ANYONE,
    getScopedEmployeeFilter,
    getScopedEmployees,
    getScopedProjects,
    getApproversFor,
    canApproveFor,
    getTaskVisibilityFilter
};
