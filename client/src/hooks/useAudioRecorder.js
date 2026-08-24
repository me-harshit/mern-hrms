import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Record a voice note, and measure it while recording.
 *
 * The peaks are captured live from an AnalyserNode rather than decoded
 * afterwards: we already have the audio graph open, so sampling it costs
 * nothing, and it means the waveform can be sent to the server with the file.
 * A thread with twenty voice notes then draws twenty waveforms without
 * downloading and decoding twenty files.
 *
 * `status`: idle -> requesting -> recording <-> paused -> preview
 */
const MAX_MS = 5 * 60 * 1000;   // a voice note, not a podcast
const PEAKS = 56;               // bars kept for the stored waveform

// Preference order — Safari has no Opus, so it needs the mp4 fallback.
const pickMimeType = () => {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
    ];
    if (typeof MediaRecorder === 'undefined') return null;
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || null;
};

export const useAudioRecorder = () => {
    const [isSupported] = useState(() =>
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined' &&
        !!pickMimeType()
    );

    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [recordingTimeMs, setRecordingTimeMs] = useState(0);
    const [liveLevels, setLiveLevels] = useState([]);   // the moving bars
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [waveform, setWaveform] = useState([]);       // the kept peaks

    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const rafRef = useRef(null);
    const startedAtRef = useRef(0);
    const pausedMsRef = useRef(0);
    const pauseStartRef = useRef(0);
    const peaksRef = useRef([]);

    const cleanup = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;

        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => { });
        }
        audioCtxRef.current = null;
        analyserRef.current = null;
    }, []);

    // A recorder left running when the page changes keeps the mic light on.
    useEffect(() => cleanup, [cleanup]);

    const sample = useCallback(() => {
        const analyser = analyserRef.current;
        if (!analyser) return;

        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(buf);

        // RMS of the waveform around the 128 midpoint: a real loudness figure
        // rather than the single peak sample, which flickers.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // Nudge it up a little: speech sits low on a linear scale and the bars
        // look dead otherwise.
        const level = Math.min(1, Math.pow(rms, 0.6) * 1.8);

        peaksRef.current.push(level);
        setLiveLevels(prev => {
            const next = [...prev, level];
            return next.length > 48 ? next.slice(-48) : next;
        });

        const elapsed = Date.now() - startedAtRef.current - pausedMsRef.current;
        setRecordingTimeMs(elapsed);

        if (elapsed >= MAX_MS) {
            stopRecording();
            return;
        }

        rafRef.current = requestAnimationFrame(sample);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startRecording = useCallback(async () => {
        setError(null);
        setStatus('requesting');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            streamRef.current = stream;

            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);
            audioCtxRef.current = ctx;
            analyserRef.current = analyser;

            const mimeType = pickMimeType();
            const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96000 });
            chunksRef.current = [];
            peaksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
                setRecordedBlob(blob);

                // Squash however many frames were captured down to a fixed
                // number of bars, so every note draws the same width.
                const peaks = peaksRef.current;
                const out = [];
                if (peaks.length) {
                    const per = peaks.length / PEAKS;
                    for (let i = 0; i < PEAKS; i++) {
                        const slice = peaks.slice(Math.floor(i * per), Math.max(Math.floor((i + 1) * per), Math.floor(i * per) + 1));
                        const avg = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
                        out.push(Number(avg.toFixed(3)));
                    }
                }
                setWaveform(out);
                setStatus('preview');
                cleanup();
            };

            // The mic can be pulled out, or revoked from the browser UI.
            stream.getAudioTracks()[0].onended = () => {
                if (recorderRef.current?.state === 'recording') stopRecording();
            };

            recorderRef.current = recorder;
            startedAtRef.current = Date.now();
            pausedMsRef.current = 0;
            setRecordingTimeMs(0);
            setLiveLevels([]);
            recorder.start(250);
            setStatus('recording');
            rafRef.current = requestAnimationFrame(sample);
        } catch (err) {
            cleanup();
            setStatus('idle');
            setError(err.name === 'NotAllowedError'
                ? 'Microphone permission was refused.'
                : 'Could not start recording.');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanup, sample]);

    const stopRecording = useCallback(() => {
        const rec = recorderRef.current;
        if (rec && rec.state !== 'inactive') rec.stop();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
    }, []);

    const pauseRecording = useCallback(() => {
        const rec = recorderRef.current;
        if (rec?.state === 'recording') {
            rec.pause();
            pauseStartRef.current = Date.now();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            setStatus('paused');
        }
    }, []);

    const resumeRecording = useCallback(() => {
        const rec = recorderRef.current;
        if (rec?.state === 'paused') {
            rec.resume();
            pausedMsRef.current += Date.now() - pauseStartRef.current;
            setStatus('recording');
            rafRef.current = requestAnimationFrame(sample);
        }
    }, [sample]);

    const discardRecording = useCallback(() => {
        stopRecording();
        cleanup();
        recorderRef.current = null;
        chunksRef.current = [];
        peaksRef.current = [];
        setRecordedBlob(null);
        setWaveform([]);
        setLiveLevels([]);
        setRecordingTimeMs(0);
        setStatus('idle');
        setError(null);
    }, [cleanup, stopRecording]);

    return {
        isSupported,
        status,
        error,
        recordingTimeMs,
        liveLevels,
        recordedBlob,
        waveform,
        maxMs: MAX_MS,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        discardRecording
    };
};

export default useAudioRecorder;
