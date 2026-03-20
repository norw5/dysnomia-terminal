
import React, { useState, useEffect, useCallback } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, QING_ABI, LAU_ABI, ERC20_ABI, CHO_ABI } from '../constants';
import { Persistence, SectorData } from '../services/persistenceService';
import { CryptoService } from '../services/cryptoService';
import VoidChat from './VoidChat';
import SecureChat from './SecureChat';
import KeyManager from './KeyManager';
import { ZeroAddress, formatUnits } from 'ethers';
import { Contact } from '../types';
import SoulSigil from './SoulSigil';

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
  const [activeContactId, setActiveContactId] = useState<string>(() => {
      return sessionStorage.getItem('dys_selected_contact') || '';
  });
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'CHANNELS' | 'CONTACTS'>('CHANNELS');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContactId, setNewContactId] = useState('');
  const [selectedSidebarUser, setSelectedSidebarUser] = useState<string | null>(null);
  
  // Extended User Info State
  const [sidebarUserInfo, setSidebarUserInfo] = useState<{
      wallet: string;
      lau: string;
      aura: string;
      pole: string;
      username: string;
      loading: boolean;
  } | null>(null);
  
  // Access Control State
  const [accessState, setAccessState] = useState<'LOADING' | 'ADMITTED' | 'RESTRICTED' | 'VOID' | 'SECURE'>('LOADING');
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
  }, [user.mapSync.lastUpdate, user.mapSync.isScanning]);

  // Load Contacts separately — only on mount
  useEffect(() => {
      const loadContacts = async () => {
          const storedContacts = await Persistence.getAllContacts();
          setContacts(storedContacts);
      };
      loadContacts();
  }, []);

  // Check Access when channel changes
  useEffect(() => {
      if (activeTab === 'CONTACTS') {
          if (activeContactId) {
              setAccessState('SECURE');
              sessionStorage.setItem('dys_selected_contact', activeContactId);

              // Check if user has ANY cryptographic keys. If not, auto-open Key Manager.
              const mySoul = user.saat?.soul;
              if (mySoul) {
                  const hasPGP = CryptoService.hasPGPPrivateKey(mySoul);
                  const hasECDH = CryptoService.hasPrivateKey(mySoul);
                  if (!hasPGP && !hasECDH) {
                      setShowKeyManager(true);
                  }
              }
          }
          return;
      }

      if (activeChannelAddr === ADDRESSES.VOID) {
          setAccessState('VOID');
          sessionStorage.setItem('dys_selected_sector', ADDRESSES.VOID);
          return;
      }
      
      sessionStorage.setItem('dys_selected_sector', activeChannelAddr);
      checkAccess();
  }, [activeChannelAddr, activeContactId, activeTab, user.lauAddress, web3]);

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

  const activeChannelName = activeAccessIsSecure() ? contacts.find(c => c.soulId === activeContactId)?.username || "CONTACT" : channels.find(c => c.address === activeChannelAddr)?.name || "UNKNOWN";
  
  function activeAccessIsSecure() {
      return activeTab === 'CONTACTS' && !!activeContactId;
  }

  const handleAddContact = async (overrideId?: string) => {
      const targetId = overrideId || newContactId;
      if (!web3 || !targetId) return;
      setLoading(true);
      try {
          // Resolve soul ID
          const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
          const soulBigInt = BigInt(targetId);
          const wallet = await cho.GetAddressBySoul(soulBigInt).catch(() => ZeroAddress);
          
          if (wallet && wallet !== ZeroAddress) {
              const lauAddr = await cho.GetUserTokenAddress(wallet).catch(() => ZeroAddress);
              if (lauAddr && lauAddr !== ZeroAddress) {
                  const lauContract = web3.getContract(lauAddr, LAU_ABI);
                  const username = await lauContract.Username().catch(() => "UNKNOWN");
                  const newContact: Contact = {
                      address: lauAddr,
                      soulId: targetId,
                      username: username
                  };
                  await Persistence.saveContact(newContact);
                  setContacts(prev => [...prev.filter(c => c.soulId !== targetId), newContact]);
                  if (!overrideId) setNewContactId('');
                  addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Contact Added: ${username}` });
              } else {
                  addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Contact Failed: No LAU found.` });
              }
          } else {
             addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Contact Failed: Soul not found.` });
          }
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Add Contact Error: ${e.message}` });
      } finally {
          setLoading(false);
      }
  };

  const filteredChannels = channels.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewIdentityLocal = useCallback((id: string) => {
      console.log("test")
      setSelectedSidebarUser(id);
  }, []);

  useEffect(() => {
      if (!selectedSidebarUser || !web3) {
          setSidebarUserInfo(null);
          return;
      }
      
      let isMounted = true;
      const fetchInfo = async () => {
          setSidebarUserInfo({ wallet: 'TBD', lau: 'TBD', aura: '...', pole: '...', username: '...', loading: true });
          try {
              const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
              const wallet = await cho.GetAddressBySoul(BigInt(selectedSidebarUser)).catch(() => ZeroAddress);
              let lau = ZeroAddress;
              let aura = 'UNKNOWN';
              let pole = 'UNKNOWN';
              let username = 'UNKNOWN SOUL';
              
              if (wallet && wallet !== ZeroAddress) {
                  lau = await cho.GetUserTokenAddress(wallet).catch(() => ZeroAddress);
                  if (lau && lau !== ZeroAddress) {
                      const lauContract = web3.getContract(lau, LAU_ABI);
                      // Saat(1) is Aura, Saat(2) is Pole
                      const [auraVal, poleVal, fetchedUsername] = await Promise.all([
                          lauContract.Saat(1).catch(() => 0n),
                          lauContract.Saat(2).catch(() => 0n),
                          lauContract.Username().catch(() => "UNKNOWN SOUL")
                      ]);
                      aura = auraVal.toString();
                      pole = poleVal.toString();
                      username = fetchedUsername;
                  }
              }
              
              if (isMounted) {
                  setSidebarUserInfo({
                      wallet,
                      lau,
                      aura,
                      pole,
                      username,
                      loading: false
                  });
              }
          } catch (e) {
              if (isMounted) setSidebarUserInfo(prev => prev ? { ...prev, loading: false } : null);
          }
      };
      fetchInfo();

      return () => { isMounted = false; };
  }, [selectedSidebarUser, web3]);

  return (
    <div className="h-full flex flex-col md:flex-row bg-dys-black border-l-4 border-r-4 border-dys-black">
        
        {/* LEFT: CHANNEL LIST */}
        <div className="w-full md:w-64 bg-dys-panel border-r border-dys-border flex flex-col">
            <div className="p-3 border-b border-dys-border bg-black/50">
                <div className="flex w-full mb-3 border border-dys-border">
                    <button 
                        onClick={() => { setActiveTab('CHANNELS'); setActiveContactId(''); }}
                        className={`flex-1 py-1 text-[10px] font-bold ${activeTab === 'CHANNELS' ? 'bg-dys-cyan text-black' : 'text-gray-500 hover:text-white'}`}
                    >
                        CHANNELS
                    </button>
                    <button 
                        onClick={() => { setActiveTab('CONTACTS'); }}
                        className={`flex-1 py-1 text-[10px] font-bold ${activeTab === 'CONTACTS' ? 'bg-dys-green text-black' : 'text-gray-500 hover:text-white'}`}
                    >
                        SECURE_DMS
                    </button>
                </div>
                <h3 className="text-dys-cyan font-bold tracking-widest text-xs mb-2">FREQUENCY_TUNER</h3>
                <input 
                    className="w-full bg-black border border-dys-border p-2 text-[10px] text-dys-cyan focus:border-dys-cyan outline-none font-mono"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                
                {activeTab === 'CHANNELS' ? (
                    <button 
                        onClick={user.mapSync.isScanning ? user.mapSync.stopSync : user.mapSync.triggerSync}
                        className={`w-full mt-3 text-[9px] border py-2 font-bold transition-all flex items-center justify-center gap-2 ${user.mapSync.isScanning ? 'bg-dys-red/20 text-dys-red border-dys-red animate-pulse' : 'bg-dys-green/10 text-dys-green border-dys-green/30 hover:bg-dys-green hover:text-black'}`}
                    >
                        <span className={user.mapSync.isScanning ? "animate-spin" : ""}>{user.mapSync.isScanning ? "⟳" : "📡"}</span>
                        {user.mapSync.isScanning ? `SCANNING [${user.mapSync.progress}]` : 'SCAN FREQUENCIES'}
                    </button>
                ) : (
                    <div className="mt-3 flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Soul ID..."
                                className="w-full bg-black border border-dys-border p-1 text-[10px] text-dys-green outline-none font-mono"
                                value={newContactId}
                                onChange={e => setNewContactId(e.target.value)}
                            />
                            <button onClick={handleAddContact} disabled={loading || !newContactId} className="bg-dys-green/20 text-dys-green hover:bg-dys-green hover:text-black px-2 py-1 text-[10px] font-bold border border-dys-green transition-colors">ADD</button>
                        </div>
                        <button 
                            onClick={() => setShowKeyManager(true)} 
                            className={`w-full py-1 text-[10px] font-bold border transition-colors ${showKeyManager ? 'bg-dys-cyan text-black border-dys-cyan' : 'border-dys-cyan/50 text-dys-cyan hover:bg-dys-cyan hover:text-black'}`}
                        >
                            KEY MANAGER
                        </button>
                    </div>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {activeTab === 'CHANNELS' ? filteredChannels.map(c => {
                    const isActive = c.address === activeChannelAddr;
                    const isLoc = user.currentArea && user.currentArea.toLowerCase() === c.address.toLowerCase();
                    return (
                        <button
                            key={c.address}
                            onClick={() => { setActiveChannelAddr(c.address); setShowKeyManager(false); }}
                            className={`w-full text-left p-3 border-l-2 text-xs font-mono transition-all flex justify-between items-center ${
                                isActive && !showKeyManager                                ? 'border-dys-cyan bg-dys-cyan/10 text-white' 
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
                }) : contacts.filter(c => c.username.toLowerCase().includes(searchQuery.toLowerCase()) || c.soulId.includes(searchQuery)).map(c => {
                    const isActive = c.soulId === activeContactId;
                    return (
                        <button
                            key={c.soulId}
                            onClick={() => { setActiveContactId(c.soulId); setShowKeyManager(false); }}
                            className={`w-full text-left p-3 border-l-2 text-xs font-mono transition-all flex justify-between items-center ${
                                isActive && !showKeyManager                                ? 'border-dys-green bg-dys-green/10 text-white' 
                                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}
                        >
                            <div>
                                <div className="font-bold truncate w-32">{c.username}</div>
                                <div className="text-[9px] opacity-50">SOUL: {c.soulId}</div>
                            </div>
                            <span className="text-[9px] bg-dys-green/20 text-dys-green border border-dys-green/50 px-1">SECURE</span>
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
                    <div className="text-[9px] text-gray-500 font-mono">{activeAccessIsSecure() ? activeContactId : activeChannelAddr}</div>
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
                    {accessState === 'SECURE' && (
                        <div className="text-[9px] text-dys-green font-bold border border-dys-green/30 bg-dys-green/5 px-2 py-1">
                            ENCRYPTED_P2P
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 relative overflow-hidden flex">
                <div className="flex-1 relative">
                    {showKeyManager ? (
                        <KeyManager
                            web3={web3!}
                            user={user}
                            addLog={addLog}
                            onClose={() => setShowKeyManager(false)}
                        />
                    ) : activeAccessIsSecure() ? (() => {
                            const activeContact = contacts.find(c => c.soulId === activeContactId);
                            return (
                                <SecureChat 
                                    key={`secure-${activeContactId}`}
                                    web3={web3!}
                                    recipientSoulId={activeContactId}
                                    recipientLauAddress={activeContact?.address || ''}
                                    user={user}
                                    addLog={addLog}
                                    onViewIdentity={handleViewIdentityLocal}
                                />
                            );
                        })() : (
                        <VoidChat 
                            key={`void-${activeChannelAddr}`}
                            web3={web3!}
                            viewAddress={activeChannelAddr}
                            lauArea={user.currentArea}
                            lauAddress={user.lauAddress}
                            user={user}
                            addLog={addLog}
                            onViewIdentity={handleViewIdentityLocal}
                        />
                    )}
                </div>

                {/* Inline User Sidebar - Now Absolute to prevent layout shifting and overlap issues */}
                {selectedSidebarUser && (
                    <div className="absolute right-0 top-0 bottom-0 w-64 bg-dys-panel border-l border-dys-border flex flex-col z-50 animate-fade-in shadow-2xl">
                        <div className="p-4 border-b border-dys-border flex justify-between items-center bg-black/50">
                            <div className="font-bold text-dys-cyan text-[10px] tracking-widest">USER_PROFILE</div>
                            <button onClick={() => setSelectedSidebarUser(null)} className="text-gray-500 hover:text-white transition-colors">✕</button>
                        </div>
                        <div className="p-6 flex flex-col items-center gap-4 flex-1 overflow-y-auto scrollbar-thin">
                            <SoulSigil soulId={selectedSidebarUser} size={80} className="rounded-sm shadow-[0_0_15px_rgba(0,255,255,0.2)]" />
                            <div className="text-center w-full">
                                <div className="font-bold text-white tracking-wider font-mono text-lg mb-4 truncate px-2">
                                    {contacts.find(c => c.soulId === selectedSidebarUser)?.username || (sidebarUserInfo?.loading ? "REFRESHING..." : sidebarUserInfo?.username || "UNKNOWN SOUL")}
                                </div>
                                
                                {/* Info Grid */}
                                <div className="flex flex-col gap-3 w-full text-left bg-black/30 p-3 border border-dys-border/50 rounded-sm overflow-hidden">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[8px] text-dys-cyan tracking-widest font-bold">SOUL_ID</span>
                                            <span className="font-mono text-xs text-gray-300 truncate">{selectedSidebarUser}</span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[8px] text-dys-cyan tracking-widest font-bold">AURA_SIG</span>
                                            <span className="font-mono text-xs text-gray-300 break-all">{sidebarUserInfo?.loading ? '...' : sidebarUserInfo?.aura}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[8px] text-dys-cyan tracking-widest font-bold">POLE_POS</span>
                                        <span className="font-mono text-xs text-gray-300 truncate">{sidebarUserInfo?.loading ? '...' : sidebarUserInfo?.pole}</span>
                                    </div>
                                    <div className="flex flex-col mt-1">
                                        <span className="text-[8px] text-dys-gold tracking-widest font-bold">LAU_TOKEN</span>
                                        <span className="font-mono text-[9px] text-gray-400 break-all">{sidebarUserInfo?.loading ? '...' : sidebarUserInfo?.lau}</span>
                                    </div>
                                    <div className="flex flex-col mt-1">
                                        <span className="text-[8px] text-dys-gold tracking-widest font-bold">WALLET_ADDR</span>
                                        <span className="font-mono text-[9px] text-gray-400 break-all">{sidebarUserInfo?.loading ? '...' : sidebarUserInfo?.wallet}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="w-full h-px bg-dys-border my-2"></div>
                            
                            <div className="flex flex-col gap-3 w-full mt-auto">
                                {!contacts.find(c => c.soulId === selectedSidebarUser) && (
                                    <button 
                                       onClick={() => {
                                           handleAddContact(selectedSidebarUser);
                                       }} 
                                       disabled={loading}
                                       className="w-full bg-dys-green/10 text-dys-green border border-dys-green/50 py-2 text-[10px] font-bold hover:bg-dys-green hover:text-black transition-colors disabled:opacity-50"
                                    >
                                        {loading ? "..." : "ADD TO CONTACTS"}
                                    </button>
                                )}
                                <button 
                                   onClick={() => {
                                       setActiveTab('CONTACTS');
                                       setActiveContactId(selectedSidebarUser);
                                   }} 
                                   className="w-full bg-dys-cyan/10 text-dys-cyan border border-dys-cyan/50 py-2 text-[10px] font-bold hover:bg-dys-cyan hover:text-black transition-colors"
                                >
                                    SECURE DIRECT MESSAGE
                                </button>
                                <button 
                                   onClick={() => onViewIdentity && onViewIdentity(selectedSidebarUser)} 
                                   className="w-full border border-gray-700 text-gray-400 py-2 text-[10px] font-bold hover:bg-white hover:text-black transition-colors"
                                >
                                    VIEW IN LAU REGISTRY
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

    </div>
  );
};

export default CommsDeck;
