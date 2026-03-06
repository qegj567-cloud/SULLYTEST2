
// ─── MiniMax TTS (Text-to-Audio) 配置类型 ───────────────────────────────
// 独立模块：定义语音合成所需的所有配置接口
// API 文档: https://platform.minimaxi.com/docs

/** 音色设置 */
export interface TtsVoiceSetting {
    /** 音色 ID（系统音色 / 复刻音色 / 文生音色） */
    voice_id: string;
    /** 语速 0.5–2，默认 1.0 */
    speed: number;
    /** 音量 (0, 10]，默认 1.0 */
    vol: number;
    /** 语调 -12–12，默认 0（原音色） */
    pitch: number;
    /**
     * 情绪控制，模型通常自动匹配
     * 可选: happy | sad | angry | fearful | disgusted | surprised | calm | fluent | whisper
     * - fluent / whisper 仅 speech-2.6 系列
     * - speech-2.8 不支持 whisper
     */
    emotion?: string;
    /** 英语文本规范化（提升数字阅读，略增延迟） */
    english_normalization?: boolean;
}

/** 音频输出设置 */
export interface TtsAudioSetting {
    /** 采样率: 8000 | 16000 | 22050 | 24000 | 32000 | 44100，默认 32000 */
    audio_sample_rate: number;
    /** 比特率: 32000 | 64000 | 128000 | 256000，默认 128000（仅 mp3） */
    bitrate: number;
    /** 输出格式: mp3 | pcm | flac，默认 mp3 */
    format: 'mp3' | 'pcm' | 'flac';
    /** 声道: 1 单声道 | 2 双声道，默认 1 */
    channel: number;
}

/** 声音效果器 */
export interface TtsVoiceModify {
    /** 音高 -100~100（负=低沉，正=明亮） */
    pitch: number;
    /** 强度 -100~100（负=刚劲，正=轻柔） */
    intensity: number;
    /** 音色 -100~100（负=浑厚，正=清脆） */
    timbre: number;
    /** 音效: spacious_echo | auditorium_echo | lofi_telephone | robotic */
    sound_effects?: string;
}

/** 发音词典 */
export interface TtsPronunciationDict {
    /**
     * 注音/发音替换规则
     * 中文声调: 1=一声 2=二声 3=三声 4=四声 5=轻声
     * 示例: ["燕少飞/(yan4)(shao3)(fei1)", "omg/oh my god"]
     */
    tone: string[];
}

/** AI 预处理配置（用独立 AI 为文本添加语气词标签） */
export interface TtsPreprocessConfig {
    /** 是否启用 AI 预处理 */
    enabled: boolean;
    /**
     * 自定义预处理提示词
     * 告诉 AI 如何为文本添加语气词 (sighs)(laughs) 和停顿标记 <#x#>
     */
    prompt: string;
    /** 预处理 AI 的 API Base URL（OpenAI 兼容格式） */
    apiBase: string;
    /** 预处理 AI 的 API Key */
    apiKey: string;
    /** 预处理 AI 模型名（建议用 flash/turbo 系列，又快又便宜） */
    model: string;
}

// ─── 汇总配置 ────────────────────────────────────────────────────────────

/** MiniMax TTS 完整配置 */
export interface TtsConfig {
    /** 
     * API 代理 / 基础 URL
     * 默认 '/minimax-api' (利用 Vite 解决本地 CORS)
     * 或填入 'https://api.minimaxi.com' / 其他反代域名
     */
    baseUrl: string;
    /** MiniMax API Key */
    apiKey: string;
    /**
     * MiniMax Group ID（必填）
     * Authorization 头格式: Bearer {GroupId};{ApiKey}
     * 在 MiniMax 开放平台 -> 账号 -> 组织信息 中获取
     */
    groupId: string;
    /**
     * 模型版本
     * speech-2.8-hd | speech-2.8-turbo | speech-2.6-hd | speech-2.6-turbo
     * speech-02-hd | speech-02-turbo | speech-01-hd | speech-01-turbo
     */
    model: string;
    /** 音色设置 */
    voiceSetting: TtsVoiceSetting;
    /** 音频输出设置 */
    audioSetting: TtsAudioSetting;
    /** 声音效果器（可选） */
    voiceModify?: TtsVoiceModify;
    /** 发音词典（可选） */
    pronunciationDict?: TtsPronunciationDict;
    /**
     * 小语种/方言增强
     * 可选 auto 或指定语种如 Chinese, English, Japanese 等
     */
    languageBoost?: string;
    /** AI 预处理配置 */
    preprocessConfig: TtsPreprocessConfig;
    /** 是否添加 AIGC 音频水印，默认 false */
    aigcWatermark?: boolean;
}

// ─── 默认值 ──────────────────────────────────────────────────────────────

export const DEFAULT_TTS_PREPROCESS_PROMPT = `你是语音标注助手。请将文本中的语气词和动作描写转化为 MiniMax TTS 标签，同时优化文本的朗读节奏，使其听起来像真人自然说话，带有呼吸感和情感温度。

可用标签（只用这些）：
(laughs) (chuckle) (sighs) (breath) (gasps) (coughs) (sniffs) (crying) (humming) (pant) (emm)
<#数字#> → 停顿（秒）

标注规则：
1. 语气词替换：咳/咳咳→(coughs) 嗯/额→(emm) 哈哈→(laughs) 嘿嘿/呵→(chuckle) 唉/哎→(sighs) 呜→(crying) 哼→(humming) 啊!→(gasps)
2. 括号动作转换：（笑）→(chuckle) （叹气）→(sighs) （清嗓）→(coughs) 无法表达的动作直接删除
3. 省略号"..."根据语境转为 <#1#> 停顿
4. 自然呼吸：超过15个字的长句中间插入一个 (breath)
5. 关键转折、称呼对方名字之前加 <#1#> 停顿
6. 带撒娇/温柔语气的句子，句首可加 (breath) 营造气息感
7. 不要修改说话的实际内容，不要添加解释
8. 直接输出处理后的文本`;

export const DEFAULT_TTS_CONFIG: TtsConfig = {
    baseUrl: '/minimax-api',
    apiKey: '',
    groupId: '',
    model: 'speech-2.8-hd',
    voiceSetting: {
        voice_id: 'audiobook_male_1',
        speed: 1.0,
        vol: 1.0,
        pitch: 0,
    },
    audioSetting: {
        audio_sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
    },
    preprocessConfig: {
        enabled: false,
        prompt: DEFAULT_TTS_PREPROCESS_PROMPT,
        apiBase: '',
        apiKey: '',
        model: '',
    },
};

// ─── API 响应类型 ────────────────────────────────────────────────────────

/** 创建任务的响应 */
export interface TtsCreateTaskResponse {
    task_id: string;
    file_id: number;
    task_token: string;
    usage_characters: number;
    base_resp: { status_code: number; status_msg: string };
}

/** 查询任务状态的响应 */
export interface TtsQueryTaskResponse {
    task_id: string;
    status: 'Processing' | 'Success' | 'Failed';
    file_id: number;
    base_resp: { status_code: number; status_msg: string };
}
