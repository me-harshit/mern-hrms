import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMicrophone, faStop, faWandMagicSparkles,
    faTriangleExclamation, faSpinner, faXmark
} from '@fortawesome/free-solid-svg-icons';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import api from '../utils/api';
import '../styles/voiceTask.css';

const fmtElapsed = (ms) => {
    const total = Math.floor(ms / 1000);
    return `0:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Speak a task briefing, review/fix the transcript, then hand it to Gemini
 * to come back as one or more reviewable drafts (BulkVoiceTask.md §2-3).
 *
 * The transcript box is always there and always editable — recording just
 * fills it. That matters on its own: Firefox/Safari have no SpeechRecognition
 * at all, and even on Chrome/Edge some managers will just prefer typing. Voice
 * is one way to fill the box, not a requirement for using this page.
 *
 * Stopping (on silence, or the manager tapping Stop) never throws anything
 * away: `baseTextRef` holds whatever was already confirmed — spoken earlier,
 * or hand-typed — and each new listening session appends onto it rather than
 * replacing it. So the loop is: speak, pause, fix a misheard word or add a
 * sentence by typing, tap the mic again to add more by voice, repeat, then
 * Parse — never "lost my recording because I paused too long."
 *
 * Speech-to-text only — no audio ever leaves the browser. Nothing is created
 * from here; `onParsed` hands the caller drafts to review, never a save.
 */
const VoiceCommandBar = ({ onParsed, onClose }) => {
    const {
        isSupported, status, error, transcript, interimText, elapsedMs, maxMs,
        startListening, stopListening, reset
    } = useVoiceDictation({ lang: 'en-IN' });

    const [editedText, setEditedText] = useState('');
    const [parsing, setParsing] = useState(false);
    const [parseError, setParseError] = useState(null);

    // What was already confirmed (spoken in an earlier session, or hand-typed)
    // before this listening session started — the new transcript gets
    // appended onto this, never replaces it.
    const baseTextRef = useRef('');

    useEffect(() => {
        if (status === 'stopped') {
            const merged = [baseTextRef.current, transcript].filter(Boolean).join(' ').trim();
            setEditedText(merged);
            baseTextRef.current = '';
        }
    }, [status, transcript]);

    const handleMicClick = () => {
        if (status === 'listening') {
            stopListening();
            return;
        }
        baseTextRef.current = editedText;
        setParseError(null);
        reset();
        startListening();
    };

    const handleClear = () => {
        setEditedText('');
        baseTextRef.current = '';
        setParseError(null);
    };

    const handleParse = async () => {
        const text = editedText.trim();
        if (!text || parsing) return;

        setParsing(true);
        setParseError(null);
        try {
            const res = await api.post('/tasks/voice/parse', { transcript: text });
            const drafts = res.data?.drafts || [];
            if (drafts.length === 0) {
                setParseError(res.data?.message || "Couldn't find any task instructions in that recording.");
                return;
            }
            onParsed(drafts, text);
        } catch (err) {
            setParseError(err.response?.data?.message || 'Could not parse that recording. Try again.');
        } finally {
            setParsing(false);
        }
    };

    const handleTranscriptKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleParse();
        }
    };

    const isListening = status === 'listening';
    const hasText = editedText.trim().length > 0;
    const liveMergedText = isListening
        ? [baseTextRef.current, transcript].filter(Boolean).join(' ').trim()
        : editedText;

    return (
        <div className="vtb-panel">
            <div className="vtb-header">
                <div className="vtb-title">
                    <FontAwesomeIcon icon={faWandMagicSparkles} /> Voice Assign
                </div>
                <button type="button" className="vtb-close" onClick={onClose} aria-label="Close voice assign">
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </div>

            {isSupported ? (
                <div className="vtb-controls">
                    <button
                        type="button"
                        className={`vtb-mic ${isListening ? 'is-live' : ''}`}
                        onClick={handleMicClick}
                        disabled={parsing}
                        title={isListening ? 'Stop' : hasText ? 'Add more' : 'Record'}
                    >
                        <FontAwesomeIcon icon={isListening ? faStop : faMicrophone} />
                    </button>
                    <div className="vtb-status" aria-live="polite">
                        {isListening ? (
                            <>
                                <span className="vtb-live-dot" /> Listening… {fmtElapsed(elapsedMs)} / {fmtElapsed(maxMs)}
                                {' '}— tap the mic to stop whenever you're done.
                            </>
                        ) : hasText ? (
                            'Edit anything misheard below, tap the mic to add more, then parse it — nothing is lost between takes.'
                        ) : (
                            'Tap the mic and describe the task — who it\'s for, what it is, when it\'s due. Say "every day for N days" for a repeating task. Or just type it below.'
                        )}
                    </div>
                </div>
            ) : (
                <div className="vtb-status vtb-status-inline">
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    Voice input needs Chrome or Edge on desktop — type your briefing below instead.
                </div>
            )}

            {isListening && interimText && (
                <div className="vtb-live-caption"><em>{interimText}</em></div>
            )}

            {error && (
                <div className="vtb-error"><FontAwesomeIcon icon={faTriangleExclamation} /> {error}</div>
            )}

            <textarea
                className="vtb-transcript custom-input"
                rows={3}
                value={liveMergedText}
                onChange={(e) => setEditedText(e.target.value)}
                onKeyDown={handleTranscriptKeyDown}
                placeholder={isSupported
                    ? 'Type a task briefing, or tap the mic to dictate it…'
                    : 'Type a task briefing — who it\'s for, what it is, when it\'s due…'}
                disabled={parsing || isListening}
            />

            {parseError && (
                <div className="vtb-error"><FontAwesomeIcon icon={faTriangleExclamation} /> {parseError}</div>
            )}

            <div className="vtb-actions">
                {hasText && !isListening && (
                    <button type="button" className="gts-btn secondary" onClick={handleClear} disabled={parsing}>
                        Clear
                    </button>
                )}
                <button
                    type="button"
                    className="gts-btn primary"
                    onClick={handleParse}
                    disabled={!hasText || parsing || isListening}
                >
                    {parsing
                        ? <><FontAwesomeIcon icon={faSpinner} spin /> Parsing…</>
                        : <><FontAwesomeIcon icon={faWandMagicSparkles} /> Parse with AI</>}
                </button>
            </div>
        </div>
    );
};

export default VoiceCommandBar;
