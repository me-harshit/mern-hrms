import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function useScreenRecorder({ onRecordingComplete, maxDurationMs = MAX_DURATION_MS } = {}) {
    const [status, setStatus] = useState('idle'); // idle, requesting, recording, paused, preview
    const [recordingTimeMs, setRecordingTimeMs] = useState(0);
    const [micLevel, setMicLevel] = useState(0);
    const [recordedBlob, setRecordedBlob] = useState(null);

    const onRecordingCompleteRef = useRef(onRecordingComplete);
    useEffect(() => {
        onRecordingCompleteRef.current = onRecordingComplete;
    }, [onRecordingComplete]);

    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const timerRef = useRef(null);
    const startTimeRef = useRef(null);
    const pauseTimeRef = useRef(null);

    const getSupportedMimeType = () => {
        // VP8 first, deliberately. This file is an intermediate — the nightly
        // job re-encodes it to H.264 — so encode *speed* matters far more than
        // compression ratio, and VP8 software-encodes several times faster than
        // VP9. That is the difference between a Mac keeping real time and
        // lagging minutes behind the recording.
        const types = [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp9,opus',
            'video/webm',
            'video/mp4' // Safari, which cannot record WebM at all
        ];
        for (const type of types) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return '';
    };

    const cleanup = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch (e) {}
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
    }, []);

    const updateMicLevel = useCallback(() => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setMicLevel(average / 255); // 0 to 1
        animationFrameRef.current = requestAnimationFrame(updateMicLevel);
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        } else if (status === 'recording') {
            setStatus('idle');
            cleanup();
        }
        window.onbeforeunload = null;
    }, [status, cleanup]);

    const updateTimer = useCallback(() => {
        if (status !== 'recording') return;
        const now = Date.now();
        const elapsed = now - startTimeRef.current;
        setRecordingTimeMs(elapsed);
        if (elapsed >= maxDurationMs) {
            stopRecording();
        }
    }, [status, maxDurationMs, stopRecording]);

    useEffect(() => {
        if (status === 'recording') {
            timerRef.current = setInterval(updateTimer, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [status, updateTimer]);

    const startRecording = async () => {
        try {
            setStatus('requesting');
            setRecordedBlob(null);
            chunksRef.current = [];

            // 1. Get Screen Stream
            let displayStream;
            try {
                displayStream = await navigator.mediaDevices.getDisplayMedia({
                    // Uncapped, this captures the display's *native* resolution.
                    // On a Retina MacBook that is 3456x2234 — nearly 4x the
                    // pixels of a 1080p Windows laptop — and no Mac has a
                    // hardware VP9 encoder, so the software encoder falls
                    // behind and stopping the recording stalls for a long time
                    // while it drains. 1080p is plenty for a screen share, and
                    // the midnight job re-encodes to H.264 anyway.
                    video: {
                        displaySurface: 'monitor',
                        width: { max: 1920 },
                        height: { max: 1080 },
                        frameRate: { ideal: 15, max: 24 }
                    },
                    audio: true // try to get system audio if available
                });
            } catch (err) {
                // User cancelled or not supported
                setStatus('idle');
                return;
            }

            // Listen for native stop (e.g., Chrome's "Stop sharing" bar)
            displayStream.getVideoTracks()[0].onended = () => {
                stopRecording();
            };

            // 2. Get Mic Stream
            let micStream = null;
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                console.warn('Microphone permission denied or not available. Recording without narration.', err);
            }

            // 3. Mix Audio if needed
            let mixedStream = displayStream;
            let finalTracks = [displayStream.getVideoTracks()[0]];

            if (micStream || displayStream.getAudioTracks().length > 0) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                const audioCtx = new AudioContext();
                audioContextRef.current = audioCtx;
                const dest = audioCtx.createMediaStreamDestination();

                if (micStream && micStream.getAudioTracks().length > 0) {
                    const micSource = audioCtx.createMediaStreamSource(micStream);
                    micSource.connect(dest);
                    
                    // Setup mic level analyser
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    micSource.connect(analyser);
                    analyserRef.current = analyser;
                    updateMicLevel();
                }

                if (displayStream.getAudioTracks().length > 0) {
                    const displayAudioSource = audioCtx.createMediaStreamSource(displayStream);
                    displayAudioSource.connect(dest);
                }

                if (dest.stream.getAudioTracks().length > 0) {
                     finalTracks.push(dest.stream.getAudioTracks()[0]);
                }
            }

            mixedStream = new MediaStream(finalTracks);
            streamRef.current = mixedStream;

            // 4. Setup MediaRecorder
            const mimeType = getSupportedMimeType();
            const options = { videoBitsPerSecond: 1500000 }; // 1.5 Mbps
            if (mimeType) {
                options.mimeType = mimeType;
            }
            const mediaRecorder = new MediaRecorder(mixedStream, options);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' });
                setRecordedBlob(blob);
                setStatus('preview');
                
                if (onRecordingCompleteRef.current) {
                    onRecordingCompleteRef.current(blob);
                }
                
                try {
                    cleanup();
                } catch (err) {
                    console.error('Screen recorder cleanup error:', err);
                }
            };

            mediaRecorder.start(1000); // 1-second chunks
            startTimeRef.current = Date.now();
            setRecordingTimeMs(0);
            setStatus('recording');

            // Handle page unload warning
            window.onbeforeunload = () => "A recording is in progress. Are you sure you want to leave?";

        } catch (err) {
            console.error('Failed to start recording:', err);
            setStatus('idle');
            cleanup();
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            pauseTimeRef.current = Date.now();
            setStatus('paused');
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            if (pauseTimeRef.current) {
                 // adjust start time by paused duration
                 startTimeRef.current += (Date.now() - pauseTimeRef.current);
            }
            setStatus('recording');
        }
    };

    const discardRecording = () => {
        setRecordedBlob(null);
        chunksRef.current = [];
        setStatus('idle');
        setRecordingTimeMs(0);
        window.onbeforeunload = null;
    };

    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    const isSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);

    return {
        isSupported,
        status, // idle, requesting, recording, paused, preview
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        discardRecording,
        recordingTimeMs,
        micLevel,
        recordedBlob,
        stream: status === 'recording' || status === 'paused' ? streamRef.current : null
    };
}
