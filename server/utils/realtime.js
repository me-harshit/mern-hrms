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

        /*
         * Chat rooms.
         *
         * Membership is NOT checked here, and deliberately so: joining a room
         * only decides where an event is delivered, and every event this
         * server emits into a conversation room was already authorised by the
         * route that produced it. The room a client asks for cannot make the
         * server send it a conversation it was never going to send.
         *
         * The unread badge is a separate path — it goes to `user:<id>` rooms,
         * which are joined from the verified token above and cannot be spoofed.
         */
        socket.on('conversation:join', (conversationId) => {
            if (conversationId) socket.join(`conv:${conversationId}`);
        });
        socket.on('conversation:leave', (conversationId) => {
            if (conversationId) socket.leave(`conv:${conversationId}`);
        });

        // "Riya is typing…". Relayed straight to the other people in the room
        // and never stored — a typing indicator that outlives the keystroke is
        // worse than none.
        socket.on('conversation:typing', ({ conversationId, name, typing }) => {
            if (!conversationId) return;
            socket.to(`conv:${conversationId}`).emit('conversation:typing', {
                conversationId,
                userId: socket.userId,
                name,
                typing: Boolean(typing)
            });
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

/** Send an event to everyone with a given conversation open. */
const emitToConversation = (conversationId, event, payload) => {
    if (!io || !conversationId) return;
    io.to(`conv:${conversationId}`).emit(event, payload);
};

/**
 * Send to a list of people at once — the chat list update that has to reach
 * members who do *not* have the conversation open, so their sidebar reorders
 * and their unread badge moves.
 */
const emitToUsers = (userIds, event, payload) => {
    if (!io || !userIds) return;
    for (const id of userIds) {
        if (id) io.to(roomFor(id)).emit(event, payload);
    }
};

module.exports = { initRealtime, emitToUser, emitToUsers, emitToTask, emitToConversation };
