import { CharacterProfile, GroupProfile, Message } from '../../types';
import { openDB, STORE_CHARACTERS, STORE_MESSAGES, STORE_GROUPS, ScheduledMessage, STORE_SCHEDULED } from './core';

// --- Characters ---
export const getAllCharacters = async (): Promise<CharacterProfile[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_CHARACTERS, 'readonly');
        const store = transaction.objectStore(STORE_CHARACTERS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const saveCharacter = async (character: CharacterProfile): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_CHARACTERS, 'readwrite');
    transaction.objectStore(STORE_CHARACTERS).put(character);
};

export const deleteCharacter = async (id: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_CHARACTERS, 'readwrite');
    transaction.objectStore(STORE_CHARACTERS).delete(id);
};

// --- Messages ---
export const getMessagesByCharId = async (charId: string): Promise<Message[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('charId');
        const request = index.getAll(IDBKeyRange.only(charId));
        request.onsuccess = () => {
            const results = (request.result || []).filter((m: Message) => !m.groupId);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const getRecentMessagesByCharId = async (charId: string, limit: number): Promise<Message[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('charId');
        const collected: Message[] = [];
        const cursorReq = index.openCursor(IDBKeyRange.only(charId), 'prev');
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor && collected.length < limit) {
                const m = cursor.value as Message;
                if (!m.groupId) collected.push(m);
                cursor.continue();
            } else {
                resolve(collected.reverse());
            }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
    });
};

export const getRecentMessagesWithCount = async (charId: string, limit: number): Promise<{ messages: Message[], totalCount: number }> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('charId');
        const countReq = index.count(IDBKeyRange.only(charId));
        countReq.onsuccess = () => {
            const totalCount = countReq.result;
            const collected: Message[] = [];
            const cursorReq = index.openCursor(IDBKeyRange.only(charId), 'prev');
            cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (cursor && collected.length < limit) {
                    const m = cursor.value as Message;
                    if (!m.groupId) collected.push(m);
                    cursor.continue();
                } else {
                    resolve({ messages: collected.reverse(), totalCount });
                }
            };
            cursorReq.onerror = () => reject(cursorReq.error);
        };
        countReq.onerror = () => reject(countReq.error);
    });
};

export const getMessagesFromId = async (charId: string, fromId: number): Promise<{ messages: Message[], totalCount: number }> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('charId');
        const collected: Message[] = [];
        const cursorReq = index.openCursor(IDBKeyRange.only(charId));
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
                const m = cursor.value as Message;
                if (!m.groupId && m.id >= fromId) {
                    collected.push(m);
                }
                cursor.continue();
            } else {
                resolve({ messages: collected, totalCount: collected.length });
            }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
    });
};

export const saveMessage = async (msg: Omit<Message, 'id' | 'timestamp'>): Promise<number> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = transaction.objectStore(STORE_MESSAGES);
        const request = store.add({ ...msg, timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
    });
};

export const updateMessage = async (id: number, content: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as Message;
            if (data) { data.content = content; store.put(data); resolve(); }
            else reject(new Error('Message not found'));
        };
        req.onerror = () => reject(req.error);
    });
};

export const updateMessageMetadata = async (id: number, metadataUpdates: Record<string, any>): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as Message;
            if (data) { data.metadata = { ...(data.metadata || {}), ...metadataUpdates }; store.put(data); resolve(); }
            else reject(new Error('Message not found'));
        };
        req.onerror = () => reject(req.error);
    });
};

export const deleteMessage = async (id: number): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    transaction.objectStore(STORE_MESSAGES).delete(id);
};

export const deleteMessages = async (ids: number[]): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    ids.forEach(id => store.delete(id));
    return new Promise((resolve) => { transaction.oncomplete = () => resolve(); });
};

export const clearMessages = async (charId: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    const index = store.index('charId');
    const request = index.openCursor(IDBKeyRange.only(charId));
    request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
            const m = cursor.value as Message;
            if (!m.groupId) store.delete(cursor.primaryKey);
            cursor.continue();
        }
    };
};

// --- Groups ---
export const getGroups = async (): Promise<GroupProfile[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_GROUPS)) return [];
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_GROUPS, 'readonly');
        const request = transaction.objectStore(STORE_GROUPS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const saveGroup = async (group: GroupProfile): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_GROUPS, 'readwrite').objectStore(STORE_GROUPS).put(group);
};

export const deleteGroup = async (id: string): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_GROUPS, 'readwrite').objectStore(STORE_GROUPS).delete(id);
};

export const getGroupMessages = async (groupId: string): Promise<Message[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const index = transaction.objectStore(STORE_MESSAGES).index('groupId');
        const request = index.getAll(IDBKeyRange.only(groupId));
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const getRecentGroupMessagesWithCount = async (groupId: string, limit: number): Promise<{ messages: Message[], totalCount: number }> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const index = transaction.objectStore(STORE_MESSAGES).index('groupId');
        const countReq = index.count(IDBKeyRange.only(groupId));
        countReq.onsuccess = () => {
            const totalCount = countReq.result;
            const collected: Message[] = [];
            const cursorReq = index.openCursor(IDBKeyRange.only(groupId), 'prev');
            cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (cursor && collected.length < limit) { collected.push(cursor.value as Message); cursor.continue(); }
                else resolve({ messages: collected.reverse(), totalCount });
            };
            cursorReq.onerror = () => reject(cursorReq.error);
        };
        countReq.onerror = () => reject(countReq.error);
    });
};

// --- Scheduled Messages ---
export const saveScheduledMessage = async (msg: ScheduledMessage): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_SCHEDULED, 'readwrite').objectStore(STORE_SCHEDULED).put(msg);
};

export const getDueScheduledMessages = async (charId: string): Promise<ScheduledMessage[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_SCHEDULED, 'readonly');
        const index = transaction.objectStore(STORE_SCHEDULED).index('charId');
        const request = index.getAll(IDBKeyRange.only(charId));
        request.onsuccess = () => {
            const all = request.result as ScheduledMessage[];
            resolve(all.filter(m => m.dueAt <= Date.now()));
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteScheduledMessage = async (id: string): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_SCHEDULED, 'readwrite').objectStore(STORE_SCHEDULED).delete(id);
};
