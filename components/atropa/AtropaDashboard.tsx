import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Web3Service } from '../../services/web3Service';
import { LogEntry, TreasuryToken, AtropaView, UserContext } from '../../types';
import { MinterType, CoreSubCategory, getRegistryTokensByMinter, getCoreTokensBySubCategory } from '../../constants';
import { getTokenDetails, getSystemTokensByMinter, getImportedTokenAddresses, saveImportedToken, removeImportedToken, isRegisteredToken, hydrateTokenData, clearTokenCache } from '../../services/atropaService';
import TokenCard from './TokenCard';
import AtropaInfo from './AtropaInfo';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface AtropaDashboardProps {
    web3: Web3Service;
    user: UserContext;
    addLog: (entry: LogEntry) => void;
    onNavigate: (view: AtropaView, context?: any) => void;
}

type TabType = 'CORE' | 'V1' | 'V2' | 'V3' | 'V4' | 'INFO';

const MINTER_TABS: { type: TabType; label: string; desc: string; color: string; count: number }[] = [
    { type: 'CORE', label: 'CORE', desc: 'Core Treasury Liquidity Web', color: '#00ff41', count: 0 },
    { type: 'V1', label: 'V1 · TBILL', desc: 'Treasury Bill Minter · 1:1 Ratio', color: '#00ff41', count: 0 },
    { type: 'V2', label: 'V2 · FED', desc: 'Federal Minter · Debenture / Infinite Mint', color: '#ff6b35', count: 0 },
    { type: 'V3', label: 'V3 · INDEX', desc: 'Index Minter · Dynamic Multiplier', color: '#00f0ff', count: 0 },
    { type: 'V4', label: 'V4 · PERSONAL', desc: 'Personal Minter · Custom Multiplier', color: '#c77dff', count: 0 },
    { type: 'INFO', label: 'INFO & SPECS', desc: 'Treasury Architecture Documentation', color: '#ffffff', count: 0 },
];

const CORE_SUB_TABS: { type: CoreSubCategory | 'ALL'; label: string }[] = [
    { type: 'ALL', label: 'ALL' },
    { type: 'NATIVE', label: 'NATIVE' },
    { type: 'GOVERNANCE', label: 'GOVERNANCE' },
    { type: 'ECONOMY', label: 'ECONOMY' },
    { type: 'INFRASTRUCTURE', label: 'INFRA' },
];

const TAB_COLORS: Record<TabType, string> = {
    CORE: '#00ff41',
    V1: '#00ff41',
    V2: '#ff6b35',
    V3: '#00f0ff',
    V4: '#c77dff',
    INFO: '#ffffff',
};

type SortField = 'symbol' | 'name' | 'totalSupply' | 'parentSymbol' | 'minterType' | 'parityMultiple';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'table';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const formatSupply = (supply: string): string => {
    const n = parseFloat(supply);
    if (isNaN(n)) return '—';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
};

const truncAddr = (a: string) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AtropaDashboard: React.FC<AtropaDashboardProps> = ({ web3, user, addLog, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<TabType>('CORE');
    const [coreSubFilter, setCoreSubFilter] = useState<CoreSubCategory | 'ALL'>('ALL');
    const [tokens, setTokens] = useState<TreasuryToken[]>([]);
    const [importedTokens, setImportedTokens] = useState<TreasuryToken[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [importAddress, setImportAddress] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>(() =>
        typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table'
    );
    const [sortField, setSortField] = useState<SortField>('symbol');
    const [sortDir, setSortDir] = useState<SortDirection>('asc');

    // Registry counts for tab badges
    const tabCounts = useMemo(() => ({
        CORE: getRegistryTokensByMinter('CORE').length,
        V1: getRegistryTokensByMinter('V1').length,
        V2: getRegistryTokensByMinter('V2').length,
        V3: getRegistryTokensByMinter('V3').length,
        V4: getRegistryTokensByMinter('V4').length,
    }), []);

    // -----------------------------------------------------------------------
    // Data Loading & Hydration
    // -----------------------------------------------------------------------

    const hydrateQueueRef = useRef<boolean>(false);

    const startHydration = useCallback(async (baseTokens: TreasuryToken[]) => {
        hydrateQueueRef.current = true;
        
        const unhydrated = baseTokens.filter(t => !t.isHydrated);
        const BATCH_SIZE = 5;
        
        for (let i = 0; i < unhydrated.length; i += BATCH_SIZE) {
            if (!hydrateQueueRef.current) break; // cancelled by tab switch or unmount
            
            const batch = unhydrated.slice(i, i + BATCH_SIZE);
            try {
                 const newHydrated = await Promise.all(batch.map(t => hydrateTokenData(web3, t, user.address)));
                 if (!hydrateQueueRef.current) break;
                 
                 setTokens(prev => {
                     const next = [...prev];
                     let changed = false;
                     newHydrated.forEach(ht => {
                         const idx = next.findIndex(x => x.address === ht.address);
                         if (idx !== -1 && !next[idx].isHydrated) {
                             next[idx] = ht;
                             changed = true;
                         }
                     });
                     return changed ? next : prev;
                 });
            } catch {}
            
            // Yield event loop
            await new Promise(r => setTimeout(r, 100));
        }
    }, [web3, user.address]);

    const loadTokens = useCallback(async (forceRefresh: boolean = false) => {
        setLoading(true);
        hydrateQueueRef.current = false; // Cancel any ongoing hydration
        if (forceRefresh) clearTokenCache();
        try {
            const address = user.address || null;
            const systemTokens = await getSystemTokensByMinter(web3, activeTab, address, forceRefresh);
            setTokens(systemTokens);

            // Load user-imported tokens matching current tab
            const importedAddrs = getImportedTokenAddresses();
            if (importedAddrs.length > 0) {
                const importedResults = await Promise.allSettled(
                    importedAddrs.map(addr => getTokenDetails(web3, addr, undefined, address, forceRefresh))
                );
                const imported = importedResults
                    .filter((r): r is PromiseFulfilledResult<TreasuryToken> => r.status === 'fulfilled')
                    .map(r => r.value)
                    .filter(t => t.minterType === activeTab);
                setImportedTokens(imported);
            } else {
                setImportedTokens([]);
            }

            addLog({
                id: generateId(),
                timestamp: new Date().toLocaleTimeString(),
                type: 'SUCCESS',
                message: `Treasury ${activeTab} · ${systemTokens.length} tokens loaded`
            });
            
            // Background load the dynamic details!
            startHydration(systemTokens);
        } catch (e: any) {
            console.error('Failed to load tokens:', e);
            addLog({
                id: generateId(),
                timestamp: new Date().toLocaleTimeString(),
                type: 'ERROR',
                message: `Treasury ${activeTab} Load Failed: ${e.message}`
            });
        } finally {
            setLoading(false);
        }
    }, [web3, activeTab, user.address, addLog]);

    useEffect(() => { loadTokens(); }, [loadTokens]);

    // -----------------------------------------------------------------------
    // Import
    // -----------------------------------------------------------------------

    const handleImportToken = async () => {
        if (!importAddress || importAddress.length !== 42) return;
        setImportLoading(true);
        try {
            const regInfo = await isRegisteredToken(web3, importAddress);
            if (!regInfo.registered) {
                addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Token not found in any minter registry` });
                setImportLoading(false);
                return;
            }
            saveImportedToken(importAddress);
            const details = await getTokenDetails(web3, importAddress, regInfo.minterType, user.address);
            setImportedTokens(prev => [...prev, details]);
            setImportAddress('');
            setShowImport(false);
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Imported: ${details.name} (${details.symbol}) — ${regInfo.minterType}` });
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Import Failed: ${e.message}` });
        } finally {
            setImportLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Filtering & Sorting
    // -----------------------------------------------------------------------

    const filteredTokens = useMemo(() => {
        let list = [...tokens, ...importedTokens];

        // CORE sub-category filter
        if (activeTab === 'CORE' && coreSubFilter !== 'ALL') {
            list = list.filter(t => t.coreSubCategory === coreSubFilter);
        }

        // Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            list = list.filter(t =>
                t.name.toLowerCase().includes(term) ||
                t.symbol.toLowerCase().includes(term) ||
                t.address.toLowerCase().includes(term)
            );
        }

        // Sort
        list.sort((a, b) => {
            let va: string | number = '', vb: string | number = '';
            switch (sortField) {
                case 'symbol': va = a.symbol.toLowerCase(); vb = b.symbol.toLowerCase(); break;
                case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
                case 'totalSupply': va = parseFloat(a.totalSupply) || 0; vb = parseFloat(b.totalSupply) || 0; break;
                case 'parentSymbol': va = (a.parentSymbol || '').toLowerCase(); vb = (b.parentSymbol || '').toLowerCase(); break;
                case 'minterType': va = a.minterType; vb = b.minterType; break;
                case 'parityMultiple': va = a.parityMultiple || 0; vb = b.parityMultiple || 0; break;
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [tokens, importedTokens, activeTab, coreSubFilter, searchTerm, sortField, sortDir]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleSort = (field: SortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const handleMint = (token: TreasuryToken) => onNavigate(AtropaView.MINT_LAB, { token });
    const handleExplore = (token: TreasuryToken) => onNavigate(AtropaView.TOKEN_EXPLORER, { token });
    const tabColor = TAB_COLORS[activeTab];
    const activeTabInfo = MINTER_TABS.find(t => t.type === activeTab);
    const sortIcon = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* ============= HEADER ============= */}
            <div className="px-4 py-3 border-b border-green-900/30 bg-gradient-to-r from-green-950/20 to-black shrink-0">
                {/* Title row */}
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h2 className="font-bold text-lg tracking-wider" style={{ color: tabColor }}>
                            ATROPA TREASURY
                        </h2>
                        <p className="text-[10px] tracking-widest uppercase opacity-40" style={{ color: tabColor }}>
                            {activeTabInfo?.desc || 'Token Registry'}
                        </p>
                    </div>
                    <div className="flex gap-2 items-center">
                        {/* View toggle */}
                        <div className="flex border border-green-400/20 text-[10px]">
                            <button
                                onClick={() => setViewMode('table')}
                                className={`px-2 py-1 font-bold transition-all ${viewMode === 'table' ? 'bg-green-400/20 text-green-400' : 'text-gray-600 hover:text-green-400/50'}`}
                            >☰</button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`px-2 py-1 font-bold transition-all ${viewMode === 'grid' ? 'bg-green-400/20 text-green-400' : 'text-gray-600 hover:text-green-400/50'}`}
                            >⊞</button>
                        </div>
                        <button
                            onClick={() => setShowImport(!showImport)}
                            className="px-3 py-1 text-xs font-bold border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all"
                        >+ IMPORT</button>
                        <button
                            onClick={() => loadTokens(true)}
                            disabled={loading}
                            className="px-3 py-1 text-xs font-bold border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-50"
                        >{loading ? '⟳ LOADING...' : '⟳ REFRESH'}</button>
                    </div>
                </div>

                {/* ============= MINTER TABS ============= */}
                <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
                    {MINTER_TABS.map(tab => {
                        const isActive = activeTab === tab.type;
                        const color = TAB_COLORS[tab.type];
                        const count = tabCounts[tab.type];
                        return (
                            <button
                                key={tab.type}
                                onClick={() => { setActiveTab(tab.type); setCoreSubFilter('ALL'); }}
                                className={`px-3 py-1.5 text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                    isActive
                                        ? 'text-black'
                                        : 'hover:opacity-80'
                                }`}
                                style={{
                                    borderColor: isActive ? color : `${color}20`,
                                    backgroundColor: isActive ? color : 'transparent',
                                    color: isActive ? '#000' : `${color}80`,
                                }}
                            >
                                {tab.label}
                                <span className={`text-[9px] font-mono ${isActive ? 'opacity-60' : 'opacity-40'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* ============= CORE SUB-TABS ============= */}
                {activeTab === 'CORE' && (
                    <div className="flex gap-1 mb-2">
                        {CORE_SUB_TABS.map(sub => {
                            const isActive = coreSubFilter === sub.type;
                            const subCount = sub.type === 'ALL'
                                ? tabCounts.CORE
                                : getCoreTokensBySubCategory(sub.type as CoreSubCategory).length;
                            return (
                                <button
                                    key={sub.type}
                                    onClick={() => setCoreSubFilter(sub.type)}
                                    className={`px-2 py-1 text-[10px] font-bold border transition-all flex items-center gap-1 ${
                                        isActive
                                            ? 'border-green-400/60 text-green-400 bg-green-400/10'
                                            : 'border-green-400/10 text-green-400/30 hover:text-green-400/60 hover:border-green-400/30'
                                    }`}
                                >
                                    {sub.label}
                                    <span className="text-[8px] opacity-50">{subCount}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ============= SEARCH ============= */}
                <input
                    type="text"
                    placeholder="Search by name, symbol, or address..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-black border border-green-400/20 px-3 py-1.5 text-xs font-mono placeholder-green-400/20 focus:border-green-400/50 outline-none"
                    style={{ color: tabColor }}
                />
            </div>

            {/* ============= IMPORT PANEL ============= */}
            {showImport && (
                <div className="px-4 py-3 border-b border-green-400/20 bg-green-950/20 shrink-0">
                    <div className="text-xs text-green-400 font-bold mb-2">IMPORT TOKEN BY ADDRESS</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="0x..."
                            value={importAddress}
                            onChange={(e) => setImportAddress(e.target.value)}
                            className="flex-1 bg-black border border-green-400/20 px-3 py-1.5 text-xs text-green-400 font-mono placeholder-green-400/20 focus:border-green-400/50 outline-none"
                        />
                        <button
                            onClick={handleImportToken}
                            disabled={importLoading || importAddress.length !== 42}
                            className="px-4 py-1.5 text-xs font-bold border border-green-400 text-green-400 hover:bg-green-400 hover:text-black transition-all disabled:opacity-30"
                        >{importLoading ? 'SCANNING...' : 'IMPORT'}</button>
                    </div>
                </div>
            )}

            {/* ============= STATS BAR ============= */}
            <div className="px-4 py-1.5 border-b border-green-900/20 bg-black/40 flex items-center justify-between text-[10px] font-mono shrink-0" style={{ color: `${tabColor}60` }}>
                <span>{filteredTokens.length} tokens {searchTerm && `(filtered)`}</span>
                <span>
                    {loading && <span className="animate-pulse mr-2">● LOADING</span>}
                    {!loading && tokens.length > 0 && `Total Supply: ${formatSupply(
                        filteredTokens.reduce((s, t) => s + (parseFloat(t.totalSupply) || 0), 0).toString()
                    )}`}
                </span>
            </div>

            {/* ============= CONTENT ============= */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'INFO' ? (
                    <AtropaInfo />
                ) : loading && tokens.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-sm animate-pulse font-mono" style={{ color: `${tabColor}50` }}>
                            SCANNING TREASURY CONTRACTS...
                        </div>
                    </div>
                ) : filteredTokens.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full" style={{ color: `${tabColor}30` }}>
                        <div className="text-4xl mb-3">⌘</div>
                        <div className="text-sm font-bold">NO TOKENS FOUND</div>
                        <div className="text-[10px] mt-1">Try a different tab or import a token</div>
                    </div>
                ) : viewMode === 'table' ? (
                    /* ============ TABLE VIEW ============ */
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-green-900/30" style={{ backgroundColor: '#050505' }}>
                                    <th className="text-left px-3 py-2 cursor-pointer hover:text-white transition-colors" style={{ color: `${tabColor}60` }} onClick={() => handleSort('symbol')}>
                                        SYMBOL{sortIcon('symbol')}
                                    </th>
                                    <th className="text-left px-3 py-2 cursor-pointer hover:text-white transition-colors" style={{ color: `${tabColor}60` }} onClick={() => handleSort('name')}>
                                        NAME{sortIcon('name')}
                                    </th>
                                    {activeTab === 'CORE' && (
                                        <th className="text-left px-3 py-2" style={{ color: `${tabColor}60` }}>CAT</th>
                                    )}
                                    <th className="text-right px-3 py-2 cursor-pointer hover:text-white transition-colors" style={{ color: `${tabColor}60` }} onClick={() => handleSort('totalSupply')}>
                                        SUPPLY{sortIcon('totalSupply')}
                                    </th>
                                    <th className="text-left px-3 py-2 cursor-pointer hover:text-white transition-colors hidden md:table-cell" style={{ color: `${tabColor}60` }} onClick={() => handleSort('parentSymbol')}>
                                        PARENT{sortIcon('parentSymbol')}
                                    </th>
                                    {(activeTab === 'V3' || activeTab === 'V4') && (
                                        <>
                                            <th className="text-right px-3 py-2 hidden md:table-cell" style={{ color: `${tabColor}60` }}>MULT</th>
                                            <th className="text-right px-3 py-2 cursor-pointer hover:text-white transition-colors hidden lg:table-cell" style={{ color: `${tabColor}60` }} onClick={() => handleSort('parityMultiple')}>
                                                PARITY{sortIcon('parityMultiple')}
                                            </th>
                                        </>
                                    )}
                                    {activeTab === 'V2' && (
                                        <th className="text-center px-3 py-2" style={{ color: `${tabColor}60` }}>STATUS</th>
                                    )}
                                    <th className="text-right px-3 py-2 hidden lg:table-cell" style={{ color: `${tabColor}60` }}>BAL</th>
                                    <th className="text-center px-3 py-2" style={{ color: `${tabColor}60` }}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTokens.map(token => (
                                    <tr
                                        key={token.address}
                                        className="border-b border-green-900/10 hover:bg-white/[0.02] cursor-pointer transition-colors group"
                                        onClick={() => handleExplore(token)}
                                    >
                                        <td className="px-3 py-2 font-bold" style={{ color: tabColor }}>
                                            {token.symbol}
                                        </td>
                                        <td className="px-3 py-2 text-gray-400 truncate max-w-[200px]">
                                            {token.name}
                                        </td>
                                        {activeTab === 'CORE' && (
                                            <td className="px-3 py-2">
                                                {token.coreSubCategory && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 border rounded-sm"
                                                        style={{
                                                            color: token.coreSubCategory === 'NATIVE' ? '#ffd700' :
                                                                   token.coreSubCategory === 'GOVERNANCE' ? '#ff6b6b' :
                                                                   token.coreSubCategory === 'INFRASTRUCTURE' ? '#888' : '#00ff41',
                                                            borderColor: token.coreSubCategory === 'NATIVE' ? '#ffd70030' :
                                                                         token.coreSubCategory === 'GOVERNANCE' ? '#ff6b6b30' :
                                                                         token.coreSubCategory === 'INFRASTRUCTURE' ? '#88888830' : '#00ff4130',
                                                        }}
                                                    >
                                                        {token.coreSubCategory === 'INFRASTRUCTURE' ? 'INFRA' : token.coreSubCategory}
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-3 py-2 text-right text-gray-400 font-mono tabular-nums">
                                            {formatSupply(token.totalSupply)}
                                        </td>
                                        <td className="px-3 py-2 text-gray-500 truncate max-w-[120px] hidden md:table-cell">
                                            {token.parentSymbol || truncAddr(token.parentAddress)}
                                        </td>
                                        {(activeTab === 'V3' || activeTab === 'V4') && (
                                            <>
                                                <td className="px-3 py-2 text-right hidden md:table-cell" style={{ color: '#00ffff' }}>
                                                    {token.multiplier ? `${token.multiplier}×` : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right hidden lg:table-cell group relative">
                                                    {!token.isHydrated ? (
                                                        <span className="text-gray-700">⌛</span>
                                                    ) : token.parityStatus === 'UNKNOWN' || token.parityMultiple === undefined ? (
                                                        <span className="text-gray-600/50 text-xs tracking-widest">—</span>
                                                    ) : (
                                                        <span className={`text-xs font-bold tracking-tight ${
                                                            token.parityStatus === 'OVER' ? 'text-green-400' :
                                                            token.parityStatus === 'UNDER' ? 'text-red-400' : 'text-gray-400'
                                                        }`}>
                                                            {token.parityMultiple > 0 ? `${token.parityMultiple.toFixed(2)}x ` : ''}
                                                            {token.parityStatus === 'OVER' ? 'OVER ▲' : token.parityStatus === 'UNDER' ? 'TO PARITY ▼' : 'PARITY ━'}
                                                        </span>
                                                    )}
                                                </td>
                                            </>
                                        )}
                                        {activeTab === 'V2' && (
                                            <td className="px-3 py-2 text-center">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 border ${
                                                    token.debenture
                                                        ? 'text-green-400 border-green-400/30 bg-green-400/10'
                                                        : 'text-red-400 border-red-400/30 bg-red-400/10'
                                                }`}>
                                                    {token.debenture ? '● OPEN' : '○ CLOSED'}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-3 py-2 text-right hidden lg:table-cell font-mono tabular-nums" style={{ color: tabColor }}>
                                            {token.userBalance && parseFloat(token.userBalance) > 0 ? formatSupply(token.userBalance) : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                {token.minterType !== 'CORE' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleMint(token); }}
                                                        className="px-2 py-0.5 text-[10px] font-bold border transition-all hover:bg-green-400 hover:text-black"
                                                        style={{ color: '#00ff41', borderColor: '#00ff4130' }}
                                                    >MINT</button>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleExplore(token); }}
                                                    className="px-2 py-0.5 text-[10px] font-bold border border-gray-700 text-gray-500 transition-all hover:text-white hover:border-gray-500"
                                                >⧉</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* ============ GRID/CARD VIEW ============ */
                    <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {filteredTokens.map(token => (
                                <TokenCard
                                    key={token.address}
                                    token={token}
                                    onMint={handleMint}
                                    onExplore={handleExplore}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AtropaDashboard;
