import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMicrophone, faStop, faPause, faPlay, faTrash, faCheck, faCircle
} from '@fortawesome/free-solid-svg-icons';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import Waveform from './Waveform';
import '../styles/audio.css';

const fmt = (ms) => {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Record a voice note for the discussion.
 *
 * Always previews before attaching: a note you cannot hear back before sending
 * is a note you will re-record anyway. `onAttach` receives the file plus the
 * waveform and duration measured during recording, so the server can store them
 * alongside the audio.
 */
const AudioRecorder = ({ onAttach, disabled }) => {
    const {
        isSupported, status, error, recordingTimeMs, liveLevels,
        recordedBlob, waveform, maxMs,
        startRecording, stopRecording, pauseRecording, resumeRecording, discardRecording
    } = useAudioRecorder();

    const previewUrl = React.useMemo(
        () => (recordedBlob ? URL.createObjectURL(recordedBlob) : null),
        [recordedBlob]
    );

    // An object URL that outlives its blob leaks; revoke it when it changes.
    React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const [playing, setPlaying] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const audioRef = React.useRef(null);

    if (!isSupported) return null;

    const attach = () => {
        if (!recordedBlob) return;
        const now = new Date();
        const p = (n) => String(n).padStart(2, '0');
        // Extension has to match what MediaRecorder actually produced, or the
        // server's mime sniffing and the browser's playback disagree.
        const ext = recordedBlob.type.includes('mp4') ? 'm4a'
            : recordedBlob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File(
            [recordedBlob],
            `voice-note-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.${ext}`,
            { type: recordedBlob.type }
        );
        onAttach(file, { waveform, durationMs: recordingTimeMs });
        discardRecording();
    };

    const togglePlay = () => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) { el.play(); setPlaying(true); }
        else { el.pause(); setPlaying(false); }
    };

    return (
        <div className={`ar ${status !== 'idle' ? 'is-active' : ''}`}>
            {status === 'idle' && (
                <button type="button" className="ar-trigger" onClick={startRecording} disabled={disabled}
                    title="Record a voice note">
                    <FontAwesomeIcon icon={faMicrophone} />
                    <span>Voice note</span>
                </button>
            )}

            {status === 'requesting' && (
                <span className="ar-hint">Waiting for microphone permission…</span>
            )}

            {(status === 'recording' || status === 'paused') && (
                <div className="ar-live">
                    <span className={`ar-dot ${status === 'recording' ? 'is-live' : ''}`}>
                        <FontAwesomeIcon icon={faCircle} />
                    </span>

                    {/* The bars are the live signal, so a dead mic is obvious
                        before a two-minute take rather than after it. */}
                    <div className="ar-bars" aria-hidden="true">
                        {(liveLevels.length ? liveLevels : [0]).map((l, i) => (
                            <span key={i} className="ar-bar" style={{ height: `${Math.max(8, l * 100)}%` }} />
                        ))}
                    </div>

                    <span className="ar-time">
                        {fmt(recordingTimeMs)}
                        <em>/ {fmt(maxMs)}</em>
                    </span>

                    {status === 'recording' ? (
                        <button type="button" className="ar-icon" onClick={pauseRecording} title="Pause">
                            <FontAwesomeIcon icon={faPause} />
                        </button>
                    ) : (
                        <button type="button" className="ar-icon" onClick={resumeRecording} title="Resume">
                            <FontAwesomeIcon icon={faPlay} />
                        </button>
                    )}
                    <button type="button" className="ar-icon is-stop" onClick={stopRecording} title="Stop">
                        <FontAwesomeIcon icon={faStop} />
                    </button>
                    <button type="button" className="ar-icon is-discard" onClick={discardRecording} title="Discard">
                        <FontAwesomeIcon icon={faTrash} />
                    </button>
                </div>
            )}

            {status === 'preview' && (
                <div className="ar-preview">
                    <button type="button" className="ar-play" onClick={togglePlay}
                        title={playing ? 'Pause' : 'Play back'}>
                        <FontAwesomeIcon icon={playing ? faPause : faPlay} />
                    </button>

                    <Waveform
                        peaks={waveform}
                        progress={progress}
                        onSeek={(p) => {
                            const el = audioRef.current;
                            if (el && el.duration) { el.currentTime = p * el.duration; setProgress(p); }
                        }}
                    />

                    <span className="ar-time">{fmt(recordingTimeMs)}</span>

                    <button type="button" className="ar-icon is-discard" onClick={discardRecording} title="Discard">
                        <FontAwesomeIcon icon={faTrash} />
                    </button>
                    <button type="button" className="ar-attach" onClick={attach} title="Attach to message">
                        <FontAwesomeIcon icon={faCheck} /> Attach
                    </button>

                    <audio
                        ref={audioRef}
                        src={previewUrl}
                        onTimeUpdate={(e) => {
                            const el = e.currentTarget;
                            if (el.duration && isFinite(el.duration)) setProgress(el.currentTime / el.duration);
                        }}
                        onEnded={() => { setPlaying(false); setProgress(0); }}
                        hidden
                    />
                </div>
            )}

            {error && <span className="ar-error">{error}</span>}
        </div>
    );
};

export default AudioRecorder;
