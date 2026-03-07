
import React, { useState, useEffect, useMemo } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, MAP_ABI, CHEON_ABI, QING_ABI, YUE_ABI, ERC20_ABI, META_ABI, SHIO_ABI, SHA_ABI, LAU_ABI } from '../constants';
import { Persistence, SectorData } from '../services/persistenceService';
import { isAddress, formatUnits } from 'ethers';

interface OperationsDeckProps {
  web3: Web3Service | null;
  user: UserContext;
  addLog: (entry: LogEntry) => void;
  onNavigate?: (address: string) => void;
}

const OperationsDeck: React.FC<OperationsDeckProps> = ({ web3, user, addLog, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'FOUNDRY' | 'REACTOR' | 'PHYSICS'>('REACTOR');
  
  // FOUNDRY (Genesis) State
  const [tfAsset, setTfAsset] = useState('');
  const [recentGenesis, setRecentGenesis] = useState<any[]>([]);
  
  // REACTOR (Cheon) State
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [selectedReactorQing, setSelectedReactorQing] = useState<string>('');
  const [reactorStatus, setReactorStatus] = useState<'IDLE' | 'CHARGING' | 'COOLING'>('IDLE');
  const [sectorSearch, setSectorSearch] = useState('');
  
  // TELEMETRY State
  const [telemetry, setTelemetry] = useState({
      hypogram: '0.00',
      epigram: '0.00',
      maiBalance: '0.00',
      lastYield: '0.00'
  });

  // PHYSICS State
  const [physicsTab, setPhysicsTab] = useState<'SHIO' | 'SHA'>('SHIO');
  
  // MetaComputer State
  const [selectedPhysicsQing, setSelectedPhysicsQing] = useState<string>('');
  const [metaResults, setMetaResults] = useState<{ dione: string, charge: string, deimos: string, yeo: string } | null>(null);
  
  // MaterialSynthesizer State
  const [shioXi, setShioXi] = useState('');
  const [shioAlpha, setShioAlpha] = useState('');
  const [shioBeta, setShioBeta] = useState('');
  const [shioRho, setShioRho] = useState<any>(null);
  
  const [shaPi, setShaPi] = useState('');
  const [shaTheta, setShaTheta] = useState('');
  
  const [shioAddress, setShioAddress] = useState<string>('');
  const [shaAddress, setShaAddress] = useState<string>('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
      const load = async () => {
          const s = await Persistence.getAllSectors();
          setSectors(s);
          if (user.currentArea && user.currentArea !== ADDRESSES.VOID) {
              setSelectedReactorQing(user.currentArea);
          } else if (s.length > 0 && !selectedReactorQing) {
              setSelectedReactorQing(s[0].address);
          }
      };
      load();
  }, [user.currentArea, user.mapSync.lastUpdate]); 

  useEffect(() => {
      if (selectedReactorQing && activeTab === 'REACTOR') {
          fetchTelemetry();
      }
  }, [selectedReactorQing, activeTab, user.yue, web3]);

  useEffect(() => {
      const fetchUserCrypto = async () => {
          if (!web3 || !user.lauAddress) return;
          try {
              const lau = web3.getContract(user.lauAddress, LAU_ABI);
              const onData = await lau.On();
              const shioAddr = onData[4]; // Shio is at index 4
              setShioAddress(shioAddr);
              
              const shio = web3.getContract(shioAddr, SHIO_ABI);
              const rhoData = await shio.Rho();
              
              let rodChannel = "Unknown";
              let coneChannel = "Unknown";
              try {
                  const rod = web3.getContract(rhoData[0], SHA_ABI);
                  const cone = web3.getContract(rhoData[1], SHA_ABI);
                  const rodView = await rod.View();
                  const coneView = await cone.View();
                  rodChannel = rodView[3].toString(); // Channel is index 3 in Fa struct
                  coneChannel = coneView[3].toString();
              } catch (e) {
                  console.warn("Failed to fetch SHA views", e);
              }

              setShioRho({
                  rod: rhoData[0],
                  cone: rhoData[1],
                  barn: rhoData[2].toString(),
                  rodChannel,
                  coneChannel
              });
              setShaAddress(rhoData[0]); // Default to Rod
          } catch (e) {
              console.error("Failed to fetch user crypto state", e);
          }
      };
      if (activeTab === 'PHYSICS') {
          fetchUserCrypto();
      }
  }, [activeTab, user.lauAddress, web3]);

  // Fetch Recent Genesis Events
  useEffect(() => {
      if (activeTab === 'FOUNDRY' && web3) {
          const fetchEvents = async () => {
              try {
                  const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
                  const currentBlock = await web3.getProvider().getBlockNumber();
                  const fromBlock = Math.max(0, currentBlock - 10000); // Scan last 10k blocks safely
                  const events = await map.queryFilter("NewQing", fromBlock, currentBlock);
                  
                  const formatted = await Promise.all(events.reverse().slice(0, 10).map(async (e: any) => {
                      const qing = e.args[0];
                      const asset = e.args[1];
                      let name = "Unknown Sector";
                      try {
                          const qContract = web3.getContract(qing, QING_ABI);
                          name = await qContract.name();
                      } catch {}
                      return { qing, asset, name, block: e.blockNumber };
                  }));
                  setRecentGenesis(formatted);
              } catch (e) {
                  console.warn("Genesis scan failed", e);
              }
          };
          fetchEvents();
      }
  }, [activeTab, web3]);

  const fetchTelemetry = async () => {
      if (!web3 || !user.yue || !user.address || !selectedReactorQing) return null;
      try {
          const yue = web3.getContract(user.yue, YUE_ABI);
          const mai = web3.getContract(ADDRESSES.MAI, ERC20_ABI);

          const [barData, maiBal] = await Promise.all([
              yue.Bar(selectedReactorQing).catch(() => [0n, 0n]),
              mai.balanceOf(user.address).catch(() => 0n)
          ]);

          const stats = {
              hypogram: formatUnits(barData[0], 18),
              epigram: formatUnits(barData[1], 18),
              maiBalance: formatUnits(maiBal, 18),
              rawMai: maiBal,
              rawHypo: barData[0],
              rawEpi: barData[1]
          };

          setTelemetry(prev => ({
              ...prev,
              hypogram: stats.hypogram,
              epigram: stats.epigram,
              maiBalance: stats.maiBalance
          }));

          return stats;
      } catch (e) {
          console.error("Telemetry error", e);
          return null;
      }
  };

  const handleTerraform = async () => {
      if(!web3 || !tfAsset || !isAddress(tfAsset)) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Invalid Asset Address.` });
          return;
      }
      setLoading(true);
      try {
          const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
          const tx = await web3.sendTransaction(map, 'New', [tfAsset]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Genesis Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Sector Generated.` });
          setTfAsset('');
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Terraforming Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleCycleReactor = async () => {
      if (!web3 || !selectedReactorQing) return;
      setLoading(true);
      setReactorStatus('CHARGING');
      
      try {
          // 1. Snapshot Pre-State
          const preStats = await fetchTelemetry();

          const cheon = web3.getContract(ADDRESSES.CHEON, CHEON_ABI);
          const tx = await web3.sendTransaction(cheon, 'Su', [selectedReactorQing]);
          
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Reactor Cycle Initiated (Su): ${tx.hash}` });
          
          await web3.waitForReceipt(tx);
          
          // 2. Snapshot Post-State & Diff
          const postStats = await fetchTelemetry();
          
          let logMsg = "Cycle Complete.";
          if (preStats && postStats) {
              const maiDiff = postStats.rawMai - preStats.rawMai;
              const hypoDiff = postStats.rawHypo - preStats.rawHypo;
              const formattedMai = formatUnits(maiDiff, 18);
              const formattedHypo = formatUnits(hypoDiff, 18);
              
              if (maiDiff > 0n) {
                  logMsg += ` Yield: +${formattedMai} MAI.`;
                  setTelemetry(prev => ({ ...prev, lastYield: formattedMai }));
              }
              if (hypoDiff > 0n) {
                  logMsg += ` Pressure Δ: +${formattedHypo} Bar.`;
              }
          }

          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: logMsg });
          
          setReactorStatus('COOLING');
          setTimeout(() => setReactorStatus('IDLE'), 2000);
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Reactor Critical`, details: web3.parseError(e) });
          setReactorStatus('IDLE');
      } finally {
          setLoading(false);
      }
  };

  const forceReset = () => {
      setLoading(false);
      setReactorStatus('IDLE');
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Manual Override: System Reset.` });
  };

  const handleRunSimulation = async () => {
      if (!web3 || !selectedPhysicsQing) return;
      setLoading(true);
      try {
          const qing = web3.getContract(selectedPhysicsQing, QING_ABI);
          const waat = await qing.Waat();
          
          const meta = web3.getContract(ADDRESSES.META, META_ABI);
          const result = await meta.getFunction("Beat").staticCall(waat);
          
          setMetaResults({
              dione: result[0].toString(),
              charge: result[1].toString(),
              deimos: result[2].toString(),
              yeo: result[3].toString()
          });
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Simulation Complete for Sector ${selectedPhysicsQing}` });
      } catch (e: any) {
          console.error(e);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `CALCULATION FAILURE: SECTOR UNSTABLE. Ensure you have joined the sector and hold its tokens.` });
          setMetaResults(null);
      } finally {
          setLoading(false);
      }
  };

  const handleExecuteBeat = async () => {
      if (!web3 || !selectedPhysicsQing) return;
      setLoading(true);
      try {
          const qing = web3.getContract(selectedPhysicsQing, QING_ABI);
          const waat = await qing.Waat();
          
          const meta = web3.getContract(ADDRESSES.META, META_ABI);
          const tx = await web3.sendTransaction(meta, 'Beat', [waat]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Beat Execution Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Beat Executed Successfully.` });
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Execution Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleGenerateMatter = async () => {
      if (!web3 || !shioAddress) return;
      setLoading(true);
      try {
          const shio = web3.getContract(shioAddress, SHIO_ABI);
          const tx = await web3.sendTransaction(shio, 'Generate', [shioXi, shioAlpha, shioBeta]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Matter Generation Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Matter Generated Successfully.` });
          
          // Refresh Rho
          const rhoData = await shio.Rho();
          setShioRho(prev => ({
              ...prev,
              rod: rhoData[0],
              cone: rhoData[1],
              barn: rhoData[2].toString()
          }));
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Generation Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleIsomerize = async () => {
      if (!web3 || !shioAddress) return;
      setLoading(true);
      try {
          const shio = web3.getContract(shioAddress, SHIO_ABI);
          const tx = await web3.sendTransaction(shio, 'Isomerize', []);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Isomerize Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Isomerize Complete.` });
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Isomerize Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleIsolate = async () => {
      if (!web3 || !shioAddress) return;
      setLoading(true);
      try {
          const shio = web3.getContract(shioAddress, SHIO_ABI);
          const tx = await web3.sendTransaction(shio, 'Isolate', []);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Isolate Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Isolate Complete.` });
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Isolate Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleMagnetize = async () => {
      if (!web3 || !shioAddress) return;
      setLoading(true);
      try {
          const shio = web3.getContract(shioAddress, SHIO_ABI);
          const tx = await web3.sendTransaction(shio, 'Magnetize', []);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Magnetize Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Magnetize Complete.` });
          
          const rhoData = await shio.Rho();
          setShioRho(prev => ({
              ...prev,
              barn: rhoData[2].toString()
          }));
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Magnetize Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleFuseStates = async () => {
      if (!web3 || !shaAddress) return;
      setLoading(true);
      try {
          const sha = web3.getContract(shaAddress, SHA_ABI);
          const tx = await web3.sendTransaction(sha, 'React', [shaPi, shaTheta]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `State Fusion Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `States Fused Successfully.` });
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Fusion Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const filteredSectors = useMemo(() => {
        const q = sectorSearch.toLowerCase();
        return sectors.filter(s => 
            s.name.toLowerCase().includes(q) || 
            s.symbol.toLowerCase().includes(q) || 
            s.address.toLowerCase().includes(q)
        );
  }, [sectors, sectorSearch]);

  const selectedSectorName = sectors.find(s => s.address === selectedReactorQing)?.name || "UNKNOWN SECTOR";

  return (
    <div className="h-full flex flex-col bg-dys-black p-4 md:p-8 font-mono text-gray-300">
        <div className="flex border-b border-dys-border mb-6">
            <button onClick={() => setActiveTab('REACTOR')} className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'REACTOR' ? 'bg-dys-gold/20 text-dys-gold border-b-2 border-dys-gold' : 'text-gray-500 hover:text-white'}`}>REACTOR (CHEON)</button>
            <button onClick={() => setActiveTab('FOUNDRY')} className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'FOUNDRY' ? 'bg-dys-green/20 text-dys-green border-b-2 border-dys-green' : 'text-gray-500 hover:text-white'}`}>FOUNDRY (MAP)</button>
            <button onClick={() => setActiveTab('PHYSICS')} className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'PHYSICS' ? 'bg-dys-red/20 text-dys-red border-b-2 border-dys-red' : 'text-gray-500 hover:text-white'}`}>PHYSICS</button>
        </div>

        <div className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full">
            {activeTab === 'REACTOR' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                    <div className="lg:col-span-4 bg-dys-panel border border-dys-border flex flex-col h-[500px] lg:h-auto">
                        <div className="p-3 border-b border-dys-border bg-black/50">
                            <h3 className="text-dys-gold font-bold tracking-widest text-xs mb-2">TARGET SELECTION</h3>
                            <input 
                                className="w-full bg-black border border-dys-border p-2 text-[10px] text-dys-gold focus:border-dys-gold outline-none font-mono mb-2"
                                placeholder="Search Sectors..."
                                value={sectorSearch}
                                onChange={(e) => setSectorSearch(e.target.value)}
                            />
                            <button 
                                onClick={user.mapSync.isScanning ? user.mapSync.stopSync : user.mapSync.triggerSync}
                                className={`w-full text-[9px] border py-2 font-bold transition-all flex items-center justify-center gap-2 ${user.mapSync.isScanning ? 'bg-dys-red/20 text-dys-red border-dys-red animate-pulse' : 'bg-dys-green/10 text-dys-green border-dys-green/30 hover:bg-dys-green hover:text-black'}`}
                            >
                                <span className={user.mapSync.isScanning ? "animate-spin" : ""}>{user.mapSync.isScanning ? "⟳" : "📡"}</span>
                                {user.mapSync.isScanning ? `SCANNING [${user.mapSync.progress}]` : 'SYNC NETWORK'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                            {filteredSectors.map(s => {
                                const isSelected = s.address === selectedReactorQing;
                                return (
                                    <button 
                                        key={s.address}
                                        onClick={() => setSelectedReactorQing(s.address)}
                                        className={`w-full text-left p-3 border-l-4 text-xs font-mono transition-all flex justify-between items-center group ${isSelected ? 'border-dys-gold bg-dys-gold/10 text-white' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                    >
                                        <div className="truncate pr-2">
                                            <div className={`font-bold ${isSelected ? 'text-dys-gold' : 'text-gray-400 group-hover:text-white'}`}>{s.name}</div>
                                            <div className="text-[9px] opacity-50">{s.symbol}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="lg:col-span-8 flex flex-col gap-6">
                        <div className="bg-dys-panel border border-dys-gold/30 p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-dys-gold text-black text-[9px] font-bold px-2 py-1">CHEON SYSTEM ONLINE</div>
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-xl text-dys-gold font-bold tracking-widest">PARTICLE REACTOR</h3>
                                    <div className="text-xs text-white font-bold mt-1">LOCKED TARGET: {selectedSectorName}</div>
                                </div>
                                <button 
                                    onClick={() => onNavigate && onNavigate(selectedReactorQing)}
                                    disabled={!selectedReactorQing}
                                    className="bg-dys-cyan/10 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black px-4 py-2 font-bold text-xs disabled:opacity-30"
                                >
                                    OPEN NAV
                                </button>
                            </div>
                            
                            {user.yue ? (
                                <div className="bg-black border border-dys-border p-4 grid grid-cols-2 gap-4 text-xs mb-6">
                                    <div className="col-span-2 text-[10px] text-gray-500 border-b border-gray-800 pb-1 mb-1 flex justify-between">
                                        <span>REACTOR TELEMETRY</span>
                                        <span>VAULT: {user.yue.substring(0, 6)}...</span>
                                    </div>
                                    <div><div className="text-gray-500 mb-1">HYPOGRAM (PRESSURE)</div><div className="text-dys-cyan font-bold font-mono text-sm">{parseFloat(telemetry.hypogram).toFixed(4)}</div></div>
                                    <div><div className="text-gray-500 mb-1">EPIGRAM (POTENTIAL)</div><div className="text-purple-400 font-bold font-mono text-sm">{parseFloat(telemetry.epigram).toFixed(4)}</div></div>
                                    <div className="col-span-2 bg-dys-gold/5 p-2 border border-dys-gold/20"><div className="flex justify-between items-center"><div className="text-dys-gold font-bold">MAI YIELD</div><div className="text-white font-mono">{parseFloat(telemetry.maiBalance).toFixed(4)}</div></div></div>
                                </div>
                            ) : (
                                <div className="text-center text-xs text-dys-red p-4 border border-dys-red bg-dys-red/5 mb-6">[WARNING] NO YUE VAULT LINKED. REACTOR INACTIVE.</div>
                            )}

                            <div>
                                <button onClick={handleCycleReactor} disabled={loading || !selectedReactorQing || !user.yue} className={`w-full py-6 font-bold text-sm tracking-[0.2em] transition-all relative overflow-hidden group ${reactorStatus === 'CHARGING' ? 'bg-dys-gold text-black cursor-wait' : reactorStatus === 'COOLING' ? 'bg-dys-cyan text-black' : 'bg-dys-gold/10 text-dys-gold border border-dys-gold hover:bg-dys-gold hover:text-black disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                                    <span className="relative z-10">{reactorStatus === 'CHARGING' ? 'CYCLING...' : reactorStatus === 'COOLING' ? 'COOLING DOWN' : 'CYCLE REACTOR'}</span>
                                </button>
                                {loading && <button onClick={forceReset} className="w-full mt-2 text-[9px] text-dys-red hover:text-white uppercase font-bold border border-transparent hover:border-dys-red py-1">[ EMERGENCY RESET ]</button>}
                            </div>
                        </div>

                        <div className="border border-dys-border bg-black p-6 flex flex-col items-center justify-center relative flex-1 min-h-[300px]">
                            <pre className={`text-[10px] leading-none font-bold transition-colors duration-500 select-none ${reactorStatus === 'CHARGING' ? 'text-white animate-pulse' : reactorStatus === 'COOLING' ? 'text-dys-cyan' : 'text-dys-gold/50'}`}>
{`
       .---.
      /     \\
     |  ( )  |
      \\     /
       '---'
      /  |  \\
     /   |   \\
    /    |    \\
   /     |     \\
  /______|______\\
  |      |      |
  | [##] | [##] |
  |______|______|
`}
                            </pre>
                             <div className="mt-4 text-center z-10 bg-black/80 px-4 py-1">
                                <div className="text-xs text-gray-500">CORE STATUS</div>
                                <div className={`text-lg font-bold ${reactorStatus === 'IDLE' ? 'text-gray-400' : reactorStatus === 'CHARGING' ? 'text-white' : 'text-dys-cyan'}`}>{reactorStatus}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* ... (Foundry and Conflict tabs remain the same) */}
            {activeTab === 'FOUNDRY' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     <div className="bg-dys-panel border border-dys-green/30 p-8 space-y-6">
                        <div>
                            <h3 className="text-xl text-dys-green font-bold mb-2 tracking-widest">SECTOR GENESIS</h3>
                            <p className="text-xs text-gray-500">Wrap an ERC20 asset to create a new QING territory on the map. Requires CHO registration.</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] text-dys-green font-bold uppercase">Seed Asset Address</label>
                            <input className="w-full bg-black border border-dys-green/50 p-3 text-sm text-white focus:border-dys-green outline-none font-mono" placeholder="0x..." value={tfAsset} onChange={(e) => setTfAsset(e.target.value)} />
                        </div>
                        <button onClick={handleTerraform} disabled={loading || !tfAsset} className="w-full py-4 bg-dys-green/10 text-dys-green border border-dys-green hover:bg-dys-green hover:text-black font-bold text-xs tracking-widest transition-all">{loading ? 'TERRAFORMING...' : 'INITIATE GENESIS'}</button>
                     </div>
                     <div className="border border-dys-border bg-black p-6 flex flex-col">
                         <h4 className="text-xs text-gray-500 font-bold uppercase mb-4 border-b border-gray-800 pb-2">RECENT EXPANSIONS</h4>
                         <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] scrollbar-thin">
                             {recentGenesis.map((g, idx) => (
                                 <div key={idx} className="p-3 border-l-2 border-dys-green bg-dys-green/5 hover:bg-dys-green/10 transition-colors">
                                     <div className="flex justify-between items-start"><span className="text-xs font-bold text-dys-green">{g.name}</span><span className="text-[9px] text-gray-500">BLK {g.block}</span></div>
                                     <div className="text-[10px] text-gray-600 font-mono mt-1">{g.qing}</div>
                                 </div>
                             ))}
                         </div>
                     </div>
                </div>
            )}
            
            {activeTab === 'PHYSICS' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                    <div className="lg:col-span-4 bg-dys-panel border border-dys-border flex flex-col h-[500px] lg:h-auto">
                        <div className="p-3 border-b border-dys-border bg-black/50">
                            <h3 className="text-dys-red font-bold tracking-widest text-xs mb-2">TARGET SECTOR</h3>
                            <input 
                                className="w-full bg-black border border-dys-border p-2 text-[10px] text-dys-red focus:border-dys-red outline-none font-mono mb-2"
                                placeholder="Search Sectors..."
                                value={sectorSearch}
                                onChange={(e) => setSectorSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                            {filteredSectors.map(s => {
                                const isSelected = s.address === selectedPhysicsQing;
                                return (
                                    <button 
                                        key={s.address}
                                        onClick={() => setSelectedPhysicsQing(s.address)}
                                        className={`w-full text-left p-3 border-l-4 text-xs font-mono transition-all flex justify-between items-center group ${isSelected ? 'border-dys-red bg-dys-red/10 text-white' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                    >
                                        <div className="truncate pr-2">
                                            <div className={`font-bold ${isSelected ? 'text-dys-red' : 'text-gray-400 group-hover:text-white'}`}>{s.name}</div>
                                            <div className="text-[9px] opacity-50">{s.symbol}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="lg:col-span-8 flex flex-col gap-6 overflow-y-auto">
                        {/* MetaComputer */}
                        <div className="bg-dys-panel border border-dys-red/30 p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-dys-red text-black text-[9px] font-bold px-2 py-1">META COMPUTER</div>
                            <h3 className="text-xl text-dys-red font-bold tracking-widest mb-4">META-ANALYSIS (BEAT)</h3>
                            <p className="text-xs text-gray-500 mb-4">Calculate resonance frequency of a Sector. Requires holding the Sector's token.</p>
                            
                            <div className="flex gap-4 mb-6">
                                <button 
                                    onClick={handleRunSimulation} 
                                    disabled={loading || !selectedPhysicsQing} 
                                    className="flex-1 py-4 bg-dys-red/10 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black font-bold text-xs tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'SIMULATING...' : '[ RUN SIMULATION ]'}
                                </button>
                                <button 
                                    onClick={handleExecuteBeat} 
                                    disabled={loading || !selectedPhysicsQing} 
                                    className="flex-1 py-4 bg-dys-red/20 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black font-bold text-xs tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'EXECUTING...' : '[ EXECUTE (COMMIT) ]'}
                                </button>
                            </div>

                            {metaResults && (
                                <div className="bg-black border border-dys-border p-4 grid grid-cols-2 gap-4 text-xs">
                                    <div className="col-span-2 text-[10px] text-gray-500 border-b border-gray-800 pb-1 mb-1">HOLODECK RESULTS</div>
                                    <div><div className="text-gray-500 mb-1">DIONE (ORBITAL RESONANCE)</div><div className="text-dys-cyan font-bold font-mono text-sm break-all">{metaResults.dione}</div></div>
                                    <div><div className="text-gray-500 mb-1">CHARGE (POWER OUTPUT)</div><div className="text-dys-gold font-bold font-mono text-sm break-all">{metaResults.charge}</div></div>
                                    <div><div className="text-gray-500 mb-1">DEIMOS (ENTROPY FACTOR)</div><div className="text-dys-red font-bold font-mono text-sm break-all">{metaResults.deimos}</div></div>
                                    <div><div className="text-gray-500 mb-1">YEO (EXPANSION RANGE)</div><div className="text-purple-400 font-bold font-mono text-sm break-all">{metaResults.yeo}</div></div>
                                </div>
                            )}
                        </div>

                        {/* MaterialSynthesizer */}
                        <div className="bg-dys-panel border border-dys-red/30 p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-dys-red text-black text-[9px] font-bold px-2 py-1">MATERIAL SYNTHESIZER</div>
                            <h3 className="text-xl text-dys-red font-bold tracking-widest mb-2">FABRICATION OF REALITY</h3>
                            
                            <div className="flex border-b border-dys-border mb-6 mt-4">
                                <button onClick={() => setPhysicsTab('SHIO')} className={`px-6 py-2 font-bold text-xs tracking-widest transition-colors ${physicsTab === 'SHIO' ? 'bg-dys-red/20 text-dys-red border-b-2 border-dys-red' : 'text-gray-500 hover:text-white'}`}>SHIO (GENERATE)</button>
                                <button onClick={() => setPhysicsTab('SHA')} className={`px-6 py-2 font-bold text-xs tracking-widest transition-colors ${physicsTab === 'SHA' ? 'bg-dys-red/20 text-dys-red border-b-2 border-dys-red' : 'text-gray-500 hover:text-white'}`}>SHA (REACT)</button>
                            </div>

                            {physicsTab === 'SHIO' && (
                                <div className="space-y-4">
                                    {user.saat && (
                                        <div className="text-[10px] text-gray-500 mb-2">
                                            <span className="text-dys-cyan">SUGGESTED INPUTS:</span><br/>
                                            Soul: {user.saat.soul}<br/>
                                            Aura: {user.saat.aura}
                                        </div>
                                    )}
                                    {shioRho && (
                                        <div className="bg-black border border-dys-border p-4 text-xs mb-4">
                                            <div className="text-[10px] text-gray-500 border-b border-gray-800 pb-1 mb-2">SHIO TELEMETRY</div>
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="flex justify-between"><span className="text-gray-500">ROD:</span> <span className="text-dys-cyan font-mono">{shioRho.rod}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">ROD CH:</span> <span className="text-dys-cyan font-mono">{shioRho.rodChannel}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">CONE:</span> <span className="text-dys-cyan font-mono">{shioRho.cone}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">CONE CH:</span> <span className="text-dys-cyan font-mono">{shioRho.coneChannel}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">BARN:</span> <span className="text-dys-gold font-mono">{shioRho.barn}</span></div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-[10px] text-dys-red font-bold uppercase">Xi (Seed)</label>
                                            <input className="w-full bg-black border border-dys-red/50 p-2 text-sm text-white focus:border-dys-red outline-none font-mono mt-1" value={shioXi} onChange={(e) => setShioXi(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-dys-red font-bold uppercase">Alpha (Param)</label>
                                            <input className="w-full bg-black border border-dys-red/50 p-2 text-sm text-white focus:border-dys-red outline-none font-mono mt-1" value={shioAlpha} onChange={(e) => setShioAlpha(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-dys-red font-bold uppercase">Beta (Param)</label>
                                            <input className="w-full bg-black border border-dys-red/50 p-2 text-sm text-white focus:border-dys-red outline-none font-mono mt-1" value={shioBeta} onChange={(e) => setShioBeta(e.target.value)} />
                                        </div>
                                    </div>
                                    <button onClick={handleGenerateMatter} disabled={loading || !shioXi || !shioAlpha || !shioBeta || !shioAddress} className="w-full py-3 bg-dys-red/10 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black font-bold text-xs tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4">
                                        {loading ? 'GENERATING...' : '[ GENERATE MATTER ]'}
                                    </button>
                                    <div className="grid grid-cols-3 gap-4 mt-4">
                                        <button onClick={handleIsomerize} disabled={loading || !shioAddress} className="py-2 bg-dys-red/5 text-dys-red border border-dys-red/50 hover:bg-dys-red hover:text-black font-bold text-[10px] tracking-widest transition-all disabled:opacity-50">
                                            [ ISOMERIZE ]
                                        </button>
                                        <button onClick={handleIsolate} disabled={loading || !shioAddress} className="py-2 bg-dys-red/5 text-dys-red border border-dys-red/50 hover:bg-dys-red hover:text-black font-bold text-[10px] tracking-widest transition-all disabled:opacity-50">
                                            [ ISOLATE ]
                                        </button>
                                        <button onClick={handleMagnetize} disabled={loading || !shioAddress} className="py-2 bg-dys-red/5 text-dys-red border border-dys-red/50 hover:bg-dys-red hover:text-black font-bold text-[10px] tracking-widest transition-all disabled:opacity-50">
                                            [ MAGNETIZE ]
                                        </button>
                                    </div>
                                </div>
                            )}

                            {physicsTab === 'SHA' && (
                                <div className="space-y-4">
                                    <p className="text-[10px] text-gray-500 mb-4">
                                        Note: If Pi and Theta result in a 0 output, the transaction will revert with ReactionZeroError (0xb5067c27). Try different values.
                                    </p>
                                    {shioRho && (
                                        <div className="mb-4">
                                            <label className="text-[10px] text-dys-red font-bold uppercase">Target SHA</label>
                                            <select 
                                                className="w-full bg-black border border-dys-red/50 p-2 text-sm text-white focus:border-dys-red outline-none font-mono mt-1"
                                                value={shaAddress}
                                                onChange={(e) => setShaAddress(e.target.value)}
                                            >
                                                <option value={shioRho.rod}>ROD ({shioRho.rod})</option>
                                                <option value={shioRho.cone}>CONE ({shioRho.cone})</option>
                                            </select>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] text-dys-red font-bold uppercase">Pi (Rotation)</label>
                                            <input className="w-full bg-black border border-dys-red/50 p-2 text-sm text-white focus:border-dys-red outline-none font-mono mt-1" value={shaPi} onChange={(e) => setShaPi(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-dys-red font-bold uppercase">Theta (Angle)</label>
                                            <input className="w-full bg-black border border-dys-red/50 p-2 text-sm text-white focus:border-dys-red outline-none font-mono mt-1" value={shaTheta} onChange={(e) => setShaTheta(e.target.value)} />
                                        </div>
                                    </div>
                                    <button onClick={handleFuseStates} disabled={loading || !shaPi || !shaTheta || !shaAddress} className="w-full py-3 bg-dys-red/10 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black font-bold text-xs tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4">
                                        {loading ? 'FUSING...' : '[ FUSE STATES ]'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default OperationsDeck;
