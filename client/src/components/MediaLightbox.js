import React, { useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faChevronLeft, faChevronRight, faDownload } from '@fortawesome/free-solid-svg-icons';
import { resolveMediaUrl } from '../utils/taskHelpers';

/**
 * In-page viewer for task media. Opening attachments in a new tab loses the
 * page you were on and drops you at a bare S3 url, so images and videos are
 * shown here instead.
 *
 * items: [{ _id, url, fileName, type }]
 */
const MediaLightbox = ({ items, index, onClose, onIndexChange }) => {
    const total = items?.length || 0;
    const item = items?.[index];

    const next = useCallback(() => {
        if (total > 1) onIndexChange((index + 1) % total);
    }, [index, total, onIndexChange]);

    const prev = useCallback(() => {
        if (total > 1) onIndexChange((index - 1 + total) % total);
    }, [index, total, onIndexChange]);

    // Keyboard control, and don't let the page scroll behind the overlay.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') next();
            else if (e.key === 'ArrowLeft') prev();
        };
        document.addEventListener('keydown', onKey);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose, next, prev]);

    if (!item) return null;

    const src = resolveMediaUrl(item.url);

    return (
        <div className="lb-overlay" onClick={onClose}>
            <button className="lb-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
                <FontAwesomeIcon icon={faTimes} />
            </button>

            {total > 1 && (
                <button
                    className="lb-nav prev"
                    onClick={(e) => { e.stopPropagation(); prev(); }}
                    title="Previous (←)" aria-label="Previous"
                >
                    <FontAwesomeIcon icon={faChevronLeft} />
                </button>
            )}

            {/* Stop propagation so clicking the media itself doesn't close it. */}
            <figure className="lb-stage" onClick={(e) => e.stopPropagation()}>
                {item.type === 'video' ? (
                    <video src={src} controls autoPlay className="lb-media" />
                ) : (
                    <img src={src} alt={item.fileName || 'attachment'} className="lb-media" />
                )}

                <figcaption className="lb-caption">
                    <span className="lb-name">{item.fileName || 'Attachment'}</span>
                    <span className="lb-actions">
                        {total > 1 && <span className="lb-counter">{index + 1} / {total}</span>}
                        <a href={src} download={item.fileName || true} onClick={(e) => e.stopPropagation()} title="Download">
                            <FontAwesomeIcon icon={faDownload} />
                        </a>
                    </span>
                </figcaption>
            </figure>

            {total > 1 && (
                <button
                    className="lb-nav next"
                    onClick={(e) => { e.stopPropagation(); next(); }}
                    title="Next (→)" aria-label="Next"
                >
                    <FontAwesomeIcon icon={faChevronRight} />
                </button>
            )}
        </div>
    );
};

export default MediaLightbox;
