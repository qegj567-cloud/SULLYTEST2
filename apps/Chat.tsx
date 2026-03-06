import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { Message, MessageType, MemoryFragment, Emoji, EmojiCategory, AppID } from '../types';
import { processImage } from '../utils/file';
import { safeResponseJson } from '../utils/safeApi';
import { XhsMcpClient, extractNotesFromMcpData, normalizeNote } from '../utils/xhsMcpClient';
import MessageItem from '../components/chat/MessageItem';
import { PRESET_THEMES } from '../components/chat/ChatConstants';
import { DEFAULT_ARCHIVE_PROMPTS } from '../constants/archivePrompts';
import ChatHeader from '../components/chat/ChatHeader';
import ChatInputArea from '../components/chat/ChatInputArea';
import ChatModals from '../components/chat/ChatModals';
import Modal from '../components/os/Modal';
import { useChatAI } from '../hooks/useChatAI';
import { useVoiceTts } from '../hooks/useVoiceTts';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { WhisperStt } from '../utils/whisperStt';
import { haptic } from '../utils/haptics';

const Chat: React.FC = () => {
    const { characters, activeCharacterId, setActiveCharacterId, updateCharacter, apiConfig, closeApp, openApp, customThemes, removeCustomTheme, addToast, userProfile, lastMsgTimestamp, groups, clearUnread, realtimeConfig, ttsConfig } = useOS();
    const [messages, setMessages] = useState<Message[]>([]);
    const [totalMsgCount, setTotalMsgCount] = useState(0);
    const [visibleCount, setVisibleCount] = useState(30);
    const [input, setInput] = useState('');
    const [showPanel, setShowPanel] = useState<'none' | 'actions' | 'emojis' | 'chars'>('none');

    // Emoji State
    const [emojis, setEmojis] = useState<Emoji[]>([]);
    const [categories, setCategories] = useState<EmojiCategory[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('default');
    const [newCategoryName, setNewCategoryName] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);
    const lastMsgIdRef = useRef<number | null>(null);
    const scrollThrottleRef = useRef(0);
    const visibleCountRef = useRef(30);
    const activeCharIdRef = useRef(activeCharacterId);

    // Reply Logic
    const [replyTarget, setReplyTarget] = useState<Message | null>(null);

    const [modalType, setModalType] = useState<'none' | 'transfer' | 'emoji-import' | 'chat-settings' | 'message-options' | 'edit-message' | 'delete-emoji' | 'delete-category' | 'add-category' | 'history-manager' | 'archive-settings' | 'prompt-editor' | 'category-options' | 'category-visibility'>('none');
    const [allHistoryMessages, setAllHistoryMessages] = useState<Message[]>([]);
    const [transferAmt, setTransferAmt] = useState('');
    const [emojiImportText, setEmojiImportText] = useState('');
    const [settingsContextLimit, setSettingsContextLimit] = useState(500);
    const [settingsHideSysLogs, setSettingsHideSysLogs] = useState(false);
    const [preserveContext, setPreserveContext] = useState(true);
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [selectedEmoji, setSelectedEmoji] = useState<Emoji | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<EmojiCategory | null>(null); // For deletion modal
    const [editContent, setEditContent] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [transferActionMsg, setTransferActionMsg] = useState<Message | null>(null);

    // Archive Prompts State
    const [archivePrompts, setArchivePrompts] = useState<{ id: string, name: string, content: string }[]>(DEFAULT_ARCHIVE_PROMPTS);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('preset_rational');
    const [editingPrompt, setEditingPrompt] = useState<{ id: string, name: string, content: string } | null>(null);

    // --- Multi-Select State ---
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());

    // --- Translation State (per-character toggle, global language settings) ---
    const [translationEnabled, setTranslationEnabled] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`chat_translate_enabled_${activeCharacterId}`) || 'false'); } catch { return false; }
    });
    const [translateSourceLang, setTranslateSourceLang] = useState(() => {
        return localStorage.getItem('chat_translate_source_lang') || '日本語';
    });
    const [translateTargetLang, setTranslateTargetLang] = useState(() => {
        return localStorage.getItem('chat_translate_lang') || '中文';
    });
    // Which messages are currently showing "译" version (toggle state only, no API calls)
    const [showingTargetIds, setShowingTargetIds] = useState<Set<number>>(new Set());

    // --- Timestamp State (per-character, theme can force-enable) ---
    const [showTimestampSetting, setShowTimestampSetting] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`chat_show_timestamp_${activeCharacterId}`) || 'false'); } catch { return false; }
    });

    // --- Voice TTS State ---
    const { playingMsgId, loadingMsgIds, playVoice, stopVoice, synthesizeForMessage } = useVoiceTts();
    const [autoTts, setAutoTts] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`chat_auto_tts_${activeCharacterId}`) || 'false'); } catch { return false; }
    });

    // --- Voice Recording (STT) ---
    const voiceRecorder = useVoiceRecorder();
    const [sttProcessing, setSttProcessing] = useState(false);
    const [transcribingMsgIds, setTranscribingMsgIds] = useState<Set<number>>(new Set());

    // 录音错误可视化 — 移动端 title 属性不显示，需要 toast
    useEffect(() => {
        if (voiceRecorder.error) {
            addToast(voiceRecorder.error, 'error');
        }
    }, [voiceRecorder.error]);

    const char = characters.find(c => c.id === activeCharacterId) || characters[0];
    const currentThemeId = char?.bubbleStyle || 'default';
    const activeTheme = useMemo(() => customThemes.find(t => t.id === currentThemeId) || PRESET_THEMES[currentThemeId] || PRESET_THEMES.default, [currentThemeId, customThemes]);

    // Timestamp: theme can force-enable (e.g. WeChat), otherwise per-character user setting
    const isTimestampForced = !!activeTheme.showTimestamp;
    const effectiveShowTimestamp = isTimestampForced || showTimestampSetting;
    const timestampInterval = activeTheme.timestampIntervalMs ?? 180000; // default 3 minutes

    const draftKey = `chat_draft_${activeCharacterId}`;

    // AI-visible categories: only those allowed for the active character (excludes __user__-only categories)
    const aiVisibleCategories = useMemo(() => categories.filter(cat => {
        if (!cat.allowedCharacterIds || cat.allowedCharacterIds.length === 0) return true;
        return cat.allowedCharacterIds.includes(activeCharacterId);
    }), [categories, activeCharacterId]);

    // User-visible categories: also includes categories marked with __user__
    const userVisibleCategories = useMemo(() => categories.filter(cat => {
        if (!cat.allowedCharacterIds || cat.allowedCharacterIds.length === 0) return true;
        return cat.allowedCharacterIds.includes(activeCharacterId) || cat.allowedCharacterIds.includes('__user__');
    }), [categories, activeCharacterId]);

    const aiVisibleEmojis = useMemo(() => {
        const hiddenIds = new Set(categories.filter(c => !aiVisibleCategories.some(vc => vc.id === c.id)).map(c => c.id));
        if (hiddenIds.size === 0) return emojis;
        return emojis.filter(e => !e.categoryId || !hiddenIds.has(e.categoryId));
    }, [emojis, categories, aiVisibleCategories]);

    // --- Initialize Hook ---
    const { isTyping, recallStatus, searchStatus, diaryStatus, lastTokenUsage, tokenBreakdown, setLastTokenUsage, triggerAI } = useChatAI({
        char,
        userProfile,
        apiConfig,
        groups,
        emojis: aiVisibleEmojis,
        categories: aiVisibleCategories,
        addToast,
        setMessages,
        realtimeConfig,
        translationConfig: translationEnabled
            ? { enabled: true, sourceLang: translateSourceLang, targetLang: translateTargetLang }
            : undefined,
        autoVoice: autoTts,
        onVoiceMessageSaved: autoTts && ttsConfig?.apiKey ? (msgId: number, text: string) => {
            // Fire-and-forget synthesis; reload from IDB when done to avoid stale closure
            synthesizeForMessage(msgId, text, ttsConfig).then(async (result) => {
                if (result) {
                    // Update IDB first, then reload messages from DB (safe even if state changed)
                    await DB.updateMessageMetadata(msgId, { duration: result.duration, hasAudio: true });
                    await reloadMessages(visibleCountRef.current);
                }
            }).catch(err => console.error('[AutoTTS] synthesis failed:', err));
        } : undefined,
    });

    const canReroll = !isTyping && messages.length > 0 && messages[messages.length - 1].role === 'assistant';

    // --- Translation: pure frontend toggle (no API calls, bilingual data is already in message content) ---
    const handleTranslateToggle = useCallback((msgId: number) => {
        setShowingTargetIds(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId);
            else next.add(msgId);
            return next;
        });
    }, []);

    const loadEmojiData = async () => {
        await DB.initializeEmojiData();
        const [es, cats] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
        setEmojis(es);
        setCategories(cats);
        if (activeCategory !== 'default' && !cats.some(c => c.id === activeCategory)) {
            setActiveCategory('default');
        }
    };

    // How many messages to load per batch (initial load + each "load more" click)
    const LOAD_BATCH_SIZE = 30;

    const reloadMessages = useCallback(async (requestedVisibleCount: number) => {
        if (!activeCharacterId) return;

        const charIdAtStart = activeCharacterId;
        const allMsgs = await DB.getMessagesByCharId(activeCharacterId);

        // Guard against stale async results: if the user switched characters
        // while the DB query was in flight, discard this result.
        if (activeCharIdRef.current !== charIdAtStart) return;

        const chatScopeMsgs = allMsgs
            .filter(m => m.metadata?.source !== 'date')
            .filter(m => !char?.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
            .filter(m => !(char?.hideSystemLogs && m.role === 'system'));

        setTotalMsgCount(chatScopeMsgs.length);
        setMessages(chatScopeMsgs.slice(-requestedVisibleCount));
    }, [activeCharacterId, char?.hideBeforeMessageId, char?.hideSystemLogs]);

    useEffect(() => {
        if (activeCharacterId) {
            // Update ref BEFORE any async work so stale reloadMessages calls
            // from a previous character can detect the switch and bail out.
            activeCharIdRef.current = activeCharacterId;

            reloadMessages(LOAD_BATCH_SIZE);
            loadEmojiData();
            const savedDraft = localStorage.getItem(draftKey);
            setInput(savedDraft || '');
            if (char) {
                setSettingsContextLimit(char.contextLimit || 500);
                setSettingsHideSysLogs(char.hideSystemLogs || false);
                clearUnread(char.id);
            }
            // Per-character translation toggle
            try {
                setTranslationEnabled(JSON.parse(localStorage.getItem(`chat_translate_enabled_${activeCharacterId}`) || 'false'));
            } catch { setTranslationEnabled(false); }
            setVisibleCount(30);
            visibleCountRef.current = 30;
            lastMsgIdRef.current = null;
            scrollThrottleRef.current = 0;
            setLastTokenUsage(null);
            setReplyTarget(null);
            setSelectionMode(false);
            setSelectedMsgIds(new Set());
            setShowingTargetIds(new Set());
            // Per-character timestamp toggle
            try {
                setShowTimestampSetting(JSON.parse(localStorage.getItem(`chat_show_timestamp_${activeCharacterId}`) || 'false'));
            } catch { setShowTimestampSetting(false); }
            // Per-character auto TTS toggle
            try {
                setAutoTts(JSON.parse(localStorage.getItem(`chat_auto_tts_${activeCharacterId}`) || 'false'));
            } catch { setAutoTts(false); }
        }
    }, [activeCharacterId, reloadMessages]);

    // Load all messages when history-manager modal opens
    useEffect(() => {
        if (modalType === 'history-manager' && activeCharacterId) {
            DB.getMessagesByCharId(activeCharacterId).then(allMsgs => {
                const filtered = allMsgs
                    .filter(m => m.metadata?.source !== 'date')
                    .filter(m => !(char?.hideSystemLogs && m.role === 'system'));
                setAllHistoryMessages(filtered);
            });
        }
    }, [modalType, activeCharacterId, char?.hideSystemLogs]);

    useEffect(() => {
        const savedPrompts = localStorage.getItem('chat_archive_prompts');
        if (savedPrompts) {
            try {
                const parsed = JSON.parse(savedPrompts);
                const merged = [...DEFAULT_ARCHIVE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('preset_'))];
                setArchivePrompts(merged);
            } catch (e) { }
        }
        const savedId = localStorage.getItem('chat_active_archive_prompt_id');
        if (savedId && archivePrompts.some(p => p.id === savedId)) setSelectedPromptId(savedId);
    }, []);

    useEffect(() => {
        if (activeCharacterId && lastMsgTimestamp > 0) {
            reloadMessages(visibleCountRef.current);
            clearUnread(activeCharacterId);
        }
    }, [lastMsgTimestamp, activeCharacterId, reloadMessages, clearUnread]);

    useEffect(() => {
        visibleCountRef.current = visibleCount;
    }, [visibleCount]);

    const handleInputChange = (val: string) => {
        setInput(val);
        if (val.trim()) localStorage.setItem(draftKey, val);
        else localStorage.removeItem(draftKey);
    };

    useLayoutEffect(() => {
        if (!scrollRef.current || selectionMode) return;
        const currentLastId = messages.length > 0 ? messages[messages.length - 1].id : null;
        // Only auto-scroll when a new message is appended (ID changes),
        // not when loading older history or updating existing messages in-place
        if (currentLastId !== lastMsgIdRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            lastMsgIdRef.current = currentLastId;
        }
    }, [messages, activeCharacterId, selectionMode]);

    useEffect(() => {
        if (isTyping && scrollRef.current && !selectionMode) {
            const now = Date.now();
            if (now - scrollThrottleRef.current > 150) {
                scrollThrottleRef.current = now;
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [messages, isTyping, recallStatus, searchStatus, diaryStatus, selectionMode]);

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    // --- Actions ---

    const handleSendText = async (customContent?: string, customType?: MessageType, metadata?: any) => {
        if (!char || (!input.trim() && !customContent)) return;
        const text = customContent || input.trim();
        const type = customType || 'text';

        if (!customContent) { setInput(''); localStorage.removeItem(draftKey); }

        if (type === 'image') {
            const recentChat = messages.slice(-10).map(m => {
                const sender = m.role === 'user' ? userProfile.name : char.name;
                return `${sender}: ${m.content.substring(0, 100)}`;
            });
            await DB.saveGalleryImage({
                id: `img-${Date.now()}-${Math.random()}`,
                charId: char.id,
                url: text,
                timestamp: Date.now(),
                savedDate: new Date().toISOString().split('T')[0],
                chatContext: recentChat
            });
            addToast('图片已保存至相册', 'info');
        }

        const msgPayload: any = { charId: char.id, role: 'user', type, content: text, metadata };

        if (replyTarget) {
            msgPayload.replyTo = {
                id: replyTarget.id,
                content: replyTarget.content,
                name: replyTarget.role === 'user' ? '我' : char.name
            };
            setReplyTarget(null);
        }

        await DB.saveMessage(msgPayload);
        haptic.medium();

        // Detect XHS link in user text and create xhs_card via MCP
        if (type === 'text') {
            const xhsUrlMatch = text.match(/xiaohongshu\.com\/(?:discovery\/item|explore)\/([a-f0-9]{24})/);
            const mcpUrl = realtimeConfig?.xhsMcpConfig?.serverUrl;
            if (xhsUrlMatch && mcpUrl && realtimeConfig?.xhsMcpConfig?.enabled) {
                const noteUrl = `https://www.xiaohongshu.com/explore/${xhsUrlMatch[1]}`;
                try {
                    const result = await XhsMcpClient.getNoteDetail(mcpUrl, noteUrl);
                    if (result.success && result.data) {
                        const note = normalizeNote(result.data);
                        await DB.saveMessage({
                            charId: char.id,
                            role: 'user',
                            type: 'xhs_card',
                            content: note.title || '小红书笔记',
                            metadata: { xhsNote: note }
                        });
                    }
                } catch (e) {
                    console.warn('XHS link fetch via MCP failed:', e);
                }
            }
        }

        await reloadMessages(visibleCountRef.current);
        setShowPanel('none');

        // Manual trigger only: Removed auto triggerAI call
    };

    const handleReroll = async () => {
        if (isTyping || messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant') return;

        const toDeleteIds: number[] = [];
        let index = messages.length - 1;
        while (index >= 0 && messages[index].role === 'assistant') {
            toDeleteIds.push(messages[index].id);
            index--;
        }

        if (toDeleteIds.length === 0) return;

        await DB.deleteMessages(toDeleteIds);
        const newHistory = messages.slice(0, index + 1);
        setMessages(newHistory);
        addToast('回溯对话中...', 'info');

        triggerAI(newHistory);
    };

    const handleImageSelect = async (file: File) => {
        try {
            const base64 = await processImage(file, { maxWidth: 600, quality: 0.6, forceJpeg: true });
            setShowPanel('none');
            await handleSendText(base64, 'image');
        } catch (err: any) {
            addToast(err.message || '图片处理失败', 'error');
        }
    };

    const handlePanelAction = (type: string, payload?: any) => {
        switch (type) {
            case 'transfer': setModalType('transfer'); break;
            case 'poke': handleSendText('[戳一戳]', 'interaction'); break;
            case 'archive': setModalType('archive-settings'); break;
            case 'settings': setModalType('chat-settings'); break;
            case 'emoji-import': setModalType('emoji-import'); break;
            case 'send-emoji': if (payload) handleSendText(payload.url, 'emoji'); break;
            case 'delete-emoji-req': setSelectedEmoji(payload); setModalType('delete-emoji'); break;
            case 'add-category': setModalType('add-category'); break;
            case 'select-category': setActiveCategory(payload); break;
            case 'category-options': setSelectedCategory(payload); setModalType('category-options'); break;
            case 'delete-category-req': setSelectedCategory(payload); setModalType('delete-category'); break;
            case 'edit-theme':
                if (payload) {
                    window.sessionStorage.setItem('themeMakerEditId', payload);
                    openApp(AppID.ThemeMaker);
                }
                break;
        }
    };

    // --- Modal Handlers ---

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
            addToast('请输入分类名称', 'error');
            return;
        }
        const newCat = { id: `cat-${Date.now()}`, name: newCategoryName.trim() };
        await DB.saveEmojiCategory(newCat);
        await loadEmojiData();
        setActiveCategory(newCat.id);
        setModalType('none');
        setNewCategoryName('');
        addToast('分类创建成功', 'success');
    };

    const handleImportEmoji = async () => {
        if (!emojiImportText.trim()) return;
        const lines = emojiImportText.split('\n');
        const targetCatId = activeCategory === 'default' ? undefined : activeCategory;

        for (const line of lines) {
            const parts = line.split('--');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const url = parts.slice(1).join('--').trim();
                if (name && url) {
                    await DB.saveEmoji(name, url, targetCatId);
                }
            }
        }
        await loadEmojiData();
        setModalType('none');
        setEmojiImportText('');
        addToast('表情包导入成功', 'success');
    };

    const handleDeleteCategory = async () => {
        if (!selectedCategory) return;
        await DB.deleteEmojiCategory(selectedCategory.id);
        await loadEmojiData();
        setActiveCategory('default');
        setModalType('none');
        setSelectedCategory(null);
        addToast('分类及包含表情已删除', 'success');
    };

    const handleSaveCategoryVisibility = async (categoryId: string, allowedCharacterIds: string[] | undefined) => {
        const cat = categories.find(c => c.id === categoryId);
        if (!cat) return;
        await DB.saveEmojiCategory({ ...cat, allowedCharacterIds });
        await loadEmojiData();
        setSelectedCategory(null);
        const userCount = allowedCharacterIds?.filter(id => id !== '__user__').length ?? 0;
        const includesUser = allowedCharacterIds?.includes('__user__');
        const label = !allowedCharacterIds ? '已设为所有人可见' : includesUser && userCount === 0 ? '已设为仅用户可见' : `已设置 ${(includesUser ? userCount + 1 : userCount)} 个可见`;
        addToast(label, 'success');
    };

    const handleSavePrompt = () => {
        if (!editingPrompt || !editingPrompt.name.trim() || !editingPrompt.content.trim()) {
            addToast('请填写完整', 'error');
            return;
        }
        setArchivePrompts(prev => {
            let next;
            if (prev.some(p => p.id === editingPrompt.id)) {
                next = prev.map(p => p.id === editingPrompt.id ? editingPrompt : p);
            } else {
                next = [...prev, editingPrompt];
            }
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        setSelectedPromptId(editingPrompt.id);
        setModalType('archive-settings');
        setEditingPrompt(null);
    };

    const handleDeletePrompt = (id: string) => {
        if (id.startsWith('preset_')) {
            addToast('默认预设不可删除', 'error');
            return;
        }
        setArchivePrompts(prev => {
            const next = prev.filter(p => p.id !== id);
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        if (selectedPromptId === id) setSelectedPromptId('preset_rational');
        addToast('预设已删除', 'success');
    };

    const createNewPrompt = () => {
        setEditingPrompt({ id: `custom_${Date.now()}`, name: '新预设', content: DEFAULT_ARCHIVE_PROMPTS[0].content });
        setModalType('prompt-editor');
    };

    const editSelectedPrompt = () => {
        const p = archivePrompts.find(a => a.id === selectedPromptId);
        if (!p) return;
        if (p.id.startsWith('preset_')) {
            setEditingPrompt({ id: `custom_${Date.now()}`, name: `${p.name} (Copy)`, content: p.content });
        } else {
            setEditingPrompt({ ...p });
        }
        setModalType('prompt-editor');
    };

    const handleBgUpload = async (file: File) => {
        try {
            const dataUrl = await processImage(file, { skipCompression: true });
            updateCharacter(char.id, { chatBackground: dataUrl });
            addToast('聊天背景已更新', 'success');
        } catch (err: any) {
            addToast(err.message, 'error');
        }
    };

    const saveSettings = () => {
        updateCharacter(char.id, {
            contextLimit: settingsContextLimit,
            hideSystemLogs: settingsHideSysLogs
        });
        setModalType('none');
        addToast('设置已保存', 'success');
    };

    const handleClearHistory = async () => {
        if (!char) return;
        if (preserveContext) {
            const allMessages = await DB.getMessagesByCharId(char.id);
            const toKeep = allMessages.slice(-10);
            const toKeepIds = new Set(toKeep.map(m => m.id));
            const toDelete = allMessages.filter(m => !toKeepIds.has(m.id));
            if (toDelete.length === 0) {
                addToast('消息太少，无需清理', 'info');
                return;
            }
            await DB.deleteMessages(toDelete.map(m => m.id));
            setMessages(toKeep);
            setTotalMsgCount(toKeep.length);
            setVisibleCount(LOAD_BATCH_SIZE);
            visibleCountRef.current = LOAD_BATCH_SIZE;
            addToast(`已清理 ${toDelete.length} 条历史，保留最近10条`, 'success');
        } else {
            await DB.clearMessages(char.id);
            setMessages([]);
            setTotalMsgCount(0);
            setVisibleCount(LOAD_BATCH_SIZE);
            visibleCountRef.current = LOAD_BATCH_SIZE;
            addToast('已清空', 'success');
        }
        setModalType('none');
    };

    const handleSetHistoryStart = (messageId: number | undefined) => {
        updateCharacter(char.id, { hideBeforeMessageId: messageId });
        setModalType('none');
        addToast(messageId ? '已隐藏历史消息' : '已恢复全部历史记录', 'success');
    };

    const handleFullArchive = async () => {
        if (!apiConfig.apiKey || !char) {
            addToast('请先配置 API Key', 'error');
            return;
        }
        const allMessages = await DB.getMessagesByCharId(char.id);
        const msgsByDate: Record<string, Message[]> = {};
        allMessages
            .filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
            .forEach(m => {
                const d = new Date(m.timestamp);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (!msgsByDate[dateStr]) msgsByDate[dateStr] = [];
                msgsByDate[dateStr].push(m);
            });

        const datesToProcess = Object.keys(msgsByDate).sort();
        if (datesToProcess.length === 0) {
            addToast('聊天记录为空，无法归档', 'info');
            return;
        }

        setIsSummarizing(true);
        setShowPanel('none');
        setModalType('none');

        try {
            let processedCount = 0;
            const newMemories: MemoryFragment[] = [];
            const templateObj = archivePrompts.find(p => p.id === selectedPromptId) || DEFAULT_ARCHIVE_PROMPTS[0];
            const template = templateObj.content;

            for (const dateStr of datesToProcess) {
                const dayMsgs = msgsByDate[dateStr];
                const rawLog = dayMsgs.map(m => `[${formatTime(m.timestamp)}] ${m.role === 'user' ? userProfile.name : char.name}: ${m.type === 'image' ? '[Image]' : m.content}`).join('\n');

                let prompt = template;
                prompt = prompt.replace(/\$\{dateStr\}/g, dateStr);
                prompt = prompt.replace(/\$\{char\.name\}/g, char.name);
                prompt = prompt.replace(/\$\{userProfile\.name\}/g, userProfile.name);
                prompt = prompt.replace(/\$\{rawLog.*?\}/g, rawLog.substring(0, 200000));

                const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.5,
                        max_tokens: 8000
                    })
                });

                if (!response.ok) throw new Error(`API Error on ${dateStr}`);
                const data = await safeResponseJson(response);
                let summary = data.choices?.[0]?.message?.content || '';
                summary = summary.trim().replace(/^["']|["']$/g, '');

                if (summary) {
                    newMemories.push({ id: `mem-${Date.now()}`, date: dateStr, summary: summary, mood: 'archive' });
                    processedCount++;
                }
                await new Promise(r => setTimeout(r, 500));
            }

            const finalMemories = [...(char.memories || []), ...newMemories];
            updateCharacter(char.id, { memories: finalMemories });
            addToast(`成功归档 ${processedCount} 天`, 'success');

        } catch (e: any) {
            addToast(`归档中断: ${e.message}`, 'error');
        } finally {
            setIsSummarizing(false);
        }
    };

    // --- Message Management ---
    const handleDeleteMessage = async () => {
        if (!selectedMessage) return;
        // P7: Clean up voice audio blob from IDB if this is a voice message
        if (selectedMessage.type === 'voice') {
            await DB.deleteVoiceAudio(selectedMessage.id);
        }
        await DB.deleteMessage(selectedMessage.id);
        setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
        setTotalMsgCount(prev => Math.max(0, prev - 1));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已删除', 'success');
    };

    const confirmEditMessage = async () => {
        if (!selectedMessage) return;
        await DB.updateMessage(selectedMessage.id, editContent);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, content: editContent } : m));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已修改', 'success');
    };

    const handleReplyMessage = () => {
        if (!selectedMessage) return;
        setReplyTarget({
            ...selectedMessage,
            metadata: { ...selectedMessage.metadata, senderName: selectedMessage.role === 'user' ? '我' : char.name }
        });
        setModalType('none');
    };

    const handleCopyMessage = () => {
        if (!selectedMessage) return;
        navigator.clipboard.writeText(selectedMessage.content);
        setModalType('none');
        setSelectedMessage(null);
        addToast('已复制到剪贴板', 'success');
    };

    // --- Voice: Read Aloud ---
    const handleReadAloud = useCallback(async () => {
        if (!selectedMessage || !ttsConfig?.apiKey) {
            addToast('请先在设置中配置 TTS', 'error');
            setModalType('none');
            return;
        }
        const msg = selectedMessage;
        setModalType('none');
        setSelectedMessage(null);

        console.log('[ReadAloud] Starting TTS for msg:', msg.id, 'text:', msg.content.slice(0, 50));
        console.log('[ReadAloud] ttsConfig:', JSON.stringify({ baseUrl: ttsConfig.baseUrl, model: ttsConfig.model, hasApiKey: !!ttsConfig.apiKey, groupId: ttsConfig.groupId?.slice(0, 6) + '...' }));

        // Create a placeholder voice message immediately
        const voiceMsg: any = {
            charId: char.id,
            role: msg.role,
            type: 'voice' as MessageType,
            content: msg.content,
            metadata: { duration: 0, sourceText: msg.content, hasAudio: false, source: 'read-aloud' },
        };
        const savedId = await DB.saveMessage(voiceMsg);
        await reloadMessages(visibleCountRef.current);

        // Synthesize in background
        try {
            const result = await synthesizeForMessage(savedId, msg.content, ttsConfig);
            if (result) {
                await DB.updateMessageMetadata(savedId, { duration: result.duration, hasAudio: true, sourceText: msg.content });
                setMessages(prev => prev.map(m => m.id === savedId ? { ...m, metadata: { ...m.metadata, duration: result.duration, hasAudio: true } } : m));
                addToast('语音合成完成', 'success');
            } else {
                addToast('TTS 合成失败（结果为空）', 'error');
            }
        } catch (err: any) {
            console.error('[ReadAloud] TTS error:', err);
            addToast(`TTS 合成失败: ${err?.message || err}`, 'error');
        }
    }, [selectedMessage, ttsConfig, char, synthesizeForMessage, reloadMessages]);

    // --- Voice: Convert to Text ---
    const handleVoiceToText = useCallback(() => {
        if (!selectedMessage || selectedMessage.type !== 'voice') return;
        const sourceText = selectedMessage.metadata?.sourceText || selectedMessage.content;
        addToast(sourceText.length > 60 ? sourceText.substring(0, 60) + '...' : sourceText, 'info');
        setModalType('none');
        setSelectedMessage(null);
    }, [selectedMessage, addToast]);

    // --- Voice: Download Audio ---
    const handleDownloadVoice = useCallback(async () => {
        if (!selectedMessage || selectedMessage.type !== 'voice') return;
        const msgId = selectedMessage.id;
        setModalType('none');
        setSelectedMessage(null);

        const blob = await DB.getVoiceAudio(msgId);
        if (!blob) {
            addToast('音频文件不存在', 'error');
            return;
        }

        const filename = `voice_${char.name}_${new Date().toISOString().slice(0, 10)}_${msgId}.mp3`;

        // Try navigator.share first (works on mobile PWA)
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file] });
                    return;
                }
            } catch (err: any) {
                // User cancelled share or not supported — fall through to download
                if (err?.name === 'AbortError') return;
            }
        }

        // Fallback: create <a> download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addToast('语音已保存', 'success');
    }, [selectedMessage, char, addToast]);

    const handleDeleteEmoji = async () => {
        if (!selectedEmoji) return;
        await DB.deleteEmoji(selectedEmoji.name);
        await loadEmojiData();
        setModalType('none');
        setSelectedEmoji(null);
        addToast('表情包已删除', 'success');
    };

    // --- Batch Selection ---
    const handleEnterSelectionMode = () => {
        if (selectedMessage) {
            setSelectedMsgIds(new Set([selectedMessage.id]));
            setSelectionMode(true);
            setModalType('none');
            setSelectedMessage(null);
        }
    };

    const toggleMessageSelection = useCallback((id: number) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Memoized callbacks for MessageItem to avoid busting React.memo
    const handleMessageLongPress = useCallback((msg: Message) => {
        setSelectedMessage(msg);
        setModalType('message-options');
    }, []);

    // --- Transfer Action ---
    const handleTransferAction = useCallback((msg: Message) => {
        setTransferActionMsg(msg);
    }, []);

    const handleTransferStatusUpdate = async (status: 'accepted' | 'returned') => {
        if (!transferActionMsg || !char) return;
        await DB.updateMessageMetadata(transferActionMsg.id, { status });
        // Update local state immediately
        setMessages(prev => prev.map(m => m.id === transferActionMsg.id ? { ...m, metadata: { ...m.metadata, status } } : m));
        setTransferActionMsg(null);
        const isFromUser = transferActionMsg.role === 'user';
        const amt = transferActionMsg.metadata?.amount || '?';
        if (status === 'accepted') {
            addToast(isFromUser ? `${char.name} 已收取 ¥${amt}` : `你已收取 ¥${amt}`, 'success');
        } else {
            addToast(isFromUser ? `${char.name} 已退还 ¥${amt}` : `你已退还 ¥${amt}`, 'info');
        }
    };

    const handleBatchDelete = async () => {
        if (selectedMsgIds.size === 0) return;
        const deleteCount = selectedMsgIds.size;
        // P7: Clean up voice audio blobs for any voice messages being deleted
        const voiceMsgIds = messages.filter(m => selectedMsgIds.has(m.id) && m.type === 'voice').map(m => m.id);
        for (const vid of voiceMsgIds) {
            await DB.deleteVoiceAudio(vid);
        }
        await DB.deleteMessages(Array.from(selectedMsgIds));
        setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
        setTotalMsgCount(prev => Math.max(0, prev - deleteCount));
        addToast(`已删除 ${deleteCount} 条消息`, 'success');
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
    };

    // --- Forward Chat Records ---
    const [showForwardModal, setShowForwardModal] = useState(false);

    const handleForwardSelected = () => {
        if (selectedMsgIds.size === 0) return;
        setShowForwardModal(true);
    };

    const handleForwardToCharacter = async (targetCharId: string) => {
        if (!char) return;
        const selectedMsgs = messages
            .filter(m => selectedMsgIds.has(m.id))
            .sort((a, b) => a.id - b.id);

        if (selectedMsgs.length === 0) return;

        // Build preview text (first few messages)
        const previewLines = selectedMsgs.slice(0, 4).map(m => {
            const sender = m.role === 'user' ? userProfile.name : char.name;
            const text = m.type === 'text' ? m.content.slice(0, 30) : `[${m.type === 'image' ? '图片' : m.type === 'emoji' ? '表情' : m.type}]`;
            return `${sender}: ${text}`;
        });
        if (selectedMsgs.length > 4) previewLines.push(`... 共 ${selectedMsgs.length} 条消息`);

        const forwardData = {
            fromUserName: userProfile.name,
            fromCharName: char.name,
            count: selectedMsgs.length,
            preview: previewLines,
            messages: selectedMsgs.map(m => ({
                role: m.role,
                type: m.type,
                content: m.content,
                metadata: m.metadata,
                timestamp: m.timestamp || Date.now()
            }))
        };

        // Save forward card to target character's chat
        await DB.saveMessage({
            charId: targetCharId,
            role: 'user',
            type: 'chat_forward' as MessageType,
            content: JSON.stringify(forwardData),
        });

        // Also save a copy in the current chat so the user can see what they forwarded
        const targetChar = characters.find(c => c.id === targetCharId);
        if (char.id !== targetCharId) {
            await DB.saveMessage({
                charId: char.id,
                role: 'system',
                type: 'text' as MessageType,
                content: `[转发了 ${selectedMsgs.length} 条聊天记录给 ${targetChar?.name || ''}]`,
            });
            // Refresh messages to show the forwarding system message
            reloadMessages(visibleCountRef.current);
        }

        addToast(`已转发 ${selectedMsgs.length} 条记录给 ${targetChar?.name || ''}`, 'success');
        setShowForwardModal(false);
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
    };

    const displayMessages = useMemo(() => messages
        .filter(m => m.metadata?.source !== 'date')
        .filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
        .filter(m => { if (char.hideSystemLogs && m.role === 'system') return false; return true; })
        .slice(-visibleCount),
        [messages, char?.hideBeforeMessageId, char?.hideSystemLogs, visibleCount]);

    const collapsedCount = Math.max(0, totalMsgCount - displayMessages.length);

    // Reset active category if it becomes invisible for the current character
    useEffect(() => {
        if (activeCategory !== 'default' && userVisibleCategories.length > 0 && !userVisibleCategories.some(c => c.id === activeCategory)) {
            setActiveCategory('default');
        }
    }, [userVisibleCategories, activeCategory]);

    // Build a set of hidden category IDs for quick lookup (user panel perspective)
    const hiddenCategoryIds = useMemo(() => {
        const visible = new Set(userVisibleCategories.map(c => c.id));
        return new Set(categories.filter(c => !visible.has(c.id)).map(c => c.id));
    }, [categories, userVisibleCategories]);

    // Memoize filtered emojis for ChatInputArea
    const filteredEmojis = useMemo(() => emojis.filter(e => {
        // Exclude emojis from hidden categories
        if (e.categoryId && hiddenCategoryIds.has(e.categoryId)) return false;
        if (activeCategory === 'default') return !e.categoryId || e.categoryId === 'default';
        return e.categoryId === activeCategory;
    }), [emojis, activeCategory, hiddenCategoryIds]);

    // Memoize ChatInputArea callbacks
    const handleSendCallback = useCallback(() => handleSendText(), [char, input, replyTarget]);
    const handleCharSelectCallback = useCallback((id: string) => { setActiveCharacterId(id); setShowPanel('none'); }, []);

    // --- Voice Recording → STT → AI Handler ---
    const handleVoiceRecordMessage = useCallback(async (blob: Blob, duration: number) => {
        if (!char) return;
        haptic.medium();

        try {
            // 1. Save user voice message (visual bubble) immediately
            const voiceMsgId = await DB.saveMessage({
                charId: char.id,
                role: 'user',
                type: 'voice',
                content: '', // will be filled with transcribed text
                metadata: {
                    duration,
                    source: 'user-recording',
                    hasAudio: true,
                    sttStatus: 'pending',
                    transcribedText: '',
                },
            });

            // 2. Save audio blob to IDB
            await DB.saveVoiceAudio(voiceMsgId, blob);

            // 3. Update UI immediately — user sees their voice bubble
            const updatedMsgs = await DB.getMessagesByCharId(char.id);
            setMessages(updatedMsgs);

            // Mark as transcribing
            setTranscribingMsgIds(prev => new Set(prev).add(voiceMsgId));
            setSttProcessing(true);

            // 4. Run Whisper STT in background
            let transcribedText = '';
            try {
                const result = await WhisperStt.transcribe(blob, 'tiny', (progress) => {
                    if (progress.status === 'progress' && progress.progress !== undefined) {
                        console.log(`🎤 [STT] Model download: ${progress.progress.toFixed(0)}%`);
                    }
                });
                transcribedText = result.text;
            } catch (sttErr) {
                console.error('🎤 [STT] Transcription failed:', sttErr);
                addToast('语音识别失败，请重试', 'error');
                // Update message status to failed
                await DB.updateMessageMetadata(voiceMsgId, { sttStatus: 'failed' });
                setTranscribingMsgIds(prev => { const s = new Set(prev); s.delete(voiceMsgId); return s; });
                setSttProcessing(false);
                return;
            }

            if (!transcribedText.trim()) {
                addToast('未识别到语音内容', 'error');
                await DB.updateMessageMetadata(voiceMsgId, { sttStatus: 'failed' });
                setTranscribingMsgIds(prev => { const s = new Set(prev); s.delete(voiceMsgId); return s; });
                setSttProcessing(false);
                return;
            }

            // 5. Update voice message with transcribed text
            await DB.updateMessage(voiceMsgId, transcribedText);
            await DB.updateMessageMetadata(voiceMsgId, { sttStatus: 'done', transcribedText });

            setTranscribingMsgIds(prev => { const s = new Set(prev); s.delete(voiceMsgId); return s; });
            setSttProcessing(false);

            // 6. Trigger AI (re-fetch messages to include updated voice msg)
            const latestMsgs = await DB.getMessagesByCharId(char.id);
            setMessages(latestMsgs);
            triggerAI(latestMsgs);
        } catch (err) {
            console.error('🎤 [VoiceRecord] Error:', err);
            addToast('语音消息发送失败', 'error');
            setSttProcessing(false);
        }
    }, [char, addToast, triggerAI]);

    return (
        <div
            className={`sully-chat-container flex flex-col h-full bg-[#f1f5f9] overflow-hidden relative font-sans transition-[background-image] duration-500 theme-${activeTheme.baseThemeId || activeTheme.id}`}
            style={{
                backgroundImage: char.chatBackground ? `url(${char.chatBackground})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
            {activeTheme.customCss && <style>{activeTheme.customCss}</style>}

            <ChatModals
                modalType={modalType} setModalType={setModalType}
                transferAmt={transferAmt} setTransferAmt={setTransferAmt}
                emojiImportText={emojiImportText} setEmojiImportText={setEmojiImportText}
                settingsContextLimit={settingsContextLimit} setSettingsContextLimit={setSettingsContextLimit}
                settingsHideSysLogs={settingsHideSysLogs} setSettingsHideSysLogs={setSettingsHideSysLogs}
                preserveContext={preserveContext} setPreserveContext={setPreserveContext}
                editContent={editContent} setEditContent={setEditContent}
                archivePrompts={archivePrompts} selectedPromptId={selectedPromptId} setSelectedPromptId={setSelectedPromptId}
                editingPrompt={editingPrompt} setEditingPrompt={setEditingPrompt} isSummarizing={isSummarizing}
                selectedMessage={selectedMessage} selectedEmoji={selectedEmoji} activeCharacter={char} messages={messages}
                allHistoryMessages={allHistoryMessages}

                newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onAddCategory={handleAddCategory}
                selectedCategory={selectedCategory}

                onTransfer={() => {
                    const amt = parseFloat(transferAmt);
                    if (!transferAmt || isNaN(amt) || amt <= 0) { addToast('请输入有效金额', 'error'); return; }
                    handleSendText(`[转账]`, 'transfer', { amount: amt.toFixed(2), status: 'pending' });
                    setTransferAmt('');
                    setModalType('none');
                }}
                onImportEmoji={handleImportEmoji}
                onSaveSettings={saveSettings} onBgUpload={handleBgUpload} onRemoveBg={() => updateCharacter(char.id, { chatBackground: undefined })}
                onClearHistory={handleClearHistory} onArchive={handleFullArchive}
                onCreatePrompt={createNewPrompt} onEditPrompt={editSelectedPrompt} onSavePrompt={handleSavePrompt} onDeletePrompt={handleDeletePrompt}
                onSetHistoryStart={handleSetHistoryStart} onEnterSelectionMode={handleEnterSelectionMode}
                onReplyMessage={handleReplyMessage} onEditMessageStart={() => { if (selectedMessage) { setEditContent(selectedMessage.content); setModalType('edit-message'); } }}
                onConfirmEditMessage={confirmEditMessage} onDeleteMessage={handleDeleteMessage} onCopyMessage={handleCopyMessage} onDeleteEmoji={handleDeleteEmoji} onDeleteCategory={handleDeleteCategory}
                allCharacters={characters} onSaveCategoryVisibility={handleSaveCategoryVisibility}
                translationEnabled={translationEnabled}
                onToggleTranslation={() => { const next = !translationEnabled; setTranslationEnabled(next); localStorage.setItem(`chat_translate_enabled_${activeCharacterId}`, JSON.stringify(next)); if (!next) { setShowingTargetIds(new Set()); } }}
                translateSourceLang={translateSourceLang}
                translateTargetLang={translateTargetLang}
                onSetTranslateSourceLang={(lang: string) => { setTranslateSourceLang(lang); localStorage.setItem('chat_translate_source_lang', lang); setShowingTargetIds(new Set()); }}
                onSetTranslateLang={(lang: string) => { setTranslateTargetLang(lang); localStorage.setItem('chat_translate_lang', lang); setShowingTargetIds(new Set()); }}
                xhsEnabled={!!char.xhsEnabled}
                onToggleXhs={() => updateCharacter(char.id, { xhsEnabled: !char.xhsEnabled })}
                showTimestampSetting={isTimestampForced || showTimestampSetting}
                isTimestampForced={isTimestampForced}
                onToggleTimestamp={() => {
                    if (isTimestampForced) return;
                    const next = !showTimestampSetting;
                    setShowTimestampSetting(next);
                    localStorage.setItem(`chat_show_timestamp_${activeCharacterId}`, JSON.stringify(next));
                }}
                onReadAloud={ttsConfig?.apiKey ? handleReadAloud : undefined}
                onVoiceToText={handleVoiceToText}
                onDownloadVoice={handleDownloadVoice}
                autoTts={autoTts}
                onToggleAutoTts={() => {
                    if (!autoTts && !ttsConfig?.apiKey) {
                        addToast('请先在全局设置中配置 TTS API Key', 'error');
                        return;
                    }
                    const next = !autoTts;
                    setAutoTts(next);
                    localStorage.setItem(`chat_auto_tts_${activeCharacterId}`, JSON.stringify(next));
                }}
            />

            <ChatHeader
                selectionMode={selectionMode}
                selectedCount={selectedMsgIds.size}
                onCancelSelection={() => { setSelectionMode(false); setSelectedMsgIds(new Set()); }}
                activeCharacter={char}
                isTyping={isTyping}
                isSummarizing={isSummarizing}
                lastTokenUsage={lastTokenUsage}
                tokenBreakdown={tokenBreakdown}
                onClose={closeApp}
                onTriggerAI={() => triggerAI(messages)}
                onShowCharsPanel={() => setShowPanel('chars')}
            />

            <div ref={scrollRef} className="flex-1 overflow-y-auto pt-6 pb-6 no-scrollbar" style={{ backgroundImage: activeTheme.type === 'custom' && activeTheme.user.backgroundImage ? 'none' : undefined }}>
                {collapsedCount > 0 && (
                    <div className="flex justify-center mb-6">
                        <button onClick={async () => {
                            const nextVisibleCount = visibleCount + LOAD_BATCH_SIZE;
                            visibleCountRef.current = nextVisibleCount;
                            setVisibleCount(nextVisibleCount);
                            await reloadMessages(nextVisibleCount);
                        }} className="px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full text-xs text-slate-500 shadow-sm border border-white hover:bg-white transition-colors">加载历史消息 ({collapsedCount})</button>
                    </div>
                )}

                {displayMessages.map((m, i) => {
                    const prevRole = i > 0 ? displayMessages[i - 1].role : null;
                    const nextRole = i < displayMessages.length - 1 ? displayMessages[i + 1].role : null;
                    const prevMsg = i > 0 ? displayMessages[i - 1] : null;
                    const showTs = effectiveShowTimestamp && (!prevMsg || (m.timestamp - prevMsg.timestamp) >= timestampInterval);
                    return (
                        <MessageItem
                            key={m.id || i}
                            msg={m}
                            isFirstInGroup={prevRole !== m.role}
                            isLastInGroup={nextRole !== m.role}
                            activeTheme={activeTheme}
                            charAvatar={char.avatar}
                            charName={char.name}
                            userAvatar={userProfile.avatar}
                            onLongPress={handleMessageLongPress}
                            selectionMode={selectionMode}
                            isSelected={selectedMsgIds.has(m.id)}
                            onToggleSelect={toggleMessageSelection}
                            translationEnabled={translationEnabled && m.type === 'text' && m.role === 'assistant'}
                            isShowingTarget={showingTargetIds.has(m.id)}
                            onTranslateToggle={handleTranslateToggle}
                            onTransferAction={handleTransferAction}
                            showTimestamp={showTs}
                            timestampValue={m.timestamp}
                            onPlayVoice={playVoice}
                            onStopVoice={stopVoice}
                            onRetryVoice={ttsConfig?.apiKey ? (msgId: number) => {
                                const msg = messages.find(m => m.id === msgId);
                                if (!msg || !ttsConfig) return;
                                const text = msg.metadata?.sourceText || msg.content;
                                synthesizeForMessage(msgId, text, ttsConfig).then(async (result) => {
                                    if (result) {
                                        await DB.updateMessageMetadata(msgId, { duration: result.duration, hasAudio: true });
                                        await reloadMessages(visibleCountRef.current);
                                        addToast('语音合成完成', 'success');
                                    }
                                }).catch(err => {
                                    console.error('[RetryVoice] synthesis failed:', err);
                                    addToast(`重试合成失败: ${err?.message || err}`, 'error');
                                });
                            } : undefined}
                            playingMsgId={playingMsgId}
                            loadingMsgIds={loadingMsgIds}
                        />
                    );
                })}

                {(isTyping || recallStatus || searchStatus || diaryStatus) && !selectionMode && (
                    <div className="flex items-start gap-2.5 px-3 mb-4 animate-fade-in">
                        <img src={char.avatar} className="w-9 h-9 rounded-[4px] object-cover bg-slate-200" />
                        <div className="sully-typing-bubble bg-white px-3 py-2 rounded-lg shadow-sm relative">
                            {/* Typing indicator tail */}
                            <svg className="sully-typing-tail absolute top-[12px] -left-[5.5px] w-[6px] h-[10px] pointer-events-none" style={{ fill: '#ffffff' }}><polygon points="6,0 0,5 6,10" /></svg>
                            {searchStatus ? (
                                <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    🔍 {searchStatus}
                                </div>
                            ) : recallStatus ? (
                                <div className="flex items-center gap-2 text-xs text-indigo-500 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    {recallStatus}
                                </div>
                            ) : diaryStatus ? (
                                <div className="flex items-center gap-2 text-xs text-amber-600 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    📖 {diaryStatus}
                                </div>
                            ) : (
                                <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div></div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="relative z-40">
                {replyTarget && (
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <div className="flex items-center gap-2 truncate"><span className="font-bold text-slate-700">正在回复:</span><span className="truncate max-w-[200px]">{replyTarget.content}</span></div>
                        <button onClick={() => setReplyTarget(null)} className="p-1 text-slate-400 hover:text-slate-600">×</button>
                    </div>
                )}

                <ChatInputArea
                    input={input} setInput={handleInputChange}
                    isTyping={isTyping} selectionMode={selectionMode}
                    showPanel={showPanel} setShowPanel={setShowPanel}
                    onSend={handleSendCallback}
                    onDeleteSelected={handleBatchDelete}
                    onForwardSelected={handleForwardSelected}
                    selectedCount={selectedMsgIds.size}
                    emojis={filteredEmojis}
                    characters={characters} activeCharacterId={activeCharacterId}
                    onCharSelect={handleCharSelectCallback}
                    customThemes={customThemes} onUpdateTheme={(id) => updateCharacter(char.id, { bubbleStyle: id })}
                    onRemoveTheme={removeCustomTheme} activeThemeId={currentThemeId}
                    onPanelAction={handlePanelAction}
                    onImageSelect={handleImageSelect}
                    isSummarizing={isSummarizing}
                    categories={userVisibleCategories}
                    activeCategory={activeCategory}
                    onReroll={handleReroll}
                    canReroll={canReroll}
                    onVoiceMessage={handleVoiceRecordMessage}
                    voiceRecorderState={sttProcessing ? 'processing' : voiceRecorder.state}
                    voiceRecordingDuration={voiceRecorder.duration}
                    onStartRecording={voiceRecorder.startRecording}
                    onStopRecording={voiceRecorder.stopRecording}
                    onCancelRecording={voiceRecorder.cancelRecording}
                    voiceRecorderError={voiceRecorder.error}
                    isVoiceProcessing={sttProcessing}
                />
            </div>

            {/* Forward Modal */}
            <Modal isOpen={showForwardModal} title="转发聊天记录" onClose={() => setShowForwardModal(false)}>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    <p className="text-xs text-slate-400 mb-3">选择要转发给的角色 (已选 {selectedMsgIds.size} 条消息)</p>
                    {characters.filter(c => c.id !== activeCharacterId).map(c => (
                        <button
                            key={c.id}
                            onClick={() => handleForwardToCharacter(c.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all border border-slate-100"
                        >
                            <img src={c.avatar} className="w-10 h-10 rounded-xl object-cover" />
                            <div className="flex-1 text-left">
                                <div className="font-bold text-sm text-slate-700">{c.name}</div>
                                <div className="text-[10px] text-slate-400 truncate">{c.description}</div>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                        </button>
                    ))}
                    {characters.filter(c => c.id !== activeCharacterId).length === 0 && (
                        <div className="text-center text-xs text-slate-400 py-8">没有其他角色可以转发</div>
                    )}
                </div>
            </Modal>

            {/* Transfer Action Modal */}
            <Modal isOpen={!!transferActionMsg} title="转账详情" onClose={() => setTransferActionMsg(null)}>
                {transferActionMsg && (
                    <div className="flex flex-col items-center gap-4 py-2">
                        <div className="w-14 h-14 rounded-full bg-[#f3883b]/10 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f3883b" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-slate-800">¥{transferActionMsg.metadata?.amount || '0.00'}</div>
                            <div className="text-xs text-slate-400 mt-1">
                                {transferActionMsg.role === 'user' ? `你转账给${char.name}` : `${char.name}转账给你`}
                            </div>
                        </div>
                        <div className="w-full space-y-2 mt-2">
                            {transferActionMsg.role === 'user' ? (
                                /* User sent this transfer — only allow withdraw */
                                <button
                                    onClick={() => handleTransferStatusUpdate('returned')}
                                    className="w-full py-3 bg-slate-100 text-slate-600 font-medium rounded-2xl active:scale-[0.98] transition-transform"
                                >
                                    撤回转账
                                </button>
                            ) : (
                                /* AI sent this transfer — allow accept or return */
                                <>
                                    <button
                                        onClick={() => handleTransferStatusUpdate('accepted')}
                                        className="w-full py-3 bg-[#07c160] text-white font-bold rounded-2xl active:scale-[0.98] transition-transform shadow-sm"
                                    >
                                        确认收款
                                    </button>
                                    <button
                                        onClick={() => handleTransferStatusUpdate('returned')}
                                        className="w-full py-3 bg-slate-100 text-slate-600 font-medium rounded-2xl active:scale-[0.98] transition-transform"
                                    >
                                        退还
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Chat;
