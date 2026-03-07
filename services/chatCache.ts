
import { ChatMessage } from '../types';

interface ChannelCache {
    messages: ChatMessage[];
    earliestBlock: number; // The oldest block we have scanned back to
    latestBlock: number;   // The newest block we have scanned up to
    timestamp: number;     // When this cache was last updated
}

class ChatCacheService {
    private cache: Map<string, ChannelCache> = new Map();
    private MAX_CACHE_AGE = 1000 * 60 * 60; // 1 hour expiration if unused

    getCache(address: string): ChannelCache | null {
        const data = this.cache.get(address.toLowerCase());
        if (!data) return null;
        return data;
    }

    setCache(address: string, messages: ChatMessage[], earliestBlock: number, latestBlock: number) {
        this.cache.set(address.toLowerCase(), {
            messages,
            earliestBlock,
            latestBlock,
            timestamp: Date.now()
        });
    }

    clear() {
        this.cache.clear();
    }
}

export const ChatCache = new ChatCacheService();
