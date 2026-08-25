import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMicrophone, faStop, faWandMagicSparkles, faRotateLeft,
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

    useEffect(() => {
        if (status === 'stopped') setEditedText(transcript);
    }, [status, transcript]);

    if (!isSupported) {
        return (
            <div className="vtb-panel vtb-unsupported">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <span>Voice input needs Chrome or Edge on desktop. Use the form below instead.</span>
                <button type="button" className="vtb-close" onClick={onClose}>
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </div>
        );
    }

    const handleMicClick = () => {
        if (status === 'listening') {
            stopListening();
            return;
        }
        reset();
        setEditedText('');
        setParseError(null);
        startListening();
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

    const isListening = status === 'listening';
    const hasText = editedText.trim().length > 0;

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

            <div className="vtb-controls">
                <button
                    type="button"
                    className={`vtb-mic ${isListening ? 'is-live' : ''}`}
                    onClick={handleMicClick}
                    disabled={parsing}
                >
                    <FontAwesomeIcon icon={isListening ? faStop : faMicrophone} />
                </button>
                <div className="vtb-status">
                    {isListening ? (
                        <>
                            <span className="vtb-live-dot" /> Listening… {fmtElapsed(elapsedMs)} / {fmtElapsed(maxMs)}
                        </>
                    ) : hasText ? (
                        'Review the transcript below, edit anything misheard, then parse it.'
                    ) : (
                        'Tap the mic and describe the task — who it\'s for, what it is, when it\'s due. Say "every day for N days" for a repeating task.'
                    )}
                </div>
            </div>

            {isListening && (
                <div className="vtb-live-caption">
                    {transcript} <em>{interimText}</em>
                </div>
            )}

            {error && (
                <div className="vtb-error"><FontAwesomeIcon icon={faTriangleExclamation} /> {error}</div>
            )}

            {!isListening && (editedText || status === 'stopped') && (
                <>
                    <textarea
                        className="vtb-transcript custom-input"
                        rows={3}
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        placeholder="Transcript will appear here — you can edit it before parsing."
                        disabled={parsing}
                    />

                    {parseError && (
                        <div className="vtb-error"><FontAwesomeIcon icon={faTriangleExclamation} /> {parseError}</div>
                    )}

                    <div className="vtb-actions">
                        <button type="button" className="gts-btn secondary" onClick={handleMicClick} disabled={parsing}>
                            <FontAwesomeIcon icon={faRotateLeft} /> Re-record
                        </button>
                        <button
                            type="button"
                            className="gts-btn primary"
                            onClick={handleParse}
                            disabled={!hasText || parsing}
                        >
                            {parsing
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Parsing…</>
                                : <><FontAwesomeIcon icon={faWandMagicSparkles} /> Parse with AI</>}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default VoiceCommandBar;
