
import { ChatMessage } from '../types';

const DB_NAME = 'DysnomiaDB';
const DB_VERSION = 3; // Incremented for schema updates

export interface SectorData {
    address: string;
    name: string;
    symbol: string;
    integrative: string;
    waat: string;
    isSystem: boolean;
    hecke?: {
        lat: string;
        lon: string;
    };
}

export interface LauData {
    address: string;
    owner: string;
    blockNumber: number;
    timestamp: number;
    username?: string;
    soulId?: string; // Added to ensure avatar consistency
}

export interface Range {
    start: number;
    end: number;
}

export interface ChannelMeta {
    address: string;
    scannedRanges: Range[];
    lastUpdated: number;
}

export interface ExportPackage {
    version: string;
    timestamp: number;
    type: 'FULL' | 'MAP' | 'CHAT' | 'LAU';
    sectors?: SectorData[];
    laus?: LauData[];
    channels: {
        address: string;
        meta: ChannelMeta;
        messages: ChatMessage[];
    }[];
}

export type ExportMode = 'FULL' | 'MAP' | 'CHAT' | 'LAU';

class PersistenceService {
    private dbPromise: Promise<IDBDatabase> | null = null;

    constructor() {
        this.init();
    }

    private init(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains('sectors')) {
                    db.createObjectStore('sectors', { keyPath: 'address' });
                }

                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
                    msgStore.createIndex('tokenAddress', 'tokenAddress', { unique: false });
                    msgStore.createIndex('blockNumber', 'blockNumber', { unique: false });
                    msgStore.createIndex('token_block', ['tokenAddress', 'blockNumber'], { unique: false });
                }

                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'address' });
                }

                if (!db.objectStoreNames.contains('laus')) {
                    const lauStore = db.createObjectStore('laus', { keyPath: 'address' });
                    lauStore.createIndex('owner', 'owner', { unique: false });
                    lauStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });

        return this.dbPromise;
    }

    async clearDatabase(): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['sectors', 'messages', 'meta', 'laus'], 'readwrite');
            
            tx.objectStore('sectors').clear();
            tx.objectStore('messages').clear();
            tx.objectStore('meta').clear();
            tx.objectStore('laus').clear();

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // --- GRANULAR CLEARING ---

    async clearLaus(): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('laus', 'readwrite');
            tx.objectStore('laus').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async clearChatHistory(tokenAddress: string): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['messages', 'meta'], 'readwrite');
            const msgStore = tx.objectStore('messages');
            const index = msgStore.index('tokenAddress');
            const range = IDBKeyRange.only(tokenAddress.toLowerCase());
            
            // Delete messages for this token
            const req = index.openCursor(range);
            req.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            // Reset scan meta for this token
            tx.objectStore('meta').delete(tokenAddress.toLowerCase());

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async clearMapData(mapAddress: string): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['sectors', 'meta'], 'readwrite');
            tx.objectStore('sectors').clear();
            tx.objectStore('meta').delete(mapAddress.toLowerCase());
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // --- SECTOR MANAGEMENT ---

    async saveSector(sector: SectorData): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('sectors', 'readwrite');
            const store = tx.objectStore('sectors');
            const addr = sector.address.toLowerCase();
            
            // Read existing to preserve Hecke data if present and not provided in update
            const request = store.get(addr);
            
            request.onsuccess = () => {
                const existing = request.result;
                const merged = { 
                    ...existing, // Keep existing fields (like hecke)
                    ...sector,   // Overwrite with new fields
                    address: addr // Ensure address is key
                };
                
                // If the new update has explicitly null/undefined hecke, we keep existing. 
                // If it HAS hecke, it overrides.
                if (!sector.hecke && existing?.hecke) {
                    merged.hecke = existing.hecke;
                }

                store.put(merged);
            };
            
            request.onerror = () => {
                // If read fails, just put (should rarely happen)
                const safeSector = { ...sector, address: addr };
                store.put(safeSector);
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getAllSectors(): Promise<SectorData[]> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('sectors', 'readonly');
            const request = tx.objectStore('sectors').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- LAU MANAGEMENT ---

    async saveLau(lau: LauData): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('laus', 'readwrite');
            // Enforce lowercase address for key consistency
            const safeLau = { ...lau, address: lau.address.toLowerCase() };
            tx.objectStore('laus').put(safeLau);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getAllLaus(): Promise<LauData[]> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('laus', 'readonly');
            const request = tx.objectStore('laus').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getLau(address: string): Promise<LauData | undefined> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('laus', 'readonly');
            const request = tx.objectStore('laus').get(address.toLowerCase());
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- MESSAGE MANAGEMENT ---

    async saveMessages(messages: ChatMessage[], tokenAddress: string): Promise<void> {
        if (messages.length === 0) return;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            
            messages.forEach(msg => {
                const msgWithToken = { ...msg, tokenAddress: tokenAddress.toLowerCase() };
                store.put(msgWithToken);
            });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getMessages(tokenAddress: string, limit: number = 500): Promise<ChatMessage[]> {
        const db = await this.init();
        const addr = tokenAddress.toLowerCase();
        
        return new Promise((resolve, reject) => {
            const tx = db.transaction('messages', 'readonly');
            const index = tx.objectStore('messages').index('token_block');
            
            const range = IDBKeyRange.bound([addr, 0], [addr, Infinity]);
            const request = index.openCursor(range, 'prev'); 
            
            const results: ChatMessage[] = [];
            
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results.reverse());
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // --- RANGE TRACKING ---

    async updateScannedRange(tokenAddress: string, start: number, end: number): Promise<void> {
        const db = await this.init();
        const addr = tokenAddress.toLowerCase();

        const meta: ChannelMeta = await new Promise((resolve) => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').get(addr);
            req.onsuccess = () => resolve(req.result || { address: addr, scannedRanges: [], lastUpdated: 0 });
        });

        const newRanges = this.mergeRanges(meta.scannedRanges, { start, end });

        return new Promise((resolve, reject) => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({
                address: addr,
                scannedRanges: newRanges,
                lastUpdated: Date.now()
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getChannelMeta(tokenAddress: string): Promise<ChannelMeta | null> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').get(tokenAddress.toLowerCase());
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    private mergeRanges(existing: Range[], newRange: Range): Range[] {
        let ranges = [...existing, newRange];
        ranges.sort((a, b) => a.start - b.start);

        const merged: Range[] = [];
        if (ranges.length === 0) return [];
        
        let current = ranges[0];

        for (let i = 1; i < ranges.length; i++) {
            const next = ranges[i];
            if (current.end + 1 >= next.start) {
                current.end = Math.max(current.end, next.end);
                current.start = Math.min(current.start, next.start);
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    }

    // --- IMPORT / EXPORT ---

    async exportData(mode: ExportMode, tokenAddress?: string): Promise<string> {
        const db = await this.init();
        
        const exportPkg: ExportPackage = {
            version: '1.2',
            timestamp: Date.now(),
            type: mode,
            sectors: [],
            laus: [],
            channels: []
        };

        // 1. Export Sectors (If Mode is FULL or MAP)
        if (mode === 'FULL' || mode === 'MAP') {
            exportPkg.sectors = await this.getAllSectors();
        }

        // 2. Export LAUs (If Mode is FULL or LAU)
        if (mode === 'FULL' || mode === 'LAU') {
            exportPkg.laus = await this.getAllLaus();
        }

        // 3. Export Channels (If Mode is FULL or CHAT)
        if (mode === 'FULL' || mode === 'CHAT') {
            let addressesToExport: string[] = [];
            
            if (tokenAddress) {
                addressesToExport = [tokenAddress.toLowerCase()];
            } else if (mode === 'FULL') {
                const allMeta: ChannelMeta[] = await new Promise((resolve) => {
                    const tx = db.transaction('meta', 'readonly');
                    const req = tx.objectStore('meta').getAll();
                    req.onsuccess = () => resolve(req.result);
                });
                addressesToExport = allMeta.map(m => m.address);
            }

            for (const addr of addressesToExport) {
                const meta = await this.getChannelMeta(addr);
                const messages = await new Promise<ChatMessage[]>((resolve) => {
                    const tx = db.transaction('messages', 'readonly');
                    const index = tx.objectStore('messages').index('tokenAddress');
                    const req = index.getAll(IDBKeyRange.only(addr));
                    req.onsuccess = () => resolve(req.result);
                });

                if (meta) {
                    exportPkg.channels.push({
                        address: addr,
                        meta,
                        messages
                    });
                }
            }
        }

        return JSON.stringify(exportPkg, null, 2);
    }

    async importData(jsonString: string): Promise<{ sectorsAdded: number, messagesAdded: number, lausAdded: number }> {
        let pkg: ExportPackage;
        try {
            pkg = JSON.parse(jsonString);
        } catch (e) {
            throw new Error("Invalid JSON format");
        }

        let sectorsAdded = 0;
        let messagesAdded = 0;
        let lausAdded = 0;

        // 1. Import Sectors
        if (pkg.sectors && Array.isArray(pkg.sectors)) {
            for (const sector of pkg.sectors) {
                await this.saveSector(sector);
                sectorsAdded++;
            }
        }

        // 2. Import LAUs
        if (pkg.laus && Array.isArray(pkg.laus)) {
            for (const lau of pkg.laus) {
                await this.saveLau(lau);
                lausAdded++;
            }
        }

        // 3. Import Channels
        if (pkg.channels && Array.isArray(pkg.channels)) {
            for (const channel of pkg.channels) {
                const { address, meta, messages } = channel;
                
                if (messages && messages.length > 0) {
                    await this.saveMessages(messages, address);
                    messagesAdded += messages.length;
                }

                if (meta) {
                    const existingMeta = await this.getChannelMeta(address);
                    let mergedRanges = meta.scannedRanges;
                    
                    if (existingMeta) {
                        let currentRanges = existingMeta.scannedRanges;
                        for (const range of meta.scannedRanges) {
                            currentRanges = this.mergeRanges(currentRanges, range);
                        }
                        mergedRanges = currentRanges;
                    }

                    const db = await this.init();
                    await new Promise<void>((resolve, reject) => {
                        const tx = db.transaction('meta', 'readwrite');
                        tx.objectStore('meta').put({
                            address: address.toLowerCase(),
                            scannedRanges: mergedRanges,
                            lastUpdated: Date.now()
                        });
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => reject(tx.error);
                    });
                }
            }
        }

        return { sectorsAdded, messagesAdded, lausAdded };
    }
}

export const Persistence = new PersistenceService();
