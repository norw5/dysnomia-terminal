import React, { useState, useEffect, useRef } from 'react';
import { Interface, id as ethId, ethers } from 'ethers';
import { Web3Service } from '../services/web3Service';
import { UserContext, LogEntry, ChatMessage } from '../types';
import { ADDRESSES, LAU_ABI, VOID_ABI, DYSNOMIA_ABIS } from '../constants';
import { Persistence } from '../services/persistenceService';
import { CryptoService } from '../services/cryptoService';
import SoulSigil from './SoulSigil';

interface SecureChatProps {
    web3: Web3Service;
    recipientSoulId: string;
    recipientLauAddress: string;  // LAU address of the recipient (needed for VOID.Log targeting)
    user: UserContext;
    addLog: (log: LogEntry) => void;
    onViewIdentity: (soulId: string) => void;
}

const PUBKEY_PREFIX = '[PUBKEY:';
// DMs are sent as: LAU.Chat("[DM:recipientSoulId]encryptedPayload")
// The VOID prepends "<Username> " to log lines, so stored as: "<Username> [DM:recipientSoulId]encryptedPayload"
const DM_TAG = '[DM:';

/**
 * Extract the encrypted payload from a DM log line targeted at a specific soul.
 * Returns null if the line is not a DM to that soul.
 */
function extractDMPayload(logLine: string, targetSoulId: string): string | null {
    const expected = `${DM_TAG}${targetSoulId}]`;
    const idx = logLine.indexOf(expected);
    if (idx < 0) return null;
    const payload = logLine.substring(idx + expected.length).trim();
    return payload.length > 10 ? payload : null;
}

const SHIO_LOG_ABI = ["event LogEvent(uint64 Soul, uint64 Aura, string LogLine)"];
const SCAN_DEPTH = 100000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * VOID prepends "<Username> " to all log lines.
 * Extract a pubkey from a raw log line containing a PUBKEY broadcast.
 */
function extractPubKey(logLine: string): string | null {
    const idx = logLine.indexOf(PUBKEY_PREFIX);
    if (idx < 0) return null;
    const afterPrefix = logLine.substring(idx);
    const closeBracket = afterPrefix.indexOf(']');
    if (closeBracket <= 0) return null;
    const key = afterPrefix.substring(closeBracket + 1).trim();
    return key.length > 20 ? key : null;
}

/** Scan local VOID cache for the most recent PUBKEY broadcast from a given soul. */
async function findPubKeyInCache(soulId: string): Promise<string | null> {
    try {
        const msgs = await Persistence.getMessages(ADDRESSES.VOID, 10000);
        for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i];
            if (msg.type === soulId) {
                const key = extractPubKey(msg.content);
                if (key) return key;
            }
        }
    } catch (e) {
        console.warn("Cache pubkey scan error:", e);
    }
    return null;
}

/** On-chain fallback: scan recent VOID log events for a PUBKEY broadcast. */
async function findPubKeyOnChain(web3: Web3Service, targetSoulId: string): Promise<string | null> {
    try {
        const provider = web3.getProvider();
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - SCAN_DEPTH);
        const topicHash = ethId("LogEvent(uint64,uint64,string)");
        const iface = new Interface(SHIO_LOG_ABI);

        let bestKey: string | null = null;
        let bestBlock = 0;

        for (let start = fromBlock; start <= currentBlock; start += 10000) {
            const end = Math.min(start + 9999, currentBlock);
            const logs = await provider.getLogs({ topics: [topicHash], fromBlock: start, toBlock: end });
            for (const log of logs) {
                try {
                    const parsed = iface.parseLog(log);
                    if (!parsed) continue;
                    const soul = parsed.args[0].toString();
                    const logLine = parsed.args[2];
                    if (soul === targetSoulId) {
                        const key = extractPubKey(logLine);
                        if (key && log.blockNumber > bestBlock) {
                            bestKey = key;
                            bestBlock = log.blockNumber;
                        }
                    }
                } catch { /* skip unparseable */ }
            }
        }
        return bestKey;
    } catch (e) {
        console.warn("On-chain pubkey scan failed:", e);
        return null;
    }
}

/**
 * Scan recent VOID log events for DMs between two specific souls.
 * Returns both sent (fromSoul→toSoul) and received (toSoul→fromSoul) messages.
 */
async function scanDMsFromVoid(
    web3: Web3Service,
    mySoulId: string,
    recipientSoulId: string,
    fromBlock: number
): Promise<Array<{ blockNumber: number; soul: string; payload: string; isMe: boolean }>> {
    const results: Array<{ blockNumber: number; soul: string; payload: string; isMe: boolean }> = [];
    try {
        const provider = web3.getProvider();
        const currentBlock = await provider.getBlockNumber();
        const topicHash = ethId("LogEvent(uint64,uint64,string)");
        const iface = new Interface(SHIO_LOG_ABI);

        for (let start = fromBlock; start <= currentBlock; start += 10000) {
            const end = Math.min(start + 9999, currentBlock);
            const logs = await provider.getLogs({ topics: [topicHash], fromBlock: start, toBlock: end });
            for (const log of logs) {
                try {
                    const parsed = iface.parseLog(log);
                    if (!parsed) continue;
                    const soul = parsed.args[0].toString();
                    const logLine = parsed.args[2];

                    // Messages I sent (my soul, tagged with recipient)
                    if (soul === mySoulId) {
                        const payload = extractDMPayload(logLine, recipientSoulId);
                        if (payload) results.push({ blockNumber: log.blockNumber, soul, payload, isMe: true });
                    }
                    // Messages they sent to me (their soul, tagged with my soul)
                    else if (soul === recipientSoulId) {
                        const payload = extractDMPayload(logLine, mySoulId);
                        if (payload) results.push({ blockNumber: log.blockNumber, soul, payload, isMe: false });
                    }
                } catch { /* skip */ }
            }
        }
    } catch (e) {
        console.warn("DM scan error:", e);
    }
    return results;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SecureChat({ web3, recipientSoulId, recipientLauAddress, user, addLog, onViewIdentity }: SecureChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [initializingKey, setInitializingKey] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [recipientPubKey, setRecipientPubKey] = useState<string | null>(null);
    const [pubKeyLoading, setPubKeyLoading] = useState(true);
    const [pubKeyStatus, setPubKeyStatus] = useState('Checking local cache...');
    const [encryptLibraryAddress, setEncryptLibraryAddress] = useState<string | null>(null);
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const mySoulIdStr = user.saat?.soul || "";
    const myLauAddress = user.lauAddress || "";

    // ── Key check ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (mySoulIdStr) setHasKey(CryptoService.hasPrivateKey(mySoulIdStr));
    }, [mySoulIdStr]);

    // ── Recipient pubkey: cache → on-chain ───────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setPubKeyLoading(true);
        setRecipientPubKey(null);
        setPubKeyStatus('Checking local cache...');

        const fetchKey = async () => {
            if (!recipientSoulId || !web3) { setPubKeyLoading(false); return; }

            const cached = await findPubKeyInCache(recipientSoulId);
            if (cached) {
                if (!cancelled) { setRecipientPubKey(cached); setPubKeyLoading(false); setPubKeyStatus('Key found in cache'); }
                return;
            }

            if (!cancelled) setPubKeyStatus('Not in cache — scanning network...');
            const onChain = await findPubKeyOnChain(web3, recipientSoulId);
            if (!cancelled) {
                setRecipientPubKey(onChain);
                setPubKeyLoading(false);
                setPubKeyStatus(onChain ? 'Key found on-chain' : 'No key found');
            }

            // Also check if the ENCRYPT library is deployed
            try {
                const voidContract = web3.getContract(ADDRESSES.VOID, VOID_ABI);
                const encAddr = await voidContract.GetLibraryAddress("encrypt");
                if (encAddr && encAddr !== "0x0000000000000000000000000000000000000000" && !cancelled) {
                    setEncryptLibraryAddress(encAddr);
                }
            } catch (e) {
                console.warn("Could not check ENCRYPT library status", e);
            }
        };
        fetchKey();
        return () => { cancelled = true; };
    }, [recipientSoulId, web3]);

    // ── Poll DMs from both LAU addresses ─────────────────────────────────────
    useEffect(() => {
        let isMounted = true;
        let pTimeout: NodeJS.Timeout;

        const pollMessages = async () => {
            if (!web3 || !mySoulIdStr || !recipientSoulId || !hasKey || !recipientPubKey || !myLauAddress || !recipientLauAddress) return;

            try {
                const fromBlock = Math.max(0, await web3.getProvider().getBlockNumber() - SCAN_DEPTH);
                const rawMessages = await scanDMsFromVoid(web3, mySoulIdStr, recipientSoulId, fromBlock);

                const decryptedMessages: ChatMessage[] = [];
                for (const raw of rawMessages) {
                    let decrypted = '[UNABLE TO DECRYPT]';

                    // Check if it's an ENCRYPT library notification marker: "IDX:123"
                    if (raw.payload.startsWith('IDX:') && encryptLibraryAddress) {
                        try {
                            const indexStr = raw.payload.substring(4);
                            const indexNum = parseInt(indexStr);
                            const encryptContract = web3.getContract(encryptLibraryAddress, DYSNOMIA_ABIS.ENCRYPT);

                            // The shared secret is used as the symmetric stream-cipher key "password" in ENCRYPT
                            const sharedSecretBytes = await CryptoService.deriveSharedSecretBytes(mySoulIdStr, recipientPubKey);
                            
                            // For messages I sent: Crypt runs From->To
                            // For messages they sent: Crypt runs To->From (where 'To' is me)
                            const senderSoulId = raw.isMe ? mySoulIdStr : raw.soul;
                            const targetSoulId = raw.isMe ? recipientSoulId : mySoulIdStr;
                            
                            // ENCRYPT.Decrypt(uint64 From, uint64 to, uint64 Index, bytes memory Key)
                            const decryptedHex = await encryptContract["Decrypt(uint64,uint64,uint64,bytes)"](
                                senderSoulId, targetSoulId, indexNum, sharedSecretBytes
                            );
                            
                            // Convert hex result to string
                            const utf8Str = new TextDecoder().decode(ethers.getBytes(decryptedHex));
                            decrypted = utf8Str;
                        } catch (e) {
                            console.warn("Failed to decrypt ENCRYPT payload at index:", raw.payload.substring(4), e);
                        }
                    } else {
                        // Standard local decryption fallback (full ciphertext broadcast)
                        const dec = await CryptoService.decryptMessage(mySoulIdStr, recipientPubKey, raw.payload);
                        if (dec) decrypted = dec;
                    }

                    decryptedMessages.push({
                        id: `dm-${raw.blockNumber}-${raw.soul}-${raw.isMe}-${raw.payload.substring(0, 10)}`,
                        sender: raw.soul,
                        type: raw.soul,
                        content: raw.payload,
                        message: decrypted,
                        timestamp: raw.blockNumber,
                        blockNumber: raw.blockNumber,
                        isMe: raw.isMe,
                    });
                }

                if (isMounted) {
                    decryptedMessages.sort((a, b) => a.blockNumber - b.blockNumber);
                    setMessages(decryptedMessages);
                    setIsLoadingMessages(false);
                }
            } catch (e) {
                console.error("DM poll error:", e);
                if (isMounted) setIsLoadingMessages(false);
            }

            if (isMounted) pTimeout = setTimeout(pollMessages, 15000);
        };

        if (hasKey && recipientPubKey) pollMessages();

        return () => {
            isMounted = false;
            clearTimeout(pTimeout);
        };
    }, [web3, mySoulIdStr, recipientSoulId, hasKey, recipientPubKey]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Key initialization ────────────────────────────────────────────────────
    const handleInitializeKey = async () => {
        if (!web3 || !mySoulIdStr || !myLauAddress) return;
        setInitializingKey(true);
        try {
            const pubKeyBase64 = await CryptoService.generateKeyPair(mySoulIdStr);
            const lauContract = web3.getContract(myLauAddress, LAU_ABI);
            const broadcastMsg = `${PUBKEY_PREFIX}${mySoulIdStr}]${pubKeyBase64}`;
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Broadcasting PubKey via VOID...` });
            const tx = await web3.sendTransaction(lauContract, 'Chat', [broadcastMsg]);
            await web3.waitForReceipt(tx);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `PubKey Registered` });
            setHasKey(true);
        } catch (error: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Key Gen failed: ${error.message}` });
        } finally {
            setInitializingKey(false);
        }
    };

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || sending || !web3 || !recipientPubKey || !mySoulIdStr || !myLauAddress || !recipientLauAddress) return;
        setSending(true);
        try {
            // ENCRYPT Library Path (Preferred - keeps ciphertext out of VOID feed)
            if (encryptLibraryAddress) {
                // We use our shared secret directly as the encryption key for ENCRYPT streams
                const sharedSecretBytes = await CryptoService.deriveSharedSecretBytes(mySoulIdStr, recipientPubKey);
                const encryptContract = web3.getContract(encryptLibraryAddress, DYSNOMIA_ABIS.ENCRYPT);
                
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Encrypting payload on-chain...` });
                
                // Call ENCRYPT.Encrypt(uint64 From, uint64 to, bytes Key, bytes Data)
                const utf8Bytes = ethers.toUtf8Bytes(newMessage);
                const tx = await web3.sendTransaction(encryptContract, 'Encrypt(uint64,uint64,bytes,bytes)', [
                    mySoulIdStr, recipientSoulId, sharedSecretBytes, utf8Bytes
                ]);
                const receipt = await web3.waitForReceipt(tx);
                
                // We need the returned index to notify the recipient. 
                // Since there is no event, we must parse the return value or simulate it
                // Ethers doesn't give returns from mutating txs easily without events, but we can static call first
                const indexNum = await encryptContract["Encrypt(uint64,uint64,bytes,bytes)"].staticCall(
                    mySoulIdStr, recipientSoulId, sharedSecretBytes, utf8Bytes, 
                    { from: user.address } // Need to simulate from the owner's address
                );
                
                // Broadcast notification marker via LAU
                const lauContract = web3.getContract(myLauAddress, LAU_ABI);
                const taggedMsg = `[DM:${recipientSoulId}]IDX:${indexNum}`;
                const pingTx = await web3.sendTransaction(lauContract, 'Chat', [taggedMsg]);
                await web3.waitForReceipt(pingTx);
                
            } else {
                // Fallback Path (Local Encryption + Broadcast)
                const payload = await CryptoService.encryptMessage(mySoulIdStr, recipientPubKey, newMessage);
                if (!payload) throw new Error("Encryption failed");

                // Send via LAU.Chat — DM is tagged with recipient's soul ID so they can find it
                const lauContract = web3.getContract(myLauAddress, LAU_ABI);
                const taggedMsg = `[DM:${recipientSoulId}]${payload}`;
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Sending Encrypted Transmission...` });
                const tx = await web3.sendTransaction(lauContract, 'Chat', [taggedMsg]);
                await web3.waitForReceipt(tx);
            }
            
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Transmission Sent` });
            setNewMessage('');
        } catch (error: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transmission failed: ${error.message}` });
        } finally {
            setSending(false);
        }
    };

    // ─────────────────────────────────────────────────────── RENDER ──────────

    if (!hasKey) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-black/90">
                <div className="text-dys-cyan font-bold mb-4">CRITICAL ALERT: SECURE COMMS NOT INITIALIZED</div>
                <p className="text-gray-400 text-xs mb-8 max-w-md">
                    Generate a cryptographic key pair and broadcast your public key to the network to enable encrypted DMs.
                </p>
                <div className="flex flex-col gap-3">
                    <button onClick={handleInitializeKey} disabled={initializingKey}
                        className="bg-dys-cyan/20 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black font-bold py-3 px-8 transition-colors disabled:opacity-50 flex items-center gap-2 justify-center">
                        {initializingKey ? <span className="animate-spin">⟳</span> : "🔑"}
                        {initializingKey ? "GENERATING & REGISTERING KEYS..." : "INITIALIZE SECURE COMMS"}
                    </button>
                    {CryptoService.hasPrivateKey(mySoulIdStr) && (
                        <button onClick={() => { localStorage.removeItem(`dys_priv_key_${mySoulIdStr}`); setHasKey(false); }}
                            disabled={initializingKey}
                            className="bg-dys-red/10 text-dys-red border border-dys-red/50 hover:bg-dys-red hover:text-black font-bold py-2 px-8 transition-colors text-xs">
                            RESET LOCAL KEYS (START OVER)
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (pubKeyLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-black/90">
                <div className="text-dys-cyan font-bold mb-4 animate-pulse">SCANNING FOR TARGET KEY...</div>
                <p className="text-gray-400 text-xs max-w-md mb-2">Searching for the recipient's public key broadcast.</p>
                <p className="text-dys-cyan/60 text-[10px] font-mono">{pubKeyStatus}</p>
            </div>
        );
    }

    if (!recipientPubKey) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-black/90">
                <div className="text-dys-red font-bold mb-4">ERROR: TARGET UNREACHABLE</div>
                <p className="text-gray-400 text-xs mb-4 max-w-md">
                    No public key found for target ({recipientSoulId}) in the last {SCAN_DEPTH.toLocaleString()} blocks.
                </p>
                <p className="text-gray-500 text-[10px] max-w-md">The target may not have initialized secure comms yet.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-black/90" style={{ backgroundImage: `radial-gradient(circle at center, rgba(30,30,40,0.5) 0%, transparent 70%)` }}>
            {/* Header */}
            <div className="bg-dys-panel border-b border-dys-border p-3 flex justify-between items-center z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 cursor-pointer relative" onClick={() => onViewIdentity(recipientSoulId)}>
                        <SoulSigil soulId={recipientSoulId} />
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-dys-green border-2 border-black rounded-full shadow-[0_0_5px_rgba(0,255,128,0.5)]"></div>
                    </div>
                    <div>
                        <div className="text-dys-green font-bold flex items-center gap-2">
                            SECURE LINK <span className="text-[10px] bg-dys-green/20 text-dys-green px-1 border border-dys-green/50">E2EE</span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">TARGET_SOUL: {recipientSoulId}</div>
                    </div>
                </div>
                
                {/* Encryption Info Panel */}
                <div className="text-right flex flex-col items-end justify-center">
                    <div className="text-[9px] text-gray-400 font-mono tracking-widest whitespace-nowrap">
                        CIPHER: <span className="text-dys-cyan">{encryptLibraryAddress ? "DYSNOMIA_NATIVE_ENCRYPT" : "CLIENT_SIDE_AES_GCM"}</span>
                    </div>
                    <div className="text-[9px] text-gray-400 font-mono tracking-widest whitespace-nowrap">
                        KEY_EXCHANGE: <span className="text-dys-cyan">ECDH_P256</span>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm scrollbar-thin">
                {isLoadingMessages ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-dys-green/60">
                        <span className="text-4xl animate-spin">⟳</span>
                        <span className="text-[10px] tracking-widest">DECRYPTING SECURE CHANNEL...</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full opacity-30 text-[10px]">NO SECURE TRANSMISSIONS FOUND</div>
                ) : (
                    messages.map((msg, index) => (
                        <div key={msg.id || index} className={`flex items-start gap-3 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                            <div className="w-6 h-6 flex-shrink-0 cursor-pointer opacity-80 hover:opacity-100" onClick={() => onViewIdentity(msg.type)}>
                                <SoulSigil soulId={msg.type} />
                            </div>
                            <div className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                                <div className="flex items-baseline gap-2 mb-1">
                                    <span className="text-[0.6rem] text-dys-green tracking-wider">[SECURE]</span>
                                    <span className="text-[0.6rem] text-gray-600">BLK:{msg.blockNumber}</span>
                                </div>
                                <div className={`px-3 py-2 border break-words max-w-[80%] ${msg.isMe ? 'bg-dys-cyan/10 border-dys-cyan/30 text-dys-cyan' : 'bg-dys-green/10 border-dys-green/30 text-dys-green'}`}>
                                    {msg.message}
                                </div>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-dys-panel border-t border-dys-border">
                <form onSubmit={handleSendMessage} className="flex gap-2 relative">
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Encrypt message..." disabled={sending}
                        className="flex-1 bg-black border border-dys-green/30 text-dys-green p-3 font-mono text-sm focus:border-dys-green focus:outline-none transition-colors disabled:opacity-50 placeholder:text-dys-green/30" />
                    <button type="submit" disabled={sending || !newMessage.trim()}
                        className={`w-12 border transition-all flex items-center justify-center ${sending || !newMessage.trim() ? 'bg-black border-gray-800 text-gray-800' : 'bg-dys-green/20 border-dys-green text-dys-green hover:bg-dys-green hover:text-black cursor-pointer'}`}>
                        {sending ? <span className="animate-spin">⟳</span> : '↑'}
                    </button>
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-dys-green pointer-events-none"></div>
                    <div className="absolute bottom-0 right-14 w-2 h-2 border-b border-r border-dys-green pointer-events-none"></div>
                </form>
            </div>
        </div>
    );
}
