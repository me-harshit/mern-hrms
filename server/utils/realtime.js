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

    /*
     * The handshake carries the same JWT the REST API uses - either an
     * employee token (`user`) or an external participant's portal token
     * (`ext`, see middleware/externalAuthMiddleware.js).
     *
     * Which one it is decides what rooms the socket may enter, so it is
     * recorded on the socket rather than collapsed into a single id: an
     * outsider and a colleague are not interchangeable here.
     */
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('No token'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.user?.id) {
                socket.userId = decoded.user.id;
                socket.userRole = decoded.user.role;
                socket.isExternal = false;
                return next();
            }

            if (decoded.ext?.pid) {
                socket.userId = null;
                socket.isExternal = true;
                socket.externalId = decoded.ext.pid;
                // The one conversation this socket is ever allowed to hear.
                socket.externalConversationId = String(decoded.ext.cid || '');
                return next();
            }

            return next(new Error('Invalid token'));
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        if (socket.userId) socket.join(roomFor(socket.userId));

        // Lets an open task page receive messages for just that task. Staff
        // only - an external participant has no business in a task feed, and
        // tasks are explicitly outside what F2.3 grants them.
        socket.on('task:join', (taskId) => {
            if (taskId && !socket.isExternal) socket.join(`task:${taskId}`);
        });
        socket.on('task:leave', (taskId) => {
            if (taskId) socket.leave(`task:${taskId}`);
        });

        /*
         * Chat rooms.
         *
         * For an EMPLOYEE, membership is not checked here, and deliberately so:
         * joining a room only decides where an event is delivered, and every
         * event this server emits into a conversation room was already
         * authorised by the route that produced it. The room a colleague asks
         * for cannot make the server send them a conversation it was never
         * going to send.
         *
         * For an EXTERNAL participant that reasoning does not hold. Their whole
         * access model is one conversation (feature draft F2.3), and a room is
         * a live feed of everything posted in it - so an outsider free to name
         * any room would be a live feed of every group in the company. Their
         * token pins the only id they may join, and that is checked here.
         *
         * The unread badge is a separate path - it goes to `user:<id>` rooms,
         * which are joined from the verified token above and cannot be spoofed.
         */
        const mayJoin = (conversationId) => {
            if (!conversationId) return false;
            if (!socket.isExternal) return true;
            return String(conversationId) === socket.externalConversationId;
        };

        /*
         * Staff and outsiders are put in DIFFERENT rooms for the same
         * conversation, and that is the point.
         *
         * The payload broadcast to `conv:<id>` is the full internal message,
         * with the sender populated down to employee number, department and
         * job title. An external socket sitting in that room would receive all
         * of it on every message, whatever the portal chose to draw. So they
         * join `convext:<id>` instead, and utils/portalShape.js is the only
         * thing that writes there - reduced once, in one place.
         */
        const roomName = (id) => (socket.isExternal ? `convext:${id}` : `conv:${id}`);

        socket.on('conversation:join', (conversationId) => {
            if (mayJoin(conversationId)) socket.join(roomName(conversationId));
        });
        socket.on('conversation:leave', (conversationId) => {
            if (conversationId) socket.leave(roomName(conversationId));
        });

        // "Riya is typing…". Relayed straight to the other people in the room
        // and never stored — a typing indicator that outlives the keystroke is
        // worse than none.
        socket.on('conversation:typing', ({ conversationId, name, typing }) => {
            if (!mayJoin(conversationId)) return;
            const payload = {
                conversationId,
                userId: socket.userId,
                externalId: socket.externalId || null,
                name,
                typing: Boolean(typing)
            };
            // Relayed to both rooms: a name and a boolean is the whole payload,
            // so there is nothing here that needs reducing for an outsider, and
            // both sides should see that the other is writing.
            socket.to(`conv:${conversationId}`).emit('conversation:typing', payload);
            socket.to(`convext:${conversationId}`).emit('conversation:typing', payload);
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

/** Send an event to every EMPLOYEE with a given conversation open. */
const emitToConversation = (conversationId, event, payload) => {
    if (!io || !conversationId) return;
    io.to(`conv:${conversationId}`).emit(event, payload);
};

/**
 * Send an event to the external participants watching a conversation.
 *
 * A separate room from the one above, because the payloads are not the same
 * shape and must not be. Callers should reach this through
 * utils/portalShape.js rather than directly, so the reduction is never
 * something a route has to remember to apply.
 */
const emitToConversationExternals = (conversationId, event, payload) => {
    if (!io || !conversationId) return;
    io.to(`convext:${conversationId}`).emit(event, payload);
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

module.exports = {
    initRealtime, emitToUser, emitToUsers, emitToTask,
    emitToConversation, emitToConversationExternals
};
