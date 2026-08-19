const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

/**
 * Realtime push over socket.io.
 *
 * Every authenticated client joins a room named after its own user id, so a
 * message meant for one person is delivered only to that person's open tabs
 * rather than broadcast to everyone.
 */

let io = null;

const roomFor = (userId) => `user:${String(userId)}`;

const initRealtime = (httpServer) => {
    io = new Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    // The handshake carries the same JWT the REST API uses.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('No token'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.user.id;
            socket.userRole = decoded.user.role;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        socket.join(roomFor(socket.userId));

        // Lets an open task page receive messages for just that task.
        socket.on('task:join', (taskId) => {
            if (taskId) socket.join(`task:${taskId}`);
        });
        socket.on('task:leave', (taskId) => {
            if (taskId) socket.leave(`task:${taskId}`);
        });
    });

    console.log('✅ Realtime (socket.io) ready');
    return io;
};

/** Send an event to one user, across all their open tabs. */
const emitToUser = (userId, event, payload) => {
    if (!io || !userId) return;
    io.to(roomFor(userId)).emit(event, payload);
};

/** Send an event to everyone currently viewing a task. */
const emitToTask = (taskId, event, payload) => {
    if (!io || !taskId) return;
    io.to(`task:${taskId}`).emit(event, payload);
};

module.exports = { initRealtime, emitToUser, emitToTask };
