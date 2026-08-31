import React, { useState, useRef, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPaperclip, faImage, faFile, faDesktop, faMicrophone
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';

import AudioRecorder from './AudioRecorder';
import ScreenRecorder from './ScreenRecorder';
import '../styles/attachMenu.css';

/**
 * One attach control for the whole app: a paperclip that opens a short menu of
 * what you can attach, rather than a bare file input sitting beside a recorder.
 *
 * Written for the chat composer first and then pulled out here, because tasks
 * needed the same thing. Keeping it as one component means the list of document
 * types, the image compression, and the way a recorder takes over the row are
 * defined once — three copies of an `accept` attribute is exactly how "chat
 * takes PDFs but the task form silently won't" happens.
 *
 * The caller decides which options appear:
 *   allowVoiceNote — off by default. A task attachment is evidence of work and
 *                    a voice note is a poor form of it; the per-task discussion
 *                    thread is where talking belongs, and it opts in.
 *   allowScreenRecording — on by default.
 *
 * Files come back through onFiles(File[], meta) already compressed where that
 * helps; `meta` is only set for a voice note, carrying its waveform and duration.
 * so every caller stages them the same way. Compression is async and can take a
 * moment on a big photo set, so onBusyChange(bool) lets a form disable its
 * submit until the files it is about to send actually exist.
 */

// Kept in step with server/middleware/taskUploadMiddleware.js and
// chatUploadMiddleware.js. A type offered here and refused there is a user
// picking a file and being told no after the upload starts.
export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.html,.htm';
export const MEDIA_ACCEPT = 'image/*,video/*';

const AttachMenu = forwardRef(({
    onFiles,
    onBusyChange,
    disabled = false,
    allowVoiceNote = false,
    allowScreenRecording = true,
    label,
    maxFileMB = 300,
    className = ''
}, ref) => {
    const [open, setOpen] = useState(false);
    const [recorder, setRecorder] = useState(null);   // 'audio' | 'screen' | null

    const wrapRef = useRef(null);
    const menuRef = useRef(null);
    const mediaInput = useRef(null);
    const docInput = useRef(null);

    /*
     * The popup is positioned fixed, against the viewport, rather than absolute
     * against this wrapper.
     *
     * Task forms and the chat pane both sit inside cards with overflow:hidden,
     * which clipped an absolutely-positioned menu — the top item was cut off
     * and only the lower two were reachable. A fixed element is laid out
     * against the viewport, so no ancestor's overflow can trim it, and the
     * placement can flip above or below depending on the room actually
     * available where the trigger happens to be.
     */
    const [coords, setCoords] = useState(null);

    /*
     * Lets a caller start a recorder without going through the menu — the chat
     * composer's mic shortcut, which is the one attachment people reach for
     * mid-sentence. Exposed as a handle rather than lifting `recorder` into the
     * caller, so the recorder lifecycle stays owned by exactly one component.
     */
    useImperativeHandle(ref, () => ({
        startVoiceNote: () => { setOpen(false); setRecorder('audio'); },
        startScreenRecording: () => { setOpen(false); setRecorder('screen'); }
    }), []);

    // Measured after the menu is in the DOM but before paint, so it never
    // appears in the wrong place for a frame.
    useLayoutEffect(() => {
        if (!open) { setCoords(null); return; }

        const trigger = wrapRef.current?.getBoundingClientRect();
        const menu = menuRef.current?.getBoundingClientRect();
        if (!trigger || !menu) return;

        const GAP = 8;
        const margin = 8;
        const roomBelow = window.innerHeight - trigger.bottom;

        // Prefer above (the composer case), drop below when there is not enough
        // room up there — a form near the top of the page.
        const openUp = trigger.top > menu.height + GAP + margin
            || roomBelow < menu.height + GAP + margin;

        setCoords({
            top: openUp
                ? Math.max(margin, trigger.top - menu.height - GAP)
                : Math.min(window.innerHeight - menu.height - margin, trigger.bottom + GAP),
            left: Math.min(
                Math.max(margin, trigger.left),
                window.innerWidth - menu.width - margin
            )
        });
    }, [open]);

    // Clicking elsewhere, scrolling, or resizing dismisses it. A fixed menu does
    // not travel with the page, so a scroll must close it rather than leave it
    // stranded beside nothing.
    useEffect(() => {
        if (!open) return;
        const close = (e) => {
            if (menuRef.current?.contains(e.target)) return;
            if (wrapRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const dismiss = () => setOpen(false);

        document.addEventListener('mousedown', close);
        window.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss);
        return () => {
            document.removeEventListener('mousedown', close);
            window.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
        };
    }, [open]);

    const stage = (files) => {
        const ok = [];
        for (const f of files) {
            if (f.size > maxFileMB * 1024 * 1024) {
                Swal.fire('Too large', `"${f.name}" is over ${maxFileMB}MB.`, 'warning');
                continue;
            }
            ok.push(f);
        }
        if (ok.length) onFiles(ok);
    };

    const pickMedia = async (e) => {
        const picked = Array.from(e.target.files);
        const processed = [];
        onBusyChange?.(true);

        for (const f of picked) {
            if (!f.type.startsWith('image/')) {
                // Video goes up untouched — the server stages it and the night
                // job compresses it properly with ffmpeg.
                processed.push(f);
                continue;
            }
            try {
                // A 12MP phone photo is several MB of detail nobody looks at in
                // a thumbnail, and it costs the viewer's data too.
                const blob = await imageCompression(f, {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1600,
                    useWebWorker: false,
                    fileType: 'image/jpeg'
                });
                processed.push(new File(
                    [blob],
                    f.name.replace(/\.[^/.]+$/, '') + '.jpg',
                    { type: 'image/jpeg' }
                ));
            } catch {
                processed.push(f);   // compression is an optimisation, not a gate
            }
        }

        stage(processed);
        onBusyChange?.(false);
        e.target.value = '';
        setOpen(false);
    };

    const pickDocs = (e) => {
        stage(Array.from(e.target.files));
        e.target.value = '';
        setOpen(false);
    };

    // A live recorder replaces the trigger entirely — a paperclip beside a
    // running microphone is a button nobody is going to press.
    if (recorder) {
        return (
            <div className={`attach-recorder ${className}`}>
                {recorder === 'audio' ? (
                    <AudioRecorder
                        autoStart
                        /* The waveform and duration measured while recording are
                           forwarded as the second argument: without them the
                           server stores a voice note the player has to download
                           and decode before it can draw anything. */
                        onAttach={(file, meta) => { onFiles([file], meta); setRecorder(null); }}
                        onClose={() => setRecorder(null)}
                    />
                ) : (
                    <ScreenRecorder
                        autoStart
                        onAttach={(file) => { onFiles([file]); setRecorder(null); }}
                        onClose={() => setRecorder(null)}
                    />
                )}
            </div>
        );
    }

    return (
        <div className={`attach-wrap ${className}`} ref={wrapRef}>
            <button
                type="button"
                className={`attach-trigger ${open ? 'is-open' : ''}`}
                onClick={() => setOpen((o) => !o)}
                disabled={disabled}
            >
                <FontAwesomeIcon icon={faPaperclip} />
                {label && <span>{label}</span>}
            </button>

            {open && (
                <div
                    className="attach-menu"
                    ref={menuRef}
                    style={coords
                        ? { top: coords.top, left: coords.left }
                        // Rendered off-screen for the single frame it takes to
                        // measure, so nothing flashes at the wrong position.
                        : { top: -9999, left: -9999 }}
                >
                    <button type="button" onClick={() => mediaInput.current?.click()}>
                        <span className="ico" style={{ background: '#7f66ff' }}>
                            <FontAwesomeIcon icon={faImage} />
                        </span>
                        <span>
                            Photos &amp; videos
                            <small>JPG, PNG, MP4, MOV…</small>
                        </span>
                    </button>

                    <button type="button" onClick={() => docInput.current?.click()}>
                        <span className="ico" style={{ background: '#5157ae' }}>
                            <FontAwesomeIcon icon={faFile} />
                        </span>
                        <span>
                            Document
                            <small>PDF, Word, Excel, PPT, HTML, CSV, ZIP</small>
                        </span>
                    </button>

                    {allowScreenRecording && (
                        <button
                            type="button"
                            onClick={() => { setOpen(false); setRecorder('screen'); }}
                        >
                            <span className="ico" style={{ background: '#d3396d' }}>
                                <FontAwesomeIcon icon={faDesktop} />
                            </span>
                            <span>
                                Screen recording
                                <small>Capture your screen</small>
                            </span>
                        </button>
                    )}

                    {allowVoiceNote && (
                        <button
                            type="button"
                            onClick={() => { setOpen(false); setRecorder('audio'); }}
                        >
                            <span className="ico" style={{ background: '#0b9b7d' }}>
                                <FontAwesomeIcon icon={faMicrophone} />
                            </span>
                            <span>
                                Voice note
                                <small>Record a message</small>
                            </span>
                        </button>
                    )}
                </div>
            )}

            <input
                ref={mediaInput}
                type="file"
                accept={MEDIA_ACCEPT}
                multiple
                hidden
                onChange={pickMedia}
            />
            <input
                ref={docInput}
                type="file"
                accept={DOCUMENT_ACCEPT}
                multiple
                hidden
                onChange={pickDocs}
            />
        </div>
    );
});

AttachMenu.displayName = 'AttachMenu';

export default AttachMenu;
