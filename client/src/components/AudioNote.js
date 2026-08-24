import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause } from '@fortawesome/free-solid-svg-icons';
import Waveform from './Waveform';
import { resolveMediaUrl } from '../utils/taskHelpers';
import '../styles/audio.css';

const fmt = (ms) => {
    const total = Math.round(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * A posted voice note.
 *
 * Draws the waveform the recorder measured and sent with the file, so a thread
 * of twenty notes renders instantly instead of downloading and decoding twenty
 * audio files to work out what to draw. `preload="none"` keeps it that way —
 * nothing is fetched until someone presses play.
 */
const AudioNote = ({ media, mine }) => {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);

    const total = media.durationMs || 0;

    const toggle = () => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) { el.play().catch(() => { }); setPlaying(true); }
        else { el.pause(); setPlaying(false); }
    };

    return (
        <div className={`an ${mine ? 'is-mine' : ''}`}>
            <button type="button" className="an-play" onClick={toggle}
                aria-label={playing ? 'Pause voice note' : 'Play voice note'}>
                <FontAwesomeIcon icon={playing ? faPause : faPlay} />
            </button>

            <Waveform
                peaks={media.waveform}
                progress={progress}
                height={30}
                onSeek={(p) => {
                    const el = audioRef.current;
                    if (el && el.duration && isFinite(el.duration)) {
                        el.currentTime = p * el.duration;
                        setProgress(p);
                    }
                }}
            />

            <span className="an-time">
                {playing || progress > 0 ? fmt(elapsedMs) : fmt(total)}
            </span>

            <audio
                ref={audioRef}
                src={resolveMediaUrl(media.url)}
                preload="none"
                onTimeUpdate={(e) => {
                    const el = e.currentTarget;
                    setElapsedMs(el.currentTime * 1000);
                    if (el.duration && isFinite(el.duration)) setProgress(el.currentTime / el.duration);
                }}
                onEnded={() => { setPlaying(false); setProgress(0); setElapsedMs(0); }}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                hidden
            />
        </div>
    );
};

export default AudioNote;
