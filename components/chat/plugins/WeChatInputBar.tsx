
import React, { useRef, useEffect } from 'react';

// ===== WeChat 1:1 Pixel-Perfect Inline SVG Icons =====

const WxIconVoice = ({ className = 'w-[28px] h-[28px]' }: { className?: string }) => (
    <svg viewBox="0 0 100 100" className={className}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#2A2A2A" strokeWidth="6" />
        <g transform="translate(0, 6) scale(0.85)">
            <path d="M 33 50 L 40 42 A 12 12 0 0 1 40 58 Z" fill="#2A2A2A" />
            <path d="M 54 36 A 20 20 0 0 1 54 64" fill="none" stroke="#2A2A2A" strokeWidth="6" strokeLinecap="round" />
            <path d="M 69 24 A 36 36 0 0 1 69 76" fill="none" stroke="#2A2A2A" strokeWidth="6" strokeLinecap="round" />
        </g>
    </svg>
);

const WxIconEmoji = ({ className = 'w-[28px] h-[28px]' }: { className?: string }) => (
    <svg viewBox="-35 -35 528.71 528.71" className={className}>
        <g fill="#2A2A2A" stroke="#f7f7f7" strokeWidth="12" strokeLinejoin="round">
            <path d="M229.355,0C102.922,0,0,102.922,0,229.355S102.922,458.71,229.355,458.71 S458.71,355.788,458.71,229.355S355.788,0,229.355,0z M229.355,427.363c-109.192,0-198.008-88.816-198.008-198.008 S120.163,31.347,229.355,31.347s198.008,88.816,198.008,198.008S338.547,427.363,229.355,427.363z" />
            <path d="M329.665,243.984h-200.62c-8.882,0-15.673,6.792-15.673,15.673 c0,63.739,52.245,115.984,115.984,115.984s115.984-52.245,115.984-115.984C345.339,250.775,338.547,243.984,329.665,243.984z M229.355,344.294c-41.273,0-75.755-29.78-83.069-68.963h166.139C305.11,314.514,270.629,344.294,229.355,344.294z" />
            <circle cx="309.29" cy="164.049" r="29.257" />
            <circle cx="149.42" cy="164.049" r="29.257" />
        </g>
    </svg>
);

const WxIconPlus = ({ className = 'w-[28px] h-[28px]' }: { className?: string }) => (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="#2A2A2A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="21" />
        <line x1="24" y1="13" x2="24" y2="35" />
        <line x1="13" y1="24" x2="35" y2="24" />
    </svg>
);

const WxIconMic = ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="#b2b2b2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="10" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
);

// ===== Props — mirrors a subset of ChatInputAreaProps =====
interface WeChatInputBarProps {
    input: string;
    setInput: (v: string) => void;
    showPanel: 'none' | 'actions' | 'emojis' | 'chars';
    setShowPanel: (v: 'none' | 'actions' | 'emojis' | 'chars') => void;
    onSend: () => void;
    // Voice Recording Support
    onVoiceMessage?: (blob: Blob, duration: number) => void;
    voiceRecorderState?: 'idle' | 'recording' | 'processing';
    voiceRecordingDuration?: number;
    onStartRecording?: () => Promise<boolean>;
    onStopRecording?: () => Promise<{ blob: Blob; duration: number } | null>;
    onCancelRecording?: () => void;
    voiceRecorderError?: string | null;
    isVoiceProcessing?: boolean;
}

/**
 * Pixel-perfect WeChat input bar — an isolated plugin component.
 * Contains its own auto-expand textarea logic and WeChat-specific SVG icons.
 */
const WeChatInputBar: React.FC<WeChatInputBarProps> = ({
    input, setInput, showPanel, setShowPanel, onSend,
    onVoiceMessage, voiceRecorderState = 'idle', voiceRecordingDuration = 0,
    onStartRecording, onStopRecording, onCancelRecording,
    voiceRecorderError, isVoiceProcessing = false
}) => {
    const wxTextareaRef = useRef<HTMLTextAreaElement>(null);

    // --- Voice Recording State ---
    const [isOverCancel, setIsOverCancel] = React.useState(false);
    const startYRef = React.useRef(0);
    const isRecordingRef = React.useRef(false);
    const CANCEL_THRESHOLD = 50;

    const formatDuration = (s: number) => {
        const min = Math.floor(s / 60);
        const sec = s % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    // --- Touch / Mouse handlers for press-hold recording ---
    const handlePointerDown = React.useCallback(async (e: React.TouchEvent | React.MouseEvent | React.PointerEvent) => {
        if (!onStartRecording || voiceRecorderState !== 'idle') return;

        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        startYRef.current = clientY;
        setIsOverCancel(false);

        const ok = await onStartRecording();
        if (ok) {
            isRecordingRef.current = true;
        }
    }, [voiceRecorderState, onStartRecording]);

    const handlePointerMove = React.useCallback((e: React.TouchEvent | React.MouseEvent | React.PointerEvent) => {
        if (!isRecordingRef.current) return;

        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        const dy = startYRef.current - clientY; // positive = moved up
        setIsOverCancel(dy > CANCEL_THRESHOLD);
    }, []);

    const handlePointerUp = React.useCallback(async () => {
        if (!isRecordingRef.current) return;
        isRecordingRef.current = false;

        if (isOverCancel) {
            onCancelRecording?.();
            setIsOverCancel(false);
            return;
        }

        const result = await onStopRecording?.();
        if (result && result.blob.size > 0 && result.duration >= 1) {
            onVoiceMessage?.(result.blob, result.duration);
        }
        setIsOverCancel(false);
    }, [isOverCancel, onCancelRecording, onStopRecording, onVoiceMessage]);

    const isRecording = voiceRecorderState === 'recording';
    const showOverlay = isRecording;

    // Auto-expand textarea height (up to ~5 lines = 120px)
    useEffect(() => {
        const el = wxTextareaRef.current;
        if (!el) return;
        el.style.height = '0px'; // Reset to measure natural scrollHeight
        const scrollH = el.scrollHeight;
        el.style.height = Math.min(scrollH, 120) + 'px';
    }, [input]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: '56px',
                padding: '8px 6px',
                gap: '4px',
                background: '#f7f7f7',
                borderTop: '0.5px solid rgba(0,0,0,0.12)',
                transition: 'min-height 0.15s ease',
            }}
        >
            {/* Voice Button */}
            <button
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={() => { if (isRecordingRef.current) handlePointerUp(); }}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isVoiceProcessing}
                style={{
                    width: '36px', height: '36px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, background: isRecording ? '#e5e5e5' : 'transparent', border: 'none',
                    borderRadius: '50%',
                    padding: 0, cursor: 'pointer',
                    opacity: isVoiceProcessing ? 0.5 : 1,
                    transition: 'background 0.2s'
                }}
                title={voiceRecorderError || '按住说话'}
            >
                {isVoiceProcessing ? (
                    <div className="w-5 h-5 border-2 border-[#2A2A2A]/30 border-t-[#2A2A2A] rounded-full animate-spin" />
                ) : (
                    <WxIconVoice className="w-[27px] h-[27px]" />
                )}
            </button>

            {/* Input Field */}
            <div
                style={{
                    flex: 1, minWidth: 0, minHeight: '38px',
                    background: '#ffffff', borderRadius: '6px',
                    border: '0.5px solid rgba(0,0,0,0.08)',
                    display: 'flex', alignItems: 'flex-end',
                    padding: '7px 10px',
                }}
            >
                <textarea
                    ref={wxTextareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    style={{
                        flex: 1, minWidth: 0, background: 'transparent',
                        fontSize: '16px', color: '#333333',
                        border: 'none', outline: 'none', resize: 'none',
                        minHeight: '24px', maxHeight: '120px',
                        lineHeight: '24px',
                        padding: 0, margin: 0,
                        overflowY: 'auto',
                    }}
                    className="no-scrollbar"
                    placeholder=""
                />
                {/* Microphone icon inside input field (right side) */}
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '6px', flexShrink: 0 }}>
                    <WxIconMic className="w-[18px] h-[18px]" />
                </div>
            </div>

            {/* Emoji Button */}
            <button
                onClick={() => setShowPanel(showPanel === 'emojis' ? 'none' : 'emojis')}
                style={{
                    width: '36px', height: '36px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none',
                    padding: 0, cursor: 'pointer', flexShrink: 0,
                }}
            >
                <WxIconEmoji className="w-[27px] h-[27px]" />
            </button>

            {/* Plus / Send Toggle */}
            {input.trim() ? (
                <button
                    onClick={onSend}
                    style={{
                        height: '36px', flexShrink: 0,
                        padding: '0 14px',
                        background: '#07c160', borderRadius: '5px',
                        color: '#ffffff', fontSize: '15px', fontWeight: 500,
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'opacity 0.15s',
                    }}
                >
                    发送
                </button>
            ) : (
                <button
                    onClick={() => setShowPanel(showPanel === 'actions' ? 'none' : 'actions')}
                    style={{
                        width: '36px', height: '36px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none',
                        padding: 0, cursor: 'pointer', flexShrink: 0,
                    }}
                >
                    <WxIconPlus className="w-[27px] h-[27px]" />
                </button>
            )}

            {/* Recording Overlay */}
            {showOverlay && (
                <div
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center pb-32 pointer-events-none"
                    style={{ background: 'transparent' }}
                >
                    {/* Transparent touch catcher for gestures — pointer events on */}
                    <div
                        className="absolute inset-0 pointer-events-auto"
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                        onMouseMove={handlePointerMove}
                        onMouseUp={handlePointerUp}
                        style={{ touchAction: 'none' }}
                    />

                    {/* Recording indicator card (WeChat style) */}
                    <div className={`relative pointer-events-none w-[150px] h-[150px] flex flex-col items-center justify-center rounded-2xl transition-all duration-200 ${isOverCancel
                            ? 'bg-red-500/90'
                            : 'bg-black/60 backdrop-blur-md'
                        }`}>
                        {/* Waveform animation */}
                        <div className="flex items-center justify-center gap-1.5 h-12 mb-2">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-[4px] rounded-full bg-white transition-all"
                                    style={{
                                        height: `${12 + Math.sin(Date.now() / 200 + i * 1.2) * 16}px`,
                                        animation: isOverCancel ? 'none' : `voice-wave ${0.4 + i * 0.1}s ease-in-out infinite alternate`,
                                    }}
                                />
                            ))}
                        </div>

                        {/* Cancel hint */}
                        <div className={`text-center text-sm font-medium mt-2 px-3 py-1 rounded-md transition-colors ${isOverCancel ? 'bg-red-600/50 text-white' : 'text-white/80'
                            }`}>
                            {isOverCancel ? '松开手指，取消发送' : '手指上滑，取消发送'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WeChatInputBar;
