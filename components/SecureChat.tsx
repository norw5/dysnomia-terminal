import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Interface, id as ethId, ethers } from 'ethers';
import { Web3Service } from '../services/web3Service';
import { UserContext, LogEntry, ChatMessage } from '../types';
import { ADDRESSES, LAU_ABI, VOID_ABI, DYSNOMIA_ABIS, SHIO_GLOBAL } from '../constants';
import { Persistence } from '../services/persistenceService';
import { CryptoService } from '../services/cryptoService';
import SoulSigil from './SoulSigil';

interface SecureChatProps {
    web3: Web3Service;
    recipientSoulId: string;
    recipientLauAddress: string;  
    user: UserContext;
    addLog: (log: LogEntry) => void;
    onViewIdentity: (soulId: string) => void;
}

const PUBKEY_PREFIX = '[PUBKEY:';
const DM_TAG = '[DM:';

function extractDMPayload(logLine: string, targetSoulId: string): string | null {
    const expected = `${DM_TAG}${targetSoulId}]`;
    let idx = logLine.indexOf(expected);
    if (idx >= 0) {
        let payload = logLine.substring(idx + expected.length).trim();
        return payload.length > 10 ? payload : null;
    }
    
    if (logLine.includes('-----BEGIN PGP MESSAGE-----')) {
        if (!logLine.includes(DM_TAG)) {
            const start = logLine.indexOf('-----BEGIN PGP MESSAGE-----');
            const end = logLine.indexOf('-----END PGP MESSAGE-----');
            if (start >= 0 && end > start) {
                return logLine.substring(start, end + 25).trim();
            }
        }
    }
    return null;
}

function extractPubKey(logLine: string): string | null {
    const idx = logLine.indexOf(PUBKEY_PREFIX);
    if (idx < 0) return null;
    const afterPrefix = logLine.substring(idx);
    const closeBracket = afterPrefix.indexOf(']');
    if (closeBracket <= 0) return null;
    const key = afterPrefix.substring(closeBracket + 1).trim();
    return key.length > 20 ? key : null;
}

function extractPGPPubKey(logLine: string): string | null {
    const start = logLine.indexOf('-----BEGIN PGP PUBLIC KEY BLOCK-----');
    const end = logLine.indexOf('-----END PGP PUBLIC KEY BLOCK-----');
    if (start >= 0 && end > start) {
        return logLine.substring(start, end + 34).trim();
    }
    return null;
}

const SHIO_LOG_ABI = ["event LogEvent(uint64 Soul, uint64 Aura, string LogLine)"];

const POLL_INTERVAL = 10000;
const GENESIS_BLOCK = 22813947;
const INITIAL_SCAN_DEPTH = 50000;
const FETCH_CHUNK_SIZE = 50000;

interface ChatSegment {
    type: 'RANGE' | 'GAP';
    start: number;
    end: number;
    messages: ChatMessage[];
}

const SecureChat: React.FC<SecureChatProps> = ({ web3, recipientSoulId, recipientLauAddress, user, addLog, onViewIdentity }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [segments, setSegments] = useState<ChatSegment[]>([]);
    
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sendMode, setSendMode] = useState<'PGP' | 'ECDH' | 'ANON'>('PGP');
    
    // Key States
    const [hasECDH, setHasECDH] = useState(false);
    const [hasPGP, setHasPGP] = useState(false);
    
    // Recipient Key States
    const [recipientECDHKey, setRecipientECDHKey] = useState<string | null>(null);
    const [recipientPGPKey, setRecipientPGPKey] = useState<string | null>(null);
    const [pubKeyLoading, setPubKeyLoading] = useState(true);
    const [pubKeyStatus, setPubKeyStatus] = useState('Checking cache & chain...');
    
    const [encryptLibraryAddress, setEncryptLibraryAddress] = useState<string | null>(null);
    const [fetchingGap, setFetchingGap] = useState<{start: number, end: number} | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const initialLoadRef = useRef<boolean>(true);

    const [hiddenDMs, setHiddenDMs] = useState<Record<string, boolean>>({});

    const mySoulIdStr = user.saat?.soul || "";
    const myLauAddress = user.lauAddress || "";
    const viewAddress = `DM_${mySoulIdStr}_${recipientSoulId}`;

    useEffect(() => {
        if (mySoulIdStr) {
            setHasECDH(CryptoService.hasPrivateKey(mySoulIdStr));
            setHasPGP(CryptoService.hasPGPPrivateKey(mySoulIdStr));
            
            const hidden = localStorage.getItem(`hidden_dms_${mySoulIdStr}`);
            if (hidden) {
                try { setHiddenDMs(JSON.parse(hidden)); } catch(e) {}
            }
        }
    }, [mySoulIdStr]);
    
    const hideMessage = (id: string) => {
        const newHidden = { ...hiddenDMs, [id]: true };
        setHiddenDMs(newHidden);
        localStorage.setItem(`hidden_dms_${mySoulIdStr}`, JSON.stringify(newHidden));
    };

    // Scan for keys
    useEffect(() => {
        let cancelled = false;
        setPubKeyLoading(true);

        const fetchKeys = async () => {
            if (!recipientSoulId || !web3) return;
            
            setPubKeyStatus('Scanning chain for Target Public Keys...');
            const provider = web3.getProvider();
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 200000); // go back ~200k blocks max for keys
            const topicHash = ethId("LogEvent(uint64,uint64,string)");
            const iface = new Interface(SHIO_LOG_ABI);

            let bestECDH: string | null = null;
            let bestPGP: string | null = null;
            let bestEBlock = 0;
            let bestPBlock = 0;

            for (let start = fromBlock; start <= currentBlock; start += 50000) {
                const end = Math.min(start + 49999, currentBlock);
                const logs = await provider.getLogs({ topics: [topicHash], fromBlock: start, toBlock: end });
                for (const log of logs) {
                    try {
                        const parsed = iface.parseLog(log);
                        if (!parsed) continue;
                        const soul = parsed.args[0].toString();
                        const logLine = parsed.args[2];
                        if (soul === recipientSoulId) {
                            const ecdh = extractPubKey(logLine);
                            if (ecdh && log.blockNumber > bestEBlock) { bestECDH = ecdh; bestEBlock = log.blockNumber; }
                            const pgp = extractPGPPubKey(logLine);
                            if (pgp && log.blockNumber > bestPBlock) { bestPGP = pgp; bestPBlock = log.blockNumber; }
                        }
                    } catch { }
                }
            }

            if (!cancelled) {
                setRecipientECDHKey(bestECDH);
                setRecipientPGPKey(bestPGP);
                setPubKeyLoading(false);
                if (bestPGP) setSendMode('PGP');
                else if (bestECDH) setSendMode('ECDH');
            }

            try {
                const voidContract = web3.getContract(ADDRESSES.VOID, VOID_ABI);
                const encAddr = await voidContract.GetLibraryAddress("encrypt");
                if (encAddr && encAddr !== "0x0000000000000000000000000000000000000000" && !cancelled) {
                    setEncryptLibraryAddress(encAddr);
                }
            } catch (e) { }
        };
        fetchKeys();
        return () => { cancelled = true; };
    }, [recipientSoulId, web3]);

    // Segments and Chunked Fetching
    const rebuildSegments = async () => {
        const filterFn = (m: ChatMessage) => {
            if (m.sender === mySoulIdStr) {
                return extractDMPayload(m.content, recipientSoulId) !== null;
            } else if (m.sender === recipientSoulId) {
                return extractDMPayload(m.content, mySoulIdStr) !== null;
            }
            return false;
        };

        const savedMsgs = await Persistence.getMessages(SHIO_GLOBAL, 5000, filterFn); 
        const meta = await Persistence.getChannelMeta(SHIO_GLOBAL);
        const ranges = meta?.scannedRanges || [];
        ranges.sort((a, b) => a.start - b.start);

        const messages = await processRawPayloads(savedMsgs);

        const newSegments: ChatSegment[] = [];
        let lastEnd = GENESIS_BLOCK;
        
        for (const range of ranges) {
            if (range.start > lastEnd + 1) {
                newSegments.push({ type: 'GAP', start: lastEnd, end: range.start - 1, messages: [] });
            }
            const rangeMsgs = messages.filter(m => m.blockNumber >= range.start && m.blockNumber <= range.end);
            rangeMsgs.sort((a,b) => a.blockNumber - b.blockNumber);
            newSegments.push({ type: 'RANGE', start: range.start, end: range.end, messages: rangeMsgs });
            lastEnd = range.end + 1;
        }

        const currentBlock = await web3.getProvider().getBlockNumber();
        if (lastEnd < currentBlock) {
             if (currentBlock - lastEnd > 100) { 
                 newSegments.push({ type: 'GAP', start: lastEnd, end: currentBlock, messages: [] });
             }
        }
        
        if (ranges.length === 0) {
            newSegments.push({ type: 'GAP', start: GENESIS_BLOCK, end: currentBlock, messages: [] });
        }

        setSegments(newSegments);
    };

    const processRawPayloads = async (rawMessages: any[]) => {
        const processed: ChatMessage[] = [];
        for (const raw of rawMessages) {
            let decrypted = '[UNABLE TO DECRYPT]';
            
            const isActuallyMe = raw.sender === mySoulIdStr;
            const targetSoul = isActuallyMe ? recipientSoulId : mySoulIdStr;
            const payload = extractDMPayload(raw.content, targetSoul) || raw.content;

            // Decrypt ENCRYPT Lib payload
            if (payload.startsWith('IDX:') && encryptLibraryAddress && recipientECDHKey && hasECDH) {
                try {
                    const indexNum = parseInt(payload.substring(4));
                    const encryptContract = web3.getContract(encryptLibraryAddress, DYSNOMIA_ABIS.ENCRYPT);
                    const sharedSecretBytes = await CryptoService.deriveSharedSecretBytes(mySoulIdStr, recipientECDHKey);
                    
                    const decryptedHex = await encryptContract["Decrypt(uint64,uint64,uint64,bytes)"](
                        raw.sender, targetSoul, indexNum, sharedSecretBytes
                    );
                    decrypted = new TextDecoder().decode(ethers.getBytes(decryptedHex));
                } catch (e) {
                    console.warn("ENCRYPT decryption failed", e);
                }
            } 
            // Decrypt PGP
            else if (payload.includes('-----BEGIN PGP MESSAGE-----')) {
                // Check local cache for our own sent messages using TX Hash
                if (isActuallyMe) {
                    const txHash = raw.id.split('-')[0];
                    const cached = localStorage.getItem(`pgp_clear_${txHash}`);
                    if (cached) decrypted = cached;
                }

                if (decrypted === '[UNABLE TO DECRYPT]') {
                    const dec = await CryptoService.decryptPGPMessage(mySoulIdStr, payload);
                    if (dec) decrypted = dec;
                    else decrypted = "[PGP MESSAGE (DECRYPTION FAILED / NOT ADDRESSED TO YOU)]";
                }
            }
            // Decrypt ECDH Fallback
            else if (recipientECDHKey) {
                const dec = await CryptoService.decryptMessage(mySoulIdStr, recipientECDHKey, payload);
                if (dec) decrypted = dec;
            }

            processed.push({
                ...raw,
                isMe: isActuallyMe,
                message: decrypted
            });
        }
        return processed;
    };

    const fetchChunk = async (fromBlock: number, toBlock: number, signal?: AbortSignal) => {
        if (fromBlock > toBlock) return;
        const provider = web3.getProvider();
        const topicHash = ethId("LogEvent(uint64,uint64,string)");
        const iface = new Interface(SHIO_LOG_ABI);

        try {
            const logs = await provider.getLogs({ topics: [topicHash], fromBlock, toBlock });
            if (signal?.aborted) throw new Error("Aborted");

            const newMessages: ChatMessage[] = [];
            for (const log of logs) {
                try {
                    const parsed = iface.parseLog(log);
                    if (!parsed) continue;
                    const soul = parsed.args[0].toString();
                    const logLine = parsed.args[2];

                    newMessages.push({
                        id: `${log.transactionHash}-${log.index}`,
                        sender: soul,
                        type: soul,
                        content: logLine,
                        message: logLine,
                        timestamp: Date.now(),
                        blockNumber: log.blockNumber,
                        isMe: soul === mySoulIdStr
                    });
                } catch { }
            }

            if (newMessages.length > 0) {
                await Persistence.saveMessages(newMessages, SHIO_GLOBAL);
            }
            await Persistence.updateScannedRange(SHIO_GLOBAL, fromBlock, toBlock);

        } catch (e: any) {
            if (e.message !== "Aborted") console.warn("Scan error", e);
            throw e;
        }
    };

    const handleFillGap = async (start: number, end: number, mode: 'FULL' | 'CHUNK') => {
        if (fetchingGap) return; 
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        setFetchingGap({ start, end });
        
        let cursor = end;
        const target = start;
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Bridging Gap: ${target} - ${cursor} (Descending)` });

        try {
            while (cursor >= target) {
                if (signal.aborted) break;
                const chunkStart = Math.max(cursor - FETCH_CHUNK_SIZE + 1, target);
                const chunkEnd = cursor;
                await fetchChunk(chunkStart, chunkEnd, signal);
                await rebuildSegments();
                cursor = chunkStart - 1;
                if (mode === 'CHUNK') break; 
                await new Promise(r => setTimeout(r, 100));
            }
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Gap Bridged.` });
        } catch (e: any) {
            if (e.message === "Aborted") {
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Scan Aborted by Pilot.` });
            } else {
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Scan Failed: ${e.message}` });
            }
        } finally {
            setFetchingGap(null);
            abortControllerRef.current = null;
            await rebuildSegments();
        }
    };

    const cancelFetch = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    useEffect(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        initialLoad(abortControllerRef.current.signal);

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [web3, recipientSoulId]);

    const initialLoad = async (signal: AbortSignal) => {
        await rebuildSegments();
        const currentBlock = await web3.getProvider().getBlockNumber();
        const meta = await Persistence.getChannelMeta(SHIO_GLOBAL);
        const ranges = meta?.scannedRanges || [];
        
        const startTarget = Math.max(GENESIS_BLOCK, currentBlock - INITIAL_SCAN_DEPTH);
        const hasRecent = ranges.some(r => r.end >= currentBlock - 200 && r.start <= startTarget + 500);
        
        if (!hasRecent) {
            await performSmartInitScan(startTarget, currentBlock, ranges, signal);
        }
    };

    const performSmartInitScan = async (targetStart: number, currentBlock: number, existingRanges: any[], signal: AbortSignal) => {
        let cursor = currentBlock;
        while (cursor > targetStart && !signal.aborted) {
            const hitRange = existingRanges.find(r => cursor >= r.start && cursor <= r.end);
            if (hitRange) {
                cursor = hitRange.start - 1; 
                break; 
            }
            const chunkStart = Math.max(targetStart, cursor - 10000); 
            
            try {
                await fetchChunk(chunkStart, cursor, signal);
            } catch (e: any) {
                if (e.message === "Aborted") break;
            }
            
            await rebuildSegments();
            cursor = chunkStart - 1;
            if (!signal.aborted) {
                await new Promise(r => setTimeout(r, 50)); 
            }
        }
    };

    // Live poll
    useEffect(() => {
        if(!web3 || !viewAddress) return;
        const poll = async () => {
            const currentBlock = await web3.getProvider().getBlockNumber();
            const meta = await Persistence.getChannelMeta(SHIO_GLOBAL);
            
            let startScan = currentBlock - 100; 
            if (meta && meta.scannedRanges.length > 0) {
                const maxScanned = Math.max(...meta.scannedRanges.map(r => r.end));
                startScan = maxScanned + 1;
            }

            if (currentBlock - startScan > 2000) {
                startScan = currentBlock - 2000;
            }

            if (startScan <= currentBlock) {
                await fetchChunk(startScan, currentBlock);
                await rebuildSegments();
            }
        };
        const interval = setInterval(poll, POLL_INTERVAL);
        poll();
        return () => clearInterval(interval);
    }, [web3, viewAddress]);

    useEffect(() => {
        if (initialLoadRef.current && segments.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
            initialLoadRef.current = false;
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [segments]);


    // ── Actions ──────────────────────────────────────────────────────────────

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || sending || !web3 || !mySoulIdStr || !myLauAddress) return;
        setSending(true);

        try {
            const tag = `[DM:${recipientSoulId}]`;
            
            // PGP Mode (addressed) or ANON (unaddressed)
            if (sendMode === 'PGP' || sendMode === 'ANON') {
                if (!recipientPGPKey) throw new Error("Recipient PGP Key not found.");
                const armored = await CryptoService.encryptPGPMessage(recipientPGPKey, newMessage);
                if (!armored) throw new Error("PGP Encryption failed.");

                const lauContract = web3.getContract(myLauAddress, LAU_ABI);
                // If ANON, we drop the recipient metadata entirely and purely broadcast the ASCII armor.
                const taggedMsg = sendMode === 'ANON' ? armored : `${tag}\n${armored}`;
                
                const tx = await web3.sendTransaction(lauContract, 'Chat', [taggedMsg]);
                
                // Cache cleartext immediately using the deterministic transaction hash
                localStorage.setItem(`pgp_clear_${tx.hash}`, newMessage);

                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Sending PGP Transmission: ${tx.hash}` });
                await web3.waitForReceipt(tx);
            } 
            // ECDH / ENCRYPT
            else if (sendMode === 'ECDH') {
                if (!recipientECDHKey) throw new Error("Recipient ECDH Key not found.");
                
                if (encryptLibraryAddress) {
                    const sharedSecretBytes = await CryptoService.deriveSharedSecretBytes(mySoulIdStr, recipientECDHKey);
                    const encryptContract = web3.getContract(encryptLibraryAddress, DYSNOMIA_ABIS.ENCRYPT);
                    const utf8Bytes = ethers.toUtf8Bytes(newMessage);
                    
                    const tx = await web3.sendTransaction(encryptContract, 'Encrypt(uint64,uint64,bytes,bytes)', [
                        mySoulIdStr, recipientSoulId, sharedSecretBytes, utf8Bytes
                    ]);
                    await web3.waitForReceipt(tx);
                    
                    const indexNum = await encryptContract["Encrypt(uint64,uint64,bytes,bytes)"].staticCall(
                        mySoulIdStr, recipientSoulId, sharedSecretBytes, utf8Bytes, { from: user.address } 
                    );
                    
                    const lauContract = web3.getContract(myLauAddress, LAU_ABI);
                    const taggedMsg = `${tag}IDX:${indexNum}`;
                    const pingTx = await web3.sendTransaction(lauContract, 'Chat', [taggedMsg]);
                    await web3.waitForReceipt(pingTx);
                } else {
                    const payload = await CryptoService.encryptMessage(mySoulIdStr, recipientECDHKey, newMessage);
                    const lauContract = web3.getContract(myLauAddress, LAU_ABI);
                    const taggedMsg = `${tag}${payload}`;
                    const tx = await web3.sendTransaction(lauContract, 'Chat', [taggedMsg]);
                    await web3.waitForReceipt(tx);
                }
            }

            setNewMessage('');
            const currentBlock = await web3.getProvider().getBlockNumber();
            await fetchChunk(currentBlock - 5, currentBlock);
            await rebuildSegments();
            
        } catch (error: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transmission failed: ${error.message}` });
        } finally {
            setSending(false);
        }
    };


    // MAIN UI
    return (
        <div className="flex flex-col h-full bg-black/90 relative">
            {/* Header */}
            <div className="bg-dys-panel border-b border-dys-border p-3 flex justify-between items-center z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 cursor-pointer relative hover:opacity-80" onClick={() => onViewIdentity(recipientSoulId)}>
                        <SoulSigil soulId={recipientSoulId} />
                    </div>
                    <div>
                        <div className="text-dys-green font-bold flex items-center gap-2 tracking-widest">
                            SECURE LINK 
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">
                            TARGET_SOUL: {recipientSoulId} | {fetchingGap ? `SCANNING ${fetchingGap.end}...` : "IDLE"}
                        </div>
                    </div>
                </div>
                
                <div className="flex gap-4 items-center">
                    <div className="flex flex-col text-right">
                        <div className="text-[9px] text-gray-400 font-mono tracking-widest flex items-center justify-end gap-1">
                            PGP: <span className={recipientPGPKey ? "text-dys-cyan" : "text-dys-red"}>{recipientPGPKey ? 'ACQUIRED' : 'MISSING'}</span>
                        </div>
                        <div className="text-[9px] text-gray-400 font-mono tracking-widest flex items-center justify-end gap-1">
                            ECDH/ENCRYPT: <span className={recipientECDHKey ? "text-dys-cyan" : "text-dys-red"}>{recipientECDHKey ? 'ACQUIRED' : 'MISSING'}</span>
                        </div>
                    </div>
                    {fetchingGap && (
                        <button 
                            onClick={cancelFetch}
                            className="text-[9px] bg-dys-red text-black px-2 py-1 font-bold animate-pulse hover:bg-white"
                        >
                            CANCEL SCAN
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm scrollbar-thin" ref={containerRef}>
                {segments.map((seg, idx) => (
                    <React.Fragment key={`seg-${idx}`}>
                        {seg.type === 'GAP' && (
                            <div className="my-6 border-y border-dashed border-dys-border/50 bg-dys-black/50 p-2 flex flex-col items-center justify-center gap-2">
                                <div className="flex items-center gap-2 text-[10px] text-gray-600 font-mono">
                                    <span>⟪ {seg.start}</span>
                                    <span className="h-px w-10 bg-gray-700"></span>
                                    <span className="text-dys-gold">{seg.end - seg.start} BLOCKS MISSING</span>
                                    <span className="h-px w-10 bg-gray-700"></span>
                                    <span>{seg.end} ⟫</span>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleFillGap(seg.start, seg.end, 'CHUNK')}
                                        disabled={!!fetchingGap}
                                        className="text-[10px] border border-dys-cyan/30 text-dys-cyan px-3 py-1 hover:bg-dys-cyan hover:text-black transition-colors disabled:opacity-30"
                                    >
                                        SCAN CHUNK ({FETCH_CHUNK_SIZE / 1000}K)
                                    </button>
                                    <button 
                                        onClick={() => handleFillGap(seg.start, seg.end, 'FULL')}
                                        disabled={!!fetchingGap}
                                        className="text-[10px] border border-dys-gold/30 text-dys-gold px-3 py-1 hover:bg-dys-gold hover:text-black transition-colors disabled:opacity-30"
                                    >
                                        BRIDGE GAP
                                    </button>
                                </div>
                                {fetchingGap && fetchingGap.start === seg.start && (
                                    <div className="w-full h-1 bg-gray-800 mt-2 overflow-hidden">
                                        <div className="h-full bg-dys-gold animate-progress"></div>
                                    </div>
                                )}
                            </div>
                        )}
                        {seg.type === 'RANGE' && seg.messages.map((msg, mIdx) => {
                            if (hiddenDMs[msg.id]) return null;

                            return (
                                <div key={msg.id} className="flex items-start gap-3 w-full">
                                    <div className="w-6 h-6 flex-shrink-0 cursor-pointer opacity-80 hover:opacity-100" onClick={() => onViewIdentity(msg.sender)}>
                                        <SoulSigil soulId={msg.sender} />
                                    </div>
                                    <div className="flex flex-col max-w-[80%] items-start">
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className={`text-[0.6rem] tracking-wider ${msg.message.includes('PGP MESSAGE') && msg.message.includes('DECRYPTION FAILED') ? 'text-dys-red' : 'text-dys-green'}`}>
                                                [SECURE]
                                            </span>
                                            <span className="text-[0.6rem] text-gray-500 font-mono">BLK:{msg.blockNumber}</span>
                                        </div>
                                        <div className={`px-4 py-3 border break-words text-sm whitespace-pre-wrap leading-relaxed ${
                                            msg.isMe 
                                            ? 'bg-dys-cyan/5 border-dys-cyan/30 text-dys-cyan/90' 
                                            : 'bg-dys-green/5 border-dys-green/30 text-dys-green/90'
                                        }`}>
                                            {msg.message}
                                        </div>
                                        {msg.content.includes('-----BEGIN PGP MESSAGE-----') && msg.message.includes('DECRYPTION FAILED') && (
                                            <div className="flex gap-2 mt-1">
                                                <button 
                                                    className="text-[9px] underline text-gray-500 hover:text-white"
                                                    onClick={async () => {
                                                        const dec = await CryptoService.decryptPGPMessage(mySoulIdStr, msg.content);
                                                        if(dec) msg.message = dec; 
                                                        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: dec ? 'Decrypted successfully' : 'Manual Decryption failed.' });
                                                        setSegments([...segments]); // quick re-render hack
                                                    }}
                                                >
                                                    RETRY DECRYPTION (MANUAL)
                                                </button>
                                                <span className="text-gray-700">|</span>
                                                <button 
                                                    className="text-[9px] underline text-gray-500 hover:text-dys-red"
                                                    onClick={() => hideMessage(msg.id)}
                                                >
                                                    HIDE MESSAGE
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Options row */}
            <div className="px-3 py-1 border-t border-dys-border bg-black flex gap-4 text-[10px] items-center shrink-0">
                <span className="text-gray-500">PROTOCOL:</span>
                <label className={`cursor-pointer ${!recipientPGPKey ? 'opacity-30' : ''}`}>
                    <input type="radio" checked={sendMode === 'PGP'} onChange={() => setSendMode('PGP')} disabled={!recipientPGPKey} className="mr-1" />
                    <span className={sendMode === 'PGP' ? 'text-dys-cyan' : 'text-gray-400'}>PGP (DEFAULT)</span>
                </label>
                <label className={`cursor-pointer ${!recipientECDHKey ? 'opacity-30' : ''}`}>
                    <input type="radio" checked={sendMode === 'ECDH'} onChange={() => setSendMode('ECDH')} disabled={!recipientECDHKey} className="mr-1" />
                    <span className={sendMode === 'ECDH' ? 'text-dys-green' : 'text-gray-400'}>ECDH / ENCRYPT LIB</span>
                </label>
                <div className="flex-1"></div>
                <label className={`cursor-pointer ${!recipientPGPKey ? 'opacity-30' : ''}`}>
                    <input type="radio" checked={sendMode === 'ANON'} onChange={() => setSendMode('ANON')} disabled={!recipientPGPKey} className="mr-1" />
                    <span className={sendMode === 'ANON' ? 'text-dys-gold' : 'text-gray-400'}>ANONYMOUS PGP (METADATA-LESS)</span>
                </label>
            </div>

            {/* Input Area */}
            <div className="p-2 bg-dys-panel border-t border-dys-border shrink-0">
                <form onSubmit={handleSend} className="flex gap-2">
                    <input 
                        type="text" 
                        value={newMessage} 
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={(sendMode === 'PGP' || sendMode === 'ANON') ? "Write secure message (PGP)..." : "Write secure message (ECDH)..."} 
                        disabled={sending || (!hasPGP && !hasECDH)}
                        className="flex-1 bg-black border border-dys-border text-white p-3 font-mono text-sm focus:border-dys-cyan focus:outline-none transition-colors disabled:opacity-50" 
                    />
                    <button 
                        type="submit" 
                        disabled={sending || !newMessage.trim() || (!hasPGP && !hasECDH)}
                        className={`px-6 border transition-all font-mono tracking-widest text-xs font-bold ${
                            sending || !newMessage.trim() 
                            ? 'bg-black border-gray-800 text-gray-800' 
                            : 'bg-dys-cyan/20 border-dys-cyan text-dys-cyan hover:bg-dys-cyan hover:text-black'
                        }`}
                    >
                        {sending ? 'ENCRYPTING...' : 'TRANSMIT'}
                    </button>
                </form>
            </div>
            </div>
            );
            };

            export default SecureChat;
