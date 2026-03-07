
import React, { useState, useEffect, useRef } from 'react';
import { Web3Service } from '../services/web3Service';
import { LogEntry, UserContext } from '../types';
import { ADDRESSES, LAU_ABI, CHO_ABI, QING_ABI } from '../constants';
import { Persistence, LauData, SectorData } from '../services/persistenceService';
import { isAddress, ZeroAddress } from 'ethers';

interface LauRegistryProps {
    web3: Web3Service | null;
    user: UserContext;
    addLog: (entry: LogEntry) => void;
    setUser: React.Dispatch<React.SetStateAction<UserContext>>;
    initialSearchTerm?: string;
}

// Helpers for Soul Sigil
const getSoulTheme = (soulIdStr: string) => {
    let hash = 0;
    for (let i = 0; i < soulIdStr.length; i++) {
        hash = soulIdStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash) % 360;
    const primary = `hsl(${h1}, 75%, 60%)`;
    const hash2 = (hash * 1664525 + 1013904223) | 0;
    const h2 = Math.abs(hash2) % 360;
    const secondary = `hsl(${h2}, 85%, 70%)`;
    return { primary, secondary };
};

const SoulSigil: React.FC<{ soulId: string, size?: number }> = ({ soulId, size = 32 }) => {
    const { primary, secondary } = getSoulTheme(soulId);
    const generateMatrix = () => {
        let hash = 0;
        for (let i = 0; i < soulId.length; i++) {
            hash = soulId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const shapeBits = [];
        for(let i = 0; i < 15; i++) shapeBits.push(((hash >> i) & 1) === 1);
        const colorHash = (hash * 1664525 + 1013904223) | 0;
        const colorBits = [];
        for(let i = 0; i < 15; i++) colorBits.push(((colorHash >> i) & 1) === 1);
        return { shapeBits, colorBits };
    };
    const { shapeBits, colorBits } = generateMatrix();
    return (
        <svg width={size} height={size} viewBox="0 0 5 5" shapeRendering="crispEdges" className="bg-black border border-white/10 shrink-0">
            <rect x="0" y="0" width="5" height="5" fill="#050505" />
            {Array.from({ length: 5 }).map((_, y) => (
                Array.from({ length: 3 }).map((_, x) => {
                    const idx = y * 3 + x;
                    if (shapeBits[idx]) {
                        const fill = colorBits[idx] ? secondary : primary;
                        return (
                            <React.Fragment key={`${x}-${y}`}>
                                <rect x={x} y={y} width="1" height="1" fill={fill} />
                                {x < 2 && <rect x={4 - x} y={y} width="1" height="1" fill={fill} />}
                            </React.Fragment>
                        );
                    }
                    return null;
                })
            ))}
        </svg>
    );
};

const LauRegistry: React.FC<LauRegistryProps> = ({ web3, user, addLog, initialSearchTerm = '' }) => {
    const [laus, setLaus] = useState<LauData[]>([]);
    const [searchQuery, setSearchQuery] = useState(initialSearchTerm);
    
    // Scan State
    const [scanState, setScanState] = useState<{
        active: boolean;
        progress: number;
        total: number;
        found: number;
        status: string;
    }>({
        active: false,
        progress: 0,
        total: 0,
        found: 0,
        status: 'IDLE'
    });

    const [loading, setLoading] = useState(false);
    
    // Manual Add State
    const [manualAddress, setManualAddress] = useState('');
    
    // Details
    const [selectedLau, setSelectedLau] = useState<LauData | null>(null);
    const [fetchedDetails, setFetchedDetails] = useState<any>(null);
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load
    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (initialSearchTerm) {
            setSearchQuery(initialSearchTerm);
        }
    }, [initialSearchTerm]);

    // Deep Link Auto-Resolution
    useEffect(() => {
        const checkDeepLink = async () => {
            // Check if searchQuery is a numeric Soul ID and not found in existing list
            if (searchQuery && /^\d+$/.test(searchQuery) && web3) {
                const soulExists = laus.some(l => l.soulId === searchQuery);
                
                // Only resolve if not found and not currently loading something else
                if (!soulExists && !loading && !scanState.active) {
                    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Resolving Deep Link for Soul #${searchQuery}...` });
                    setLoading(true);
                    try {
                        const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
                        const soulBigInt = BigInt(searchQuery); // Ensure safe integer
                        const wallet = await cho.GetAddressBySoul(soulBigInt).catch(() => ZeroAddress);
                        
                        if (wallet && wallet !== ZeroAddress) {
                            const lauAddr = await cho.GetUserTokenAddress(wallet).catch(() => ZeroAddress);
                            if (lauAddr && lauAddr !== ZeroAddress) {
                                await resolveAndSaveLau(lauAddr, searchQuery, "Deep Link");
                            } else {
                                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Soul #${searchQuery} is active but has no LAU Shell.` });
                            }
                        } else {
                             addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Identity Unresolved: Soul #${searchQuery} not found in CHO.` });
                        }
                    } catch(e: any) {
                        console.warn("Deep link resolution failed", e);
                    } finally {
                        setLoading(false);
                    }
                }
            }
        };

        const t = setTimeout(checkDeepLink, 800);
        return () => clearTimeout(t);
    }, [searchQuery, web3, laus.length]);

    const loadData = async () => {
        const storedLaus = await Persistence.getAllLaus();
        storedLaus.sort((a,b) => b.timestamp - a.timestamp);
        setLaus(storedLaus);
    };

    const handleClearCache = async () => {
        if (window.confirm("WARNING: This will wipe only the LAU REGISTRY list. Chat logs and Map data will be preserved. Continue?")) {
            await Persistence.clearLaus();
            setLaus([]);
            localStorage.removeItem('dys_scan_sector_idx');
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `LAU Registry Cache Purged.` });
            loadData();
        }
    };

    const filteredLaus = laus.filter(l => 
        l.address.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (l.username && l.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
        l.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.soulId && l.soulId.includes(searchQuery))
    );

    // --- MANUAL ADD ---
    const handleManualAdd = async () => {
        if (!web3 || !manualAddress || !isAddress(manualAddress)) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Invalid Address Format.` });
            return;
        }
        
        setLoading(true);
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Probing Address: ${manualAddress}...` });

        try {
            await resolveAndSaveLau(manualAddress, undefined, "Manual Import");
            setManualAddress('');
        } catch (e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Probe Failed: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    // --- CORE SCANNING LOGIC ---

    const stopScan = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setScanState(prev => ({ ...prev, active: false, status: 'STOPPED' }));
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Scanner Halted.` });
    };

    const resolveAndSaveLau = async (lauAddr: string, knownSoulId?: string, source: string = "Scan") => {
        if (!web3) return false;
        
        // Check if we already have this address
        const exists = laus.find(l => l.address.toLowerCase() === lauAddr.toLowerCase());
        if (exists) {
             // Update soulId if we found one and didn't have it before
             if (!exists.soulId && knownSoulId) {
                 const updated = { ...exists, soulId: knownSoulId };
                 await Persistence.saveLau(updated);
                 setLaus(prev => prev.map(l => l.address.toLowerCase() === lauAddr.toLowerCase() ? updated : l));
                 return true;
             }
             return false; 
        }

        try {
            const lauContract = web3.getContract(lauAddr, LAU_ABI);
            
            // Be more permissive with errors to allow partial data entry if CHO confirmed address
            const [username, owner, type, saat1] = await Promise.all([
                lauContract.Username().catch(() => null),
                lauContract.owner().catch(() => null),
                lauContract.Type().catch(() => null),
                lauContract.Saat(1).catch(() => 0n)
            ]);

            // Validation: Must have at least one valid property or be explicitly confirmed via CHO flow (implicit)
            const hasData = username !== null || owner !== null || type !== null;
            if (!hasData) return false;

            const soulId = knownSoulId || (saat1 > 0n ? saat1.toString() : undefined);

            const newLau: LauData = {
                address: lauAddr,
                owner: owner || "UNKNOWN",
                blockNumber: 0,
                timestamp: Date.now(),
                username: username || "UNKNOWN",
                soulId
            };

            await Persistence.saveLau(newLau);
            
            setLaus(prev => {
                const filtered = prev.filter(l => l.address.toLowerCase() !== lauAddr.toLowerCase());
                return [newLau, ...filtered];
            });

            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Identified: ${username || 'Entity'} [${source}]` });
            return true;
        } catch {
            return false;
        }
    };

    // --- SCAN: CHAT LOGS ---
    const scanChatLogs = async () => {
        if (!web3) return;
        setScanState({ active: true, progress: 0, total: 0, found: 0, status: 'ANALYZING LOGS...' });
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const sectors = await Persistence.getAllSectors();
            const channels = [ADDRESSES.VOID, ...sectors.map(s => s.address)];
            const uniqueSouls = new Set<string>();
            let processedMessages = 0;

            // 1. Gather Souls from Messages
            for (const ch of channels) {
                if (signal.aborted) break;
                // Grab all available history from cache
                const msgs = await Persistence.getMessages(ch, 50000); 
                processedMessages += msgs.length;
                
                msgs.forEach(m => {
                    // Extract ID from "SOUL:123" or "123"
                    const id = m.sender.replace(/[^0-9]/g, '');
                    if (id && id !== "0") uniqueSouls.add(id);
                });
                
                setScanState(prev => ({ 
                    ...prev, 
                    status: `MINING LOGS: ${processedMessages} MSGS SCANNED...` 
                }));
                await new Promise(r => setTimeout(r, 5)); // UI Breathe
            }

            const soulArray = Array.from(uniqueSouls);
            setScanState(prev => ({ 
                ...prev, 
                total: soulArray.length, 
                progress: 0, 
                status: `RESOLVING ${soulArray.length} SOULS...` 
            }));

            // 2. Resolve Souls
            const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
            let foundCount = 0;

            for (let i = 0; i < soulArray.length; i++) {
                if (signal.aborted) break;
                const soulId = soulArray[i];
                
                // Skip if we already have this Soul ID in registry
                if (laus.some(l => l.soulId === soulId)) {
                    setScanState(prev => ({ ...prev, progress: i + 1 }));
                    continue;
                }

                try {
                    setScanState(prev => ({ ...prev, status: `RESOLVING SOUL ${soulId}...` }));
                    const soulBigInt = BigInt(soulId);
                    const wallet = await cho.GetAddressBySoul(soulBigInt);
                    if (wallet && wallet !== ZeroAddress) {
                        const lauAddr = await cho.GetUserTokenAddress(wallet);
                        if (lauAddr && lauAddr !== ZeroAddress) {
                            const added = await resolveAndSaveLau(lauAddr, soulId, `Soul ${soulId}`);
                            if (added) foundCount++;
                        }
                    }
                } catch {}
                
                setScanState(prev => ({ ...prev, progress: i + 1, found: foundCount }));
                await new Promise(r => setTimeout(r, 20)); // Rate limit
            }

            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Chat Scan Complete. ${foundCount} New Entities.` });

        } catch (e: any) {
            if (e.message !== "Aborted") {
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Scan Error: ${e.message}` });
            }
        } finally {
            if (!signal.aborted) setScanState(prev => ({ ...prev, active: false, status: 'COMPLETE' }));
            abortControllerRef.current = null;
        }
    };

    // --- EXPORT/IMPORT ---
    const handleExport = async () => {
        try {
            const json = await Persistence.exportData('LAU');
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dysnomia_lau_registry_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Registry Exported.` });
        } catch(e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Export Failed: ${e.message}` });
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                setLoading(true);
                const result = await Persistence.importData(event.target?.result as string);
                setLoading(false);
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Imported: ${result.lausAdded} Identities.` });
                loadData();
            } catch(e: any) {
                setLoading(false);
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Import Failed: ${e.message}` });
            }
        };
        reader.readAsText(file);
    };

    // Detail View Logic
    const viewDetails = async (lau: LauData) => {
        setSelectedLau(lau);
        setFetchedDetails(null);
        if (!web3) return;

        try {
            const contract = web3.getContract(lau.address, LAU_ABI);
            const [username, area, saat0, saat1, saat2] = await Promise.all([
                contract.Username().catch(() => null),
                contract.CurrentArea().catch(() => null),
                contract.Saat(0).catch(() => 0n),
                contract.Saat(1).catch(() => 0n),
                contract.Saat(2).catch(() => 0n)
            ]);

            const soulId = saat1 > 0n ? saat1.toString() : lau.soulId;

            // Update persistence with fresh data
            const updatedLau = { 
                ...lau, 
                username: username || lau.username, 
                soulId,
                timestamp: Date.now() 
            };
            
            await Persistence.saveLau(updatedLau);
            
            setLaus(prev => prev.map(l => l.address === lau.address ? updatedLau : l));
            setSelectedLau(updatedLau); 

            setFetchedDetails({
                username,
                currentArea: area,
                saat: { pole: saat0.toString(), soul: saat1.toString(), aura: saat2.toString() }
            });

        } catch(e) { console.error(e); }
    };

    return (
        <div className="h-full flex flex-col bg-dys-black p-4 md:p-8 font-mono text-gray-300">
            <div className="w-full max-w-6xl mx-auto flex flex-col h-full gap-4">
                
                {/* TOP BAR */}
                <div className="flex flex-col gap-4 border-b border-dys-border pb-4 shrink-0">
                    <div className="flex justify-between items-end">
                        <div>
                            <h2 className="text-2xl text-dys-green font-bold tracking-tighter">LAU REGISTRY // SOUL_INDEX</h2>
                            <div className="text-xs text-gray-500 mt-1">
                                KNOWN ENTITIES: <span className="text-white font-bold">{laus.length}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                className="bg-black border border-dys-border p-2 text-xs text-dys-green focus:border-dys-green outline-none w-48"
                                placeholder="Filter Address/Name/ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* CONTROL PANEL */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* MANUAL ADD */}
                        <div className="bg-dys-panel border border-dys-border p-3">
                             <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Manual Import (Probe)</div>
                             <div className="flex gap-2">
                                 <input 
                                     className="flex-1 bg-black border border-dys-border p-2 text-xs text-dys-cyan focus:border-dys-cyan outline-none"
                                     placeholder="Enter LAU Address..."
                                     value={manualAddress}
                                     onChange={(e) => setManualAddress(e.target.value)}
                                 />
                                 <button 
                                    onClick={handleManualAdd}
                                    disabled={loading || !manualAddress}
                                    className="bg-dys-cyan/10 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black px-3 py-1 font-bold text-xs"
                                 >
                                     IMPORT
                                 </button>
                             </div>
                        </div>
                        
                        {/* DISCOVERY TOOLS */}
                        <div className="bg-dys-panel border border-dys-border p-3 flex flex-col justify-between">
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-[10px] text-gray-500 font-bold uppercase">Discovery Tools</div>
                                {scanState.active && (
                                    <button onClick={stopScan} className="text-[9px] text-dys-red bg-dys-red/10 border border-dys-red px-2 animate-pulse hover:bg-dys-red hover:text-black">
                                        ABORT SCAN
                                    </button>
                                )}
                            </div>
                            
                            {scanState.active ? (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[9px] text-dys-gold">
                                        <span>{scanState.status}</span>
                                        <span>{scanState.progress} / {scanState.total} | {scanState.found} FOUND</span>
                                    </div>
                                    <div className="w-full h-2 bg-black border border-gray-800">
                                        <div 
                                            className="h-full bg-dys-gold transition-all duration-300"
                                            style={{ width: `${scanState.total > 0 ? (scanState.progress / scanState.total) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={scanChatLogs}
                                        disabled={loading}
                                        className="w-full bg-dys-green/10 text-dys-green border border-dys-green/30 hover:bg-dys-green hover:text-black px-2 py-1 text-[10px] font-bold transition-all"
                                    >
                                        SCAN CHAT LOGS
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
                    
                    {/* LIST */}
                    <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start pb-4">
                        {filteredLaus.map((lau) => {
                            const seed = lau.soulId || lau.address.substring(2, 8);
                            return (
                                <button 
                                    key={lau.address}
                                    onClick={() => viewDetails(lau)}
                                    className={`text-left p-4 border transition-all group relative overflow-hidden flex items-start gap-4 h-24 ${selectedLau?.address === lau.address ? 'border-dys-green bg-dys-green/10' : 'border-dys-border bg-black hover:border-dys-green/50'}`}
                                >
                                    <SoulSigil soulId={seed} size={48} /> 
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm truncate ${selectedLau?.address === lau.address ? 'text-white' : 'text-gray-400 group-hover:text-dys-green'}`}>
                                            {lau.username || "UNKNOWN_PILOT"}
                                        </div>
                                        <div className="text-[10px] text-gray-600 font-mono truncate">{lau.address}</div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[9px] text-gray-700">
                                                {lau.blockNumber > 0 ? `BLK: ${lau.blockNumber}` : ""}
                                            </span>
                                            {lau.soulId && <span className="text-[9px] text-dys-gold">SOUL: {lau.soulId}</span>}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        
                        {filteredLaus.length === 0 && (
                            <div className="col-span-full text-center text-gray-600 py-10 italic">
                                {searchQuery ? 
                                    (loading ? "RESOLVING IDENTITY..." : "NO ENTITIES FOUND.") : 
                                    "No entities found. Use Discovery Tools to mine logs or import manually."}
                            </div>
                        )}
                    </div>

                    {/* DETAILS PANEL */}
                    {selectedLau && (
                        <div className="w-80 md:w-96 bg-dys-panel border border-dys-border flex flex-col shrink-0 overflow-hidden">
                            <div className="p-4 border-b border-dys-border bg-black/50 shrink-0">
                                <h3 className="text-dys-green font-bold text-sm tracking-widest">ENTITY_DOSSIER</h3>
                            </div>
                            
                            <div className="p-6 flex flex-col items-center border-b border-dys-border/50 shrink-0">
                                <SoulSigil soulId={selectedLau.soulId || selectedLau.address.substring(2, 8)} size={96} />
                                <div className="mt-4 text-xl font-bold text-white">{fetchedDetails?.username || selectedLau.username || "UNKNOWN"}</div>
                                <div className="text-[10px] text-dys-green bg-dys-green/10 px-2 py-1 rounded mt-2 font-mono select-all">
                                    {selectedLau.address}
                                </div>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
                                <div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Origin (Pilot)</div>
                                    <div className="text-xs text-gray-300 font-mono break-all">{selectedLau.owner}</div>
                                </div>
                                {selectedLau.soulId && (
                                    <div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Soul ID</div>
                                        <div className="text-xs text-dys-gold font-mono">{selectedLau.soulId}</div>
                                    </div>
                                )}
                                <div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Acquisition</div>
                                    <div className="text-xs text-gray-300">
                                        {new Date(selectedLau.timestamp).toLocaleDateString()}
                                    </div>
                                </div>

                                {fetchedDetails && (
                                    <>
                                        <div className="pt-4 border-t border-dys-border/30">
                                            <div className="text-[10px] text-dys-cyan font-bold uppercase mb-2">Current Location</div>
                                            <div className="text-xs text-dys-cyan font-mono break-all">
                                                {fetchedDetails.currentArea || "VOID (NULL)"}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-[10px] text-dys-gold font-bold uppercase mb-2">Saat Matrix</div>
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div className="bg-black border border-dys-border p-2 overflow-hidden">
                                                    <div className="text-[9px] text-gray-500 mb-1">POLE</div>
                                                    <div className="text-[10px] font-bold text-dys-gold break-all leading-tight">{fetchedDetails.saat.pole}</div>
                                                </div>
                                                <div className="bg-black border border-dys-border p-2 overflow-hidden">
                                                    <div className="text-[9px] text-gray-500 mb-1">SOUL</div>
                                                    <div className="text-[10px] font-bold text-dys-gold break-all leading-tight">{fetchedDetails.saat.soul}</div>
                                                </div>
                                                <div className="bg-black border border-dys-border p-2 overflow-hidden">
                                                    <div className="text-[9px] text-gray-500 mb-1">AURA</div>
                                                    <div className="text-[10px] font-bold text-dys-gold break-all leading-tight">{fetchedDetails.saat.aura}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER CONTROLS */}
                <div className="border-t border-dys-border pt-4 flex gap-4 justify-end shrink-0">
                     <button onClick={handleClearCache} className="text-[10px] text-dys-red hover:text-white uppercase font-bold border border-transparent hover:border-dys-red px-3 py-1 transition-all mr-auto">NUKE CACHE (LAUS ONLY)</button>
                     <button onClick={handleExport} className="text-[10px] text-gray-500 hover:text-white uppercase font-bold border border-transparent hover:border-gray-500 px-3 py-1 transition-all">EXPORT REGISTRY</button>
                     <label className="text-[10px] text-gray-500 hover:text-white uppercase font-bold border border-transparent hover:border-gray-500 px-3 py-1 transition-all cursor-pointer">
                        {loading ? 'IMPORTING...' : 'IMPORT REGISTRY'}
                        <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} disabled={loading} className="hidden" />
                     </label>
                </div>

            </div>
        </div>
    );
};

export default LauRegistry;
