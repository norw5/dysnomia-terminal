
import React, { useState, useEffect, useRef } from 'react';
import { formatUnits, ZeroAddress } from 'ethers';
import { Web3Service } from './services/web3Service';
import { AppView, LogEntry, UserContext, ContractInteractionRequest } from './types';
import { ADDRESSES, DEFAULT_RPC_URL, GEMINI_MODELS, MAP_ABI, QING_ABI, CHO_ABI, CHAN_ABI, LAU_ABI } from './constants';
import { Persistence, SectorData } from './services/persistenceService';

// Components
import TerminalLog from './components/TerminalLog';
import NavAI from './components/NavAI';
import ContractStudio from './components/ContractStudio';
import Dashboard from './components/Dashboard'; 
import OperationsDeck from './components/OperationsDeck';
import QingMap from './components/QingMap';
import VoidChat from './components/VoidChat';
import LauRegistry from './components/LauRegistry';
import CommsDeck from './components/CommsDeck';
import DataDeck from './components/DataDeck';
import MarketDeck from './components/MarketDeck'; 

enum System {
    DYSNOMIA = 'DYSNOMIA',
    ATROPA = 'ATROPA',
    BREZ = 'BREZ'
}

const GENESIS_BLOCK = 22813947;
const CHUNK_SIZE = 50000;

const App: React.FC = () => {
  const [activeSystem, setActiveSystem] = useState<System>(System.DYSNOMIA);
  const [view, setView] = useState<AppView>(AppView.COMMAND_DECK);
  const [web3, setWeb3] = useState<Web3Service | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showNavAI, setShowNavAI] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash-preview-09-2025');
  const [activeRpc, setActiveRpc] = useState<string>(DEFAULT_RPC_URL);
  const [registrySearch, setRegistrySearch] = useState('');
  const [pendingInteraction, setPendingInteraction] = useState<ContractInteractionRequest | null>(null);

  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [gasPrice, setGasPrice] = useState<string>('0');
  const [bootTime] = useState(new Date().toLocaleTimeString());
  
  const [isMapScanning, setIsMapScanning] = useState(false);
  const [mapScanProgress, setMapScanProgress] = useState('IDLE');
  const [mapLastUpdate, setMapLastUpdate] = useState(0);
  const mapAbortController = useRef<AbortController | null>(null);

  const [user, setUser] = useState<UserContext>({
    address: null,
    isConnected: false,
    providerType: 'READ_ONLY',
    balance: '0',
    lauAddress: null,
    username: null,
    currentArea: null,
    yue: null,
    qings: [],
    saat: undefined,
    mapSync: {
        isScanning: false,
        progress: 'IDLE',
        lastUpdate: 0,
        triggerSync: () => {},
        stopSync: () => {}
    }
  });

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addLog = (entry: LogEntry) => {
    const safeEntry = { ...entry, id: entry.id || generateId() };
    setLogs(prev => [...prev, safeEntry].slice(-100)); 
  };

  const scanIdentity = async (forceAddress?: string) => {
      const targetAddress = forceAddress || user.address;
      if(!web3 || !targetAddress) return;
      
      try {
          const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
          const chan = web3.getContract(ADDRESSES.CHAN, CHAN_ABI);
          
          let lauAddr = ZeroAddress;
          let yueAddr = ZeroAddress;

          try {
              lauAddr = await cho.GetUserTokenAddress(targetAddress);
          } catch (e) {
              console.warn("Failed to fetch LAU:", e);
          }

          try {
              yueAddr = await chan.Yan(targetAddress);
          } catch (e) {
              console.warn("Failed to fetch YUE:", e);
          }

          let updates: Partial<UserContext> = {};

          if(lauAddr && lauAddr !== ZeroAddress) {
              updates.lauAddress = lauAddr;
              if (user.lauAddress !== lauAddr) {
                  addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Identity Restored: ${lauAddr}` });
              }
              
              try {
                  const lau = web3.getContract(lauAddr, LAU_ABI);
                  const pole = await lau.Saat(0);
                  const soul = await lau.Saat(1);
                  const aura = await lau.Saat(2);
                  updates.saat = {
                      pole: pole.toString(),
                      soul: soul.toString(),
                      aura: aura.toString()
                  };
              } catch (e) {
                  console.warn("Failed to fetch LAU Saat:", e);
              }
          }

          if(yueAddr && yueAddr !== ZeroAddress) {
              updates.yue = yueAddr;
              if (user.yue !== yueAddr) {
                  addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Bridge Active: ${yueAddr}` });
              }
          }

          if(Object.keys(updates).length > 0) {
              setUser(prev => ({ ...prev, ...updates }));
          }
      } catch(e: any) {
          console.error("Identity Scan Fatal Error", e);
          addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Identity Scan Failed`, details: e.message });
      }
  };

  useEffect(() => {
      if (user.isConnected && user.address) {
          scanIdentity();
      }
  }, [user.isConnected, user.address, web3]);

  const triggerMapSync = async () => {
      if (isMapScanning) return;
      if (!web3) {
          addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: 'Sync Failed: No Network Connection' });
          return;
      }

      setIsMapScanning(true);
      setMapScanProgress('INITIALIZING...');
      addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: 'Global Map Sync Initiated...' });

      mapAbortController.current = new AbortController();
      const signal = mapAbortController.current.signal;

      try {
          while (!signal.aborted) {
              const currentBlock = await web3.getProvider().getBlockNumber();
              const meta = await Persistence.getChannelMeta(ADDRESSES.MAP);
              const ranges = meta?.scannedRanges || [];
              ranges.sort((a,b) => a.start - b.start); 

              let tipEnd = GENESIS_BLOCK;
              if (ranges.length > 0) tipEnd = ranges[ranges.length - 1].end;
              
              if (tipEnd < currentBlock) {
                  const start = Math.max(tipEnd + 1, currentBlock - 500000); 
                  const end = Math.min(start + CHUNK_SIZE, currentBlock);
                  setMapScanProgress(`SYNCING TIP: ${start} -> ${end}`);
                  await scanMapChunk(start, end, signal);
                  await new Promise(r => setTimeout(r, 100));
                  continue;
              }

              let foundGap = false;
              for (let i = ranges.length - 1; i > 0; i--) {
                  const current = ranges[i];
                  const prev = ranges[i-1];
                  if (current.start > prev.end + 1) {
                      const gapEnd = current.start - 1;
                      const gapStart = Math.max(prev.end + 1, gapEnd - CHUNK_SIZE);
                      setMapScanProgress(`FILLING GAP: ${gapStart} -> ${gapEnd}`);
                      await scanMapChunk(gapStart, gapEnd, signal);
                      foundGap = true;
                      break;
                  }
              }
              if (foundGap) {
                  await new Promise(r => setTimeout(r, 100));
                  continue;
              }

              let earliest = GENESIS_BLOCK;
              if (ranges.length > 0) earliest = ranges[0].start;
              
              if (earliest > GENESIS_BLOCK) {
                  const end = earliest - 1;
                  const start = Math.max(GENESIS_BLOCK, end - CHUNK_SIZE);
                  setMapScanProgress(`BACKFILLING: ${start} -> ${end}`);
                  await scanMapChunk(start, end, signal);
                  await new Promise(r => setTimeout(r, 100));
                  continue;
              }

              addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Global Map Sync Complete.` });
              break;
          }
      } catch (e: any) {
          if (e.message !== "Aborted") {
             console.error(e);
             addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Map Sync Error: ${e.message}` });
          }
      } finally {
          setIsMapScanning(false);
          setMapScanProgress('IDLE');
          mapAbortController.current = null;
      }
  };

  const stopMapSync = () => {
      if (mapAbortController.current) {
          mapAbortController.current.abort();
          addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: 'Map Sync Aborted by User.' });
      }
  };

  const scanMapChunk = async (start: number, end: number, signal: AbortSignal) => {
      if (!web3) return;
      const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
      const events = await map.queryFilter("NewQing", start, end);
      
      if (events.length > 0) {
          await Promise.all(events.map(async (e: any) => {
              const qingAddress = e.args[0];
              const integrative = e.args[1];
              const waat = e.args[2];
              
              let name = "Unknown Sector";
              let symbol = "UNK";
              try {
                  const qing = web3.getContract(qingAddress, QING_ABI);
                  name = await qing.name();
                  symbol = await qing.symbol();
              } catch {}

              const s: SectorData = {
                  address: qingAddress,
                  integrative,
                  waat: waat.toString(),
                  name,
                  symbol,
                  isSystem: false
              };
              await Persistence.saveSector(s);
          }));
          setMapLastUpdate(Date.now());
      }
      await Persistence.updateScannedRange(ADDRESSES.MAP, start, end);
  };

  useEffect(() => {
      setUser(prev => ({
          ...prev,
          mapSync: {
              isScanning: isMapScanning,
              progress: mapScanProgress,
              lastUpdate: mapLastUpdate,
              triggerSync: triggerMapSync,
              stopSync: stopMapSync
          }
      }));
  }, [isMapScanning, mapScanProgress, mapLastUpdate, web3]); 

  useEffect(() => {
    const storedKey = localStorage.getItem('dys_gemini_key');
    const storedModel = localStorage.getItem('dys_gemini_model');
    const storedRpc = localStorage.getItem('dys_custom_rpc');
    
    if(storedKey) setAiKey(storedKey);
    if(storedModel) setAiModel(storedModel);
    
    const rpcToUse = storedRpc || DEFAULT_RPC_URL;
    setActiveRpc(rpcToUse);

    initWeb3(rpcToUse);
  }, []);

  const initWeb3 = async (url: string) => {
      const _web3 = new Web3Service(url);
      setWeb3(_web3);
      addLog({
          id: generateId(),
          timestamp: new Date().toLocaleTimeString(),
          type: 'INFO',
          message: `TERMINAL_OS v4.1.5 // ATROPA KERNEL LOADED`
      });

      try {
          const provider = _web3.getProvider();
          const block = await provider.getBlockNumber();
          setBlockNumber(block);
          const feeData = await provider.getFeeData();
          if(feeData.gasPrice) {
              setGasPrice(formatUnits(feeData.gasPrice, 'gwei'));
          }
      } catch(e) {
          console.error("Telemetry failed", e);
          addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: 'Uplink Unstable: Check RPC Settings.' });
      }
  };

  const saveSettings = () => {
      localStorage.setItem('dys_gemini_key', aiKey);
      localStorage.setItem('dys_gemini_model', aiModel);
      localStorage.setItem('dys_custom_rpc', activeRpc);
      addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'Configuration Saved. Reinitializing Uplink...' });
      initWeb3(activeRpc);
  };

  const resetRpcDefaults = () => {
      setActiveRpc(DEFAULT_RPC_URL);
  };

  const handleViewIdentity = (id: string) => {
      setRegistrySearch(id);
      setView(AppView.LAU_REGISTRY);
  };

  const handleSelectSector = (address: string) => {
      sessionStorage.setItem('dys_selected_sector', address);
      setView(AppView.COMMS);
      addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Target Acquired: ${address}` });
  };

  const handleViewOnMap = (address: string) => {
      sessionStorage.setItem('dys_selected_sector', address);
      setView(AppView.NAVIGATION);
      addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Plotting Vector: ${address}` });
  };

  const handleAiDeepLink = (req: ContractInteractionRequest) => {
      setPendingInteraction(req);
      setView(AppView.CONTRACT_STUDIO);
      addLog({ 
          id: generateId(), 
          timestamp: new Date().toLocaleTimeString(), 
          type: 'INFO', 
          message: `AI Navigation: Opening ${req.contractName} Studio...` 
      });
  };

  useEffect(() => {
      if(!web3) return;
      const interval = setInterval(async () => {
          try {
              const provider = web3.getProvider();
              const block = await provider.getBlockNumber();
              setBlockNumber(block);
              const feeData = await provider.getFeeData();
              if(feeData.gasPrice) {
                  setGasPrice(parseFloat(formatUnits(feeData.gasPrice, 'gwei')).toFixed(1));
              }
          } catch(e) {}
      }, 12000); 
      return () => clearInterval(interval);
  }, [web3]);

  const connectWallet = async () => {
      if(!web3) return;
      try {
          const addr = await web3.connect();
          const balance = await web3.getBalance(addr);
          
          setUser(prev => ({
              ...prev,
              address: addr,
              isConnected: true,
              balance,
              providerType: 'INJECTED'
          }));

          addLog({
              id: generateId(),
              timestamp: new Date().toLocaleTimeString(),
              type: 'SUCCESS',
              message: `USER AUTHENTICATED: ${addr}`
          });

          scanIdentity(addr);

      } catch(e: any) {
          addLog({
              id: generateId(),
              timestamp: new Date().toLocaleTimeString(),
              type: 'ERROR',
              message: 'AUTH FAILURE',
              details: e.message
          });
      }
  };

  const renderContent = () => {
      if(!web3) return <div className="p-10 text-dys-amber animate-pulse font-mono">SYSTEM BOOT SEQUENCE...</div>;

      if (view === AppView.SETTINGS) {
          return (
              <div className="p-8 text-dys-amber font-mono max-w-2xl mx-auto mt-10 border border-dys-amber/20 bg-dys-panel/50 overflow-y-auto max-h-[80vh]">
                  {/* Settings Content... (Same as before) */}
                  <div className="space-y-4 pt-4 border-t border-dys-amber/10">
                          <div className="flex flex-col gap-2">
                              <label className="text-xs uppercase font-bold text-dys-cyan">Gemini API Key</label>
                              <input 
                                  type="password"
                                  className="bg-black border border-dys-cyan/30 p-3 text-sm text-dys-cyan focus:border-dys-cyan outline-none font-mono"
                                  placeholder="sk-..."
                                  value={aiKey}
                                  onChange={(e) => setAiKey(e.target.value)}
                              />
                          </div>
                  </div>
                   <div className="pt-4 border-t border-dys-amber/20">
                          <button 
                            onClick={saveSettings}
                            disabled={!activeRpc}
                            className="bg-dys-amber/10 text-dys-amber border border-dys-amber hover:bg-dys-amber hover:text-black px-6 py-2 font-bold text-sm transition-all disabled:opacity-50"
                          >
                              SAVE & REBOOT
                          </button>
                      </div>
              </div>
          );
      }

      if(activeSystem !== System.DYSNOMIA) {
          return (
              <div className="flex flex-col items-center justify-center h-full text-dys-red font-mono border-2 border-dys-red/20 m-4">
                  <div className="text-6xl font-bold mb-4 opacity-50">⚠</div>
                  <div className="text-xl font-bold mb-2">ACCESS DENIED</div>
              </div>
          );
      }

      switch(view) {
          case AppView.COMMAND_DECK:
              return <Dashboard user={user} web3={web3} addLog={addLog} setUser={setUser} setView={setView} />;
          case AppView.LAU_REGISTRY:
              return <LauRegistry user={user} web3={web3} addLog={addLog} setUser={setUser} initialSearchTerm={registrySearch} />;
          case AppView.NAVIGATION:
              return <QingMap web3={web3} addLog={addLog} onSelectSector={handleSelectSector} mapSync={user.mapSync} />;
          case AppView.COMMS:
              return <CommsDeck web3={web3} user={user} addLog={addLog} setUser={setUser} onViewIdentity={handleViewIdentity} />;
          case AppView.OPERATIONS:
              return <OperationsDeck web3={web3} user={user} addLog={addLog} onNavigate={handleViewOnMap} />;
          case AppView.MARKET:
              return <MarketDeck web3={web3} user={user} addLog={addLog} />;
          case AppView.CONTRACT_STUDIO:
              return <ContractStudio web3={web3} addLog={addLog} initialState={pendingInteraction} onClearState={() => setPendingInteraction(null)} />;
          case AppView.DATA_IO:
              return <DataDeck web3={web3} user={user} addLog={addLog} />;
          default:
              return <div className="p-10 text-center font-mono text-dys-red">ERR: MODULE NOT FOUND</div>;
      }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#050505] text-dys-amber overflow-hidden selection:bg-dys-amber selection:text-black font-mono">
      {/* 1. TOP STATUS BAR (HARDWARE LEVEL) */}
      <div className="h-6 bg-dys-black border-b border-dys-border flex items-center justify-center md:justify-between px-2 text-[10px] tracking-wider select-none shrink-0 opacity-60">
          <div className="flex items-center gap-4">
              <span>KERNEL: v.4.2.0</span>
              <span>MEM: OK</span>
          </div>
          <div className="hidden md:flex items-center gap-4">
              <span>UPTIME: {bootTime}</span>
              <span className={web3 ? "text-dys-green" : "text-dys-red"}>NET: {web3 ? "ONLINE" : "OFFLINE"}</span>
          </div>
      </div>

      {/* Header and Layout ... (Same as before) */}
      <header className="h-16 px-4 md:px-6 border-b-2 border-dys-amber flex items-center justify-between shrink-0 bg-[#080808]">
        <div className="flex items-center gap-6">
            <div className="leading-none group cursor-default">
                <h1 className="font-bold text-2xl tracking-tighter text-dys-amber group-hover:text-white transition-colors">ATROPA-999</h1>
                <span className="text-[10px] text-gray-500 tracking-[0.2em] group-hover:text-dys-amber transition-colors">RESEARCH_VESSEL</span>
            </div>
            <div className="hidden md:flex items-center gap-2">
                {[System.DYSNOMIA, System.ATROPA, System.BREZ].map(sys => (
                    <button
                        key={sys}
                        onClick={() => { setActiveSystem(sys); setView(AppView.COMMAND_DECK); }}
                        className={`px-3 py-1 text-xs font-bold tracking-wider transition-all border ${
                            activeSystem === sys && view !== AppView.SETTINGS
                            ? 'border-dys-amber text-black bg-dys-amber' 
                            : 'border-transparent text-gray-600 hover:text-dys-amber hover:border-dys-amber/30'
                        }`}
                    >
                        {sys}
                    </button>
                ))}
                <button onClick={() => setView(AppView.SETTINGS)} className={`px-3 py-1 text-xs font-bold tracking-wider transition-all border ${view === AppView.SETTINGS ? 'border-gray-500 text-black bg-gray-500' : 'border-transparent text-gray-600 hover:text-white'}`}>SETTINGS</button>
            </div>
        </div>
        <div className="flex items-center gap-6 text-xs font-mono">
            {/* Blockchain Stats */}
            <div className="hidden lg:flex flex-col items-end leading-tight border-r border-dys-border pr-6 mr-2 opacity-80">
                <div className="flex gap-2">
                    <span className="text-gray-600 text-[9px] uppercase">SYNC</span>
                    <span className="text-dys-amber font-bold">#{blockNumber}</span>
                </div>
                <div className="flex gap-2">
                    <span className="text-gray-600 text-[9px] uppercase">FUEL</span>
                    <span className="text-dys-amber font-bold">{gasPrice} GW</span>
                </div>
            </div>
            <div className="flex flex-col items-end leading-tight">
                <span className="text-gray-600 text-[9px] uppercase">PILOT</span>
                {user.isConnected ? (
                    <span className="text-dys-amber font-bold">{user.username || user.address?.substring(0,8)}</span>
                ) : (
                    <button onClick={connectWallet} className="text-dys-red hover:text-white font-bold animate-pulse">[ CONNECT ]</button>
                )}
            </div>
            <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-gray-600 text-[9px] uppercase">CREDITS</span>
                <span className="text-dys-amber">{Number(user.balance).toFixed(2)} PLS</span>
            </div>
             <div className="flex gap-2">
                <button onClick={() => setShowNavAI(!showNavAI)} className={`border px-3 py-1 font-bold transition-all hover:bg-white/10 ${showNavAI ? 'border-dys-amber text-dys-amber' : 'border-gray-800 text-gray-700'}`}>AI_CORE</button>
                 <button onClick={() => setShowLogs(!showLogs)} className={`border px-3 py-1 font-bold transition-all hover:bg-white/10 ${showLogs ? 'border-dys-cyan text-dys-cyan' : 'border-gray-800 text-gray-700'}`}>LOGS</button>
             </div>
        </div>
      </header>

      {activeSystem === System.DYSNOMIA && view !== AppView.SETTINGS && (
        <div className="bg-[#0a0a0a] border-b border-dys-border py-2 px-6 flex items-center gap-2 text-xs shrink-0 overflow-x-auto">
            <span className="text-dys-cyan font-bold mr-4 tracking-widest hidden md:block">MODULE // DYSNOMIA</span>
            <span className="text-gray-800 mr-2 hidden md:block">|</span>
            
            <nav className="flex gap-1">
                {[
                    { id: AppView.COMMAND_DECK, label: 'COMMAND_DECK' },
                    { id: AppView.NAVIGATION, label: 'NAVIGATION' }, 
                    { id: AppView.COMMS, label: 'COMMS' },
                    { id: AppView.OPERATIONS, label: 'OPERATIONS' }, 
                    { id: AppView.MARKET, label: 'MARKET' }, 
                    { id: AppView.LAU_REGISTRY, label: 'REGISTRY' },
                    { id: AppView.CONTRACT_STUDIO, label: 'ENG_DECK' },
                    { id: AppView.DATA_IO, label: 'DATA_IO' }, 
                ].map(item => (
                    <button
                        key={item.id}
                        onClick={() => setView(item.id)}
                        className={`px-3 py-1 border transition-all whitespace-nowrap ${
                            view === item.id 
                            ? 'border-dys-cyan text-dys-cyan bg-dys-cyan/10' 
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative border-l-4 border-r-4 border-dys-black">
          <main className="flex-1 flex flex-col min-w-0 bg-[#000] relative">
             <div className="absolute inset-0 pointer-events-none z-0 opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
             <div className="flex-1 overflow-auto z-10 flex flex-col">
                {renderContent()}
             </div>
          </main>
          {showNavAI && (
              <aside className="w-80 md:w-96 border-l-2 border-dys-amber/20 z-40 bg-[#050505]">
                  <NavAI userContext={user} addLog={addLog} currentView={view} onNavigateToContract={handleAiDeepLink} activeModel={aiModel} />
              </aside>
          )}
          {showLogs && (
              <aside className="w-72 border-l border-dys-cyan/20 z-30 bg-[#050505] flex flex-col">
                  <div className="p-2 border-b border-dys-cyan/20 text-xs font-bold text-dys-cyan tracking-widest bg-dys-cyan/5">SYSTEM_LOGS</div>
                  <TerminalLog logs={logs} />
              </aside>
          )}
      </div>
    </div>
  );
};

export default App;
