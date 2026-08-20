import { io } from 'socket.io-client';
import { SERVER_URL } from './api';

/**
 * One shared socket for the whole app.
 *
 * Created lazily on first use so a logged-out visitor never opens a connection,
 * and torn down on logout so the next user doesn't inherit the previous
 * session's identity.
 */

let socket = null;

export const getSocket = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;

    if (!socket) {
        socket = io(SERVER_URL || window.location.origin, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000
        });

        socket.on('connect_error', (err) => {
            // Expected while the server restarts; socket.io retries on its own.
            console.debug('[socket] connect error:', err.message);
        });
    }

    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

/**
 * Subscribe to an event and get an unsubscribe function back, so React effects
 * can clean up without leaking listeners across re-renders.
 */
export const onSocket = (event, handler) => {
    const s = getSocket();
    if (!s) return () => { };
    s.on(event, handler);
    return () => s.off(event, handler);
};

export default getSocket;
