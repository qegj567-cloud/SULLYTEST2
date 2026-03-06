/**
 * whisperStt.ts — 本地 Whisper 语音识别引擎 (STT)
 *
 * 使用 @huggingface/transformers 在浏览器端运行 Whisper 模型。
 * 所有依赖通过 dynamic import() 加载，不影响主包体积。
 * 如果加载失败，不影响项目其他功能。
 */

// --------------- Types ---------------

export type WhisperModelSize = 'tiny' | 'base';

export interface TranscribeResult {
    text: string;
    language?: string;
}

export interface ModelLoadProgress {
    status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
    /** File currently being downloaded */
    file?: string;
    /** Progress 0-100 for current file */
    progress?: number;
    /** Total bytes loaded */
    loaded?: number;
    /** Total bytes expected */
    total?: number;
}

// --------------- Constants ---------------

const MODEL_MAP: Record<WhisperModelSize, string> = {
    tiny: 'onnx-community/whisper-tiny',
    base: 'onnx-community/whisper-base',
};

/** Target sample rate required by Whisper */
const WHISPER_SAMPLE_RATE = 16000;

// --------------- Singleton State ---------------

let pipeline: any = null;
let currentModelSize: WhisperModelSize | null = null;
let isLoading = false;

// --------------- Audio Resampling ---------------

/**
 * Convert an audio Blob to a 16 kHz mono Float32Array.
 * Uses OfflineAudioContext for accurate resampling.
 */
async function audioBlobToFloat32(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer();

    // Use standard AudioContext to decode, then OfflineAudioContext to resample
    const audioCtx = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });

    try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        // If already at target sample rate, extract directly
        if (audioBuffer.sampleRate === WHISPER_SAMPLE_RATE) {
            return audioBuffer.getChannelData(0); // mono — channel 0
        }

        // Resample via OfflineAudioContext
        const numSamples = Math.ceil(audioBuffer.duration * WHISPER_SAMPLE_RATE);
        const offlineCtx = new OfflineAudioContext(1, numSamples, WHISPER_SAMPLE_RATE);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        const resampledBuffer = await offlineCtx.startRendering();
        return resampledBuffer.getChannelData(0);
    } finally {
        await audioCtx.close();
    }
}

// --------------- Public API ---------------

export const WhisperStt = {
    /**
     * Load the Whisper model into memory.
     * First call will download the model (~40-75 MB), subsequent calls use browser cache.
     */
    async loadModel(
        modelSize: WhisperModelSize = 'tiny',
        onProgress?: (progress: ModelLoadProgress) => void
    ): Promise<void> {
        // Already loaded with same size
        if (pipeline && currentModelSize === modelSize) return;

        // Already loading
        if (isLoading) return;

        isLoading = true;
        try {
            // Dynamic import — only loads when called
            const { pipeline: createPipeline } = await import(
                /* @vite-ignore */
                '@huggingface/transformers'
            );

            const modelId = MODEL_MAP[modelSize];
            console.log(`🎤 [Whisper] Loading model: ${modelId}`);

            pipeline = await createPipeline(
                'automatic-speech-recognition',
                modelId,
                {
                    dtype: 'q8',  // quantized for speed
                    device: 'wasm', // WASM for max compatibility; can try 'webgpu' later
                    progress_callback: (event: any) => {
                        if (onProgress && event) {
                            onProgress({
                                status: event.status || 'progress',
                                file: event.file,
                                progress: event.progress,
                                loaded: event.loaded,
                                total: event.total,
                            });
                        }
                    },
                }
            );

            currentModelSize = modelSize;
            console.log(`🎤 [Whisper] Model loaded successfully: ${modelId}`);
            onProgress?.({ status: 'ready' });
        } catch (error) {
            console.error('🎤 [Whisper] Failed to load model:', error);
            pipeline = null;
            currentModelSize = null;
            throw error;
        } finally {
            isLoading = false;
        }
    },

    /**
     * Transcribe an audio Blob to text.
     * Will auto-load the model if not already loaded.
     */
    async transcribe(
        audioBlob: Blob,
        modelSize: WhisperModelSize = 'tiny',
        onProgress?: (progress: ModelLoadProgress) => void
    ): Promise<TranscribeResult> {
        // Ensure model is loaded
        if (!pipeline) {
            await WhisperStt.loadModel(modelSize, onProgress);
        }

        if (!pipeline) {
            throw new Error('Whisper 模型加载失败');
        }

        // Convert audio to 16 kHz Float32Array
        const audioData = await audioBlobToFloat32(audioBlob);

        console.log(`🎤 [Whisper] Transcribing ${audioData.length} samples (${(audioData.length / WHISPER_SAMPLE_RATE).toFixed(1)}s)`);

        // Run inference
        const result = await pipeline(audioData, {
            language: 'chinese',
            task: 'transcribe',
            chunk_length_s: 30,
            return_timestamps: false,
        });

        const text = (result?.text || '').trim();
        console.log(`🎤 [Whisper] Transcription result: "${text}"`);

        return { text, language: 'zh' };
    },

    /** Check if a model is currently loaded */
    isModelLoaded(): boolean {
        return pipeline !== null;
    },

    /** Get the currently loaded model size */
    getLoadedModelSize(): WhisperModelSize | null {
        return currentModelSize;
    },

    /** Check if model is currently being loaded */
    isModelLoading(): boolean {
        return isLoading;
    },

    /** Release model from memory */
    async unloadModel(): Promise<void> {
        if (pipeline) {
            try {
                // Some pipelines have dispose method
                if (typeof pipeline.dispose === 'function') {
                    await pipeline.dispose();
                }
            } catch (e) {
                console.warn('🎤 [Whisper] Error disposing pipeline:', e);
            }
            pipeline = null;
            currentModelSize = null;
            console.log('🎤 [Whisper] Model unloaded');
        }
    },
};
