/**
 * useVoiceRecorder.ts — 麦克风录音 Hook
 *
 * 封装 MediaRecorder API，管理录音状态。
 * 独立于 STT 引擎，仅负责采集音频。
 */

import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'processing';

export interface UseVoiceRecorderReturn {
    /** Current recording state */
    state: RecordingState;
    /** Duration in seconds of current recording */
    duration: number;
    /** Start recording (requests mic permission) */
    startRecording: () => Promise<boolean>;
    /** Stop recording and return audio blob */
    stopRecording: () => Promise<{ blob: Blob; duration: number } | null>;
    /** Cancel current recording without returning data */
    cancelRecording: () => void;
    /** Set state to processing (external control for STT phase) */
    setProcessing: (v: boolean) => void;
    /** Whether the browser supports MediaRecorder */
    isSupported: boolean;
    /** Error message if any */
    error: string | null;
}

/** Maximum recording duration in seconds */
const MAX_DURATION = 60;

/** MediaRecorder preferred MIME type (ordered by preference) */
const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
];

function getSupportedMime(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const mime of MIME_CANDIDATES) {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
    const [state, setState] = useState<RecordingState>('idle');
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    const resolveRef = useRef<((result: { blob: Blob; duration: number } | null) => void) | null>(null);
    const cancelledRef = useRef(false);

    const isSupported = typeof navigator !== 'undefined'
        && typeof navigator.mediaDevices !== 'undefined'
        && typeof MediaRecorder !== 'undefined';

    /** Clean up all resources */
    const cleanup = useCallback(() => {
        // Stop timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        // Stop all tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        chunksRef.current = [];
    }, []);

    const startRecording = useCallback(async (): Promise<boolean> => {
        if (state !== 'idle') return false;

        setError(null);
        cancelledRef.current = false;

        // 安全上下文检查 —— HTTP 非 localhost 无法使用麦克风
        if (!isSupported) {
            const isLocalhost = typeof location !== 'undefined' &&
                (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
            if (!isLocalhost && location.protocol !== 'https:') {
                setError('录音需要 HTTPS 安全连接（当前为 HTTP）');
            } else if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
                setError('当前浏览器不支持录音');
            } else {
                setError('当前环境不支持录音');
            }
            console.error('🎤 [Recorder] Not supported. isSecureContext:', typeof window !== 'undefined' && window.isSecureContext, 'mediaDevices:', !!navigator?.mediaDevices);
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000, // request 16kHz (browser may ignore)
                },
            });
            streamRef.current = stream;

            const mimeType = getSupportedMime();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                if (cancelledRef.current) {
                    cleanup();
                    resolveRef.current?.(null);
                    resolveRef.current = null;
                    return;
                }

                const blob = new Blob(chunksRef.current, {
                    type: mimeType || 'audio/webm',
                });
                const finalDuration = Math.round((Date.now() - startTimeRef.current) / 1000);
                cleanup();
                setState('idle');
                resolveRef.current?.({ blob, duration: Math.max(1, finalDuration) });
                resolveRef.current = null;
            };

            recorder.onerror = (e: any) => {
                console.error('🎤 [Recorder] Error:', e);
                setError('录音出错');
                cleanup();
                setState('idle');
                resolveRef.current?.(null);
                resolveRef.current = null;
            };

            // Start recording
            recorder.start(250); // collect data every 250ms
            startTimeRef.current = Date.now();
            setState('recording');
            setDuration(0);

            // Duration timer
            timerRef.current = setInterval(() => {
                const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
                setDuration(elapsed);

                // Auto-stop at max duration
                if (elapsed >= MAX_DURATION) {
                    if (mediaRecorderRef.current?.state === 'recording') {
                        mediaRecorderRef.current.stop();
                    }
                }
            }, 200);

            return true;
        } catch (err: any) {
            console.error('🎤 [Recorder] Failed to start:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError('请允许麦克风权限');
            } else if (err.name === 'NotFoundError') {
                setError('未检测到麦克风');
            } else {
                setError('无法启动录音');
            }
            cleanup();
            setState('idle');
            return false;
        }
    }, [state, cleanup]);

    const stopRecording = useCallback((): Promise<{ blob: Blob; duration: number } | null> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || state !== 'recording') {
                resolve(null);
                return;
            }

            resolveRef.current = resolve;

            if (mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        });
    }, [state]);

    const cancelRecording = useCallback(() => {
        cancelledRef.current = true;
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        cleanup();
        setState('idle');
        setDuration(0);
    }, [cleanup]);

    const setProcessing = useCallback((v: boolean) => {
        setState(v ? 'processing' : 'idle');
    }, []);

    return {
        state,
        duration,
        startRecording,
        stopRecording,
        cancelRecording,
        setProcessing,
        isSupported,
        error,
    };
}
