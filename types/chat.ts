
export interface MemoryFragment {
    id: string;
    date: string;
    summary: string;
    mood?: string;
}

export interface SpriteConfig {
    scale: number;
    x: number;
    y: number;
}

export interface SkinSet {
    id: string;
    name: string;
    sprites: Record<string, string>; // emotion -> image URL or base64
}

export interface UserImpression {
    version: number;
    lastUpdated?: number;
    value_map: {
        likes: string[];
        dislikes: string[];
        core_values: string;
    };
    behavior_profile: {
        tone_style: string;
        emotion_summary: string;
        response_patterns: string;
    };
    emotion_schema: {
        triggers: {
            positive: string[];
            negative: string[];
        };
        comfort_zone: string;
        stress_signals: string[];
    };
    personality_core: {
        observed_traits: string[];
        interaction_style: string;
        summary: string;
    };
    mbti_analysis?: {
        type: string;
        reasoning: string;
        dimensions: {
            e_i: number;
            s_n: number;
            t_f: number;
            j_p: number;
        }
    };
    observed_changes?: string[];
}

export interface BubbleStyle {
    textColor: string;
    backgroundColor: string;
    backgroundImage?: string;
    backgroundImageOpacity?: number;
    borderRadius: number;
    opacity: number;

    decoration?: string;
    decorationX?: number;
    decorationY?: number;
    decorationScale?: number;
    decorationRotate?: number;

    avatarDecoration?: string;
    avatarDecorationX?: number;
    avatarDecorationY?: number;
    avatarDecorationScale?: number;
    avatarDecorationRotate?: number;
}

export interface ChatTheme {
    id: string;
    name: string;
    type: 'preset' | 'custom';
    baseThemeId?: string; // Inherited preset theme ID for CSS class (header/input/card styling)
    user: BubbleStyle;
    ai: BubbleStyle;
    customCss?: string;
    /** Theme-level: force-enable timestamp separators (e.g. WeChat). undefined/false = off */
    showTimestamp?: boolean;
    /** Minimum ms gap between messages to show a timestamp separator (default 180000 = 3min) */
    timestampIntervalMs?: number;
}

export type MessageType = 'text' | 'image' | 'emoji' | 'interaction' | 'transfer' | 'system' | 'social_card' | 'chat_forward' | 'xhs_card' | 'moments' | 'voice';

export interface Message {
    id: number;
    charId: string;
    groupId?: string;
    role: 'user' | 'assistant' | 'system';
    type: MessageType;
    content: string;
    timestamp: number;
    metadata?: any;
    replyTo?: {
        id: number;
        content: string;
        name: string;
    };
}

export interface EmojiCategory {
    id: string;
    name: string;
    isSystem?: boolean;
    allowedCharacterIds?: string[]; // If set, only these characters can see this category
}

export interface Emoji {
    name: string;
    url: string;
    categoryId?: string;
}
