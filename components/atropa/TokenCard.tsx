import React from 'react';
import { TreasuryToken } from '../../types';

interface TokenCardProps {
    token: TreasuryToken;
    onMint?: (token: TreasuryToken) => void;
    onExplore?: (token: TreasuryToken) => void;
    compact?: boolean;
}

const MINTER_COLORS: Record<string, string> = {
    CORE: '#00ff41',
    V1: '#00ff41',
    V2: '#ff6b35',
    V3: '#00f0ff',
    V4: '#c77dff',
};

const SUB_CAT_COLORS: Record<string, string> = {
    NATIVE: '#ffd700',
    GOVERNANCE: '#ff6b6b',
    ECONOMY: '#00ff41',
    INFRASTRUCTURE: '#888888',
};

const formatSupply = (supply: string): string => {
    const n = parseFloat(supply);
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
};

const truncateAddress = (addr: string): string =>
    addr ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : '';

const TokenCard: React.FC<TokenCardProps> = ({ token, onMint, onExplore, compact }) => {
    const minterColor = MINTER_COLORS[token.minterType] || '#00ff41';

    const copyAddress = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(token.address);
    };

    return (
        <div
            className="border bg-black/40 hover:bg-white/5 transition-all cursor-pointer group"
            style={{ borderColor: `${minterColor}20` }}
            onClick={() => onExplore?.(token)}
        >
            <div className="p-3">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className="text-[9px] font-bold px-1.5 py-0.5 border shrink-0"
                            style={{ color: minterColor, borderColor: `${minterColor}40`, backgroundColor: `${minterColor}10` }}
                        >
                            {token.minterType}
                        </span>
                        <span className="font-bold text-sm truncate" style={{ color: minterColor }}>
                            {token.symbol}
                        </span>
                    </div>
                    {/* Debenture Badge */}
                    {token.minterType === 'V2' && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 border shrink-0 ${
                            token.debenture
                                ? 'text-green-400 border-green-400/30 bg-green-400/10'
                                : 'text-red-400 border-red-400/30 bg-red-400/10'
                        }`}>
                            {token.debenture ? '● OPEN' : '○ CLOSED'}
                        </span>
                    )}
                    {/* CORE Sub-category Badge */}
                    {token.minterType === 'CORE' && token.coreSubCategory && (
                        <span
                            className="text-[9px] font-bold px-1.5 py-0.5 border shrink-0"
                            style={{
                                color: SUB_CAT_COLORS[token.coreSubCategory] || '#888',
                                borderColor: `${SUB_CAT_COLORS[token.coreSubCategory] || '#888'}30`,
                                backgroundColor: `${SUB_CAT_COLORS[token.coreSubCategory] || '#888'}10`,
                            }}
                        >
                            {token.coreSubCategory === 'INFRASTRUCTURE' ? 'INFRA' : token.coreSubCategory}
                        </span>
                    )}
                </div>

                {/* Name */}
                <div className="text-xs text-gray-300 mb-1 truncate">{token.name}</div>

                {/* Address */}
                <div
                    className="text-[10px] text-gray-600 font-mono mb-2 cursor-pointer hover:text-gray-400 transition-colors"
                    onClick={copyAddress}
                    title="Click to copy"
                >
                    {truncateAddress(token.address)} 📋
                </div>

                {!compact && (
                    <>
                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] mb-3">
                            <div>
                                <span className="text-gray-600 uppercase">Supply</span>
                                <div className="text-gray-300 font-bold">{formatSupply(token.totalSupply)}</div>
                            </div>
                            <div>
                                <span className="text-gray-600 uppercase">Parent</span>
                                <div className="text-gray-300 font-bold truncate" title={token.parentAddress}>
                                    {token.parentSymbol || truncateAddress(token.parentAddress)}
                                </div>
                            </div>
                            {(token.minterType === 'V3' || token.minterType === 'V4') && token.multiplier && (
                                <>
                                    <div>
                                        <span className="text-gray-600 uppercase">Multiplier</span>
                                        <div className="text-cyan-400 font-bold">{token.multiplier}×</div>
                                    </div>
                                    <div>
                                        <span className="text-gray-600 uppercase">Parity</span>
                                        <div className="font-bold">
                                            {token.parityStatus ? (
                                                <span className={
                                                    token.parityStatus === 'OVER' ? 'text-green-400' :
                                                    token.parityStatus === 'UNDER' ? 'text-red-400' : 'text-gray-400'
                                                }>
                                                    {token.parityStatus === 'OVER' ? 'OVER ▲' : token.parityStatus === 'UNDER' ? 'UNDER ▼' : 'PARITY ━'}
                                                </span>
                                            ) : (
                                                <span className="text-gray-700">⌛</span>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                            {token.userBalance && parseFloat(token.userBalance) > 0 && (
                                <div>
                                    <span className="text-gray-600 uppercase">Balance</span>
                                    <div className="font-bold" style={{ color: minterColor }}>
                                        {formatSupply(token.userBalance)}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1">
                            {token.minterType !== 'CORE' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onMint?.(token); }}
                                    className="flex-1 px-2 py-1 text-[10px] font-bold border transition-all hover:bg-green-400 hover:text-black"
                                    style={{ color: '#00ff41', borderColor: '#00ff4130' }}
                                >
                                    MINT
                                </button>
                            )}
                            {token.minterType === 'V2' && token.debenture && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onMint?.(token); }}
                                    className="flex-1 px-2 py-1 text-[10px] font-bold border border-orange-400/30 text-orange-400 transition-all hover:bg-orange-400/20"
                                >
                                    ∞ CLAIM
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); onExplore?.(token); }}
                                className="px-2 py-1 text-[10px] font-bold border border-gray-700 text-gray-500 transition-all hover:text-white hover:border-gray-500"
                            >
                                ⧉
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TokenCard;
