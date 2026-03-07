
import React, { useState, useEffect } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, QING_ABI, LAU_ABI, ERC20_ABI } from '../constants';
import { Persistence, SectorData } from '../services/persistenceService';
import VoidChat from './VoidChat';
import { ZeroAddress, formatUnits } from 'ethers';

interface CommsDeckProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
  onViewIdentity?: (id: string) => void;
}

const CommsDeck: React.FC<CommsDeckProps> = ({ user, web3, addLog, setUser, onViewIdentity }) => {
  const [channels, setChannels] = useState<SectorData[]>([
      { name: 'THE VOID', symbol: 'VOID', address: ADDRESSES.VOID, isSystem: true, integrative: ZeroAddress, waat: "0" }
  ]);
  const [activeChannelAddr, setActiveChannelAddr] = useState<string>(() => {
      // Initialize with stored value if present
      return sessionStorage.getItem('dys_selected_sector') || ADDRESSES.VOID;
  });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Access Control State
  const [accessState, setAccessState] = useState<'LOADING' | 'ADMITTED' | 'RESTRICTED' | 'VOID'>('LOADING');
  const [coverCharge, setCoverCharge] = useState<bigint>(0n);
  const [assetSymbol, setAssetSymbol] = useState('');
  const [loading, setLoading] = useState(false);

  // Load Channels (Auto-refresh on sync update)
  useEffect(() => {
      const load = async () => {
          const stored = await Persistence.getAllSectors();
          const voidSector: SectorData = { name: 'THE VOID', symbol: 'VOID', address: ADDRESSES.VOID, isSystem: true, integrative: ZeroAddress, waat: "0" };
          setChannels([voidSector, ...stored]);
      };
      load();
  }, [user.mapSync.lastUpdate, user.mapSync.isScanning]); // Reload when sync updates or status changes

  // Check Access when channel changes
  useEffect(() => {
      if (activeChannelAddr === ADDRESSES.VOID) {
          setAccessState('VOID');
          sessionStorage.setItem('dys_selected_sector', ADDRESSES.VOID);
          return;
      }
      
      sessionStorage.setItem('dys_selected_sector', activeChannelAddr);
      checkAccess();
  }, [activeChannelAddr, user.lauAddress, web3]);

  const checkAccess = async () => {
      if (!web3 || !user.lauAddress || activeChannelAddr === ADDRESSES.VOID) return;
      setAccessState('LOADING');
      
      try {
          const qing = web3.getContract(activeChannelAddr, QING_ABI);
          const [isAdmitted, charge, assetAddr] = await Promise.all([
              qing.Admitted(user.lauAddress).catch(() => false),
              qing.CoverCharge().catch(() => 0n),
              qing.Asset().catch(() => ZeroAddress)
          ]);

          if (isAdmitted) {
              setAccessState('ADMITTED');
          } else {
              setAccessState('RESTRICTED');
              setCoverCharge(charge);
              if (assetAddr && assetAddr !== ZeroAddress) {
                  const asset = web3.getContract(assetAddr, ERC20_ABI);
                  const sym = await asset.symbol().catch(() => '???');
                  setAssetSymbol(sym);
              }
          }
      } catch (e) {
          console.error(e);
          setAccessState('RESTRICTED'); // Default fail safe
      }
  };

  const handleJoin = async () => {
      if (!web3 || !user.lauAddress) return;
      setLoading(true);
      try {
          const qing = web3.getContract(activeChannelAddr, QING_ABI);
          
          // Check allowance if needed (simplified)
          if (coverCharge > 0n) {
             const assetAddr = await qing.Asset();
             const allowance = await web3.checkAllowance(assetAddr, user.address!, activeChannelAddr);
             if (allowance < coverCharge) {
                 addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Requesting Asset Approval...` });
                 const txApprove = await web3.approve(assetAddr, activeChannelAddr);
                 await web3.waitForReceipt(txApprove);
             }
          }

          const tx = await web3.sendTransaction(qing, 'Join', [user.lauAddress]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Join Vector Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Access Granted.` });
          checkAccess();
          
          // Refresh User Location
          const lau = web3.getContract(user.lauAddress, LAU_ABI);
          const currentArea = await lau.CurrentArea();
          setUser(prev => ({ ...prev, currentArea }));

      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Join Failed: ${web3.parseError(e)}` });
      } finally {
          setLoading(false);
      }
  };

  const activeChannelName = channels.find(c => c.address === activeChannelAddr)?.name || "UNKNOWN";
  
  const filteredChannels = channels.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col md:flex-row bg-dys-black border-l-4 border-r-4 border-dys-black">
        
        {/* LEFT: CHANNEL LIST */}
        <div className="w-full md:w-64 bg-dys-panel border-r border-dys-border flex flex-col">
            <div className="p-3 border-b border-dys-border bg-black/50">
                <h3 className="text-dys-cyan font-bold tracking-widest text-xs mb-2">FREQUENCY_TUNER</h3>
                <input 
                    className="w-full bg-black border border-dys-border p-2 text-[10px] text-dys-cyan focus:border-dys-cyan outline-none font-mono"
                    placeholder="Search Channels..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button 
                    onClick={user.mapSync.isScanning ? user.mapSync.stopSync : user.mapSync.triggerSync}
                    className={`w-full mt-3 text-[9px] border py-2 font-bold transition-all flex items-center justify-center gap-2 ${user.mapSync.isScanning ? 'bg-dys-red/20 text-dys-red border-dys-red animate-pulse' : 'bg-dys-green/10 text-dys-green border-dys-green/30 hover:bg-dys-green hover:text-black'}`}
                >
                    <span className={user.mapSync.isScanning ? "animate-spin" : ""}>{user.mapSync.isScanning ? "⟳" : "📡"}</span>
                    {user.mapSync.isScanning ? `SCANNING [${user.mapSync.progress}]` : 'SCAN FREQUENCIES'}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {filteredChannels.map(c => {
                    const isActive = c.address === activeChannelAddr;
                    const isLoc = user.currentArea && user.currentArea.toLowerCase() === c.address.toLowerCase();
                    return (
                        <button 
                            key={c.address}
                            onClick={() => setActiveChannelAddr(c.address)}
                            className={`w-full text-left p-3 border-l-2 text-xs font-mono transition-all flex justify-between items-center ${
                                isActive 
                                ? 'border-dys-cyan bg-dys-cyan/10 text-white' 
                                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}
                        >
                            <div>
                                <div className="font-bold truncate w-32">{c.name}</div>
                                <div className="text-[9px] opacity-50">{c.isSystem ? 'ROOT' : c.symbol}</div>
                            </div>
                            {isLoc && <span className="text-[9px] bg-dys-green text-black px-1 font-bold">LOC</span>}
                        </button>
                    );
                })}
            </div>
        </div>

        {/* RIGHT: CHAT & ACTIONS */}
        <div className="flex-1 flex flex-col min-w-0 bg-black/50">
            {/* Header */}
            <div className="p-3 border-b border-dys-border bg-dys-panel flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-white font-bold text-sm tracking-wide">{activeChannelName}</h2>
                    <div className="text-[9px] text-gray-500 font-mono">{activeChannelAddr}</div>
                </div>
                
                {/* Access Panel */}
                <div className="flex items-center gap-4">
                    {accessState === 'RESTRICTED' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                            <div className="text-right">
                                <div className="text-[9px] text-dys-red font-bold">RESTRICTED</div>
                                <div className="text-[9px] text-gray-500">FEE: {formatUnits(coverCharge, 18)} {assetSymbol}</div>
                            </div>
                            <button 
                                onClick={handleJoin}
                                disabled={loading}
                                className="bg-dys-red/20 border border-dys-red text-dys-red hover:bg-dys-red hover:text-black px-3 py-1 text-[10px] font-bold transition-all"
                            >
                                {loading ? '...' : 'JOIN'}
                            </button>
                        </div>
                    )}
                    {accessState === 'ADMITTED' && (
                        <div className="text-[9px] text-dys-green font-bold border border-dys-green/30 bg-dys-green/5 px-2 py-1">
                            ACCESS GRANTED
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 relative overflow-hidden">
                <VoidChat 
                    web3={web3!}
                    viewAddress={activeChannelAddr}
                    lauArea={user.currentArea}
                    lauAddress={user.lauAddress}
                    addLog={addLog}
                    onViewIdentity={onViewIdentity}
                />
            </div>
        </div>

    </div>
  );
};

export default CommsDeck;
