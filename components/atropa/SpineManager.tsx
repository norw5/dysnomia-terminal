import React, { useState, useEffect, useCallback } from 'react';
import { Web3Service } from '../../services/web3Service';
import { LogEntry, TreasuryToken, FederalSpine, AtropaView, UserContext } from '../../types';
import { traceParentChain, getImportedSpines, saveImportedSpine, removeImportedSpine, mintTokens, claimV2 } from '../../services/atropaService';
import { parseUnits, formatUnits } from 'ethers';

interface SpineManagerProps {
    web3: Web3Service;
    user: UserContext;
    addLog: (entry: LogEntry) => void;
    onNavigate: (view: AtropaView, context?: any) => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const truncAddr = (a: string) => a ? `${a.substring(0, 6)}...${a.substring(a.length - 4)}` : '';

const SpineManager: React.FC<SpineManagerProps> = ({ web3, user, addLog, onNavigate }) => {
    const [spines, setSpines] = useState<FederalSpine[]>([]);
    const [importTip, setImportTip] = useState('');
    const [importing, setImporting] = useState(false);
    const [selectedSpine, setSelectedSpine] = useState<FederalSpine | null>(null);
    const [runningInfMint, setRunningInfMint] = useState(false);
    const [infMintProgress, setInfMintProgress] = useState('');

    useEffect(() => {
        setSpines(getImportedSpines());
    }, []);

    const handleImportSpine = async () => {
        if (!importTip || importTip.length !== 42) return;
        setImporting(true);
        try {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Tracing spine from tip: ${truncAddr(importTip)}...` });

            const chain = await traceParentChain(web3, importTip);

            if (chain.length < 2) {
                addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: 'Could not trace a valid spine (need at least 2 tokens)' });
                setImporting(false);
                return;
            }

            const spine: FederalSpine = {
                id: `spine-${Date.now()}`,
                name: `${chain[0].symbol} → ${chain[chain.length - 1].symbol}`,
                tokens: chain,
                rootAddress: chain[0].address,
                tipAddress: chain[chain.length - 1].address,
            };

            saveImportedSpine(spine);
            setSpines(prev => [...prev, spine]);
            setImportTip('');
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Spine imported: ${chain.length} tokens traced` });
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Spine import failed: ${e.message}` });
        } finally {
            setImporting(false);
        }
    };

    const handleRemoveSpine = (spineId: string) => {
        removeImportedSpine(spineId);
        setSpines(prev => prev.filter(s => s.id !== spineId));
        if (selectedSpine?.id === spineId) setSelectedSpine(null);
    };

    const handleInfiniteMint = async () => {
        if (!selectedSpine || !user.isConnected) return;
        setRunningInfMint(true);

        const claimableTokens = selectedSpine.tokens.filter(t => t.minterType === 'V2' && t.debenture);

        for (let i = 0; i < claimableTokens.length; i++) {
            const token = claimableTokens[i];
            setInfMintProgress(`${i + 1}/${claimableTokens.length}: ${token.symbol}`);
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Spine Mint [${i+1}/${claimableTokens.length}]: ${token.symbol}` });

            try {
                const amount = parseUnits('1', 18); // Mint 1 token per step
                await mintTokens(web3, token.address, amount, 'V2');
                await claimV2(web3, token.address, token.address, amount);
                addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `${token.symbol}: Mint + Claim complete` });
            } catch (e: any) {
                addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `${token.symbol}: ${e.reason || e.message}` });
            }
        }

        setRunningInfMint(false);
        setInfMintProgress('');
        addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'Spine Infinite Mint sequence complete' });
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-green-900/30 bg-green-950/10 shrink-0">
                <h2 className="text-green-400 font-bold text-lg tracking-wider">FEDERAL SPINE MANAGER</h2>
                <p className="text-green-400/40 text-[10px] tracking-widest uppercase">
                    Import &amp; manage V2 Federal token chains
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="max-w-3xl mx-auto space-y-4">
                    {/* Import */}
                    <div className="border border-green-400/20 bg-black/40 p-4">
                        <div className="text-xs text-green-400 font-bold mb-2 tracking-widest">IMPORT SPINE</div>
                        <p className="text-[10px] text-gray-500 mb-3">
                            Enter the TIP (last child) token address. The system will trace the Parent() chain back to the root.
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={importTip}
                                onChange={(e) => setImportTip(e.target.value)}
                                placeholder="Tip token address (0x...)"
                                className="flex-1 bg-black border border-green-400/20 px-3 py-1.5 text-xs text-green-400 font-mono placeholder-green-400/20 focus:border-green-400/50 outline-none"
                            />
                            <button
                                onClick={handleImportSpine}
                                disabled={importing || importTip.length !== 42}
                                className="px-4 py-1.5 text-xs font-bold border border-green-400 text-green-400 hover:bg-green-400 hover:text-black transition-all disabled:opacity-30"
                            >
                                {importing ? '⟳ TRACING...' : 'TRACE'}
                            </button>
                        </div>
                    </div>

                    {/* Spine List */}
                    {spines.length === 0 ? (
                        <div className="text-center text-green-400/20 py-10">
                            <div className="text-4xl mb-2">⫘</div>
                            <div className="text-xs">No spines imported. Enter a tip address above to trace a chain.</div>
                        </div>
                    ) : (
                        spines.map(spine => (
                            <div
                                key={spine.id}
                                className={`border bg-black/40 p-4 cursor-pointer transition-all ${
                                    selectedSpine?.id === spine.id
                                        ? 'border-green-400/50'
                                        : 'border-green-400/15 hover:border-green-400/30'
                                }`}
                                onClick={() => setSelectedSpine(selectedSpine?.id === spine.id ? null : spine)}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="text-green-400 font-bold text-sm">{spine.name}</div>
                                        <div className="text-[10px] text-gray-600">{spine.tokens.length} tokens in chain</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-[10px] px-2 py-0.5 border border-orange-400/20 text-orange-400">
                                            {spine.tokens.filter(t => t.debenture).length} claimable
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRemoveSpine(spine.id); }}
                                            className="text-red-400/50 hover:text-red-400 text-xs px-2"
                                        >✕</button>
                                    </div>
                                </div>

                                {/* Expanded spine view */}
                                {selectedSpine?.id === spine.id && (
                                    <div className="mt-3 space-y-1">
                                        {spine.tokens.map((token, idx) => (
                                            <div key={token.address} className="flex items-center gap-2">
                                                {/* Connector */}
                                                <div className="w-6 text-center text-gray-700 text-xs shrink-0">
                                                    {idx === 0 ? '◉' : '│'}
                                                </div>
                                                {/* Token */}
                                                <div
                                                    className="flex-1 flex items-center justify-between bg-black/60 border border-green-400/10 px-3 py-1.5 hover:border-green-400/30 transition-all cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); onNavigate(AtropaView.TOKEN_EXPLORER, { token }); }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-green-400 font-bold text-xs">{token.symbol}</span>
                                                        <span className="text-gray-600 text-[10px]">{token.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {token.debenture && (
                                                            <span className="text-[9px] text-orange-400 border border-orange-400/20 px-1.5">∞ OPEN</span>
                                                        )}
                                                        <span className="text-[10px] text-gray-600 font-mono">{truncAddr(token.address)}</span>
                                                    </div>
                                                </div>
                                                {idx < spine.tokens.length - 1 && (
                                                    <div className="w-6 text-center text-green-400/30 text-xs shrink-0">↓</div>
                                                )}
                                            </div>
                                        ))}

                                        {/* Infinite Mint All */}
                                        {spine.tokens.some(t => t.debenture) && (
                                            <div className="mt-4 pt-3 border-t border-green-400/10">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleInfiniteMint(); }}
                                                    disabled={runningInfMint || !user.isConnected}
                                                    className="w-full py-2 text-xs font-bold border border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-black transition-all disabled:opacity-30"
                                                >
                                                    {runningInfMint ? `⟳ ${infMintProgress}` : '∞ BATCH INFINITE MINT (All Open Tokens)'}
                                                </button>
                                                {!user.isConnected && (
                                                    <div className="text-[10px] text-gray-600 mt-1 text-center">Connect wallet to use</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default SpineManager;
