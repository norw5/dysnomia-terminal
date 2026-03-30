import React, { useState, useEffect, useCallback } from 'react';
import { parseUnits, formatUnits, Contract } from 'ethers';
import { Web3Service } from '../../services/web3Service';
import { LogEntry, TreasuryToken, AtropaView, UserContext } from '../../types';
import { ERC20_ABI, ATROPA_TT_ABI, ATROPA_TT_V4_ABI } from '../../constants';
import { calculateMintCost, mintTokens, claimV2, claimV4, getTokenDetails } from '../../services/atropaService';

interface MintLabProps {
    web3: Web3Service;
    user: UserContext;
    addLog: (entry: LogEntry) => void;
    onNavigate: (view: AtropaView, context?: any) => void;
    initialToken?: TreasuryToken;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const formatNum = (n: string): string => {
    const v = parseFloat(n);
    if (v >= 1e12) return (v / 1e12).toFixed(4) + 'T';
    if (v >= 1e9) return (v / 1e9).toFixed(4) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(4) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(4) + 'K';
    return v.toFixed(4);
};

const MintLab: React.FC<MintLabProps> = ({ web3, user, addLog, onNavigate, initialToken }) => {
    const [token, setToken] = useState<TreasuryToken | null>(initialToken || null);
    const [amount, setAmount] = useState('');
    const [estimatedCost, setEstimatedCost] = useState<string | null>(null);
    const [parentBalance, setParentBalance] = useState('0');
    const [parentAllowance, setParentAllowance] = useState('0');
    const [minting, setMinting] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [activeMode, setActiveMode] = useState<'MINT' | 'CLAIM' | 'CREATE'>('MINT');
    const [txHash, setTxHash] = useState<string | null>(null);

    // Refresh token data
    const refreshToken = useCallback(async () => {
        if (!token) return;
        try {
            const updated = await getTokenDetails(web3, token.address, token.minterType, user.address);
            setToken(updated);
        } catch {}
    }, [web3, token?.address, user.address]);

    // Fetch parent balance
    useEffect(() => {
        if (!token || !user.address) return;
        const fetchParentInfo = async () => {
            try {
                const parent = web3.getContract(token.parentAddress, ERC20_ABI);
                const bal = await parent.balanceOf(user.address);
                setParentBalance(formatUnits(bal, 18));
                const allow = await parent.allowance(user.address, token.address);
                setParentAllowance(formatUnits(allow, 18));
            } catch {}
        };
        fetchParentInfo();
    }, [web3, token, user.address]);

    // Calculate cost when amount changes
    useEffect(() => {
        if (!token || !amount || parseFloat(amount) <= 0) {
            setEstimatedCost(null);
            return;
        }
        const calc = async () => {
            try {
                const amountWei = parseUnits(amount, 18);
                const cost = await calculateMintCost(web3, token.address, amountWei, token.minterType);
                setEstimatedCost(formatUnits(cost, 18));
            } catch {
                setEstimatedCost(null);
            }
        };
        const timer = setTimeout(calc, 300);
        return () => clearTimeout(timer);
    }, [amount, token, web3]);

    // Mint
    const handleMint = async () => {
        if (!token || !amount || !user.isConnected) return;
        setMinting(true);
        setTxHash(null);
        try {
            const amountWei = parseUnits(amount, 18);
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Minting ${formatNum(amount)} ${token.symbol}...` });

            const hash = await mintTokens(web3, token.address, amountWei, token.minterType);
            setTxHash(hash);
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Minted ${formatNum(amount)} ${token.symbol}`, details: hash });
            await refreshToken();
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Mint Failed: ${e.reason || e.message}` });
        } finally {
            setMinting(false);
        }
    };

    // Claim (V2 Infinite Mint)
    const handleClaim = async () => {
        if (!token || !amount || !user.isConnected) return;
        setClaiming(true);
        setTxHash(null);
        try {
            const amountWei = parseUnits(amount, 18);
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Claiming ${formatNum(amount)} parent tokens...` });

            let hash: string;
            if (token.minterType === 'V4') {
                hash = await claimV4(web3, token.address, amountWei);
            } else {
                hash = await claimV2(web3, token.address, token.address, amountWei);
            }
            setTxHash(hash);
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Claimed parent tokens`, details: hash });
            await refreshToken();
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Claim Failed: ${e.reason || e.message}` });
        } finally {
            setClaiming(false);
        }
    };

    if (!token) {
        return (
            <div className="h-full flex items-center justify-center text-green-400/30 font-mono">
                <div className="text-center">
                    <div className="text-4xl mb-3">⚗</div>
                    <div className="text-sm font-bold mb-2">MINT LAB</div>
                    <div className="text-[10px]">Select a token from the Treasury Deck to begin minting</div>
                    <button
                        onClick={() => onNavigate(AtropaView.TREASURY_DECK)}
                        className="mt-4 px-4 py-1.5 text-xs font-bold border border-green-400/30 text-green-400 hover:bg-green-400/10"
                    >
                        ← TREASURY DECK
                    </button>
                </div>
            </div>
        );
    }

    const isV2Claimable = token.minterType === 'V2' && token.debenture;
    const isV4Claimable = token.minterType === 'V4' && token.debenture !== false;
    const canClaim = isV2Claimable || isV4Claimable;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-green-900/30 bg-green-950/10 shrink-0">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onNavigate(AtropaView.TREASURY_DECK)}
                            className="text-green-400/50 hover:text-green-400 text-xs"
                        >
                            ← BACK
                        </button>
                        <h2 className="text-green-400 font-bold text-lg tracking-wider">MINT LAB</h2>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="max-w-2xl mx-auto space-y-4">
                    {/* Token Info */}
                    <div className="border border-green-400/20 bg-black/40 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <div className="text-green-400 font-bold text-xl">{token.symbol}</div>
                                <div className="text-gray-400 text-xs">{token.name}</div>
                                <div className="text-gray-600 text-[10px] font-mono mt-1">{token.address}</div>
                            </div>
                            <div className="text-right">
                                <span className={`text-xs font-bold px-2 py-0.5 border ${
                                    token.minterType === 'V1' ? 'text-green-400 border-green-400/30' :
                                    token.minterType === 'V2' ? 'text-orange-400 border-orange-400/30' :
                                    token.minterType === 'V3' ? 'text-cyan-400 border-cyan-400/30' :
                                    'text-purple-400 border-purple-400/30'
                                }`}>{token.minterType}</span>
                                {token.minterType === 'V2' && (
                                    <div className={`text-[10px] mt-1 font-bold ${token.debenture ? 'text-green-400' : 'text-red-400'}`}>
                                        {token.debenture ? '⬤ DEBENTURE OPEN' : '◯ PUBLISHED'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-[10px]">
                            <div>
                                <div className="text-gray-600 uppercase">Total Supply</div>
                                <div className="text-gray-300 font-bold">{formatNum(token.totalSupply)}</div>
                            </div>
                            <div>
                                <div className="text-gray-600 uppercase">Parent</div>
                                <div className="text-gray-300 font-bold">{token.parentSymbol || '???'}</div>
                            </div>
                            {token.multiplier && (
                                <div>
                                    <div className="text-gray-600 uppercase">Current Mult.</div>
                                    <div className="text-cyan-400 font-bold">{token.multiplier}×</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode Tabs */}
                    <div className="flex gap-1">
                        <button
                            onClick={() => setActiveMode('MINT')}
                            className={`px-4 py-1.5 text-xs font-bold border transition-all ${
                                activeMode === 'MINT'
                                    ? 'border-green-400 text-black bg-green-400'
                                    : 'border-green-400/20 text-green-400/50 hover:text-green-400'
                            }`}
                        >
                            ⚗ MINT
                        </button>
                        {canClaim && (
                            <button
                                onClick={() => setActiveMode('CLAIM')}
                                className={`px-4 py-1.5 text-xs font-bold border transition-all ${
                                    activeMode === 'CLAIM'
                                        ? 'border-orange-400 text-black bg-orange-400'
                                        : 'border-orange-400/20 text-orange-400/50 hover:text-orange-400'
                                }`}
                            >
                                ∞ CLAIM
                            </button>
                        )}
                    </div>

                    {/* Mint Mode */}
                    {activeMode === 'MINT' && (
                        <div className="border border-green-400/20 bg-black/40 p-4 space-y-4">
                            <div className="text-xs text-green-400 font-bold tracking-widest">STANDARD MINT</div>

                            {/* Parent Balance Info */}
                            <div className="bg-green-950/20 border border-green-400/10 p-3 text-[10px]">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Parent Token:</span>
                                    <span className="text-green-400 font-bold">{token.parentSymbol || '???'}</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-gray-500">Your Balance:</span>
                                    <span className="text-gray-300 font-bold">{formatNum(parentBalance)}</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-gray-500">Approved:</span>
                                    <span className="text-gray-300">{formatNum(parentAllowance)}</span>
                                </div>
                            </div>

                            {/* Amount Input */}
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase block mb-1">Amount to Mint</label>
                                <input
                                    type="text"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.0"
                                    className="w-full bg-black border border-green-400/20 px-3 py-2 text-green-400 text-lg font-mono placeholder-green-400/20 focus:border-green-400/50 outline-none"
                                />
                            </div>

                            {/* Cost Preview */}
                            {estimatedCost && (
                                <div className="bg-green-950/30 border border-green-400/20 p-3">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500">Cost ({token.parentSymbol}):</span>
                                        <span className="text-green-400 font-bold">{formatNum(estimatedCost)}</span>
                                    </div>
                                    {token.multiplier && (
                                        <div className="flex justify-between text-[10px] mt-1">
                                            <span className="text-gray-600">Multiplier Applied:</span>
                                            <span className="text-cyan-400">{token.multiplier}×</span>
                                        </div>
                                    )}
                                    {parseFloat(estimatedCost) > parseFloat(parentBalance) && (
                                        <div className="text-red-400 text-[10px] mt-2 font-bold">
                                            ⚠ INSUFFICIENT {token.parentSymbol} BALANCE
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Mint Button */}
                            <button
                                onClick={handleMint}
                                disabled={!user.isConnected || minting || !amount || parseFloat(amount) <= 0}
                                className="w-full py-3 text-sm font-bold border-2 border-green-400 text-green-400 hover:bg-green-400 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-green-400"
                            >
                                {minting ? '⟳ MINTING...' : !user.isConnected ? 'CONNECT WALLET' : `MINT ${amount || '0'} ${token.symbol}`}
                            </button>
                        </div>
                    )}

                    {/* Claim Mode (Infinite Mint) */}
                    {activeMode === 'CLAIM' && canClaim && (
                        <div className="border border-orange-400/20 bg-black/40 p-4 space-y-4">
                            <div className="text-xs text-orange-400 font-bold tracking-widest">∞ INFINITE MINT / CLAIM</div>

                            <div className="bg-orange-950/20 border border-orange-400/10 p-3 text-[10px] text-gray-400">
                                <p className="mb-2">
                                    <strong className="text-orange-400">How it works:</strong> This token's Debenture is OPEN, enabling the recursive mint/claim loop:
                                </p>
                                <ol className="list-decimal list-inside space-y-1 text-gray-500">
                                    <li>Deposit <span className="text-green-400">{token.parentSymbol}</span> to mint <span className="text-orange-400">{token.symbol}</span></li>
                                    <li>Send <span className="text-orange-400">{token.symbol}</span> back via Claim to recover <span className="text-green-400">{token.parentSymbol}</span></li>
                                    <li>Net cost = 0. Repeat to accumulate <span className="text-orange-400">{token.symbol}</span></li>
                                </ol>
                            </div>

                            {/* Amount Input */}
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase block mb-1">Amount to Claim</label>
                                <input
                                    type="text"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.0"
                                    className="w-full bg-black border border-orange-400/20 px-3 py-2 text-orange-400 text-lg font-mono placeholder-orange-400/20 focus:border-orange-400/50 outline-none"
                                />
                            </div>

                            {/* Your token balance */}
                            <div className="bg-orange-950/20 border border-orange-400/10 p-3 text-[10px]">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Your {token.symbol} Balance:</span>
                                    <span className="text-orange-400 font-bold">{token.userBalance ? formatNum(token.userBalance) : '0'}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleClaim}
                                disabled={!user.isConnected || claiming || !amount || parseFloat(amount) <= 0}
                                className="w-full py-3 text-sm font-bold border-2 border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-black transition-all disabled:opacity-30"
                            >
                                {claiming ? '⟳ CLAIMING...' : `CLAIM ${amount || '0'} ${token.parentSymbol}`}
                            </button>
                        </div>
                    )}

                    {/* Transaction Result */}
                    {txHash && (
                        <div className="border border-green-400/30 bg-green-950/20 p-3">
                            <div className="text-[10px] text-green-400 font-bold mb-1">✓ TRANSACTION CONFIRMED</div>
                            <a
                                href={`https://scan.pulsechain.com/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-cyan-400 hover:underline font-mono break-all"
                            >
                                {txHash}
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MintLab;
