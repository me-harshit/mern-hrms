import { useState, useEffect } from 'react';
import api from '../../utils/api';

/**
 * The project's threads, split into internal (F1.5) and vendor (F1.6).
 *
 * A hook rather than two fetches in each page: the server answers both tabs in
 * one request — the split is decided there, by whether a thread holds a live
 * external membership — so calling it twice would ask the same question twice
 * and risk the two tabs disagreeing about which threads exist.
 *
 * Lazily triggered: `enabled` stays false until the reader opens one of the two
 * tabs, so opening a workspace on the Tasks tab costs nothing here.
 */
const useProjectConversations = (projectId, enabled) => {
    const [discussions, setDiscussions] = useState([]);
    const [vendor, setVendor] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!enabled || loaded || !projectId) return;

        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const res = await api.get(`/projects/${projectId}/conversations`);
                if (cancelled) return;
                setDiscussions(res.data.discussions || []);
                setVendor(res.data.vendor || []);
                setLoaded(true);
            } catch {
                if (!cancelled) { setDiscussions([]); setVendor([]); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [projectId, enabled, loaded]);

    // `vendor` is a subset of `discussions`, not a partition of it — a group
    // with an outsider in it is still where the team talks. See the route.
    return { discussions, vendor, loading };
};

export default useProjectConversations;
