// Central place for "who is allowed to see money" rules.
//
// Salary is visible ONLY to ADMIN and HR. Every other role — including
// MANAGER, TEAM LEAD and ACCOUNTS — may see their own salary (via
// /api/auth/me and their own payslips) but never anybody else's.

const SALARY_ROLES = ['ADMIN', 'HR'];

// Can this requester see/edit salary figures for other people?
const canAccessSalary = (user) => SALARY_ROLES.includes(user?.role);

// Strip the salary field from a user doc (or array of docs) unless the
// requester is allowed to see it, or it is the requester's own record.
// Accepts mongoose docs or plain objects; always returns plain objects.
const sanitizeSalary = (docs, requester) => {
    const allowed = canAccessSalary(requester);
    const scrub = (doc) => {
        if (!doc) return doc;
        const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
        delete obj.password;
        if (!allowed && String(obj._id) !== String(requester?.id)) {
            delete obj.salary;
        }
        return obj;
    };
    return Array.isArray(docs) ? docs.map(scrub) : scrub(docs);
};

// Fields that grant privilege or control access to an account. Letting a
// MANAGER/TEAM LEAD write these would let them promote themselves to ADMIN,
// take over another account, or disable one — so they are ADMIN/HR only.
// (Salary is handled separately by canAccessSalary.)
const PRIVILEGED_FIELDS = ['role', 'password', 'status', 'isPurchaser'];

const canEditPrivilegedFields = (user) => SALARY_ROLES.includes(user?.role);

module.exports = {
    SALARY_ROLES,
    PRIVILEGED_FIELDS,
    canAccessSalary,
    canEditPrivilegedFields,
    sanitizeSalary
};
