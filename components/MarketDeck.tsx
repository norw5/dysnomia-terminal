
import React, { useState, useEffect, useMemo } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, ERC20_ABI, QING_ABI, GWAT_ABI } from '../constants';
import { formatUnits, parseUnits, ZeroAddress, randomBytes, toBigInt } from 'ethers';
import { Persistence, SectorData } from '../services/persistenceService';

// Minimal GWAT ABI for this component
const GWAT_PARTIAL_ABI = [
  "function Gwat(address Qing, uint256 Lin) returns (address Mu)"
];

interface MarketDeckProps {
  web3: Web3Service | null;
  user: UserContext;
  addLog: (entry: LogEntry) => void;
}

const CopyBadge: React.FC<{ label: string; address: string; symbol?: string }> = ({ label, address, symbol }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if(!address) return;
        navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="flex flex-col gap-1 bg-black/40 border border-gray-800 p-2 group hover:border-dys-cyan/50 transition-colors">
            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{label}</span>
            <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs text-gray-300 truncate">
                    {address ? `${address.substring(0, 8)}...${address.substring(36)}` : '---'}
                    {symbol && <span className="ml-2 text-dys-cyan bg-dys-cyan/10 px-1 rounded text-[9px]">{symbol}</span>}
                </div>
                <button onClick={handleCopy} disabled={!address} className={`px-2 py-1 text-[9px] font-bold uppercase transition-all ${copied ? 'bg-dys-green text-black' : 'bg-gray-800 text-gray-400 hover:bg-dys-cyan hover:text-black disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                    {copied ? 'COPIED' : 'COPY'}
                </button>
            </div>
        </div>
    );
};

const MarketDeck: React.FC<MarketDeckProps> = ({ web3, user, addLog }) => {
    const [loading, setLoading] = useState(false);
    const [sectors, setSectors] = useState<SectorData[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSectorAddr, setSelectedSectorAddr] = useState('');
    const [baseAssetSymbol, setBaseAssetSymbol] = useState('---');
    const [baseAssetAddr, setBaseAssetAddr] = useState('');
    const [qingSymbol, setQingSymbol] = useState('---');
    const [exchangeRate, setExchangeRate] = useState<string>('0');
    const [rawRate, setRawRate] = useState<bigint>(0n);
    const [walletBalances, setWalletBalances] = useState<{ base: string, qing: string } | null>(null);
    const [coverCharge, setCoverCharge] = useState<string>('0');
    const [amount, setAmount] = useState('');
    const [newRate, setNewRate] = useState('');
    const [newCover, setNewCover] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [isBouncer, setIsBouncer] = useState(false);
    const [adminTab, setAdminTab] = useState<'LIQUIDITY' | 'ACCESS' | 'DERIVATIVES'>('DERIVATIVES');

    useEffect(() => {
        const load = async () => {
            const s = await Persistence.getAllSectors();
            const tradeable = s.filter(sec => sec.address !== ADDRESSES.VOID);
            setSectors(tradeable);
            const saved = sessionStorage.getItem('dys_selected_sector');
            if (saved && tradeable.find(t => t.address === saved)) {
                setSelectedSectorAddr(saved);
            }
        };
        load();
    }, [user.mapSync.lastUpdate]);

    const filteredSectors = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return sectors.filter(s => s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q) || s.address.toLowerCase().includes(q));
    }, [sectors, searchQuery]);

    const selectedName = useMemo(() => {
        if (!selectedSectorAddr) return "SELECT MARKET";
        return sectors.find(s => s.address === selectedSectorAddr)?.name || "UNKNOWN SECTOR";
    }, [sectors, selectedSectorAddr]);

    const handleSelectSector = (addr: string) => {
        setSelectedSectorAddr(addr);
        sessionStorage.setItem('dys_selected_sector', addr);
        setAmount('');
        setNewRate('');
        setNewCover('');
        setExchangeRate('0');
        setRawRate(0n);
        setCoverCharge('0');
        setWalletBalances(null); 
        setIsOwner(false);
        setIsBouncer(false);
        setBaseAssetSymbol('---');
        setQingSymbol('---');
    };

    const handleTrackAsset = () => {
        if (!selectedSectorAddr || !baseAssetAddr) return;
        const current = localStorage.getItem('dys_tracked_assets');
        let tracked = current ? JSON.parse(current) : [];
        if (!tracked.find((t: any) => t.address.toLowerCase() === baseAssetAddr.toLowerCase())) tracked.push({ symbol: baseAssetSymbol, address: baseAssetAddr });
        if (!tracked.find((t: any) => t.address.toLowerCase() === selectedSectorAddr.toLowerCase())) tracked.push({ symbol: qingSymbol, address: selectedSectorAddr });
        localStorage.setItem('dys_tracked_assets', JSON.stringify(tracked));
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Assets added to Yuan Ledger.` });
    };

    useEffect(() => {
        if (!web3 || !selectedSectorAddr) return;
        const fetchMetadata = async () => {
            try {
                let integrative = "";
                const cached = sectors.find(s => s.address === selectedSectorAddr);
                if (cached && cached.integrative) {
                    integrative = cached.integrative;
                } else {
                    const qing = web3.getContract(selectedSectorAddr, ["function Asset() view returns (address)"]);
                    integrative = await qing.Asset();
                }
                setBaseAssetAddr(integrative);
                const baseContract = web3.getContract(integrative, ERC20_ABI);
                const qingContract = web3.getContract(selectedSectorAddr, ERC20_ABI);
                const [bSym, qSym] = await Promise.all([baseContract.symbol().catch(() => 'UNK'), qingContract.symbol().catch(() => 'QING')]);
                setBaseAssetSymbol(bSym);
                setQingSymbol(qSym);
                if (user.address) {
                    const qingFull = web3.getContract(selectedSectorAddr, QING_ABI);
                    try {
                        const [isBouncerCheck, isOwnerCheck] = await Promise.all([qingFull.bouncer(user.address).catch(() => false), qingFull["owner(address)"](user.address).catch(() => false)]);
                        setIsBouncer(isBouncerCheck);
                        setIsOwner(isOwnerCheck);
                        if (isOwnerCheck && adminTab === 'DERIVATIVES') setAdminTab('LIQUIDITY');
                        else if (isBouncerCheck && !isOwnerCheck && adminTab === 'DERIVATIVES') setAdminTab('ACCESS');
                    } catch (e) { console.warn("Permission check failed", e); setIsOwner(false); setIsBouncer(false); }
                }
            } catch (e) { console.warn("Sector metadata fetch failed", e); }
        };
        fetchMetadata();
    }, [selectedSectorAddr, web3, sectors, user.address]);

    useEffect(() => {
        if (!web3 || !user.address || !selectedSectorAddr || !baseAssetAddr) return;
        const fetchData = async () => {
            try {
                const qing = web3.getContract(selectedSectorAddr, QING_ABI);
                const [r, c] = await Promise.all([qing.GetMarketRate(baseAssetAddr).catch(() => 0n), qing.CoverCharge().catch(() => 0n)]);
                setRawRate(r);
                setExchangeRate(formatUnits(r, 18));
                setCoverCharge(formatUnits(c, 18));
                const baseContract = web3.getContract(baseAssetAddr, ERC20_ABI);
                const qingErc20 = web3.getContract(selectedSectorAddr, ERC20_ABI);
                const [bBal, qBal] = await Promise.all([baseContract.balanceOf(user.address).catch(() => 0n), qingErc20.balanceOf(user.address).catch(() => 0n)]);
                setWalletBalances({ base: formatUnits(bBal, 18), qing: formatUnits(qBal, 18) });
            } catch (e) { console.warn("Market data loop failed", e); }
        };
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [web3, user.address, selectedSectorAddr, baseAssetAddr]);

    const handleSetRate = async () => {
        if (!web3 || !selectedSectorAddr || !newRate) return;
        setLoading(true);
        try {
            const qing = web3.getContract(selectedSectorAddr, QING_ABI);
            const rateWei = parseUnits(newRate, 18);
            const tx = await web3.sendTransaction(qing, 'AddMarketRate', [baseAssetAddr, rateWei]);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Setting Peg: ${tx.hash}` });
            await web3.waitForReceipt(tx);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Market Rate Established.` });
            setNewRate('');
            const r = await qing.GetMarketRate(baseAssetAddr).catch(() => 0n);
            setRawRate(r);
            setExchangeRate(formatUnits(r, 18));
        } catch (e: any) {
            const errMsg = web3.parseError(e);
            if (errMsg.includes('OwnableUnauthorizedAccount')) {
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Access Denied: You are not an OWNER of this QING contract. Bouncers cannot set rates.` });
            } else {
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Peg Update Failed`, details: errMsg });
            }
        } finally { setLoading(false); }
    };

    const handleSetCover = async () => {
        if (!web3 || !selectedSectorAddr || !newCover) return;
        setLoading(true);
        try {
            const qing = web3.getContract(selectedSectorAddr, QING_ABI);
            const coverWei = parseUnits(newCover, 18);
            const tx = await web3.sendTransaction(qing, 'setCoverCharge', [coverWei]);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Updating Cover: ${tx.hash}` });
            await web3.waitForReceipt(tx);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Cover Charge Updated.` });
            setNewCover('');
            const c = await qing.CoverCharge().catch(() => 0n);
            setCoverCharge(formatUnits(c, 18));
        } catch (e: any) { addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Update Failed`, details: web3.parseError(e) }); } finally { setLoading(false); }
    };

    const handleTrade = async (isBuy: boolean) => {
        if (!web3 || !selectedSectorAddr || !amount) return;
        setLoading(true);
        try {
            const qing = web3.getContract(selectedSectorAddr, QING_ABI);
            const valWei = parseUnits(amount, 18); 
            if (isBuy) {
                 const allowance = await web3.checkAllowance(baseAssetAddr, user.address!, selectedSectorAddr);
                 const cost = (BigInt(valWei) * BigInt(rawRate)) / 1000000000000000000n;
                 if (allowance < cost) {
                      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Approving ${baseAssetSymbol}...` });
                      const txApprove = await web3.approve(baseAssetAddr, selectedSectorAddr);
                      await web3.waitForReceipt(txApprove);
                 }
                 const tx = await web3.sendTransaction(qing, 'Purchase', [baseAssetAddr, valWei]);
                 addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Buy Order Sent: ${tx.hash}` });
                 await web3.waitForReceipt(tx);
            } else {
                 const allowance = await web3.checkAllowance(selectedSectorAddr, user.address!, selectedSectorAddr);
                 if (allowance < BigInt(valWei)) {
                      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Approving ${qingSymbol}...` });
                      const txApprove = await web3.approve(selectedSectorAddr, selectedSectorAddr);
                      await web3.waitForReceipt(txApprove);
                 }
                 const tx = await web3.sendTransaction(qing, 'Redeem', [baseAssetAddr, valWei]);
                 addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Sell Order Sent: ${tx.hash}` });
                 await web3.waitForReceipt(tx);
            }
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Trade Executed.` });
            setAmount('');
        } catch (e: any) { addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Trade Failed`, details: web3.parseError(e) }); } finally { setLoading(false); }
    };

    return (
        <div className="h-full flex flex-col md:flex-row bg-dys-black font-mono text-gray-300 border-t border-dys-border">
            <div className="w-full md:w-80 border-r border-dys-border bg-dys-panel flex flex-col shrink-0">
                <div className="p-4 border-b border-dys-border bg-black/20">
                    <h3 className="text-dys-cyan font-bold tracking-widest text-sm mb-2">SECTOR_NAV</h3>
                    <input className="w-full bg-black border border-dys-border p-2 text-xs text-white focus:border-dys-cyan outline-none mb-2" placeholder="Search Name / Symbol / Addr..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    <button onClick={user.mapSync.isScanning ? user.mapSync.stopSync : user.mapSync.triggerSync} className={`w-full text-[9px] border py-2 font-bold transition-all flex items-center justify-center gap-2 ${user.mapSync.isScanning ? 'bg-dys-red/20 text-dys-red border-dys-red animate-pulse' : 'bg-dys-green/10 text-dys-green border-dys-green/30 hover:bg-dys-green hover:text-black'}`}>
                        <span className={user.mapSync.isScanning ? "animate-spin" : ""}>{user.mapSync.isScanning ? "⟳" : "📡"}</span>
                        {user.mapSync.isScanning ? `SCANNING [${user.mapSync.progress}]` : 'SYNC NETWORK'}
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {filteredSectors.map(s => {
                        const isSelected = s.address === selectedSectorAddr;
                        return (
                            <button key={s.address} onClick={() => handleSelectSector(s.address)} className={`w-full text-left p-3 border-b border-dys-border/50 hover:bg-white/5 transition-all group ${isSelected ? 'bg-dys-cyan/10 border-l-4 border-l-dys-cyan' : 'border-l-4 border-l-transparent'}`}>
                                <div className="flex justify-between items-center mb-1"><span className={`font-bold text-xs truncate w-32 ${isSelected ? 'text-dys-cyan' : 'text-gray-300'}`}>{s.name}</span><span className="text-[9px] text-gray-500 font-mono">{s.symbol}</span></div>
                                <div className="text-[9px] text-gray-600 font-mono truncate">{s.address}</div>
                            </button>
                        );
                    })}
                    {filteredSectors.length === 0 && <div className="p-4 text-center text-xs text-gray-600 italic">No Sectors Found</div>}
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 bg-black overflow-y-auto">
                <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto w-full">
                    <div className="flex flex-col gap-4 border-b border-dys-border pb-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className={`text-2xl font-bold tracking-tight mb-1 ${selectedSectorAddr ? 'text-white' : 'text-gray-600'}`}>{selectedName}</h2>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-dys-gold bg-dys-gold/10 px-2 py-0.5 rounded border border-dys-gold/20">PAIR: {qingSymbol} / {baseAssetSymbol}</span>
                                    {selectedSectorAddr && <button onClick={handleTrackAsset} className="text-[9px] text-dys-cyan border border-dys-cyan/30 hover:bg-dys-cyan hover:text-black px-2 py-0.5 transition-colors">+ TRACK</button>}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-gray-500 uppercase font-bold">Market Rate</div>
                                <div className={`text-2xl font-mono font-bold ${!selectedSectorAddr ? 'text-gray-700' : (rawRate === 0n ? 'text-dys-red' : 'text-dys-green')}`}>
                                    {walletBalances === null && selectedSectorAddr ? <span className="animate-pulse">...</span> : (!selectedSectorAddr || rawRate === 0n ? 'OFFLINE' : parseFloat(exchangeRate).toFixed(4))}
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <CopyBadge label="Sector Address (QING)" address={selectedSectorAddr} symbol={qingSymbol !== '---' ? qingSymbol : undefined} />
                            <CopyBadge label="Base Asset (Wrapper)" address={baseAssetAddr} symbol={baseAssetSymbol !== '---' ? baseAssetSymbol : undefined} />
                        </div>
                    </div>

                    {(isOwner || isBouncer) && (
                        <div className="bg-dys-panel border border-dys-gold/30 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-dys-gold"></div>
                            <div className="flex border-b border-dys-border bg-black/50">
                                <div className="px-4 py-3 text-xs font-bold bg-dys-gold text-black uppercase tracking-widest">ADMIN CONSOLE</div>
                                <button onClick={() => setAdminTab('LIQUIDITY')} className={`px-4 py-3 text-[10px] font-bold uppercase transition-colors ${adminTab === 'LIQUIDITY' ? 'text-dys-gold border-b-2 border-dys-gold' : 'text-gray-500 hover:text-white'}`}>LIQUIDITY</button>
                                <button onClick={() => setAdminTab('ACCESS')} className={`px-4 py-3 text-[10px] font-bold uppercase transition-colors ${adminTab === 'ACCESS' ? 'text-dys-gold border-b-2 border-dys-gold' : 'text-gray-500 hover:text-white'}`}>ACCESS</button>
                                <button onClick={() => setAdminTab('DERIVATIVES')} className={`px-4 py-3 text-[10px] font-bold uppercase transition-colors ${adminTab === 'DERIVATIVES' ? 'text-dys-gold border-b-2 border-dys-gold' : 'text-gray-500 hover:text-white'}`}>DERIVATIVES</button>
                            </div>
                            <div className="p-5">
                                <div className="mb-4 text-[9px] flex gap-4 p-2 bg-black border border-gray-800">
                                    <span className={isOwner ? "text-dys-green font-bold" : "text-gray-600"}>OWNER: {isOwner ? 'YES' : 'NO'}</span>
                                    <span className={isBouncer ? "text-dys-green font-bold" : "text-gray-600"}>BOUNCER: {isBouncer ? 'YES' : 'NO'}</span>
                                    {!isOwner && isBouncer && <span className="text-dys-gold animate-pulse ml-auto">LIMITED ACCESS DETECTED</span>}
                                </div>
                                {adminTab === 'LIQUIDITY' && (
                                    <div className="space-y-4 animate-in fade-in">
                                        {!isOwner && <div className="p-2 border border-dys-red bg-dys-red/10 text-[10px] text-dys-red"><strong>WARNING: NOT OWNER.</strong><br/>You do not appear to be the direct owner. Setting Market Rate requires <code>onlyOwner</code> privileges.</div>}
                                        <div className="text-[10px] text-gray-400">Current Rate: <strong>1.0 {qingSymbol} = {parseFloat(exchangeRate).toFixed(4)} {baseAssetSymbol}</strong>.<br/>Update the peg using <code>AddMarketRate</code>. Rates can typically only increase.</div>
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1"><label className="text-[9px] text-dys-gold font-bold uppercase mb-1 block">New Rate ({baseAssetSymbol})</label><input className="w-full bg-black border border-dys-gold/50 p-3 text-white font-mono focus:border-dys-gold outline-none" placeholder="0.00" value={newRate} onChange={(e) => setNewRate(e.target.value)} /></div>
                                            <button onClick={handleSetRate} disabled={loading || !newRate} className="bg-dys-gold/20 border border-dys-gold text-dys-gold hover:bg-dys-gold hover:text-black font-bold px-6 py-3 text-xs h-[42px]">UPDATE PEG</button>
                                        </div>
                                    </div>
                                )}
                                {adminTab === 'ACCESS' && (
                                    <div className="space-y-4 animate-in fade-in">
                                        <div className="text-[10px] text-gray-400">Current Entry Fee: <strong>{parseFloat(coverCharge).toFixed(4)} {baseAssetSymbol}</strong>.<br/>Bouncers can update the cover charge required to enter the QING.</div>
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1"><label className="text-[9px] text-dys-gold font-bold uppercase mb-1 block">New Cover Charge ({baseAssetSymbol})</label><input className="w-full bg-black border border-dys-gold/50 p-3 text-white font-mono focus:border-dys-gold outline-none" placeholder="0.00" value={newCover} onChange={(e) => setNewCover(e.target.value)} /></div>
                                            <button onClick={handleSetCover} disabled={loading || !newCover} className="bg-dys-gold/20 border border-dys-gold text-dys-gold hover:bg-dys-gold hover:text-black font-bold px-6 py-3 text-xs h-[42px]">SET FEE</button>
                                        </div>
                                    </div>
                                )}
                                {adminTab === 'DERIVATIVES' && (
                                    <div className="bg-black/50 p-4 border border-gray-800 text-xs text-gray-400 animate-in fade-in">
                                        <p className="mb-3"><strong className="text-dys-gold">DERIVATIVE SPAWNING (GWAT)</strong><br/>Allows Bouncers to create a personal market instance where they are the Root Owner.</p>
                                        <button disabled={true} className="bg-gray-800 text-gray-500 font-bold px-4 py-2 w-full cursor-not-allowed border border-gray-700">SYSTEM OFFLINE: CONTRACT PENDING</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="bg-dys-panel border border-dys-border p-5">
                        <h3 className="text-dys-cyan font-bold text-sm tracking-widest mb-4">EXCHANGE INTERFACE</h3>
                        <div className="grid grid-cols-2 gap-4 mb-4 text-xs font-mono bg-black p-3 border border-gray-800">
                            <div><span className="text-gray-500 block mb-1">YOUR {baseAssetSymbol}</span><span className="text-white font-bold">{walletBalances ? parseFloat(walletBalances.base).toFixed(4) : (selectedSectorAddr ? <span className="animate-pulse">...</span> : '---')}</span></div>
                            <div className="text-right"><span className="text-gray-500 block mb-1">YOUR {qingSymbol}</span><span className="text-dys-cyan font-bold">{walletBalances ? parseFloat(walletBalances.qing).toFixed(4) : (selectedSectorAddr ? <span className="animate-pulse">...</span> : '---')}</span></div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[9px] text-gray-500 font-bold uppercase mb-1 block">Order Amount ({qingSymbol})</label>
                                <input className={`w-full bg-black border border-dys-border p-3 text-white font-mono focus:border-dys-cyan outline-none text-lg ${!selectedSectorAddr ? 'cursor-not-allowed text-gray-600' : ''}`} placeholder={!selectedSectorAddr ? "SELECT SECTOR FIRST" : "0.00"} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!selectedSectorAddr} />
                                {amount && rawRate > 0n && <div className="text-right text-[10px] text-gray-500 mt-1">EST. COST: { (parseFloat(amount) * parseFloat(exchangeRate)).toFixed(4) } {baseAssetSymbol}</div>}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => handleTrade(true)} disabled={loading || !amount || rawRate === 0n || !selectedSectorAddr} className="bg-dys-green/10 border border-dys-green text-dys-green hover:bg-dys-green hover:text-black font-bold py-3 text-xs tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed">BUY {qingSymbol}</button>
                                <button onClick={() => handleTrade(false)} disabled={loading || !amount || !selectedSectorAddr} className="bg-dys-red/10 border border-dys-red text-dys-red hover:bg-dys-red hover:text-black font-bold py-3 text-xs tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed">SELL {qingSymbol}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MarketDeck;
