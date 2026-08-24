import React from 'react';
import TaskDiscussion from './TaskDiscussion';
import '../styles/recurring.css';

/**
 * Which discussion a task shows.
 *
 * A recurring task has **one** thread for the entire run, not one per day. The
 * work resets every morning; the conversation about it does not — asking a
 * question on Tuesday and having it disappear when Wednesday's copy arrives is
 * useless. So every generated day points at the schedule's thread, and a
 * fifteen-day run has exactly one window of history.
 *
 * An ordinary task keeps its own thread, as before.
 */
const TaskThreads = ({ task, currentUserId }) => {
    const scheduleId = task.recurringTaskId?._id || task.recurringTaskId;

    if (!scheduleId) {
        return <TaskDiscussion taskId={task._id} currentUserId={currentUserId} />;
    }

    return (
        <>
            <TaskDiscussion
                taskId={scheduleId}
                currentUserId={currentUserId}
                basePath="/tasks/recurring"
                title="Discussion"
            />
            <p className="tt-note">
                One thread for the whole of “{task.recurringTaskId?.title || 'this daily task'}”.
                Everything said here stays with the task tomorrow and every day after.
            </p>
        </>
    );
};

export default TaskThreads;
