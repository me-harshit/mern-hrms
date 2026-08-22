import React from 'react';

/**
 * A bar waveform.
 *
 * SVG rather than canvas: a few dozen rects scale crisply, restyle from CSS,
 * and need no redraw on resize. `progress` (0–1) colours the played portion,
 * which is what makes it a scrubber rather than decoration.
 */
const Waveform = ({
    peaks = [],
    progress = 0,
    className = '',
    height = 34,
    onSeek
}) => {
    // A note recorded before waveforms existed, or one whose peaks failed to
    // arrive, still gets a plausible-looking bar row rather than a blank gap.
    const bars = peaks.length
        ? peaks
        : Array.from({ length: 40 }, (_, i) => 0.25 + 0.18 * Math.sin(i / 2.2));

    const gap = 2;
    const barW = 3;
    const width = bars.length * (barW + gap);

    const seek = (e) => {
        if (!onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    };

    return (
        <svg
            className={`wf ${onSeek ? 'is-seekable' : ''} ${className}`}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            height={height}
            onClick={seek}
            role={onSeek ? 'slider' : 'img'}
            aria-label="Audio waveform"
        >
            {bars.map((p, i) => {
                // A floor of 2px so silence still reads as a bar rather than a
                // hole in the middle of the row.
                const h = Math.max(2, Math.min(1, p) * (height - 4));
                const played = (i + 1) / bars.length <= progress;
                return (
                    <rect
                        key={i}
                        x={i * (barW + gap)}
                        y={(height - h) / 2}
                        width={barW}
                        height={h}
                        rx={1.5}
                        className={played ? 'wf-bar is-played' : 'wf-bar'}
                    />
                );
            })}
        </svg>
    );
};

export default Waveform;
