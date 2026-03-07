
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Interface, id } from 'ethers';
import { Web3Service } from '../services/web3Service';
import { ChatMessage, LogEntry } from '../types';
import { VOID_ABI, LAU_ABI, QING_ABI, ADDRESSES, MAP_ABI } from '../constants';
import { Persistence } from '../services/persistenceService';

interface VoidChatProps {
  web3: Web3Service;
  viewAddress: string; 
  lauArea: string | null; 
  lauAddress: string | null;
  addLog: (entry: LogEntry) => void;
  refreshTrigger?: number; 
  requestedGap?: { start: number, end: number } | null;
  onGapRequestHandled?: () => void;
  onChunkLoaded?: () => void;
  onViewIdentity?: (soulId: string) => void;
}

// ABI for Shio LogEvent (Used by Void and System Contracts)
// Note: Events in Shio might not be indexed, so we use a broad signature matching
const SHIO_LOG_ABI = ["event LogEvent(uint64 Soul, uint64 Aura, string LogLine)"];
const QING_LOG_ABI = ["event LogEvent(string Username, uint64 Soul, uint64 Aura, string LogLine)"];

const POLL_INTERVAL = 10000; 
const GENESIS_BLOCK = 22813947; 
const INITIAL_SCAN_DEPTH = 50000; 
const FETCH_CHUNK_SIZE = 50000; // Increased chunk size to 50k per user request

interface ChatSegment {
    type: 'RANGE' | 'GAP';
    start: number;
    end: number;
    messages: ChatMessage[];
}

// --- IDENTITY VISUALIZATION HELPERS ---

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

// --- MAIN COMPONENT ---

const VoidChat: React.FC<VoidChatProps> = ({ web3, viewAddress, lauArea, lauAddress, addLog, refreshTrigger, requestedGap, onGapRequestHandled, onChunkLoaded, onViewIdentity }) => {
  const [segments, setSegments] = useState<ChatSegment[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingGap, setFetchingGap] = useState<{start: number, end: number} | null>(null);
  const [channelName, setChannelName] = useState('LOADING...');
  const [hideEvents, setHideEvents] = useState(true); // Default to Hidden
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const wasAtBottomRef = useRef<boolean>(true); 
  const initialLoadRef = useRef<boolean>(true);

  const currentPhysArea = lauArea || ADDRESSES.VOID;
  const inSync = viewAddress.toLowerCase() === currentPhysArea.toLowerCase();
  const isVoid = viewAddress.toLowerCase() === ADDRESSES.VOID.toLowerCase();

  const getLogConfig = useCallback(() => {
    // Determine source contract and ABI
    // const logSourceAddress = isVoid ? ADDRESSES.CHATLOG_SHIO : viewAddress; // This line was wrong, we shouldn't be using the CHATLOG_SHIO address
    const logSourceAddress = isVoid ? undefined : viewAddress;
    const logEventAbi = isVoid ? SHIO_LOG_ABI : QING_LOG_ABI;
    const logInterface = new Interface(logEventAbi);
    
    // Topic signatures differ between Void (Shio) and Qing (Venue)
    const topicSignature = isVoid 
            ? "LogEvent(uint64,uint64,string)"
            : "LogEvent(string,uint64,uint64,string)";
            
    return { logSourceAddress, logInterface, topicHash: id(topicSignature) };
  }, [isVoid, viewAddress]);

  const isEventMessage = (msg: ChatMessage) => {
      const content = msg.content.trim();
      
      // Known System/Operational Log Patterns
      const operationalPatterns = [
          /^added to/i,
          /^withdraw of/i,
          /^username set to/i,
          /^left play/i,
          /^cone installed/i,
          /^entered/i,
          /^left/i,
          /^joined/i,
          /^minted/i,
          /^burned/i,
          /^react\(/i,
          /^alpha\(/i,
          /^beta\(/i,
          /^set cover charge/i,
          /^set admittance/i
      ];

      if (content.startsWith('{') || content.includes('"type":') || content.startsWith('Type:')) return true;
      
      return operationalPatterns.some(regex => regex.test(content));
  };

  const rebuildSegments = async () => {
      if (containerRef.current) {
          const { scrollHeight, scrollTop, clientHeight } = containerRef.current;
          prevScrollHeightRef.current = scrollHeight;
          prevScrollTopRef.current = scrollTop;
          
          const isScrollable = scrollHeight > clientHeight + 10;
          if (!isScrollable) {
              wasAtBottomRef.current = true;
          } else {
              const dist = scrollHeight - scrollTop - clientHeight;
              wasAtBottomRef.current = dist < 50;
          }
      } else {
          wasAtBottomRef.current = true;
      }

      const savedMsgs = await Persistence.getMessages(viewAddress, 10000); 
      const meta = await Persistence.getChannelMeta(viewAddress);
      
      const ranges = meta?.scannedRanges || [];
      ranges.sort((a, b) => a.start - b.start);

      const newSegments: ChatSegment[] = [];
      let lastEnd = GENESIS_BLOCK;
      
      for (const range of ranges) {
          if (range.start > lastEnd + 1) {
              newSegments.push({
                  type: 'GAP',
                  start: lastEnd,
                  end: range.start - 1,
                  messages: []
              });
          }

          const rangeMsgs = savedMsgs.filter(m => m.blockNumber >= range.start && m.blockNumber <= range.end);
          rangeMsgs.sort((a,b) => a.blockNumber - b.blockNumber);
          
          newSegments.push({
              type: 'RANGE',
              start: range.start,
              end: range.end,
              messages: rangeMsgs
          });

          lastEnd = range.end + 1;
      }

      const currentBlock = await web3.getProvider().getBlockNumber();
      if (lastEnd < currentBlock) {
           if (currentBlock - lastEnd > 100) { 
               newSegments.push({
                   type: 'GAP',
                   start: lastEnd,
                   end: currentBlock,
                   messages: []
               });
           }
      }
      
      if (ranges.length === 0) {
          newSegments.push({
              type: 'GAP',
              start: GENESIS_BLOCK,
              end: currentBlock,
              messages: []
          });
      }

      setSegments(newSegments);
      if (onChunkLoaded) onChunkLoaded();
  };

  useLayoutEffect(() => {
      if (!containerRef.current) return;
      const container = containerRef.current;

      if (initialLoadRef.current && segments.length > 0) {
          const savedScroll = sessionStorage.getItem(`scroll_${viewAddress}`);
          if (savedScroll) {
              container.scrollTop = parseInt(savedScroll);
          } else {
              container.scrollTop = container.scrollHeight;
          }
          initialLoadRef.current = false;
          return;
      }

      if (wasAtBottomRef.current) {
          container.scrollTop = container.scrollHeight;
      } else {
          const heightDiff = container.scrollHeight - prevScrollHeightRef.current;
          if (heightDiff > 0 && prevScrollTopRef.current < 100) {
               container.scrollTop = prevScrollTopRef.current + heightDiff;
          }
      }
  }, [segments, viewAddress]);

  const handleScroll = () => {
      if (!containerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      sessionStorage.setItem(`scroll_${viewAddress}`, scrollTop.toString());
      
      const dist = scrollHeight - scrollTop - clientHeight;
      const isNearBottom = dist < 50;
      if (isNearBottom) wasAtBottomRef.current = true;
      else wasAtBottomRef.current = false;
  };

  useEffect(() => {
    if (!web3 || !viewAddress) return;
    initialLoadRef.current = true; 
    setSegments([]); 
    wasAtBottomRef.current = true; 

    const init = async () => {
        await rebuildSegments();

        if (isVoid) {
            setChannelName("THE VOID (GLOBAL)");
        } else {
            try {
                const contract = web3.getContract(viewAddress, QING_ABI);
                const name = await contract.name();
                setChannelName(`SECTOR: ${name}`);
            } catch(e) { 
                setChannelName(`SECTOR: ${viewAddress.substring(0,8)}`); 
            }
        }

        const currentBlock = await web3.getProvider().getBlockNumber();
        const startTarget = Math.max(GENESIS_BLOCK, currentBlock - INITIAL_SCAN_DEPTH);
        const meta = await Persistence.getChannelMeta(viewAddress);
        const ranges = meta?.scannedRanges || [];

        const hasRecentHistory = ranges.some(r => r.end >= currentBlock - 100 && r.start <= startTarget + 500);

        if (!hasRecentHistory) {
             await performSmartInitScan(startTarget, currentBlock, ranges);
        }
    };
    init();
  }, [web3, viewAddress, isVoid]); 

  useEffect(() => {
      if (refreshTrigger) {
          wasAtBottomRef.current = true;
          rebuildSegments();
      }
  }, [refreshTrigger]);

  const performSmartInitScan = async (targetStart: number, currentBlock: number, existingRanges: any[]) => {
      let cursor = currentBlock;
      while (cursor > targetStart) {
          const hitRange = existingRanges.find(r => cursor >= r.start && cursor <= r.end);
          if (hitRange) {
              cursor = hitRange.start - 1; 
              break; 
          }
          const chunkStart = Math.max(targetStart, cursor - 10000); 
          await fetchChunk(chunkStart, cursor);
          await rebuildSegments();
          cursor = chunkStart - 1;
          await new Promise(r => setTimeout(r, 50)); 
      }
  };

  useEffect(() => {
      if (requestedGap && !fetchingGap) {
          handleFillGap(requestedGap.start, requestedGap.end, 'FULL');
          if (onGapRequestHandled) onGapRequestHandled();
      }
  }, [requestedGap]);

  const fetchChunk = async (fromBlock: number, toBlock: number, signal?: AbortSignal) => {
      if (fromBlock > toBlock) return;
      const { logSourceAddress, logInterface, topicHash } = getLogConfig();
      const provider = web3.getProvider();

      try {
        const filter = {
            address: logSourceAddress, 
            topics: [topicHash],
            fromBlock: fromBlock,
            toBlock: toBlock
        };

        const logs = await provider.getLogs(filter);
        if (signal?.aborted) throw new Error("Aborted");

        const newMsgs = logs.map((log: any): ChatMessage | null => {
           try {
               const parsed = logInterface.parseLog(log);
               if(!parsed) return null;
               
               let soulId, content, username;
               if (isVoid) {
                   // VOID LOG FORMAT: (uint64 Soul, uint64 Aura, string LogLine)
                   // Not indexed, so they are in args
                   soulId = parsed.args[0].toString();
                   // Defensive check for LogLine index
                   content = parsed.args.length > 2 ? parsed.args[2] : "DATA_ERROR";
                   username = `Soul #${soulId}`;
               } else {
                   // QING LOG FORMAT: (string Username, uint64 Soul, uint64 Aura, string LogLine)
                   username = parsed.args[0];
                   soulId = parsed.args[1].toString();
                   content = parsed.args[3];
               }

               return {
                id: `${log.transactionHash}-${log.index}`,
                sender: soulId, 
                username: username,
                content: content, 
                timestamp: Date.now(), 
                blockNumber: log.blockNumber,
                isMe: false 
              };
           } catch(e) { 
               console.warn("Log Parse Error", e);
               return null; 
           }
        }).filter((m): m is ChatMessage => m !== null);

        if (newMsgs.length > 0) {
            await Persistence.saveMessages(newMsgs, viewAddress);
        }
        await Persistence.updateScannedRange(viewAddress, fromBlock, toBlock);

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

  // Live poll
  useEffect(() => {
      if(!web3 || !viewAddress) return;

      const poll = async () => {
          const currentBlock = await web3.getProvider().getBlockNumber();
          const meta = await Persistence.getChannelMeta(viewAddress);
          
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

  const handleSend = async () => {
    if (!inputText.trim()) return;
    if (!lauAddress) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Pilot Identity Required.` });
        return;
    }
    
    // SAFETY CHECK: Ensure we are in write-mode (connected wallet)
    if (!web3.hasSigner()) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transmission Failed: Wallet Connection Required (Read-Only Mode Active).` });
        return;
    }

    setIsLoading(true);

    try {
      let tx;
      if (isVoid) {
          const lauContract = web3.getContract(lauAddress, LAU_ABI); 
          tx = await web3.sendTransaction(lauContract, 'Chat', [inputText]);
      } else {
          const qingContract = web3.getContract(viewAddress, QING_ABI);
          tx = await web3.sendTransaction(qingContract, 'Chat', [lauAddress, inputText]);
      }

      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Signal Broadcasted: ${tx.hash}` });
      setInputText('');
      await web3.waitForReceipt(tx);
      
      const currentBlock = await web3.getProvider().getBlockNumber();
      wasAtBottomRef.current = true; // Force scroll on send
      await fetchChunk(currentBlock - 5, currentBlock);
      await rebuildSegments();

    } catch (err: any) {
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: 'Transmission Failed', details: web3.parseError(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const copyHash = (id: string) => {
      const hash = id.split('-')[0];
      navigator.clipboard.writeText(hash);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `TX Hash Copied.` });
  };

  return (
    <div className="flex flex-col h-full bg-black/50 border-t border-dys-border relative overflow-hidden">
      
      {/* Header */}
      <div className="p-2 border-b border-dys-border bg-dys-panel/50 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${inSync ? 'bg-dys-green animate-pulse' : 'bg-dys-gold'}`}></div>
              <div>
                  <h3 className="text-dys-cyan font-bold tracking-widest text-[10px] uppercase">
                      COMMS_LINK // {channelName}
                  </h3>
                  <div className="text-[9px] text-gray-500 font-mono">
                      STATUS: {inSync ? "LOCAL_UPLINK" : "REMOTE_RELAY"} | {fetchingGap ? `SCANNING ${fetchingGap.end}...` : "IDLE"}
                  </div>
              </div>
          </div>
          <div className="flex gap-2">
              <button 
                onClick={() => setHideEvents(!hideEvents)}
                className={`text-[9px] border px-2 py-1 font-bold transition-colors ${!hideEvents ? 'bg-white text-black border-white' : 'text-gray-500 border-gray-700 hover:text-white'}`}
              >
                  {hideEvents ? 'SHOW EVENTS' : 'HIDE EVENTS'}
              </button>
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
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-6 z-10 scrollbar-thin relative" 
        ref={containerRef}
        onScroll={handleScroll}
      >
        
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
                                SCAN CHUNK ({FETCH_CHUNK_SIZE}K)
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

                {seg.type === 'RANGE' && seg.messages.map((msg) => {
                    if (hideEvents && isEventMessage(msg)) return null;

                    const soulId = msg.sender.replace("SOUL:", "");
                    const displayName = msg.username || "Soul";
                    const { primary } = getSoulTheme(soulId);
                    
                    return (
                        <div key={msg.id} className={`flex gap-3 max-w-[95%] items-start ${msg.isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                            {/* AVATAR COLUMN */}
                            <button 
                                onClick={() => onViewIdentity && onViewIdentity(soulId)}
                                className="shrink-0 pt-1 hover:opacity-80 transition-opacity cursor-pointer"
                                title="View Identity"
                            >
                                <SoulSigil soulId={soulId} size={36} />
                            </button>

                            {/* CONTENT COLUMN */}
                            <div className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                                <div className="flex items-baseline gap-2 mb-0.5">
                                    <span 
                                        className="font-bold text-xs tracking-wide" 
                                        style={{ color: primary, textShadow: `0 0 10px ${primary}40` }}
                                    >
                                        {displayName}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-700 font-mono text-[10px]">
                                            [{msg.blockNumber}]
                                        </span>
                                        <button 
                                            onClick={() => copyHash(msg.id)}
                                            className="text-[9px] text-gray-800 hover:text-dys-cyan transition-colors"
                                            title="Copy TX Hash"
                                        >
                                            #TX
                                        </button>
                                    </div>
                                </div>
                                <div className={`px-4 py-2 border border-dys-border ${msg.isMe ? 'bg-dys-green/5 border-dys-green/30' : 'bg-dys-panel/80'}`}>
                                    <p className="font-mono text-sm whitespace-pre-wrap leading-relaxed text-gray-200 break-words max-w-[600px]">
                                        {msg.content}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}

            </React.Fragment>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 bg-dys-panel border-t border-dys-border z-10 shrink-0">
        {!lauAddress ? (
            <div className="text-dys-red font-mono text-center text-[10px] p-2">
                [ERROR] NO IDENTITY DETECTED
            </div>
        ) : (
            <div className="flex gap-0 border border-dys-border bg-black">
                <span className={`px-3 py-2 font-mono text-xs flex items-center border-r border-dys-border ${inSync ? 'text-dys-green' : 'text-dys-gold'}`}>
                    {inSync ? 'LOC:' : 'RMT:'}
                </span>
                
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={inSync ? "Broadcast message..." : "Transmit remote signal..."}
                    disabled={isLoading}
                    className="flex-1 bg-black text-white px-3 py-2 font-mono text-sm focus:outline-none disabled:opacity-50"
                />

                <button
                    onClick={handleSend}
                    disabled={isLoading || !inputText.trim()}
                    className="bg-dys-green/10 text-dys-green hover:bg-dys-green hover:text-black font-bold px-4 py-2 transition-colors disabled:opacity-50 font-mono text-[10px] tracking-wider"
                >
                    {isLoading ? '...' : 'SEND'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default VoidChat;
