
import { MemoryFragment, SpriteConfig, SkinSet, UserImpression } from './chat';
import { RoomItem, RoomGeneratedState } from './room';
import { ChatTheme, BubbleStyle } from './chat';

// --- DATE APP TYPES ---
export interface DialogueItem {
    text: string;
    emotion?: string;
}

export interface DateState {
    dialogueQueue: DialogueItem[];
    dialogueBatch: DialogueItem[];
    currentText: string;
    bgImage: string;
    currentSprite: string;
    isNovelMode: boolean;
    timestamp: number;
    peekStatus: string;
}

export interface SpecialMomentRecord {
    content: string;
    timestamp: number;
    source?: 'generated' | 'migrated';
}

export interface PhoneCustomApp {
    id: string;
    name: string;
    icon: string;
    color: string;
    prompt: string;
}

export interface PhoneEvidence {
    id: string;
    type: 'chat' | 'order' | 'social' | 'delivery' | string;
    title: string;
    detail: string;
    timestamp: number;
    systemMessageId?: number;
    value?: string;
    shop?: string;  // Store/shop name (used by Taobao order cards)
}

export interface Worldbook {
    id: string;
    title: string;
    content: string;
    category: string;
    position?: 'top' | 'after_worldview' | 'after_impression' | 'bottom';
    createdAt: number;
    updatedAt: number;
}

export interface GroupProfile {
    id: string;
    name: string;
    members: string[];
    avatar?: string;
    createdAt: number;
}

export interface CharacterProfile {
    id: string;
    name: string;
    avatar: string;
    description: string;
    systemPrompt: string;
    worldview?: string;
    memories: MemoryFragment[];
    refinedMemories?: Record<string, string>;
    activeMemoryMonths?: string[];

    writerPersona?: string;
    writerPersonaGeneratedAt?: number;

    mountedWorldbooks?: { id: string; title: string; content: string; category?: string; position?: 'top' | 'after_worldview' | 'after_impression' | 'bottom' }[];

    impression?: UserImpression;

    bubbleStyle?: string;
    chatBackground?: string;
    contextLimit?: number;
    hideSystemLogs?: boolean;
    hideBeforeMessageId?: number;

    dateBackground?: string;
    sprites?: Record<string, string>;
    spriteConfig?: SpriteConfig;
    customDateSprites?: string[]; // User-added custom emotion names for date mode (per-character)
    dateLightReading?: boolean;   // Light reading mode for novel/text view in date
    dateSkinSets?: SkinSet[];     // Multiple skin sets for portrait mode
    activeSkinSetId?: string;     // Currently active skin set ID

    savedDateState?: DateState;
    specialMomentRecords?: Record<string, SpecialMomentRecord>;

    // 小红�?per-character toggle
    xhsEnabled?: boolean;

    socialProfile?: {
        handle: string;
        bio?: string;
    };

    roomConfig?: {
        bgImage?: string;
        wallImage?: string;
        floorImage?: string;
        items: RoomItem[];
        wallScale?: number;
        wallRepeat?: boolean;
        floorScale?: number;
        floorRepeat?: boolean;
    };

    lastRoomDate?: string;
    savedRoomState?: RoomGeneratedState;

    phoneState?: {
        records?: PhoneEvidence[];
        customApps?: PhoneCustomApp[];
    };
}

export interface CharacterExportData extends Omit<CharacterProfile, 'id' | 'memories' | 'refinedMemories' | 'activeMemoryMonths' | 'impression'> {
    version: number;
    type: 'sully_character_card';
    embeddedTheme?: ChatTheme;
}
