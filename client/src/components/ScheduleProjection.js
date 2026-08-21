import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { prettyDate, prettyDayMonth } from '../utils/scheduleDates';

/**
 * "10 days selected -> 8 will run, 2 skipped, ends Thu 4 Sep" (TaskPlan.md §13.6).
 *
 * The whole point of this panel is that the manager commits to a schedule
 * knowing what it will actually do, rather than discovering next week that two
 * of the ten days quietly never happened.
 *
 * Everything shown here comes from POST /tasks/recurring/preview, which is
 * advisory: leave approved *after* the schedule is created will not appear.
 * The cron re-checks every morning and is the authority — hence the closing note.
 */
const ScheduleProjection = ({ projection, loading, selectedCount }) => {
    if (loading) {
        return (
            <div className="sp-summary">
                <div className="sp-headline">
                    <FontAwesomeIcon icon={faSpinner} spin /> Working out what will run...
                </div>
            </div>
        );
    }

    if (!projection) {
        if (!selectedCount) return null;
        return (
            <div className="sp-summary">
                <div className="sp-headline">
                    {selectedCount} day{selectedCount === 1 ? '' : 's'} selected
                    <span className="sp-chip skip">Pick who it&apos;s for to see the full picture</span>
                </div>
            </div>
        );
    }

    const { perUser = [], summary = {}, targetCount = 0 } = projection;
    const multi = perUser.length > 1;

    return (
        <div className="sp-summary">
            <div className="sp-headline">
                {targetCount} day{targetCount === 1 ? '' : 's'} selected
                <span className="sp-chip run">
                    {targetCount} task{targetCount === 1 ? '' : 's'} per person
                </span>
                {summary.endsOn && (
                    <span className="sp-chip ends">Ends {prettyDate(summary.endsOn)}</span>
                )}
                {summary.anyStalled && (
                    <span className="sp-chip stalled">
                        <FontAwesomeIcon icon={faTriangleExclamation} /> Can&apos;t fit
                    </span>
                )}
            </div>

            {perUser.map(person => {
                const skips = person.timeline.filter(t => !t.willRun && t.date);
                return (
                    <div className="sp-person" key={person.userId}>
                        {multi && <div className="sp-person-name">{person.name}</div>}
                        <div className="sp-skips">
                            {skips.length === 0 ? (
                                <span style={{ color: '#166534' }}>
                                    Every selected day runs
                                    {person.endsOn ? ` — last one ${prettyDate(person.endsOn)}.` : '.'}
                                </span>
                            ) : (
                                <>
                                    {skips.length} skipped
                                    {person.extraDates?.length > 0 &&
                                        ` — rolled forward to ${prettyDate(person.endsOn)} so ${multi ? person.name.split(' ')[0] : 'they'} still get${multi ? 's' : ''} all ${targetCount}`}
                                    :
                                    <br />
                                    {skips.map(s => (
                                        <span key={s.date}>• {prettyDayMonth(s.date)} — {s.reason}<br /></span>
                                    ))}
                                </>
                            )}
                            {person.stalled && (
                                <span style={{ color: '#991b1b', fontWeight: 700 }}>
                                    Too many blocked days in a row to fit {targetCount} tasks — shorten the run or check their leave.
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}

            <div className="sp-note">
                Days are re-checked each morning before the task goes out, so leave approved
                after today is still honoured — this preview just can&apos;t see it yet.
            </div>
        </div>
    );
};

export default ScheduleProjection;
