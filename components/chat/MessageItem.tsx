


import React, { useRef } from 'react';
import { Message, ChatTheme } from '../../types';
import { haptic } from '../../utils/haptics';
import { THEME_PLUGINS } from './ThemeRegistry';
import DefaultTransferCard from './plugins/DefaultTransferCard';
import { stripJunk } from '../../utils/markdownLite';
import XhsCard from './cards/XhsCard';
import SocialCard from './cards/SocialCard';
import SystemNoticeCard from './cards/SystemNoticeCard';
import PhoneEvidenceCard from './cards/PhoneEvidenceCard';
import RoomPlanCard from './cards/RoomPlanCard';
import RoomNoteCard from './cards/RoomNoteCard';
import FurnitureInteractionCard from './cards/FurnitureInteractionCard';
import ForwardCard from './cards/ForwardCard';
import WeChatMomentsCard from './cards/WeChatMomentsCard';
import ChatBubble from './ChatBubble';
import InteractionPill from './InteractionPill';
import VoiceBubble from './VoiceBubble';

// --- Deduplicated Selection Checkbox ---
const SelectionCheckbox: React.FC<{ isSelected: boolean; onToggle: () => void }> = ({ isSelected, onToggle }) => (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer z-20" onClick={onToggle}>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 bg-white/80'}`}>
            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
        </div>
    </div>
);

/** Format timestamp in WeChat style: today → "上午 10:30", this year → "3月4日 上午 10:30", other → with year */
const formatWeChatTime = (ts: number): string => {
    const now = new Date();
    const d = new Date(ts);
    const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (d.toDateString() === now.toDateString()) return timeStr;
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
};

interface MessageItemProps {
    msg: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    activeTheme: ChatTheme;
    charAvatar: string;
    charName: string;
    userAvatar: string;
    onLongPress: (m: Message) => void;
    selectionMode: boolean;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
    // Translation (AI messages only, bilingual content parsed from %%BILINGUAL%%)
    translationEnabled?: boolean;
    isShowingTarget?: boolean;
    onTranslateToggle?: (msgId: number) => void;
    // Transfer card actions
    onTransferAction?: (msg: Message) => void;
    // Timestamp separator (computed by parent Chat.tsx)
    showTimestamp?: boolean;
    timestampValue?: number;
    // Voice playback
    onPlayVoice?: (msgId: number) => void;
    onStopVoice?: () => void;
    onRetryVoice?: (msgId: number) => void;
    playingMsgId?: number | null;
    loadingMsgIds?: Set<number>;
}

const MessageItem = React.memo(({
    msg: m,
    isFirstInGroup,
    isLastInGroup,
    activeTheme,
    charAvatar,
    charName,
    userAvatar,
    onLongPress,
    selectionMode,
    isSelected,
    onToggleSelect,
    translationEnabled,
    isShowingTarget,
    onTranslateToggle,
    onTransferAction,
    showTimestamp,
    timestampValue,
    onPlayVoice,
    onStopVoice,
    onRetryVoice,
    playingMsgId,
    loadingMsgIds,
}: MessageItemProps) => {
    const isUser = m.role === 'user';
    const isSystem = m.role === 'system';
    const marginBottom = isLastInGroup ? 'mb-4' : 'mb-2';
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 }); // Track touch start position

    const styleConfig = isUser ? activeTheme.user : activeTheme.ai;

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        // Record initial position
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            if (!selectionMode) {
                haptic.heavy();
                onLongPress(m);
            }
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    // New handler to cancel long press if user drags/scrolls
    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const diffX = Math.abs(clientX - startPos.current.x);
        const diffY = Math.abs(clientY - startPos.current.y);

        // If moved more than 10px, assume scrolling and cancel long press
        if (diffX > 10 || diffY > 10) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (selectionMode) {
            e.stopPropagation();
            e.preventDefault();
            onToggleSelect(m.id);
        }
    };

    const interactionProps = {
        onMouseDown: handleTouchStart,
        onMouseUp: handleTouchEnd,
        onMouseLeave: handleTouchEnd,
        onMouseMove: handleMove,
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd,
        onTouchMove: handleMove,
        onTouchCancel: handleTouchEnd, // Handle system interruptions
        onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            if (!selectionMode) onLongPress(m);
        },
        onClick: handleClick
    };

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    // Reusable timestamp separator element (only rendered when showTimestamp is true)
    const timestampSeparator = showTimestamp && timestampValue ? (
        <div className="sully-msg-timestamp flex justify-center w-full py-2">
            <span className="text-[11px] text-gray-400">{formatWeChatTime(timestampValue)}</span>
        </div>
    ) : null;

    const renderAvatar = (src: string) => (
        <div className="relative w-9 h-9 shrink-0 z-0">
            <img
                src={src}
                className="w-full h-full rounded-[4px] object-cover bg-slate-200 pointer-events-none select-none"
                alt="avatar"
                loading="lazy"
                decoding="async"
            />
            {styleConfig.avatarDecoration && (
                <img
                    src={styleConfig.avatarDecoration}
                    className="absolute pointer-events-none z-10 max-w-none"
                    style={{
                        left: `${styleConfig.avatarDecorationX ?? 50}%`,
                        top: `${styleConfig.avatarDecorationY ?? 50}%`,
                        width: `${36 * (styleConfig.avatarDecorationScale ?? 1)}px`, // Base size 36px (w-9)
                        height: 'auto',
                        transform: `translate(-50%, -50%) rotate(${styleConfig.avatarDecorationRotate ?? 0}deg)`,
                    }}
                />
            )}
        </div>
    );

    // --- SYSTEM MESSAGE RENDERING ---
    if (isSystem) {
        // Clean up text: remove [System:] or [系统:] prefix for display
        const displayText = m.content.replace(/^\[(System|系统|System Log|系统记录)\s*[:：]?\s*/i, '').replace(/\]$/, '').trim();

        // Route to structured card if metadata.source is available
        // Priority: PhoneEvidenceCard > RoomPlanCard (todo) > RoomNoteCard (notebook) > SystemNoticeCard > Legacy pill
        let noticeCard: React.ReactNode = null;
        if (m.metadata?.source === 'phone' && m.metadata?.phoneTitle) {
            // Phone evidence with structured data → render as app-simulation card
            noticeCard = <PhoneEvidenceCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'todo') {
            // Room daily plan → collage journal style card
            noticeCard = <RoomPlanCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'notebook') {
            // Room private notebook → intimate note card
            noticeCard = <RoomNoteCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'item_interaction') {
            // Room furniture touch → Morandi glassmorphism feedback card
            noticeCard = <FurnitureInteractionCard message={m} />;
        } else if (m.metadata?.source) {
            // Other tagged sources (room item_interaction, schedule, bank) → styled notice card
            noticeCard = <SystemNoticeCard message={m} displayText={displayText} />;
        }

        return (
            <>
                {timestampSeparator}
                <div className={`flex flex-col items-center w-full ${selectionMode ? 'pl-8' : ''} animate-fade-in relative transition-[padding] duration-300`}>
                    {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}
                    {!showTimestamp && <div className="text-[10px] text-slate-400 mt-4 mb-0.5 opacity-70">{formatTime(m.timestamp)}</div>}
                    <div className="flex justify-center mb-4 px-10 w-full" {...interactionProps}>
                        {noticeCard || (
                            /* Fallback: Legacy grey pill for untagged system messages */
                            <div className="sully-system-pill flex items-center gap-1.5 bg-slate-200/40 backdrop-blur-md text-slate-500 px-3 py-1 rounded-full shadow-sm border border-white/20 select-none cursor-pointer active:scale-95 transition-transform">
                                {displayText.includes('任务') ? '✨' :
                                    displayText.includes('纪念日') || displayText.includes('Event') ? '📅' :
                                        displayText.includes('转账') ? '💰' : '🔔'}
                                <span className="text-[10px] font-medium tracking-wide">{displayText}</span>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }

    if (m.type === 'interaction') {
        return (
            <>
                {timestampSeparator}
                <div className={`flex flex-col items-center ${marginBottom} w-full animate-fade-in relative transition-[padding] duration-300 ${selectionMode ? 'pl-8' : ''}`}>
                    {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}
                    {!showTimestamp && <div className="text-[10px] text-slate-400 mb-1 opacity-70">{formatTime(m.timestamp)}</div>}
                    <div {...interactionProps}>
                        <InteractionPill isUser={isUser} charName={charName} />
                    </div>
                </div>
            </>
        );
    }

    const commonLayout = (content: React.ReactNode) => (
        <>
            {timestampSeparator}
            <div className={`flex items-start ${isUser ? 'justify-end' : 'justify-start'} ${marginBottom} px-3 group select-none relative transition-[padding] duration-300 ${selectionMode ? (isUser ? 'pr-14' : 'pl-14') : ''}`}>
                {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}

                {/* Avatar for AI */}
                {!isUser && renderAvatar(charAvatar)}

                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[70%] min-w-0 mx-2.5`} {...interactionProps}>
                    <div className={`${selectionMode ? 'pointer-events-none' : ''} relative w-full`}>
                        {content}
                    </div>
                </div>

                {/* Avatar for User */}
                {isUser && renderAvatar(userAvatar)}
            </div>
        </>
    );

    // [New] Social Card Rendering
    // --- Chat Forward Card ---
    if (m.type === 'chat_forward') {
        let forwardData: any = null;
        try { forwardData = JSON.parse(m.content); } catch { }
        if (forwardData) {
            return <ForwardCard forwardData={forwardData} commonLayout={commonLayout} interactionProps={interactionProps} selectionMode={selectionMode} />;
        }
    }

    // --- XHS Card Rendering (小红书笔记卡片) ---
    if (m.type === 'xhs_card' && m.metadata?.xhsNote) {
        return commonLayout(
            <XhsCard note={m.metadata.xhsNote} isUser={isUser} />
        );
    }

    // --- WeChat Moments Card (朋友圈动态卡片) ---
    if (m.type === 'moments' && m.metadata?.moments) {
        return commonLayout(
            <WeChatMomentsCard data={m.metadata.moments} />
        );
    }

    if (m.type === 'social_card' && m.metadata?.post) {
        return commonLayout(
            <SocialCard post={m.metadata.post} />
        );
    }

    if (m.type === 'transfer') {
        const CustomTransferCard = THEME_PLUGINS[activeTheme.id]?.TransferCard as any;

        if (CustomTransferCard) {
            return commonLayout(
                <CustomTransferCard
                    message={m}
                    isUser={isUser}
                    charName={charName}
                    selectionMode={selectionMode}
                    onTransferAction={onTransferAction}
                />
            );
        }

        // Fallback to the neutral default card
        return commonLayout(
            <DefaultTransferCard
                message={m}
                isUser={isUser}
                charName={charName}
                selectionMode={selectionMode}
                onTransferAction={onTransferAction}
            />
        );
    }

    if (m.type === 'emoji') {
        return commonLayout(
            <img src={m.content} className="max-w-[160px] max-h-[160px] hover:scale-105 transition-transform drop-shadow-md active:scale-95" loading="lazy" decoding="async" />
        );
    }

    if (m.type === 'image') {
        return commonLayout(
            <div className="relative group">
                <img src={m.content} className="sully-image-msg max-w-[200px] max-h-[300px] rounded-2xl shadow-sm border border-black/5" alt="Uploaded" loading="lazy" decoding="async" />
            </div>
        );
    }

    // --- Voice Message Rendering ---
    if (m.type === 'voice') {
        const isVoiceLoading = !!loadingMsgIds?.has(m.id);
        const hasAudio = !!m.metadata?.hasAudio;
        return commonLayout(
            <VoiceBubble
                duration={m.metadata?.duration ?? 0}
                isPlaying={playingMsgId === m.id}
                isLoading={isVoiceLoading}
                hasFailed={!hasAudio && !isVoiceLoading}
                isUser={isUser}
                onPlay={() => onPlayVoice?.(m.id)}
                onStop={() => onStopVoice?.()}
                onRetry={() => onRetryVoice?.(m.id)}
                styleConfig={styleConfig}
            />
        );
    }

    // --- Bilingual content parsing ---
    const rawContent = m.content;
    const bilingualIdx = rawContent.toLowerCase().indexOf('%%bilingual%%');
    const hasBilingual = bilingualIdx !== -1;
    const langAContent = hasBilingual ? stripJunk(rawContent.substring(0, bilingualIdx)) : stripJunk(rawContent);
    const langBContent = hasBilingual ? stripJunk(rawContent.substring(bilingualIdx + '%%BILINGUAL%%'.length)) : '';
    const displayContent = (isShowingTarget && langBContent) ? langBContent : langAContent;
    const showTranslateButton = translationEnabled && hasBilingual && !!langBContent;

    // Don't render empty bubbles
    if (!displayContent && m.type === 'text') return null;

    return commonLayout(
        <ChatBubble
            isUser={isUser}
            styleConfig={styleConfig}
            displayContent={displayContent}
            replyTo={m.replyTo}
            showTranslateButton={showTranslateButton}
            isShowingTarget={isShowingTarget}
            onTranslateToggle={() => onTranslateToggle?.(m.id)}
        />
    );
}, (prev: MessageItemProps, next: MessageItemProps) => {
    return prev.msg.id === next.msg.id &&
        prev.msg.content === next.msg.content &&
        prev.msg.metadata?.status === next.msg.metadata?.status &&
        prev.isFirstInGroup === next.isFirstInGroup &&
        prev.isLastInGroup === next.isLastInGroup &&
        prev.activeTheme === next.activeTheme &&
        prev.selectionMode === next.selectionMode &&
        prev.isSelected === next.isSelected &&
        prev.translationEnabled === next.translationEnabled &&
        prev.isShowingTarget === next.isShowingTarget &&
        prev.showTimestamp === next.showTimestamp &&
        prev.playingMsgId === next.playingMsgId &&
        prev.loadingMsgIds?.size === next.loadingMsgIds?.size &&
        !!prev.loadingMsgIds?.has(prev.msg.id) === !!next.loadingMsgIds?.has(next.msg.id);
});

export default MessageItem;