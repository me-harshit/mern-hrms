import React from 'react';

/**
 * Spend against budget, on the workspace header — the remnant of what used to
 * be a six-tile health strip.
 *
 * The other tiles were removed rather than restyled. Task totals, open, in
 * progress, on hold and overdue all belong to the Tasks tab, and team size was
 * already the number on the Team tab's own badge; putting them on the header
 * meant the first thing anyone saw was a row of digits duplicating the tab bar
 * directly beneath it. Those counts now live in the tab they describe, where
 * each one is also the control that filters to it.
 *
 * Spend survives because it is the one figure with no tab of its own, and it is
 * rendered only for the management shell — the employee endpoint never sends
 * the numbers at all, so this component is simply never given them.
 */
const ProjectBudgetCard = ({ budget }) => {
    if (!budget) return null;

    const total = budget.total || 0;
    const spent = budget.spent || 0;
    const over = total > 0 && spent > total;
    const pct = total > 0 ? Math.min((spent / total) * 100, 100) : 0;

    return (
        <div className={`pw-budget ${over ? 'is-over' : ''}`}>
            <div className="pw-budget-label">Spent</div>

            <div className="pw-budget-value">
                ₹ {spent.toLocaleString('en-IN')}
                {total > 0 && (
                    <span className="pw-budget-of"> of ₹ {total.toLocaleString('en-IN')}</span>
                )}
            </div>

            {/* No bar without a budget to measure against — a full-width bar on
                a zero budget reads as "spent everything", which is not what an
                unset budget means. */}
            {total > 0 && (
                <div className="pw-progress">
                    <span style={{ width: `${pct}%` }} />
                </div>
            )}

            {over && (
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 7 }}>
                    ₹ {(spent - total).toLocaleString('en-IN')} over budget
                </div>
            )}
        </div>
    );
};

export default ProjectBudgetCard;
