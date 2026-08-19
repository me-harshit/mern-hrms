import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faExclamationTriangle, faExpand, faTrash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { resolveMediaUrl } from '../utils/taskHelpers';
import MediaLightbox from './MediaLightbox';

/**
 * Images and videos attached to a task. A video that hasn't been through the
 * nightly compression job yet still plays — it's just served from the VPS
 * rather than S3 — so it gets a chip rather than being hidden.
 *
 * Clicking opens the in-page lightbox instead of navigating away.
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
