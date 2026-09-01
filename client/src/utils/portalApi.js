import axios from 'axios';
import { SERVER_URL } from './api';

/**
 * The axios instance the external participant portal uses.
 *
 * Separate from utils/api.js, and it has to be. That instance sends the
 * employee token from localStorage `token`, and on any 401 it clears the
 * session and redirects to /login — which for a vendor whose link has expired
 * would mean being thrown at an employee login screen they can never get past,
 * with no explanation of what went wrong.
 *
 * This one carries the portal token, under its own storage key so an employee
 * and a vendor using the same browser cannot overwrite each other, and reports
 * failures back to the page instead of navigating away from it.
 */

const PORTAL_TOKEN_KEY = 'portalToken';

/**
 * Keyed by invite token, not stored as a single value.
 *
 * One person can hold links to more than one conversation — a vendor working on
 * two projects gets two invitations — and a single slot would silently log them
 * out of the first the moment they opened the second.
 */
const store = () => {
    try {
        return JSON.parse(localStorage.getItem(PORTAL_TOKEN_KEY) || '{}');
    } catch {
        return {};
    }
};

export const getPortalToken = (inviteToken) => store()[inviteToken] || null;

export const setPortalToken = (inviteToken, sessionToken) => {
    try {
        localStorage.setItem(
            PORTAL_TOKEN_KEY,
            JSON.stringify({ ...store(), [inviteToken]: sessionToken })
        );
    } catch {
        // A browser with storage disabled still works — the session simply
        // lasts until the tab is closed, which for a one-off vendor reply is
        // an acceptable outcome and better than a blank page.
    }
};

export const clearPortalToken = (inviteToken) => {
    try {
        const next = store();
        delete next[inviteToken];
        localStorage.setItem(PORTAL_TOKEN_KEY, JSON.stringify(next));
    } catch { /* nothing to clear */ }
};

const portalApi = axios.create({
    baseURL: `${SERVER_URL}/api/portal`,
    headers: { 'Content-Type': 'application/json' }
});

/**
 * The active session token, set once by the page after joining.
 *
 * Held in a module variable rather than read from storage on every request, so
 * that a page opened with one invite link cannot pick up a different link's
 * session out of the shared store.
 */
let active = null;
export const useSession = (sessionToken) => { active = sessionToken; };

portalApi.interceptors.request.use((config) => {
    if (active) config.headers['x-portal-token'] = active;
    return config;
});

export default portalApi;
