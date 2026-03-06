/**
 * useVoiceTts — 语音消息管理 Hook
 *
 * 独立模块：封装 TTS 合成、IndexedDB 存储、音频播放三大能力。
 * 设计原则：
 *   - 全局单例播放（同时只播放一条语音）
 *   - 音频以 Blob 形式存入 IDB，持久可回听
 *   - 与主聊天逻辑解耦，仅通过回调暴露状态
 */

import { useState, useRef, useCallback } from 'react';
import { MinimaxTts, TtsSynthesisStatus } from '../utils/minimaxTts';
import { TtsConfig } from '../types/tts';
import { DB } from '../utils/db';

export interface VoiceTtsState {
    /** 当前正在播放的消息 ID */
    playingMsgId: number | null;
    /** 正在合成中的消息 ID 集合 */
    loadingMsgIds: Set<number>;
}

/**
 * 估算音频时长（秒）— 文件大小 + 比特率做近似（降级方案）。
 */
function estimateDuration(blob: Blob, bitrate = 128000): number {
    const bytes = blob.size;
    const seconds = (bytes * 8) / bitrate;
    return Math.max(1, Math.round(seconds));
}

/**
 * 精确获取音频时长（秒）— 使用 Web Audio API 解码。
 * 失败时回退到 estimateDuration。
 */
async function getAudioDuration(blob: Blob, bitrate?: number): Promise<number> {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const duration = Math.max(1, Math.round(audioBuffer.duration));
        ctx.close().catch(() => { });
        return duration;
    } catch {
        return estimateDuration(blob, bitrate);
    }
}

export function useVoiceTts() {
    const [playingMsgId, setPlayingMsgId] = useState<number | null>(null);
    const playingMsgIdRef = useRef<number | null>(null);
    const [loadingMsgIds, setLoadingMsgIds] = useState<Set<number>>(new Set());

    // AudioElement ref — only one at a time
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentUrlRef = useRef<string | null>(null);

    // ── Stop any currently playing audio ──────────────────────────────
    const stopVoice = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
            currentUrlRef.current = null;
        }
        playingMsgIdRef.current = null;
        setPlayingMsgId(null);
    }, []);

    // ── Play audio for a given message ID (from IDB) ─────────────────
    const playVoice = useCallback(async (msgId: number) => {
        // Use ref (not state) to avoid stale closure issues on rapid clicks
        if (audioRef.current && playingMsgIdRef.current === msgId) {
            stopVoice();
            return;
        }
        // Stop any previous playback
        stopVoice();

        const blob = await DB.getVoiceAudio(msgId);
        if (!blob) {
            console.warn('[VoiceTts] No audio blob found for msgId:', msgId);
            return;
        }

        const url = URL.createObjectURL(blob);
        currentUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        playingMsgIdRef.current = msgId;
        setPlayingMsgId(msgId);

        audio.onended = () => {
            stopVoice();
        };
        audio.onerror = () => {
            console.error('[VoiceTts] Audio playback error for msgId:', msgId);
            stopVoice();
        };

        try {
            await audio.play();
        } catch (err) {
            console.error('[VoiceTts] Failed to play audio:', err);
            stopVoice();
        }
    }, [stopVoice]);

    // ── Synthesize and save audio for a message ──────────────────────
    const synthesizeForMessage = useCallback(async (
        msgId: number,
        text: string,
        ttsConfig: TtsConfig,
        onStatus?: (status: TtsSynthesisStatus, message: string) => void
    ): Promise<{ duration: number } | null> => {
        // Mark as loading
        setLoadingMsgIds(prev => {
            const next = new Set(prev);
            next.add(msgId);
            return next;
        });

        try {
            const result = await MinimaxTts.synthesize(text, ttsConfig, onStatus);
            if (!result || !result.blob) return null;

            // Persist audio blob to IDB
            await DB.saveVoiceAudio(msgId, result.blob);

            const duration = await getAudioDuration(result.blob, ttsConfig.audioSetting?.bitrate);

            // Clean up MiniMax's own ObjectURL (we manage our own)
            if (result.url) MinimaxTts.revokeUrl(result.url);

            return { duration };
        } catch (err) {
            console.error('[VoiceTts] Synthesis failed for msgId:', msgId, err);
            throw err;  // Let caller handle the error with actual message
        } finally {
            setLoadingMsgIds(prev => {
                const next = new Set(prev);
                next.delete(msgId);
                return next;
            });
        }
    }, []);

    return {
        playingMsgId,
        loadingMsgIds,
        playVoice,
        stopVoice,
        synthesizeForMessage,
    };
}
