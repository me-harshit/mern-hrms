import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faExclamationTriangle, faExpand, faTrash, faSpinner, faFileCode } from '@fortawesome/free-solid-svg-icons';
import { resolveMediaUrl } from '../utils/taskHelpers';
import MediaLightbox from './MediaLightbox';

/**
 * Images, videos and documents attached to a task. A video that hasn't been
 * through the nightly compression job yet still plays — it's just served
 * from the VPS rather than S3 — so it gets a chip rather than being hidden.
 *
 * Clicking an image or video opens the in-page lightbox. A document (an HTML
 * brief) opens directly in a new tab instead — the lightbox only knows how
 * to draw a picture or a <video>, and embedding someone's uploaded HTML in
 * an iframe on our own page is a self-XSS surface not worth opening for it.
 */
const TaskMediaGrid = ({ media, onDelete, deletingId }) => {
    const [lightboxIndex, setLightboxIndex] = useState(null);

    if (!media || media.length === 0) return null;

    return (
        <>
            <div className="task-media-grid">
                {media.map((m, i) => (
                    <div key={m._id} className="task-media-item">
                        {m.type === 'video' ? (
                            <>
                                {/* Controls stay usable inline; the expand button
                                    is the way into the lightbox. */}
                                <video src={resolveMediaUrl(m.url)} controls preload="metadata" />
                                <button
                                    className="task-media-expand"
                                    onClick={() => setLightboxIndex(i)}
                                    title="View larger" aria-label="View larger"
                                >
                                    <FontAwesomeIcon icon={faExpand} />
                                </button>
                            </>
                        ) : m.type === 'document' ? (
                            <a
                                className="task-media-doc"
                                href={resolveMediaUrl(m.url)} target="_blank" rel="noopener noreferrer"
                                title={m.fileName || 'Open document'}
                            >
                                <FontAwesomeIcon icon={faFileCode} />
                                <span>{m.fileName || 'Document'}</span>
                            </a>
                        ) : (
                            <button
                                className="task-media-open"
                                onClick={() => setLightboxIndex(i)}
                                title="View image"
                            >
                                <img src={resolveMediaUrl(m.url)} alt={m.fileName || 'attachment'} />
                            </button>
                        )}

                        {onDelete && (
                            <button
                                className="task-media-remove"
                                onClick={() => onDelete(m)}
                                disabled={deletingId === m._id}
                                title="Remove this file" aria-label="Remove this file"
                            >
                                <FontAwesomeIcon icon={deletingId === m._id ? faSpinner : faTrash} spin={deletingId === m._id} />
                            </button>
                        )}

                        {m.status === 'processing_compression' && (
                            <span className="media-processing-chip" title="Playable now — being optimised tonight">
                                <FontAwesomeIcon icon={faFilm} /> Optimising
                            </span>
                        )}
                        {m.status === 'failed' && (
                            <span className="media-processing-chip failed" title="Compression failed — the original is still available">
                                <FontAwesomeIcon icon={faExclamationTriangle} /> Not optimised
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {lightboxIndex !== null && (
                <MediaLightbox
                    items={media}
                    index={lightboxIndex}
                    onIndexChange={setLightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </>
    );
};

export default TaskMediaGrid;
