
import React, { useState, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { safeResponseJson } from '../utils/safeApi';
import Modal from '../components/os/Modal';
import { NotionManager, FeishuManager } from '../utils/realtimeContext';
import { XhsMcpClient } from '../utils/xhsMcpClient';
import { haptic } from '../utils/haptics';
import { MinimaxTts } from '../utils/minimaxTts';
import { DEFAULT_TTS_PREPROCESS_PROMPT } from '../types/tts';
import type { TtsConfig } from '../types/tts';

const Settings: React.FC = () => {
    const {
        apiConfig, updateApiConfig, closeApp, availableModels, setAvailableModels,
        exportSystem, importSystem, addToast, resetSystem,
        apiPresets, addApiPreset, removeApiPreset,
        sysOperation,
        realtimeConfig, updateRealtimeConfig,
        ttsConfig, updateTtsConfig,
        hapticsEnabled, setHapticsEnabled
    } = useOS();

    const [localKey, setLocalKey] = useState(apiConfig.apiKey);
    const [localUrl, setLocalUrl] = useState(apiConfig.baseUrl);
    const [localModel, setLocalModel] = useState(apiConfig.model);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [testConnectionStatus, setTestConnectionStatus] = useState<'idle' | 'success' | 'error' | 'testing'>('idle');
    const [newPresetName, setNewPresetName] = useState('');

    // UI States
    const [showModelModal, setShowModelModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false); // Used for completion now
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [showRealtimeModal, setShowRealtimeModal] = useState(false);
    const [showTtsModal, setShowTtsModal] = useState(false);

    // 实时感知配置的本地状态
    const [rtWeatherEnabled, setRtWeatherEnabled] = useState(realtimeConfig.weatherEnabled);
    const [rtWeatherKey, setRtWeatherKey] = useState(realtimeConfig.weatherApiKey);
    const [rtWeatherCity, setRtWeatherCity] = useState(realtimeConfig.weatherCity);
    const [rtNewsEnabled, setRtNewsEnabled] = useState(realtimeConfig.newsEnabled);
    const [rtNewsApiKey, setRtNewsApiKey] = useState(realtimeConfig.newsApiKey || '');
    const [rtNotionEnabled, setRtNotionEnabled] = useState(realtimeConfig.notionEnabled);
    const [rtNotionKey, setRtNotionKey] = useState(realtimeConfig.notionApiKey);
    const [rtNotionDbId, setRtNotionDbId] = useState(realtimeConfig.notionDatabaseId);
    const [rtNotionNotesDbId, setRtNotionNotesDbId] = useState(realtimeConfig.notionNotesDatabaseId || '');
    const [rtFeishuEnabled, setRtFeishuEnabled] = useState(realtimeConfig.feishuEnabled);
    const [rtFeishuAppId, setRtFeishuAppId] = useState(realtimeConfig.feishuAppId);
    const [rtFeishuAppSecret, setRtFeishuAppSecret] = useState(realtimeConfig.feishuAppSecret);
    const [rtFeishuBaseId, setRtFeishuBaseId] = useState(realtimeConfig.feishuBaseId);
    const [rtFeishuTableId, setRtFeishuTableId] = useState(realtimeConfig.feishuTableId);
    const [rtXhsEnabled, setRtXhsEnabled] = useState(realtimeConfig.xhsEnabled);
    const [rtXhsMcpEnabled, setRtXhsMcpEnabled] = useState(realtimeConfig.xhsMcpConfig?.enabled || false);
    const [rtXhsMcpUrl, setRtXhsMcpUrl] = useState(realtimeConfig.xhsMcpConfig?.serverUrl || 'http://localhost:18060/mcp');
    const [rtXhsNickname, setRtXhsNickname] = useState(realtimeConfig.xhsMcpConfig?.loggedInNickname || '');
    const [rtXhsUserId, setRtXhsUserId] = useState(realtimeConfig.xhsMcpConfig?.loggedInUserId || '');
    const [rtTestStatus, setRtTestStatus] = useState('');

    // TTS 配置本地状态
    const [ttsBaseUrl, setTtsBaseUrl] = useState(ttsConfig.baseUrl || '/minimax-api');
    const [ttsApiKey, setTtsApiKey] = useState(ttsConfig.apiKey);
    const [ttsGroupId, setTtsGroupId] = useState((ttsConfig as any).groupId || '');
    const [ttsModel, setTtsModel] = useState(ttsConfig.model);
    const [ttsVoiceId, setTtsVoiceId] = useState(ttsConfig.voiceSetting.voice_id);
    const [ttsSpeed, setTtsSpeed] = useState(ttsConfig.voiceSetting.speed);
    const [ttsVol, setTtsVol] = useState(ttsConfig.voiceSetting.vol);
    const [ttsPitch, setTtsPitch] = useState(ttsConfig.voiceSetting.pitch);
    const [ttsEmotion, setTtsEmotion] = useState(ttsConfig.voiceSetting.emotion || '');
    const [ttsFormat, setTtsFormat] = useState(ttsConfig.audioSetting.format);
    const [ttsSampleRate, setTtsSampleRate] = useState(ttsConfig.audioSetting.audio_sample_rate);
    const [ttsBitrate, setTtsBitrate] = useState(ttsConfig.audioSetting.bitrate);
    const [ttsChannel, setTtsChannel] = useState(ttsConfig.audioSetting.channel);
    const [ttsModifyPitch, setTtsModifyPitch] = useState(ttsConfig.voiceModify?.pitch || 0);
    const [ttsModifyIntensity, setTtsModifyIntensity] = useState(ttsConfig.voiceModify?.intensity || 0);
    const [ttsModifyTimbre, setTtsModifyTimbre] = useState(ttsConfig.voiceModify?.timbre || 0);
    const [ttsSoundEffect, setTtsSoundEffect] = useState(ttsConfig.voiceModify?.sound_effects || '');
    const [ttsLangBoost, setTtsLangBoost] = useState(ttsConfig.languageBoost || '');
    const [ttsPronounceDict, setTtsPronounceDict] = useState((ttsConfig.pronunciationDict?.tone || []).join('\n'));
    const [ttsPreprocessEnabled, setTtsPreprocessEnabled] = useState(ttsConfig.preprocessConfig.enabled);
    const [ttsPreprocessPrompt, setTtsPreprocessPrompt] = useState(ttsConfig.preprocessConfig.prompt);
    const [ttsPreprocessApiBase, setTtsPreprocessApiBase] = useState(ttsConfig.preprocessConfig.apiBase || '');
    const [ttsPreprocessApiKey, setTtsPreprocessApiKey] = useState(ttsConfig.preprocessConfig.apiKey || '');
    const [ttsPreprocessModel, setTtsPreprocessModel] = useState(ttsConfig.preprocessConfig.model || '');
    const [ppModels, setPpModels] = useState<string[]>([]);
    const [ppLoading, setPpLoading] = useState(false);
    const [ppStatus, setPpStatus] = useState('');
    // TTS 预设
    const [ttsPresets, setTtsPresets] = useState<Array<{ name: string; config: any }>>(() => {
        try { return JSON.parse(localStorage.getItem('os_tts_presets') || '[]'); } catch { return []; }
    });
    const [ttsPresetName, setTtsPresetName] = useState('');
    const [ttsTestText, setTtsTestText] = useState('你好，这是一段语音合成测试。');
    const [ttsTestStatus, setTtsTestStatus] = useState('');
    const [ttsTestAudioUrl, setTtsTestAudioUrl] = useState('');

    // For web download link
    const [downloadUrl, setDownloadUrl] = useState<string>('');

    const [statusMsg, setStatusMsg] = useState('');
    const importInputRef = useRef<HTMLInputElement>(null);

    // Auto-save draft configs locally to prevent loss during typing
    useEffect(() => {
        setLocalUrl(apiConfig.baseUrl);
        setLocalKey(apiConfig.apiKey);
        setLocalModel(apiConfig.model);
    }, [apiConfig]);

    const loadPreset = (preset: typeof apiPresets[0]) => {
        setLocalUrl(preset.config.baseUrl);
        setLocalKey(preset.config.apiKey);
        setLocalModel(preset.config.model);
        addToast(`已加载配置: ${preset.name}`, 'info');
    };

    const handleSavePreset = () => {
        if (!newPresetName.trim()) {
            addToast('请输入预设名称', 'error');
            return;
        }
        addApiPreset(newPresetName, { baseUrl: localUrl, apiKey: localKey, model: localModel });
        setNewPresetName('');
        setShowPresetModal(false);
        addToast('预设已保存', 'success');
    };

    const handleSaveApi = () => {
        updateApiConfig({
            apiKey: localKey,
            baseUrl: localUrl,
            model: localModel
        });
        setStatusMsg('配置已保存');
        setTimeout(() => setStatusMsg(''), 2000);
        setTestConnectionStatus('idle'); // Reset test status on save
    };

    const fetchModels = async () => {
        if (!localUrl) { setStatusMsg('请先填写 URL'); return; }
        setIsLoadingModels(true);
        setStatusMsg('正在连接...');
        try {
            const baseUrl = localUrl.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${localKey}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const data = await safeResponseJson(response);
            // Support various API response formats
            const list = data.data || data.models || [];
            if (Array.isArray(list)) {
                const models = list.map((m: any) => m.id || m);
                setAvailableModels(models);
                if (models.length > 0 && !localModel) setLocalModel(models[0]);
                setStatusMsg(`获取到 ${models.length} 个模型`);
                setShowModelModal(true); // Open selector immediately
            } else { setStatusMsg('格式不兼容'); }
        } catch (error: any) {
            console.error(error);
            setStatusMsg('连接失败');
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleTestConnection = async () => {
        if (!localUrl || !localKey || !localModel) {
            setStatusMsg('请先填写完整配置');
            return;
        }
        setIsTestingConnection(true);
        setTestConnectionStatus('testing');
        setStatusMsg('正在测试连通性...');

        try {
            const baseUrl = localUrl.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: localModel,
                    messages: [{ role: 'user', content: 'hello' }],
                    max_tokens: 1
                })
            });

            if (response.ok) {
                setTestConnectionStatus('success');
                setStatusMsg('连接成功，模型可用！');
            } else {
                setTestConnectionStatus('error');
                const errData = await response.json().catch(() => null);
                if (response.status === 401) setStatusMsg('API Key 无效或未授权');
                else if (response.status === 404) setStatusMsg('模型不存在或 URL 错误');
                else if (response.status === 429) setStatusMsg('请求被限流 (Rate Limit)');
                else setStatusMsg(`连接异样: ${errData?.error?.message || response.statusText}`);
            }
        } catch (error: any) {
            console.error(error);
            setTestConnectionStatus('error');
            setStatusMsg('网络错误，请检查 URL 是否可达');
        } finally {
            setIsTestingConnection(false);
            // Auto-hide success message after a bit, keeping error visible
            if (testConnectionStatus !== 'error') {
                setTimeout(() => setStatusMsg(''), 3000);
            }
        }
    };

    const handleExport = async (mode: 'text_only' | 'media_only' | 'full') => {
        try {
            // Trigger export (Context handles loading state UI)
            const blob = await exportSystem(mode);

            if (Capacitor.isNativePlatform()) {
                // Convert Blob to Base64 for Native Write
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    const base64data = String(reader.result);
                    const fileName = `Sully_Backup_${mode}_${Date.now()}.zip`;

                    try {
                        await Filesystem.writeFile({
                            path: fileName,
                            data: base64data, // Filesystem accepts data urls? Or need strip prefix
                            directory: Directory.Cache,
                        });
                        const uriResult = await Filesystem.getUri({
                            directory: Directory.Cache,
                            path: fileName,
                        });
                        await Share.share({
                            title: `Sully Backup`,
                            files: [uriResult.uri],
                        });
                    } catch (e) {
                        console.error("Native write failed", e);
                        addToast("保存文件失败", "error");
                    }
                };
            } else {
                // Web Download
                const url = URL.createObjectURL(blob);
                setDownloadUrl(url);
                setShowExportModal(true);

                // Auto click
                const a = document.createElement('a');
                a.href = url;
                a.download = `Sully_Backup_${mode}_${new Date().toISOString().slice(0, 10)}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Pass the File object directly to importSystem
        importSystem(file).catch(err => {
            console.error(err);
            addToast(err.message || '恢复失败', 'error');
        });

        if (importInputRef.current) importInputRef.current.value = '';
    };

    const confirmReset = () => {
        resetSystem();
        setShowResetConfirm(false);
    };

    // 保存实时感知配置
    const handleSaveRealtimeConfig = () => {
        updateRealtimeConfig({
            weatherEnabled: rtWeatherEnabled,
            weatherApiKey: rtWeatherKey,
            weatherCity: rtWeatherCity,
            newsEnabled: rtNewsEnabled,
            newsApiKey: rtNewsApiKey,
            notionEnabled: rtNotionEnabled,
            notionApiKey: rtNotionKey,
            notionDatabaseId: rtNotionDbId,
            notionNotesDatabaseId: rtNotionNotesDbId || undefined,
            feishuEnabled: rtFeishuEnabled,
            feishuAppId: rtFeishuAppId,
            feishuAppSecret: rtFeishuAppSecret,
            feishuBaseId: rtFeishuBaseId,
            feishuTableId: rtFeishuTableId,
            xhsEnabled: rtXhsEnabled,
            xhsMcpConfig: {
                enabled: rtXhsMcpEnabled,
                serverUrl: rtXhsMcpUrl,
                loggedInNickname: rtXhsNickname || undefined,
                loggedInUserId: rtXhsUserId || undefined,
            }
        });
        addToast('实时感知配置已保存', 'success');
        setShowRealtimeModal(false);
    };

    // 测试天气API连接
    const testWeatherApi = async () => {
        if (!rtWeatherKey) {
            setRtTestStatus('请先填写 API Key');
            return;
        }
        setRtTestStatus('正在测试...');
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${rtWeatherCity}&appid=${rtWeatherKey}&units=metric&lang=zh_cn`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await safeResponseJson(res);
                setRtTestStatus(`连接成功！${data.name}: ${data.weather[0]?.description}, ${Math.round(data.main.temp)}°C`);
            } else {
                setRtTestStatus(`连接失败: HTTP ${res.status}`);
            }
        } catch (e: any) {
            setRtTestStatus(`网络错误: ${e.message}`);
        }
    };

    // 测试Notion连接
    const testNotionApi = async () => {
        if (!rtNotionKey || !rtNotionDbId) {
            setRtTestStatus('请填写 Notion API Key 和 Database ID');
            return;
        }
        setRtTestStatus('正在测试 Notion 连接...');
        try {
            const result = await NotionManager.testConnection(rtNotionKey, rtNotionDbId);
            setRtTestStatus(result.message);
        } catch (e: any) {
            setRtTestStatus(`网络错误: ${e.message}`);
        }
    };

    // 测试飞书连接
    const testFeishuApi = async () => {
        if (!rtFeishuAppId || !rtFeishuAppSecret || !rtFeishuBaseId || !rtFeishuTableId) {
            setRtTestStatus('请填写飞书 App ID、App Secret、多维表格 ID 和数据表 ID');
            return;
        }
        setRtTestStatus('正在测试飞书连接...');
        try {
            const result = await FeishuManager.testConnection(rtFeishuAppId, rtFeishuAppSecret, rtFeishuBaseId, rtFeishuTableId);
            setRtTestStatus(result.message);
        } catch (e: any) {
            setRtTestStatus(`网络错误: ${e.message}`);
        }
    };

    // 测试小红书 MCP 连接
    const testXhsMcp = async () => {
        if (!rtXhsMcpUrl) {
            setRtTestStatus('请填写 MCP Server URL');
            return;
        }
        setRtTestStatus('正在连接 MCP Server...');
        try {
            const result = await XhsMcpClient.testConnection(rtXhsMcpUrl);
            if (result.connected) {
                const toolCount = result.tools?.length || 0;
                const loginInfo = result.loggedIn
                    ? ` | ${result.nickname ? `账号: ${result.nickname}` : '已登录'}${result.userId ? ` (ID: ${result.userId})` : ''}`
                    : ' | ⚠️ 未登录，请先在浏览器中登录小红书';
                setRtTestStatus(`✅ MCP 连接成功! ${toolCount} 个工具可用${loginInfo}`);
                // 自动填充昵称和userId（如果用户还没手动填过）
                if (result.nickname && !rtXhsNickname) setRtXhsNickname(result.nickname);
                if (result.userId && !rtXhsUserId) setRtXhsUserId(result.userId);
                // 保存登录信息
                updateRealtimeConfig({
                    xhsMcpConfig: {
                        enabled: rtXhsMcpEnabled,
                        serverUrl: rtXhsMcpUrl,
                        loggedInNickname: rtXhsNickname || result.nickname,
                        loggedInUserId: rtXhsUserId || result.userId,
                    }
                });
            } else {
                setRtTestStatus(`❌ 连接失败: ${result.error}`);
            }
        } catch (e: any) {
            setRtTestStatus(`网络错误: ${e.message}`);
        }
    };

    return (
        <div className="h-full w-full bg-slate-50/50 flex flex-col font-light relative">

            {/* GLOBAL PROGRESS OVERLAY */}
            {sysOperation.status === 'processing' && (
                <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
                    <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 w-64">
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                        <div className="text-sm font-bold text-slate-700">{sysOperation.message}</div>
                        {sysOperation.progress > 0 && (
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${sysOperation.progress}%` }}></div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="h-20 bg-white/70 backdrop-blur-md flex items-end pb-3 px-4 border-b border-white/40 shrink-0 z-10 sticky top-0">
                <div className="flex items-center gap-2 w-full">
                    <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <h1 className="text-xl font-medium text-slate-700 tracking-wide">系统设置</h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar pb-20">

                {/* 数据备份区域 */}
                <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
                        </div>
                        <h2 className="text-sm font-semibold text-slate-600 tracking-wider">备份与恢复 (ZIP)</h2>
                    </div>

                    <div className="mb-3">
                        <button onClick={() => handleExport('full')} className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 border border-violet-300 rounded-xl text-xs font-bold text-white shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 relative overflow-hidden mb-3">
                            <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-white/20 text-[9px] text-white rounded-bl-lg font-bold">完整</div>
                            <div className="p-2 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg></div>
                            <span>整合导出 (文字+媒体)</span>
                        </button>
                    </div>

                    <p className="text-[10px] text-slate-400 px-1 mb-3 text-center">以下为分步导出，适合低配设备分次备份</p>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <button onClick={() => handleExport('text_only')} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 relative overflow-hidden">
                            <div className="p-2 bg-blue-50 rounded-full text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>
                            <span>纯文字备份</span>
                        </button>
                        <button onClick={() => handleExport('media_only')} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2">
                            <div className="p-2 bg-pink-50 rounded-full text-pink-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg></div>
                            <span>媒体与美化素材</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 mb-4">
                        <div onClick={() => importInputRef.current?.click()} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 cursor-pointer hover:bg-emerald-50 hover:border-emerald-200">
                            <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg></div>
                            <span>导入备份 (.zip / .json)</span>
                        </div>
                        <input type="file" ref={importInputRef} className="hidden" accept=".json,.zip" onChange={handleImport} />
                    </div>

                    <p className="text-[10px] text-slate-400 px-1 mb-4 leading-relaxed">
                        • <b>整合导出</b>: 一次性导出所有数据（文字+媒体），适合设备性能充足的用户。<br />
                        • <b>纯文字备份</b>: 包含所有聊天记录、角色设定、剧情数据。所有图片会被移除（减小体积）。<br />
                        • <b>媒体与美化素材</b>: 导出相册、表情包、聊天图片、头像、主题气泡、壁纸、图标等图片资源和外观配置。<br />
                        • 兼容旧版 JSON 备份文件的导入。
                    </p>

                    <button onClick={() => setShowResetConfirm(true)} className="w-full py-3 bg-red-50 border border-red-100 text-red-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                        格式化系统 (出厂设置)
                    </button>
                </section>

                {/* AI 连接设置区域 */}
                <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-emerald-100/50 rounded-xl text-emerald-600">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                                </svg>
                            </div>
                            <h2 className="text-sm font-semibold text-slate-600 tracking-wider">API 配置</h2>
                        </div>
                        <button onClick={() => setShowPresetModal(true)} className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform">
                            保存为预设
                        </button>
                    </div>

                    {/* Presets List */}
                    {apiPresets.length > 0 && (
                        <div className="mb-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block pl-1">我的预设 (Presets)</label>
                            <div className="flex gap-2 flex-wrap">
                                {apiPresets.map(preset => (
                                    <div key={preset.id} className="flex items-center bg-white border border-slate-200 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                                        <span onClick={() => loadPreset(preset)} className="text-xs font-medium text-slate-600 cursor-pointer hover:text-primary mr-2">{preset.name}</span>
                                        <button onClick={() => removeApiPreset(preset.id)} className="p-1 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="group">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">URL</label>
                            <input type="text" value={localUrl} onChange={(e) => setLocalUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                        </div>

                        <div className="group">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Key</label>
                            <input type="password" value={localKey} onChange={(e) => setLocalKey(e.target.value)} placeholder="sk-..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                        </div>

                        <div className="pt-2">
                            <div className="flex justify-between items-center mb-1.5 pl-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model</label>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={localModel}
                                    onChange={(e) => setLocalModel(e.target.value)}
                                    placeholder="手动输入模型名称..."
                                    className="flex-1 bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all shadow-sm"
                                />
                                <button
                                    onClick={() => setShowModelModal(true)}
                                    className="shrink-0 bg-slate-100 text-slate-600 border border-slate-200/60 rounded-xl px-4 py-2.5 text-xs font-bold active:bg-slate-200 transition-all shadow-sm flex items-center gap-1 hover:bg-slate-200/50"
                                >
                                    选择 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={handleTestConnection}
                                    disabled={isTestingConnection}
                                    className={`flex-1 py-2.5 border rounded-xl text-xs font-bold shadow-sm transition-all flex justify-center items-center gap-1.5
                                ${testConnectionStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                                            testConnectionStatus === 'error' ? 'bg-red-50 border-red-200 text-red-500' :
                                                'bg-white border-slate-200/60 text-slate-600 active:bg-slate-50'}`}
                                >
                                    {isTestingConnection ? (
                                        <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                                    ) : testConnectionStatus === 'success' ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>
                                    ) : testConnectionStatus === 'error' ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                                    )}
                                    {isTestingConnection ? '测试中...' :
                                        testConnectionStatus === 'success' ? '测试通过' :
                                            testConnectionStatus === 'error' ? '测试异常' : '测试连通性'}
                                </button>

                                <button
                                    onClick={fetchModels}
                                    disabled={isLoadingModels}
                                    className="flex-1 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-500 shadow-sm active:bg-slate-100 transition-all flex justify-center items-center gap-1.5"
                                >
                                    {isLoadingModels ? (
                                        <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                    )}
                                    {isLoadingModels ? '获取中...' : '获取列表'}
                                </button>
                            </div>
                        </div>

                        <button onClick={handleSaveApi} className="w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-primary/20 bg-primary active:scale-95 transition-all mt-4">
                            {statusMsg || '保存配置'}
                        </button>
                    </div>
                </section>

                {/* 实时感知配置区域 */}
                <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-violet-100/50 rounded-xl text-violet-600">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                                </svg>
                            </div>
                            <h2 className="text-sm font-semibold text-slate-600 tracking-wider">实时感知</h2>
                        </div>
                        <button onClick={() => setShowRealtimeModal(true)} className="text-[10px] bg-violet-100 text-violet-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform">
                            配置
                        </button>
                    </div>

                    <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                        让AI角色感知真实世界：天气、新闻热点、当前时间。角色可以根据天气关心你、聊聊最近的热点话题。
                    </p>

                    <div className="grid grid-cols-5 gap-2 text-center">
                        <div className={`py-3 rounded-xl text-xs font-bold ${rtWeatherEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                            <div className="text-lg mb-1">{rtWeatherEnabled ? '☀️' : '🌫️'}</div>
                            天气
                        </div>
                        <div className={`py-3 rounded-xl text-xs font-bold ${rtNewsEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                            <div className="text-lg mb-1">{rtNewsEnabled ? '📰' : '📄'}</div>
                            新闻
                        </div>
                        <div className={`py-3 rounded-xl text-xs font-bold ${rtNotionEnabled ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>
                            <div className="text-lg mb-1">{rtNotionEnabled ? '📝' : '📋'}</div>
                            Notion
                        </div>
                        <div className={`py-3 rounded-xl text-xs font-bold ${rtFeishuEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                            <div className="text-lg mb-1">{rtFeishuEnabled ? '📒' : '📋'}</div>
                            飞书
                        </div>
                        <div className={`py-3 rounded-xl text-xs font-bold ${rtXhsEnabled ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                            <div className="text-lg mb-1">{rtXhsEnabled ? '📕' : '📋'}</div>
                            小红书
                        </div>
                    </div>
                </section>

                {/* 语音合成 (TTS) 配置区域 */}
                <section className="relative overflow-hidden bg-[#fdf6f0]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#f0e4d7]/60">
                    {/* 装饰性背景圆 */}
                    <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#f5d5c8]/30 to-[#e8cfe8]/30 blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-gradient-to-tr from-[#d4e4f7]/25 to-[#f5d5c8]/25 blur-xl pointer-events-none" />

                    <div className="relative flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-gradient-to-br from-[#f5d5c8]/60 to-[#e8cfe8]/60 backdrop-blur-sm rounded-2xl text-[#b8849b]">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
                            </div>
                            <h2 className="text-sm font-semibold text-[#8b7e74] tracking-wider">语音合成</h2>
                        </div>
                        <button onClick={() => setShowTtsModal(true)} className="text-[10px] bg-gradient-to-r from-[#e8cfe8]/70 to-[#f5d5c8]/70 backdrop-blur-sm text-[#9b7e8f] px-4 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform border border-white/40">
                            配置
                        </button>
                    </div>

                    <p className="relative text-xs text-[#a89b91] mb-4 leading-relaxed">
                        使用 MiniMax 语音合成 API，让角色用声音说话。支持多种音色、情绪和声音效果。
                    </p>

                    <div className="relative grid grid-cols-3 gap-3 text-center">
                        <div className={`py-3.5 rounded-2xl text-xs font-bold backdrop-blur-sm ${ttsConfig.apiKey ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                            <div className="text-sm mb-1.5 opacity-70">{ttsConfig.apiKey ? '●' : '○'}</div>
                            {ttsConfig.apiKey ? '已配置' : '未配置'}
                        </div>
                        <div className="py-3.5 rounded-2xl text-xs font-bold bg-[#fce4ec]/50 backdrop-blur-sm text-[#c4929f] border border-[#f5d5da]/50">
                            <div className="text-[10px] mb-1.5 font-mono opacity-70">MODEL</div>
                            {ttsConfig.model.replace('speech-', '')}
                        </div>
                        <div className="py-3.5 rounded-2xl text-xs font-bold bg-[#f0eaf7]/50 backdrop-blur-sm text-[#a18db8] border border-[#e5ddf0]/50">
                            <div className="text-[10px] mb-1.5 font-mono opacity-70">VOICE</div>
                            {ttsConfig.voiceSetting.voice_id.length > 10 ? ttsConfig.voiceSetting.voice_id.slice(0, 10) + '...' : ttsConfig.voiceSetting.voice_id}
                        </div>
                    </div>
                </section>

                {/* 触觉反馈 */}
                <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-amber-100/50 rounded-xl text-amber-600">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" /></svg>
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-slate-600">触觉反馈</h2>
                                <p className="text-[10px] text-slate-400">操作时产生震动反馈</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={hapticsEnabled} onChange={e => { setHapticsEnabled(e.target.checked); if (e.target.checked) haptic.medium(); }} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                    </div>
                </section>

                <div className="text-center text-[10px] text-slate-300 pb-8 font-mono tracking-widest uppercase">
                    v2.2 (Realtime Awareness)
                </div>
            </div>

            {/* 模型选择 Modal */}
            <Modal isOpen={showModelModal} title="选择模型" onClose={() => setShowModelModal(false)}>
                <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-2 p-1">
                    {availableModels.length > 0 ? availableModels.map(m => (
                        <button key={m} onClick={() => { setLocalModel(m); setShowModelModal(false); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-mono flex justify-between items-center ${m === localModel ? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                            <span className="truncate">{m}</span>
                            {m === localModel && <div className="w-2 h-2 rounded-full bg-primary"></div>}
                        </button>
                    )) : <div className="text-center text-slate-400 py-8 text-xs">列表为空，请先点击“刷新模型列表”</div>}
                </div>
            </Modal>

            {/* Preset Name Modal */}
            <Modal isOpen={showPresetModal} title="保存预设" onClose={() => setShowPresetModal(false)} footer={<button onClick={handleSavePreset} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存</button>}>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">预设名称 (例如: DeepSeek)</label>
                    <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)} className="w-full bg-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-primary" autoFocus placeholder="Name..." />
                </div>
            </Modal>

            {/* 强制导出 Modal */}
            <Modal isOpen={showExportModal} title="备份下载" onClose={() => setShowExportModal(false)} footer={
                <div className="flex gap-2 w-full">
                    <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">关闭</button>
                </div>
            }>
                <div className="space-y-4 text-center py-4">
                    <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    </div>
                    <p className="text-sm font-bold text-slate-700">备份文件已生成！</p>
                    <p className="text-xs text-slate-500">如果浏览器没有自动下载，请点击下方链接。</p>
                    {downloadUrl && <a href={downloadUrl} download="Sully_Backup.zip" className="text-primary text-sm underline block py-2">点击手动下载 .zip</a>}
                </div>
            </Modal>

            {/* 实时感知配置 Modal */}
            <Modal
                isOpen={showRealtimeModal}
                title="实时感知配置"
                onClose={() => setShowRealtimeModal(false)}
                footer={<button onClick={handleSaveRealtimeConfig} className="w-full py-3 bg-violet-500 text-white font-bold rounded-2xl shadow-lg">保存配置</button>}
            >
                <div className="space-y-5 max-h-[60vh] overflow-y-auto no-scrollbar">
                    {/* 天气配置 */}
                    <div className="bg-emerald-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">☀️</span>
                                <span className="text-sm font-bold text-emerald-700">天气感知</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtWeatherEnabled} onChange={e => setRtWeatherEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                        {rtWeatherEnabled && (
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">OpenWeatherMap API Key</label>
                                    <input type="password" value={rtWeatherKey} onChange={e => setRtWeatherKey(e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: openweathermap.org" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">城市 (英文)</label>
                                    <input type="text" value={rtWeatherCity} onChange={e => setRtWeatherCity(e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm" placeholder="Beijing, Shanghai, etc." />
                                </div>
                                <button onClick={testWeatherApi} className="w-full py-2 bg-emerald-100 text-emerald-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试天气API</button>
                            </div>
                        )}
                    </div>

                    {/* 新闻配置 */}
                    <div className="bg-blue-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">📰</span>
                                <span className="text-sm font-bold text-blue-700">新闻热点</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtNewsEnabled} onChange={e => setRtNewsEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                            </label>
                        </div>
                        {rtNewsEnabled && (
                            <div className="space-y-2">
                                <p className="text-xs text-blue-600/70">默认使用 Hacker News（英文科技新闻）。配置 Brave API 可获取中文新闻。</p>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Brave Search API Key (推荐)</label>
                                    <input type="password" value={rtNewsApiKey} onChange={e => setRtNewsApiKey(e.target.value)} className="w-full bg-white/80 border border-blue-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: brave.com/search/api" />
                                </div>
                                <p className="text-[10px] text-blue-500/70">
                                    免费2000次/月，支持中文新闻。<br />
                                    不配置则用 Hacker News（英文科技新闻）。
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Notion 配置 */}
                    <div className="bg-orange-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">📝</span>
                                <span className="text-sm font-bold text-orange-700">Notion 日记</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtNotionEnabled} onChange={e => setRtNotionEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                            </label>
                        </div>
                        {rtNotionEnabled && (
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notion Integration Token</label>
                                    <input type="password" value={rtNotionKey} onChange={e => setRtNotionKey(e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="secret_..." />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Database ID</label>
                                    <input type="text" value={rtNotionDbId} onChange={e => setRtNotionDbId(e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从数据库URL复制" />
                                </div>
                                <button onClick={testNotionApi} className="w-full py-2 bg-orange-100 text-orange-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试Notion连接</button>
                                <div className="border-t border-orange-200/50 pt-2 mt-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">笔记数据库 ID（可选）</label>
                                    <input type="text" value={rtNotionNotesDbId} onChange={e => setRtNotionNotesDbId(e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="用户日常笔记的数据库ID" />
                                    <p className="text-[10px] text-orange-500/60 leading-relaxed mt-1">
                                        填写后角色可以偶尔看到你的笔记标题，温馨地提起你写的内容。留空则不启用。
                                    </p>
                                </div>
                                <p className="text-[10px] text-orange-500/70 leading-relaxed">
                                    1. 在 <a href="https://www.notion.so/my-integrations" target="_blank" className="underline">Notion开发者</a> 创建Integration<br />
                                    2. 创建一个日记数据库，添加"Name"(标题)和"Date"(日期)属性<br />
                                    3. 在数据库右上角菜单中 Connect 你的 Integration
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 飞书配置 (中国区替代) */}
                    <div className="bg-indigo-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">📒</span>
                                <span className="text-sm font-bold text-indigo-700">飞书日记</span>
                                <span className="text-[9px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded-full">中国区</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtFeishuEnabled} onChange={e => setRtFeishuEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-indigo-500/70 leading-relaxed">
                            Notion 的中国区替代方案，无需翻墙。使用飞书多维表格存储日记。
                        </p>
                        {rtFeishuEnabled && (
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App ID</label>
                                    <input type="text" value={rtFeishuAppId} onChange={e => setRtFeishuAppId(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="cli_xxxxxxxx" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App Secret</label>
                                    <input type="password" value={rtFeishuAppSecret} onChange={e => setRtFeishuAppSecret(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="xxxxxxxxxxxxxxxx" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">多维表格 App Token</label>
                                    <input type="text" value={rtFeishuBaseId} onChange={e => setRtFeishuBaseId(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从多维表格URL中获取" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">数据表 Table ID</label>
                                    <input type="text" value={rtFeishuTableId} onChange={e => setRtFeishuTableId(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="tblxxxxxxxx" />
                                </div>
                                <button onClick={testFeishuApi} className="w-full py-2 bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试飞书连接</button>
                                <p className="text-[10px] text-indigo-500/70 leading-relaxed">
                                    1. 在 <a href="https://open.feishu.cn/app" target="_blank" className="underline">飞书开放平台</a> 创建企业自建应用，获取 App ID 和 Secret<br />
                                    2. 在应用权限中添加「多维表格」相关权限<br />
                                    3. 创建一个多维表格，添加字段: 标题(文本)、内容(文本)、日期(日期)、心情(文本)、角色(文本)<br />
                                    4. 从多维表格 URL 中获取 App Token 和 Table ID
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 小红书 MCP */}
                    <div className="bg-red-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">📕</span>
                                <span className="text-sm font-bold text-red-700">小红书 MCP</span>
                                <span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">浏览器自动化</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtXhsMcpEnabled} onChange={e => { setRtXhsMcpEnabled(e.target.checked); setRtXhsEnabled(e.target.checked); }} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-red-500/70 leading-relaxed">
                            通过 MCP Server（浏览器自动化）操作小红书。角色可以搜索、浏览、发帖、评论。
                        </p>
                        {rtXhsMcpEnabled && (
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">MCP Server URL</label>
                                    <input value={rtXhsMcpUrl} onChange={e => setRtXhsMcpUrl(e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="http://localhost:18060/mcp" />
                                </div>
                                <button onClick={testXhsMcp} className="w-full py-2 bg-red-100 text-red-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试 MCP 连接</button>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">小红书昵称</label>
                                        <input value={rtXhsNickname} onChange={e => setRtXhsNickname(e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px]" placeholder="手动填写（MCP检测可能不准）" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">用户 ID</label>
                                        <input value={rtXhsUserId} onChange={e => setRtXhsUserId(e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="可选，用于查看主页" />
                                    </div>
                                </div>
                                <p className="text-[10px] text-red-500/70 leading-relaxed">
                                    需要部署 xiaohongshu-mcp 并保持登录。在角色聊天设置中单独开关小红书。<br />
                                    昵称和用户ID用于"查看自己的主页"功能。MCP自动检测可能不准，建议手动填写。<br />
                                    项目: github.com/xpzouying/xiaohongshu-mcp
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 测试状态 */}
                    {rtTestStatus && (
                        <div className={`p-3 rounded-xl text-xs font-medium text-center ${rtTestStatus.includes('成功') ? 'bg-emerald-100 text-emerald-700' : rtTestStatus.includes('失败') || rtTestStatus.includes('错误') ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                            {rtTestStatus}
                        </div>
                    )}
                </div>
            </Modal>

            {/* 确认重置 Modal */}
            <Modal
                isOpen={showResetConfirm}
                title="系统警告"
                onClose={() => setShowResetConfirm(false)}
                footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">取消</button>
                        <button onClick={confirmReset} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">确认格式化</button>
                    </div>
                }
            >
                <div className="flex flex-col items-center gap-3 py-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-red-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                    <p className="text-center text-sm text-slate-600 font-medium">
                        这将<span className="text-red-500 font-bold">永久删除</span>所有角色、聊天记录和设置，且无法恢复！
                    </p>
                </div>
            </Modal>

            {/* TTS 配置 Modal */}
            <Modal
                isOpen={showTtsModal}
                title="语音合成配置"
                onClose={() => setShowTtsModal(false)}
                footer={<button onClick={() => {
                    updateTtsConfig({
                        baseUrl: ttsBaseUrl,
                        apiKey: ttsApiKey,
                        groupId: ttsGroupId,
                        model: ttsModel,
                        voiceSetting: { voice_id: ttsVoiceId, speed: ttsSpeed, vol: ttsVol, pitch: ttsPitch, emotion: ttsEmotion || undefined },
                        audioSetting: { audio_sample_rate: ttsSampleRate, bitrate: ttsBitrate, format: ttsFormat as 'mp3' | 'pcm' | 'flac', channel: ttsChannel },
                        voiceModify: (ttsModifyPitch || ttsModifyIntensity || ttsModifyTimbre || ttsSoundEffect) ? { pitch: ttsModifyPitch, intensity: ttsModifyIntensity, timbre: ttsModifyTimbre, sound_effects: ttsSoundEffect || undefined } : undefined,
                        languageBoost: ttsLangBoost || undefined,
                        pronunciationDict: ttsPronounceDict.trim() ? { tone: ttsPronounceDict.split('\n').filter(l => l.trim()) } : undefined,
                        preprocessConfig: { enabled: ttsPreprocessEnabled, prompt: ttsPreprocessPrompt, apiBase: ttsPreprocessApiBase, apiKey: ttsPreprocessApiKey, model: ttsPreprocessModel },
                    });
                    addToast('语音合成配置已保存', 'success');
                    setShowTtsModal(false);
                }} className="w-full py-3 bg-gradient-to-r from-[#e8a0bf] to-[#c4b0d9] text-white font-bold rounded-2xl shadow-lg border border-white/30">保存配置</button>}
            >
                <div className="space-y-6 max-h-[60vh] overflow-y-auto no-scrollbar">

                    {/* 预设 */}
                    <div className="bg-[#fef0e7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-[#c4929f]">预设管理</span>
                        </div>
                        <div className="flex gap-2">
                            <input type="text" value={ttsPresetName} onChange={e => setTtsPresetName(e.target.value)} className="flex-1 bg-white/70 backdrop-blur-sm border border-[#f0e4d7]/60 rounded-xl px-3 py-2 text-[11px] focus:bg-white/90 transition-all" placeholder="输入预设名称..." />
                            <button onClick={() => {
                                if (!ttsPresetName.trim()) return;
                                const preset = {
                                    name: ttsPresetName.trim(),
                                    config: {
                                        voiceId: ttsVoiceId, speed: ttsSpeed, vol: ttsVol, pitch: ttsPitch, emotion: ttsEmotion,
                                        model: ttsModel, langBoost: ttsLangBoost,
                                        modifyPitch: ttsModifyPitch, modifyIntensity: ttsModifyIntensity, modifyTimbre: ttsModifyTimbre, soundEffect: ttsSoundEffect,
                                        format: ttsFormat, sampleRate: ttsSampleRate, bitrate: ttsBitrate, channel: ttsChannel,
                                    }
                                };
                                const updated = [...ttsPresets.filter(p => p.name !== preset.name), preset];
                                setTtsPresets(updated);
                                localStorage.setItem('os_tts_presets', JSON.stringify(updated));
                                setTtsPresetName('');
                                addToast(`预设「${preset.name}」已保存`, 'success');
                            }} className="text-[10px] bg-gradient-to-r from-[#e8a0bf] to-[#c4b0d9] text-white px-3 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-transform border border-white/30">保存预设</button>
                        </div>
                        {ttsPresets.length > 0 && (
                            <div className="space-y-1.5">
                                {ttsPresets.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-xl px-3 py-2 border border-[#f0e4d7]/30">
                                        <span className="flex-1 text-[11px] font-medium text-[#8b7e74] truncate">{p.name}</span>
                                        <button onClick={() => {
                                            const c = p.config;
                                            setTtsVoiceId(c.voiceId || ''); setTtsSpeed(c.speed ?? 1); setTtsVol(c.vol ?? 1); setTtsPitch(c.pitch ?? 0); setTtsEmotion(c.emotion || '');
                                            setTtsModel(c.model || 'speech-2.8-hd'); setTtsLangBoost(c.langBoost || '');
                                            setTtsModifyPitch(c.modifyPitch ?? 0); setTtsModifyIntensity(c.modifyIntensity ?? 0); setTtsModifyTimbre(c.modifyTimbre ?? 0); setTtsSoundEffect(c.soundEffect || '');
                                            setTtsFormat(c.format || 'mp3'); setTtsSampleRate(c.sampleRate ?? 32000); setTtsBitrate(c.bitrate ?? 128000); setTtsChannel(c.channel ?? 1);
                                            addToast(`已加载预设「${p.name}」`, 'success');
                                        }} className="text-[9px] bg-[#e8cfe8]/50 text-[#9b7e8f] px-2 py-1 rounded-lg font-bold active:scale-95 transition-transform">加载</button>
                                        <button onClick={() => {
                                            const updated = ttsPresets.filter((_, j) => j !== i);
                                            setTtsPresets(updated);
                                            localStorage.setItem('os_tts_presets', JSON.stringify(updated));
                                        }} className="text-[9px] text-[#b8aaa0] px-1.5 py-1 rounded-lg hover:text-red-400 transition-colors">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* API Key */}
                    <div className="bg-[#f3eef8]/60 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#e5ddf0]/40">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-[#9b7e8f]">API 连接</span>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Base URL (代理直连)</label>
                            <input type="text" value={ttsBaseUrl} onChange={e => setTtsBaseUrl(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="默认 /minimax-api" />
                            <p className="text-[10px] text-[#b8aaa0]/80 mt-1">跨域问题 (CORS) 必填。本地调试默认保留 <span className="font-mono bg-white/50 inline-block px-1 rounded text-[#9b7e8f]">/minimax-api</span></p>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">MiniMax API Key</label>
                            <input type="password" value={ttsApiKey} onChange={e => setTtsApiKey(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="Bearer Token" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Group ID <span className="text-[#c4929f]">（必填）</span></label>
                            <input type="text" value={ttsGroupId} onChange={e => setTtsGroupId(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="在 MiniMax 平台 → 账号 → 组织信息 中获取" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">模型</label>
                            <select value={ttsModel} onChange={e => setTtsModel(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                <option value="speech-2.8-hd">speech-2.8-hd (最新旗舰)</option>
                                <option value="speech-2.8-turbo">speech-2.8-turbo (最新快速)</option>
                                <option value="speech-2.6-hd">speech-2.6-hd</option>
                                <option value="speech-2.6-turbo">speech-2.6-turbo</option>
                                <option value="speech-02-hd">speech-02-hd</option>
                                <option value="speech-02-turbo">speech-02-turbo</option>
                                <option value="speech-01-hd">speech-01-hd</option>
                                <option value="speech-01-turbo">speech-01-turbo</option>
                            </select>
                        </div>
                    </div>

                    {/* 音色设置 */}
                    <div className="bg-[#fce4ec]/40 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f5d5da]/40">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-[#c4929f]">音色设置</span>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Voice ID</label>
                            <input type="text" value={ttsVoiceId} onChange={e => setTtsVoiceId(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#f5d5da]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="音色编号" />
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {['audiobook_male_1', 'Chinese (Mandarin)_Lyrical_Voice', 'English_Graceful_Lady', 'Japanese_Whisper_Belle'].map(v => (
                                <button key={v} onClick={() => setTtsVoiceId(v)} className={`text-[9px] px-2 py-1 rounded-lg font-medium transition-colors ${ttsVoiceId === v ? 'bg-[#c4929f] text-white' : 'bg-white/60 text-[#c4929f] border border-[#f5d5da]/50'}`}>{v.length > 18 ? v.slice(0, 18) + '...' : v}</button>
                            ))}
                        </div>
                        <div className="space-y-3">
                            {[{ label: '语速', value: ttsSpeed, set: setTtsSpeed, min: 0.5, max: 2, step: 0.1, fmt: (v: number) => v.toFixed(1) },
                            { label: '音量', value: ttsVol, set: setTtsVol, min: 0.1, max: 10, step: 0.1, fmt: (v: number) => v.toFixed(1) },
                            { label: '语调', value: ttsPitch, set: setTtsPitch, min: -12, max: 12, step: 1, fmt: (v: number) => String(v) },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-[#b8aaa0] w-8">{s.label}</label>
                                    <button onClick={() => s.set(Math.max(s.min, +(s.value - s.step).toFixed(2)))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform">−</button>
                                    <input type="number" value={s.fmt(s.value)} onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) s.set(Math.max(s.min, Math.min(s.max, v))); }} className="w-16 text-center bg-white/60 border border-[#f5d5da]/50 rounded-lg px-1 py-1 text-[11px] font-mono font-bold text-[#c4929f]" step={s.step} min={s.min} max={s.max} />
                                    <button onClick={() => s.set(Math.min(s.max, +(s.value + s.step).toFixed(2)))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform">+</button>
                                    <span className="text-[9px] text-[#b8aaa0]">{s.min}~{s.max}</span>
                                </div>
                            ))}
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">情绪</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {[{ v: '', l: '自动' }, { v: 'happy', l: '开心' }, { v: 'sad', l: '悲伤' }, { v: 'angry', l: '愤怒' }, { v: 'calm', l: '平静' }, { v: 'surprised', l: '惊讶' }, { v: 'fearful', l: '恐惧' }, { v: 'disgusted', l: '厌恶' }, { v: 'fluent', l: '生动' }].map(e => (
                                    <button key={e.v} onClick={() => setTtsEmotion(e.v)} className={`text-[9px] px-2.5 py-1.5 rounded-lg font-medium transition-colors ${ttsEmotion === e.v ? 'bg-[#c4929f] text-white' : 'bg-white/60 text-[#c4929f] border border-[#f5d5da]/50'}`}>{e.l}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">语种增强</label>
                            <select value={ttsLangBoost} onChange={e => setTtsLangBoost(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#f5d5da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                <option value="">不启用</option>
                                <option value="auto">自动判断</option>
                                <option value="Chinese">中文</option>
                                <option value="Chinese,Yue">粤语</option>
                                <option value="English">英语</option>
                                <option value="Japanese">日语</option>
                                <option value="Korean">韩语</option>
                                <option value="French">法语</option>
                                <option value="German">德语</option>
                                <option value="Spanish">西班牙语</option>
                                <option value="Russian">俄语</option>
                            </select>
                        </div>
                    </div>

                    {/* 声音效果器 */}
                    <div className="bg-[#e8f0fe]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#d4e4f7]/40">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-[#8ba4c4]">声音效果器</span>
                        </div>
                        <div className="space-y-3">
                            {[{ label: '音高', desc: '低沉↔明亮', value: ttsModifyPitch, set: setTtsModifyPitch },
                            { label: '强度', desc: '刚劲↔轻柔', value: ttsModifyIntensity, set: setTtsModifyIntensity },
                            { label: '音色', desc: '浑厚↔清脆', value: ttsModifyTimbre, set: setTtsModifyTimbre },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-[#b8aaa0] w-14 leading-tight">{s.label}<br /><span className="text-[8px] font-normal">{s.desc}</span></label>
                                    <button onClick={() => s.set(Math.max(-100, s.value - 10))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#d4e4f7]/50 text-[#8ba4c4] font-bold text-sm active:scale-90 transition-transform">−</button>
                                    <input type="number" value={s.value} onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) s.set(Math.max(-100, Math.min(100, v))); }} className="w-16 text-center bg-white/60 border border-[#d4e4f7]/50 rounded-lg px-1 py-1 text-[11px] font-mono font-bold text-[#8ba4c4]" step={10} min={-100} max={100} />
                                    <button onClick={() => s.set(Math.min(100, s.value + 10))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#d4e4f7]/50 text-[#8ba4c4] font-bold text-sm active:scale-90 transition-transform">+</button>
                                    <span className="text-[9px] text-[#b8aaa0]">-100~100</span>
                                </div>
                            ))}
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">音效</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {[{ v: '', l: '无' }, { v: 'spacious_echo', l: '空旷回音' }, { v: 'auditorium_echo', l: '礼堂广播' }, { v: 'lofi_telephone', l: '电话失真' }, { v: 'robotic', l: '电音' }].map(e => (
                                    <button key={e.v} onClick={() => setTtsSoundEffect(e.v)} className={`text-[9px] px-2.5 py-1.5 rounded-lg font-medium transition-colors ${ttsSoundEffect === e.v ? 'bg-[#8ba4c4] text-white' : 'bg-white/60 text-[#8ba4c4] border border-[#d4e4f7]/50'}`}>{e.l}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 音频格式 */}
                    <div className="bg-[#e6f5ee]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#d0e8da]/40">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-[#7faa95]">音频格式</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">格式</label>
                                <select value={ttsFormat} onChange={e => setTtsFormat(e.target.value as any)} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    <option value="mp3">MP3</option>
                                    <option value="pcm">PCM</option>
                                    <option value="flac">FLAC</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">采样率</label>
                                <select value={ttsSampleRate} onChange={e => setTtsSampleRate(Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    {[8000, 16000, 22050, 24000, 32000, 44100].map(r => <option key={r} value={r}>{r} Hz</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">比特率</label>
                                <select value={ttsBitrate} onChange={e => setTtsBitrate(Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    {[32000, 64000, 128000, 256000].map(b => <option key={b} value={b}>{b / 1000} kbps</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">声道</label>
                                <select value={ttsChannel} onChange={e => setTtsChannel(Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    <option value={1}>单声道</option>
                                    <option value={2}>双声道</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* 发音词典 */}
                    <div className="bg-[#fef5e7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-[#c4a86c]">发音词典</span>
                        </div>
                        <textarea value={ttsPronounceDict} onChange={e => setTtsPronounceDict(e.target.value)} rows={3} className="w-full bg-white/60 backdrop-blur-sm border border-[#f0e4d7]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono resize-none focus:bg-white/80 transition-all" placeholder={`每行一条规则，例如：\n燕少飞/(yan4)(shao3)(fei1)\nomg/oh my god`} />
                        <p className="text-[10px] text-[#c4a86c]/70">每行一条注音规则。中文声调: 1=一声 2=二声 3=三声 4=四声 5=轻声</p>
                    </div>

                    {/* AI 预处理 */}
                    <div className="bg-[#f0eaf7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#e5ddf0]/40">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-[#a18db8]">AI 语气预处理</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={ttsPreprocessEnabled} onChange={e => setTtsPreprocessEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#c4b0d9]"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-[#a18db8]/70">开启后，发送到 TTS 之前先用独立 AI 为文本添加语气词标签 (laughs)(sighs) 等，让朗读更自然。</p>
                        {ttsPreprocessEnabled && (
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Base URL</label>
                                    <input type="text" value={ttsPreprocessApiBase} onChange={e => setTtsPreprocessApiBase(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="https://api.openai.com/v1 或其他兼容接口" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Key</label>
                                    <input type="password" value={ttsPreprocessApiKey} onChange={e => setTtsPreprocessApiKey(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="sk-..." />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">模型 <span className="text-[#a18db8] font-normal normal-case">推荐 flash/turbo</span></label>
                                    <div className="flex gap-2">
                                        <input type="text" value={ttsPreprocessModel} onChange={e => setTtsPreprocessModel(e.target.value)} className="flex-1 bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="gemini-2.0-flash / gpt-4o-mini ..." />
                                        <button
                                            onClick={async () => {
                                                if (!ttsPreprocessApiBase) { setPpStatus('❌ 请先填写 URL'); return; }
                                                setPpLoading(true); setPpStatus('⏳ 拉取中...');
                                                try {
                                                    const base = ttsPreprocessApiBase.replace(/\/+$/, '');
                                                    const res = await fetch(`${base}/models`, { headers: { 'Authorization': `Bearer ${ttsPreprocessApiKey}`, 'Content-Type': 'application/json' } });
                                                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                                    const data = await res.json();
                                                    const list = (data.data || data.models || []).map((m: any) => m.id || m).filter(Boolean);
                                                    setPpModels(list);
                                                    if (list.length > 0 && !ttsPreprocessModel) setTtsPreprocessModel(list[0]);
                                                    setPpStatus(`✅ 获取到 ${list.length} 个模型`);
                                                } catch (e: any) { setPpStatus(`❌ ${e.message}`); }
                                                finally { setPpLoading(false); }
                                            }}
                                            disabled={ppLoading}
                                            className="text-[10px] bg-[#e8cfe8]/50 text-[#a18db8] px-3 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-transform disabled:opacity-50"
                                        >{ppLoading ? '拉取中...' : '拉取模型'}</button>
                                    </div>
                                    {ppModels.length > 0 && (
                                        <div className="mt-1.5 max-h-24 overflow-y-auto bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl">
                                            {ppModels.map(m => (
                                                <button key={m} onClick={() => setTtsPreprocessModel(m)} className={`block w-full text-left px-3 py-1.5 text-[10px] font-mono truncate transition-colors ${ttsPreprocessModel === m ? 'bg-[#e8cfe8]/50 text-[#9b7e8f] font-bold' : 'text-[#8b7e74] hover:bg-[#f0eaf7]/50'}`}>{m}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!ttsPreprocessApiBase || !ttsPreprocessApiKey || !ttsPreprocessModel) { setPpStatus('❌ 请先填写完整配置'); return; }
                                        setPpStatus('⏳ 测试连接中...');
                                        try {
                                            const base = ttsPreprocessApiBase.replace(/\/+$/, '');
                                            const res = await fetch(`${base}/chat/completions`, {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${ttsPreprocessApiKey}`, 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ model: ttsPreprocessModel, messages: [{ role: 'user', content: 'hello' }], max_tokens: 1 })
                                            });
                                            if (res.ok) setPpStatus('✅ 连接成功！模型可用');
                                            else if (res.status === 401) setPpStatus('❌ API Key 无效');
                                            else if (res.status === 404) setPpStatus('❌ 模型不存在或 URL 错误');
                                            else setPpStatus(`❌ HTTP ${res.status}`);
                                        } catch (e: any) { setPpStatus(`❌ 网络错误: ${e.message}`); }
                                    }}
                                    className="w-full py-2 bg-[#e8cfe8]/40 text-[#a18db8] text-xs font-bold rounded-xl active:scale-95 transition-transform"
                                >测试连接</button>
                                {ppStatus && <p className={`text-[10px] text-center font-medium ${ppStatus.startsWith('✅') ? 'text-[#7faa95]' : ppStatus.startsWith('⏳') ? 'text-[#b8aaa0]' : 'text-red-400'}`}>{ppStatus}</p>}
                                <div className="border-t border-[#e5ddf0]/50 pt-2">
                                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">预处理提示词</label>
                                    <textarea value={ttsPreprocessPrompt} onChange={e => setTtsPreprocessPrompt(e.target.value)} rows={4} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] resize-none focus:bg-white/80 transition-all" />
                                    <button onClick={() => setTtsPreprocessPrompt(DEFAULT_TTS_PREPROCESS_PROMPT)} className="text-[10px] text-[#a18db8] underline">重置为默认提示词</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 测试合成 */}
                    <div className="bg-[#f9f3ee]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-[#8b7e74]">测试合成</span>
                        </div>
                        <textarea value={ttsTestText} onChange={e => setTtsTestText(e.target.value)} rows={2} className="w-full bg-white/60 backdrop-blur-sm border border-[#f0e4d7]/50 rounded-xl px-3 py-2.5 text-sm resize-none focus:bg-white/80 transition-all" placeholder="输入测试文本..." />
                        <button
                            onClick={async () => {
                                if (!ttsApiKey) { setTtsTestStatus('❌ 请先填写 API Key'); return; }
                                setTtsTestStatus('⏳ 正在合成...');
                                if (ttsTestAudioUrl) { MinimaxTts.revokeUrl(ttsTestAudioUrl); setTtsTestAudioUrl(''); }
                                try {
                                    const testConfig: TtsConfig = {
                                        baseUrl: ttsBaseUrl, apiKey: ttsApiKey, groupId: ttsGroupId, model: ttsModel,
                                        voiceSetting: { voice_id: ttsVoiceId, speed: ttsSpeed, vol: ttsVol, pitch: ttsPitch, emotion: ttsEmotion || undefined },
                                        audioSetting: { audio_sample_rate: ttsSampleRate, bitrate: ttsBitrate, format: ttsFormat as any, channel: ttsChannel },
                                        voiceModify: (ttsModifyPitch || ttsModifyIntensity || ttsModifyTimbre || ttsSoundEffect) ? { pitch: ttsModifyPitch, intensity: ttsModifyIntensity, timbre: ttsModifyTimbre, sound_effects: ttsSoundEffect || undefined } : undefined,
                                        languageBoost: ttsLangBoost || undefined,
                                        preprocessConfig: { enabled: false, prompt: '', apiBase: '', apiKey: '', model: '' },
                                    };
                                    const result = await MinimaxTts.synthesize(ttsTestText, testConfig, (_s, msg) => setTtsTestStatus(`⏳ ${msg}`));
                                    setTtsTestAudioUrl(result.url);
                                    setTtsTestStatus(`✅ 合成成功！字符数: ${result.usageCharacters || '?'}`);
                                } catch (e: any) {
                                    setTtsTestStatus(`❌ ${e.message}`);
                                }
                            }}
                            disabled={ttsTestStatus.startsWith('⏳')}
                            className="w-full py-2.5 bg-gradient-to-r from-[#e8a0bf]/60 to-[#c4b0d9]/60 backdrop-blur-sm text-[#8b7e74] text-xs font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 border border-white/30"
                        >
                            {ttsTestStatus.startsWith('⏳') ? ttsTestStatus : '测试合成'}
                        </button>
                        {ttsTestAudioUrl && (
                            <audio controls src={ttsTestAudioUrl} className="w-full mt-2" style={{ height: 36 }} />
                        )}
                        {ttsTestStatus && !ttsTestStatus.startsWith('⏳') && (
                            <p className={`text-xs text-center font-medium ${ttsTestStatus.startsWith('✅') ? 'text-[#7faa95]' : 'text-red-400'}`}>{ttsTestStatus}</p>
                        )}
                    </div>

                </div>
            </Modal>

        </div>
    );
};

export default Settings;
