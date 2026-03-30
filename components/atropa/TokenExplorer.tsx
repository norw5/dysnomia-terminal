import React, { useState, useEffect } from 'react';
import { Web3Service } from '../../services/web3Service';
import { LogEntry, TreasuryToken, AtropaView, UserContext } from '../../types';
import { getTokenDetails, getUserPermission, publishToken, setPermission } from '../../services/atropaService';

interface TokenExplorerProps {
    web3: Web3Service;
    user: UserContext;
    addLog: (entry: LogEntry) => void;
    onNavigate: (view: AtropaView, context?: any) => void;
    initialToken?: TreasuryToken;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const formatSupply = (supply: string): string => {
    const n = parseFloat(supply);
    if (n >= 1e12) return (n / 1e12).toFixed(4) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(4) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(4) + 'M';
    return n.toFixed(4);
};

const HU_LEVELS: { min: number; label: string; color: string }[] = [
    { min: 255, label: 'CREATOR', color: '#c77dff' },
    { min: 100, label: 'ADMIN', color: '#ff6b35' },
    { min: 10, label: 'OPERATOR', color: '#00f0ff' },
    { min: 5, label: 'DATA', color: '#00ff41' },
    { min: 1, label: 'BASIC', color: '#888' },
    { min: 0, label: 'NONE', color: '#333' },
];

const getHuLabel = (hu: number) => {
    for (const level of HU_LEVELS) {
        if (hu >= level.min) return level;
    }
    return HU_LEVELS[HU_LEVELS.length - 1];
};

const TokenExplorer: React.FC<TokenExplorerProps> = ({ web3, user, addLog, onNavigate, initialToken }) => {
    const [token, setToken] = useState<TreasuryToken | null>(initialToken || null);
    const [loading, setLoading] = useState(false);
    const [lookupAddress, setLookupAddress] = useState('');
    const [publishing, setPublishing] = useState(false);

    const loadToken = async (addr: string) => {
        setLoading(true);
        try {
            const details = await getTokenDetails(web3, addr, undefined, user.address);
            setToken(details);
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Explorer: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!token || !user.isConnected) return;
        setPublishing(true);
        try {
            const hash = await publishToken(web3, token.address);
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Published ${token.symbol}!`, details: hash });
            await loadToken(token.address);
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Publish Failed: ${e.reason || e.message}` });
        } finally {
            setPublishing(false);
        }
    };

    if (!token) {
        return (
            <div className="h-full flex flex-col">
                <div className="px-4 py-3 border-b border-green-900/30 bg-green-950/10 shrink-0">
                    <h2 className="text-green-400 font-bold text-lg tracking-wider">TOKEN EXPLORER</h2>
                </div>
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="w-full max-w-md space-y-4">
                        <div className="text-center text-green-400/30 mb-4">
                            <div className="text-4xl mb-2">🔍</div>
                            <div className="text-xs">Enter a token address to inspect</div>
                        </div>
                        <input
                            type="text"
                            value={lookupAddress}
                            onChange={(e) => setLookupAddress(e.target.value)}
                            placeholder="0x..."
                            className="w-full bg-black border border-green-400/20 px-3 py-2 text-green-400 text-sm font-mono placeholder-green-400/20 focus:border-green-400/50 outline-none"
                        />
                        <button
                            onClick={() => loadToken(lookupAddress)}
                            disabled={loading || lookupAddress.length !== 42}
                            className="w-full py-2 text-xs font-bold border border-green-400 text-green-400 hover:bg-green-400 hover:text-black transition-all disabled:opacity-30"
                        >
                            {loading ? 'SCANNING...' : 'INSPECT TOKEN'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const huLevel = token.userHu !== undefined ? getHuLabel(token.userHu) : null;
    const isAdmin = token.userHu !== undefined && token.userHu >= 100;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-green-900/30 bg-green-950/10 shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onNavigate(AtropaView.TREASURY_DECK)}
                        className="text-green-400/50 hover:text-green-400 text-xs"
                    >← BACK</button>
                    <h2 className="text-green-400 font-bold text-lg tracking-wider">TOKEN EXPLORER</h2>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="max-w-2xl mx-auto space-y-4">
                    {/* Identity */}
                    <div className="border border-green-400/20 bg-black/40 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <div className="text-green-400 font-bold text-2xl">{token.symbol}</div>
                                <div className="text-gray-400 text-sm">{token.name}</div>
                            </div>
                            <span className={`text-sm font-bold px-3 py-1 border ${
                                token.minterType === 'V1' ? 'text-green-400 border-green-400/30' :
                                token.minterType === 'V2' ? 'text-orange-400 border-orange-400/30' :
                                token.minterType === 'V3' ? 'text-cyan-400 border-cyan-400/30' :
                                'text-purple-400 border-purple-400/30'
                            }`}>{token.minterType}</span>
                        </div>
                        <div className="text-[10px] text-gray-600 font-mono break-all">{token.address}</div>
                    </div>

                    {/* Properties Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="border border-green-400/10 bg-black/40 p-3">
                            <div className="text-[10px] text-gray-600 uppercase mb-1">Total Supply</div>
                            <div className="text-green-400 font-bold">{formatSupply(token.totalSupply)}</div>
                        </div>
                        <div className="border border-green-400/10 bg-black/40 p-3">
                            <div className="text-[10px] text-gray-600 uppercase mb-1">Parent Token</div>
                            <div className="text-green-400 font-bold">{token.parentSymbol || '???'}</div>
                            <div className="text-[10px] text-gray-600 font-mono truncate">{token.parentAddress}</div>
                        </div>
                        {token.minterType === 'V2' && (
                            <div className="border border-green-400/10 bg-black/40 p-3">
                                <div className="text-[10px] text-gray-600 uppercase mb-1">Debenture Status</div>
                                <div className={`font-bold ${token.debenture ? 'text-green-400' : 'text-red-400'}`}>
                                    {token.debenture ? '⬤ OPEN (Claimable)' : '◯ PUBLISHED (Locked)'}
                                </div>
                            </div>
                        )}
                        {token.multiplier && (
                            <div className="border border-green-400/10 bg-black/40 p-3">
                                <div className="text-[10px] text-gray-600 uppercase mb-1">Current Multiplier</div>
                                <div className="text-cyan-400 font-bold text-lg">{token.multiplier}×</div>
                            </div>
                        )}
                        {token.creatorAddress && (
                            <div className="border border-green-400/10 bg-black/40 p-3">
                                <div className="text-[10px] text-gray-600 uppercase mb-1">Creator</div>
                                <div className="text-gray-300 text-xs font-mono truncate">{token.creatorAddress}</div>
                            </div>
                        )}
                        {token.userBalance && (
                            <div className="border border-green-400/10 bg-black/40 p-3">
                                <div className="text-[10px] text-gray-600 uppercase mb-1">Your Balance</div>
                                <div className="text-green-400 font-bold">{formatSupply(token.userBalance)}</div>
                            </div>
                        )}
                    </div>

                    {/* Permission Level */}
                    {huLevel && (
                        <div className="border bg-black/40 p-3" style={{ borderColor: `${huLevel.color}30` }}>
                            <div className="text-[10px] text-gray-600 uppercase mb-1">Your Permission Level (_hu)</div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold" style={{ color: huLevel.color }}>{huLevel.label}</span>
                                <span className="text-gray-600 text-xs">(level {token.userHu})</span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-1">
                                {token.userHu === 0 && 'No permissions. Call ha() to set to 1.'}
                                {token.userHu! >= 1 && token.userHu! < 5 && 'Basic access. Cannot interact with fallback.'}
                                {token.userHu! >= 5 && token.userHu! < 10 && 'Data operations allowed.'}
                                {token.userHu! >= 10 && token.userHu! < 100 && 'Can set _ho values for other addresses.'}
                                {token.userHu! >= 100 && token.userHu! < 255 && 'Admin: can publish() and manage permissions.'}
                                {token.userHu === 255 && 'Creator: full control over this token.'}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        {token.minterType !== 'CORE' && (
                            <button
                                onClick={() => onNavigate(AtropaView.MINT_LAB, { token })}
                                className="flex-1 py-2 text-xs font-bold border border-green-400/30 text-green-400 hover:bg-green-400/20 transition-all"
                            >
                                ⚗ MINT
                            </button>
                        )}
                        <a
                            href={`https://scan.pulsechain.com/address/${token.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 text-xs font-bold border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/20 transition-all text-center"
                        >
                            ⧉ SCANNER
                        </a>
                    </div>

                    {/* Admin Panel */}
                    {isAdmin && token.minterType === 'V2' && token.debenture && (
                        <div className="border border-red-400/20 bg-red-950/10 p-4">
                            <div className="text-xs text-red-400 font-bold tracking-widest mb-3">⚠ ADMIN PANEL</div>
                            <button
                                onClick={handlePublish}
                                disabled={publishing}
                                className="w-full py-2 text-xs font-bold border border-red-400 text-red-400 hover:bg-red-400 hover:text-black transition-all disabled:opacity-30"
                            >
                                {publishing ? 'PUBLISHING...' : 'PUBLISH TOKEN (Permanent — Disables Claim)'}
                            </button>
                            <div className="text-[10px] text-red-400/50 mt-2">
                                ⚠ This action is PERMANENT. Once published, the Debenture is set to false and parent tokens are locked forever.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TokenExplorer;
