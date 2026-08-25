import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Live speech-to-text for the voice task briefing (BulkVoiceTask.md §2).
 *
 * Wraps the browser's native SpeechRecognition — no server round-trip, no
 * dependency, and (unlike useAudioRecorder, built for voice *notes*) this
 * needs live *text*, not a recorded blob.
 *
 * `status`: idle -> listening -> stopped
 *
 * Chrome stops the recognizer on any pause even with `continuous: true`, so
 * `onend` restarts it automatically unless the manager (or the silence timer,
 * or the duration cap) actually asked to stop — that's what makes this feel
 * continuous instead of cutting out mid-sentence.
 */
const SILENCE_STOP_MS = 2500;
const MAX_LISTEN_MS = 90 * 1000;

const getRecognitionCtor = () =>
    (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

export const useVoiceDictation = ({ lang = 'en-IN' } = {}) => {
    const [isSupported] = useState(() => !!getRecognitionCtor());
    const [status, setStatus] = useState('idle');
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [elapsedMs, setElapsedMs] = useState(0);
    const [error, setError] = useState(null);

    const recognitionRef = useRef(null);
    const finalTextRef = useRef('');
    const silenceTimerRef = useRef(null);
    const tickRef = useRef(null);
    const startedAtRef = useRef(0);
    const manualStopRef = useRef(false);

    const clearTimers = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
    };

    const stopListening = useCallback(() => {
        manualStopRef.current = true;
        clearTimers();
        try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    }, []);

    // A recognizer left running when the page changes keeps listening.
    useEffect(() => () => {
        manualStopRef.current = true;
        try { recognitionRef.current?.stop(); } catch { /* noop */ }
        clearTimers();
    }, []);

    const startListening = useCallback(() => {
        const Ctor = getRecognitionCtor();
        if (!Ctor) {
            setError('Voice input is not supported in this browser. Try Chrome or Edge.');
            return;
        }

        setError(null);
        finalTextRef.current = '';
        setTranscript('');
        setInterimText('');
        manualStopRef.current = false;

        const recognition = new Ctor();
        recognition.lang = lang;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) {
                    finalTextRef.current = `${finalTextRef.current} ${res[0].transcript}`.trim();
                } else {
                    interim += res[0].transcript;
                }
            }
            setTranscript(finalTextRef.current);
            setInterimText(interim);

            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => stopListening(), SILENCE_STOP_MS);
        };

        recognition.onerror = (event) => {
            // 'no-speech' fires constantly while waiting for the manager to
            // start talking — not a real error, let the silence timer decide.
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            setError(event.error === 'not-allowed'
                ? 'Microphone permission was refused.'
                : 'Voice recognition error — try again.');
        };

        recognition.onend = () => {
            if (manualStopRef.current) {
                clearTimers();
                setInterimText('');
                setStatus('stopped');
                return;
            }
            try { recognition.start(); } catch { /* a start already in flight */ }
        };

        recognitionRef.current = recognition;
        startedAtRef.current = Date.now();
        setElapsedMs(0);
        setStatus('listening');

        try {
            recognition.start();
        } catch (err) {
            setStatus('idle');
            setError('Could not start listening.');
            return;
        }

        tickRef.current = setInterval(() => {
            const elapsed = Date.now() - startedAtRef.current;
            setElapsedMs(elapsed);
            if (elapsed >= MAX_LISTEN_MS) stopListening();
        }, 250);
    }, [lang, stopListening]);

    const reset = useCallback(() => {
        manualStopRef.current = true;
        try { recognitionRef.current?.stop(); } catch { /* noop */ }
        clearTimers();
        finalTextRef.current = '';
        setTranscript('');
        setInterimText('');
        setElapsedMs(0);
        setError(null);
        setStatus('idle');
    }, []);

    // Lets the manager hand-correct a mis-heard name before parsing.
    const setTranscriptText = useCallback((text) => {
        finalTextRef.current = text;
        setTranscript(text);
    }, []);

    return {
        isSupported,
        status,
        error,
        transcript,
        interimText,
        elapsedMs,
        maxMs: MAX_LISTEN_MS,
        startListening,
        stopListening,
        reset,
        setTranscriptText
    };
};

export default useVoiceDictation;
