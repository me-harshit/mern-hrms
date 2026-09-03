import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faFolderOpen, faFileCode, faFilm, faMicrophone,
    faSpinner, faArrowUpRightFromSquare
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/taskHelpers';
import MediaLightbox from '../MediaLightbox';
import { timeAgo } from './projectShared';

/**
 * Every file shared on this project, in one library — feature draft F1.7.
 *
 * Read-only, and gathered rather than stored: the server aggregates what is
 * already attached to the project's tasks, its task discussions and its chats
 * (vendor uploads included, which is F2.5 arriving here for nothing). There is
 * no upload button because a file with no task and no message attached to it
 * has no context — files enter this library by being attached where the work
 * is happening, and each row links back to exactly that place.
 */

const TYPES = [
    { key: 'All', label: 'All types' },
    { key: 'image', label: 'Images' },
    { key: 'video', label: 'Videos' },
    { key: 'document', label: 'Documents' },
    { key: 'audio', label: 'Voice notes' }
];

const SOURCES = [
    { key: 'All', label: 'Everywhere' },
    { key: 'task', label: 'Tasks' },
    { key: 'discussion', label: 'Task discussions' },
    { key: 'chat', label: 'Chats' }
];

const ICON_FOR = { video: faFilm, audio: faMicrophone, document: faFileCode };

const ProjectDocumentsTab = ({ projectId, onCount }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [truncated, setTruncated] = useState(false);
    const [type, setType] = useState('All');
    const [source, setSource] = useState('All');
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [lightboxIndex, setLightboxIndex] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search), 400);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/projects/${projectId}/documents`, {
                params: { type, source, search: debounced || undefined }
            });
            setRows(res.data.data || []);
            setTruncated(Boolean(res.data.truncated));
            if (onCount) onCount(res.data.totalRecords ?? 0);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, type, source, debounced]);

    useEffect(() => { load(); }, [load]);

    /*
     * The lightbox can draw a picture or a <video> and nothing else, so only
     * those two are indexed into it. Without this remap, clicking the third
     * image in a list whose second entry is a PDF would open the wrong file.
     */
    const viewable = useMemo(
        () => rows.filter((r) => r.type === 'image' || r.type === 'video'),
        [rows]
    );

    const openViewer = (row) => {
        const idx = viewable.findIndex((v) => v.url === row.url);
        if (idx !== -1) setLightboxIndex(idx);
    };

    return (
        <>
            <div className="pw-toolbar">
                <input
                    className="pw-search"
                    placeholder="Search files…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className={`pw-select ${type !== 'All' ? 'is-active' : ''}`}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                >
                    {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <select
                    className={`pw-select ${source !== 'All' ? 'is-active' : ''}`}
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                >
                    {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
            </div>

            {truncated && (
                <p className="pw-subtitle" style={{ marginBottom: 12 }}>
                    Showing the 500 most recent files. Narrow the filters to see older ones.
                </p>
            )}

            {loading ? (
                <div className="pw-panel"><div className="pw-empty">Loading files…</div></div>
            ) : rows.length === 0 ? (
                <div className="pw-panel">
                    <div className="pw-empty">
                        <FontAwesomeIcon icon={faFolderOpen} className="pw-empty-icon" />
                        <strong>No files yet</strong>
                        Anything attached to a task, a task discussion or a project
                        chat is gathered here automatically — including files a
                        vendor uploads.
                    </div>
                </div>
            ) : (
                <div className="pw-docs">
                    {rows.map((doc, i) => {
                        const processing = doc.status === 'processing_compression';
                        const isViewable = doc.type === 'image' || doc.type === 'video';

                        return (
                            <div
                                key={`${doc.url}-${i}`}
                                className={`pw-doc ${processing ? 'is-processing' : ''}`}
                                onClick={() => {
                                    if (processing) return;
                                    if (isViewable) openViewer(doc);
                                    // A document is somebody's uploaded HTML;
                                    // opening it in a new tab rather than an
                                    // iframe on our own page is the same call
                                    // TaskMediaGrid makes, for the same reason.
                                    else window.open(resolveMediaUrl(doc.url), '_blank', 'noopener');
                                }}
                            >
                                <div className="pw-doc-thumb">
                                    {processing ? (
                                        <FontAwesomeIcon icon={faSpinner} spin />
                                    ) : doc.type === 'image' ? (
                                        <img src={resolveMediaUrl(doc.url)} alt={doc.fileName || 'attachment'} />
                                    ) : (
                                        <FontAwesomeIcon icon={ICON_FOR[doc.type] || faFileCode} />
                                    )}
                                </div>

                                <div className="pw-doc-meta">
                                    <div className="pw-doc-name" title={doc.fileName}>
                                        {doc.fileName || 'Untitled file'}
                                    </div>
                                    <div className="pw-doc-src" title={doc.sourceLabel}>
                                        {doc.sourceLabel}
                                    </div>
                                    <div className="pw-doc-src">
                                        {doc.uploadedBy?.name || 'Unknown'}
                                        {doc.uploadedBy?.isExternal && (
                                            <span className="pw-pill external" style={{ marginLeft: 6 }}>
                                                External
                                            </span>
                                        )}
                                        {' · '}{timeAgo(doc.at)}
                                    </div>
                                    <Link
                                        to={doc.link}
                                        className="pw-doc-src"
                                        style={{ color: '#215D7B', fontWeight: 600 }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> Open source
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {lightboxIndex !== null && viewable.length > 0 && (
                <MediaLightbox
                    items={viewable}
                    index={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                    onIndexChange={setLightboxIndex}
                />
            )}
        </>
    );
};

export default ProjectDocumentsTab;
