import React, { useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVideo, faStop, faPlay, faPause, faCheck, faTrash, faMicrophone } from '@fortawesome/free-solid-svg-icons';
import { useScreenRecorder } from '../hooks/useScreenRecorder';
import '../styles/tasks.css';

/**
 * `autoStart` opens the screen picker the moment this mounts, for callers that
 * already treated the user's click as "start recording" — the composer's attach
 * menu, where a second Record button would be a click for nothing.
 * `onClose` lets that caller put its own UI back when the take is dropped.
 */
const ScreenRecorder = ({ onAttach, autoStart = false, onClose }) => {
    const {
        isSupported,
        status,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        discardRecording,
        recordingTimeMs,
        micLevel,
        recordedBlob,
        stream
    } = useScreenRecorder();

    const videoRef = useRef(null);
    const startedRef = useRef(false);

    // Once only: re-firing on every render would reopen the picker endlessly.
    useEffect(() => {
        if (autoStart && !startedRef.current && status === 'idle') {
            startedRef.current = true;
            startRecording();
        }
    }, [autoStart, status, startRecording]);

    // Format time: mm:ss
    const formatTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Attach stream to live preview when recording
    useEffect(() => {
        if (videoRef.current && stream && (status === 'recording' || status === 'paused')) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, status]);

    // Attach recorded blob to preview
    useEffect(() => {
         if (videoRef.current && recordedBlob && status === 'preview') {
             videoRef.current.srcObject = null;
             videoRef.current.src = URL.createObjectURL(recordedBlob);
         }
    }, [recordedBlob, status]);

    if (!isSupported) {
        return null;
    }

    const handleAttach = () => {
        if (recordedBlob) {
            // Generate a recognizable filename
            const now = new Date();
            const pad = (n) => n.toString().padStart(2, '0');
            // Safari cannot record WebM and produces an MP4, so hardcoding
            // .webm here shipped an MP4 under a WebM name and mime type —
            // which neither the browser nor QuickTime will open. Take both
            // from the blob the recorder actually produced.
            const mime = (recordedBlob.type || 'video/webm').split(';')[0];
            const ext = mime === 'video/mp4' ? 'mp4' : 'webm';
            const filename = `screen-recording-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.${ext}`;
            const file = new File([recordedBlob], filename, { type: mime });
            onAttach(file);
            discardRecording(); // reset the recorder for next use
            onClose?.();
        }
    };

    return (
        <div className="screen-recorder-container">
            {status === 'idle' && !autoStart && (
                <button type="button" className="gts-btn secondary" onClick={startRecording}>
                    <FontAwesomeIcon icon={faVideo} /> Record Screen
                </button>
            )}

            {status === 'requesting' && (
                <div className="recorder-waiting">
                    <button type="button" className="gts-btn secondary" disabled>
                        Selecting Screen...
                    </button>
                    {onClose && (
                        <button type="button" className="gts-btn secondary" onClick={onClose}>
                            Cancel
                        </button>
                    )}
                </div>
            )}

            {(status === 'recording' || status === 'paused') && (
                <div className="recording-active-panel">
                    <div className="live-preview-wrapper">
                        <video ref={videoRef} autoPlay muted className="live-preview-video" />
                        <div className="recording-overlay">
                            <div className={`recording-indicator ${status === 'recording' ? 'pulsing' : ''}`}></div>
                            <span className="recording-time">{formatTime(recordingTimeMs)} / 10:00</span>
                        </div>
                    </div>

                    <div className="recorder-controls">
                        {status === 'recording' ? (
                            <button type="button" className="gts-btn secondary icon-btn" onClick={pauseRecording} title="Pause">
                                <FontAwesomeIcon icon={faPause} />
                            </button>
                        ) : (
                            <button type="button" className="gts-btn secondary icon-btn" onClick={resumeRecording} title="Resume">
                                <FontAwesomeIcon icon={faPlay} />
                            </button>
                        )}
                        <button type="button" className="gts-btn danger icon-btn" onClick={stopRecording} title="Stop">
                            <FontAwesomeIcon icon={faStop} />
                        </button>
                    </div>
                    
                    <div className="mic-meter-container">
                        <FontAwesomeIcon icon={faMicrophone} className="mic-icon" />
                        <div className="mic-meter-bar">
                            <div className="mic-meter-fill" style={{ width: `${micLevel * 100}%` }}></div>
                        </div>
                    </div>
                </div>
            )}

            {status === 'preview' && (
                <div className="recording-preview-panel">
                    <div className="live-preview-wrapper">
                        <video ref={videoRef} controls className="live-preview-video" />
                    </div>
                    <div className="preview-controls">
                        <button type="button" className="gts-btn secondary"
                            onClick={() => { discardRecording(); onClose?.(); }}>
                            <FontAwesomeIcon icon={faTrash} /> Discard
                        </button>
                        <button type="button" className="gts-btn primary" onClick={handleAttach}>
                            <FontAwesomeIcon icon={faCheck} /> Attach Recording
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScreenRecorder;
