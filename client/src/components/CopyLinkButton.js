import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLink, faCheck } from '@fortawesome/free-solid-svg-icons';

/**
 * Copies a deep link to one task or schedule.
 *
 * The link is just the ordinary in-app URL, deliberately — there is no share
 * token and no widening of who may read what. Whoever opens it still passes
 * the same check they would by navigating there themselves: assignee,
 * assigner, Admin/HR, or a Team Lead over that team. Someone with no
 * connection to the task gets the same refusal they always did, so pasting a
 * link into a group chat can never hand access to a person who did not
 * already have it.
 *
 * `path` is app-relative ('/task/123'); the origin is taken from the browser
 * so the same code yields a localhost link in development and the real domain
 * in production without configuration.
 */
const CopyLinkButton = ({ path, label = 'Copy link', className = 'icon-btn' }) => {
    const [copied, setCopied] = useState(false);
    const timer = useRef(null);

    // A row can unmount while the "copied" tick is still counting down.
    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = async (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}${path}`;

        let ok = false;
        try {
            // Only defined in a secure context: HTTPS or localhost. On a plain
            // http:// LAN address it is undefined rather than failing, so the
            // fallback below is what actually runs there.
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
                ok = true;
            }
        } catch (err) {
            // Permission refused, or the document was not focused. Fall through.
            ok = false;
        }

        if (!ok) {
            // execCommand is deprecated but remains the only thing that works
            // without a secure context, and it needs a real selection to act on.
            try {
                const el = document.createElement('textarea');
                el.value = url;
                el.setAttribute('readonly', '');
                el.style.position = 'fixed';
                el.style.opacity = '0';
                document.body.appendChild(el);
                el.select();
                ok = document.execCommand('copy');
                document.body.removeChild(el);
            } catch (err) {
                ok = false;
            }
        }

        if (ok) {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1600);
        } else {
            // Never silently do nothing — show the link so it can be copied by
            // hand rather than leaving the button looking broken.
            window.prompt('Copy this link:', url);
        }
    };

    return (
        <button
            type="button"
            className={`${className} ${copied ? 'is-copied' : ''}`}
            onClick={copy}
            title={copied ? 'Link copied' : label}
            aria-label={label}
        >
            <FontAwesomeIcon icon={copied ? faCheck : faLink} />
        </button>
    );
};

export default CopyLinkButton;
