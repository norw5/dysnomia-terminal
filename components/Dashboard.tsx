
import React, { useState, useEffect, useMemo } from 'react';
import { UserContext, LogEntry, AppView, PowerTokenData } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, LAU_ABI, ERC20_ABI, LAU_FACTORY_ABI, POWER_TOKENS, SEI_ABI, CHO_ABI, YUE_ABI, CHAN_ABI, QING_ABI } from '../constants';
import { formatUnits, parseUnits, ZeroAddress } from 'ethers';
import QingMap from './QingMap';

interface DashboardProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
  setView: (view: AppView) => void;
}

interface AssetLedgerItem {
    symbol: string;
    address: string;
    wallet: bigint;
    lau: bigint;
    yue: bigint;
    power: bigint;
    decimals: number;
    isCustom?: boolean;
}

type LocationType = 'WALLET' | 'LAU' | 'YUE';

// --- VISUAL HELPERS ---

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

const SoulSigil: React.FC<{ soulId: string, size?: number, className?: string }> = ({ soulId, size = 64, className = "" }) => {
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
        <div className={`relative ${className}`} style={{ width: size, height: size }}>
            <svg width="100%" height="100%" viewBox="0 0 5 5" shapeRendering="crispEdges" className="bg-black border border-dys-border/50">
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
            {/* Scanline overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none opacity-50"></div>
        </div>
    );
};

const CopyButton: React.FC<{ text: string, label?: string }> = ({ text, label }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button 
            onClick={handleCopy} 
            className="flex items-center gap-2 group cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition-colors"
            title="Click to Copy"
        >
            <span className={`text-[10px] font-mono ${copied ? 'text-dys-green' : 'text-gray-500 group-hover:text-dys-cyan'}`}>
                {label || (text.substring(0, 6) + '...' + text.substring(text.length - 4))}
            </span>
            <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-dys-cyan">
                {copied ? '✓' : '❐'}
            </span>
        </button>
    );
};

// --- DATA VISUALIZATION ---

const SaatRadar: React.FC<{ user: UserContext, powerMetrics: { pole: number, soul: number, aura: number } }> = ({ user, powerMetrics }) => {
    const size = 180;
    const center = size / 2;
    const radius = (size / 2) - 20;

    const getBaseVal = (val?: string) => {
        if (!val) return 0.3;
        const bn = BigInt(val);
        return Number(bn % 100n) / 100;
    };

    const pVal = Math.max(0.2, getBaseVal(user.saat?.pole));
    const sVal = Math.max(0.2, getBaseVal(user.saat?.soul));
    const aVal = Math.max(0.2, getBaseVal(user.saat?.aura));

    const dynP = Math.min(1, pVal + (powerMetrics.pole * 0.8));
    const dynS = Math.min(1, sVal + (powerMetrics.soul * 0.8));
    const dynA = Math.min(1, aVal + (powerMetrics.aura * 0.8));

    const rads = (deg: number) => (deg * Math.PI) / 180;
    const getPoint = (val: number, angle: number) => ({
        x: center + (radius * val * Math.cos(rads(angle))),
        y: center + (radius * val * Math.sin(rads(angle)))
    });

    const ptsBase = [getPoint(sVal, -90), getPoint(aVal, 30), getPoint(pVal, 150)];
    const ptsDyn = [getPoint(dynS, -90), getPoint(dynA, 30), getPoint(dynP, 150)];

    const polyBase = ptsBase.map(p => `${p.x},${p.y}`).join(' ');
    const polyDyn = ptsDyn.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <div className="relative flex flex-col items-center bg-black border border-dys-border/50 p-2">
            <svg width={size} height={size} className="overflow-visible">
                <circle cx={center} cy={center} r={radius} fill="none" stroke="#222" strokeWidth="1" strokeDasharray="4 2" />
                <circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="#222" strokeWidth="1" />
                
                <line x1={center} y1={center} x2={center} y2={center - radius} stroke="#333" />
                <line x1={center} y1={center} x2={center + radius * Math.cos(rads(30))} y2={center + radius * Math.sin(rads(30))} stroke="#333" />
                <line x1={center} y1={center} x2={center + radius * Math.cos(rads(150))} y2={center + radius * Math.sin(rads(150))} stroke="#333" />

                <polygon points={polyBase} fill="rgba(100, 100, 100, 0.2)" stroke="#666" strokeWidth="1" />
                <polygon points={polyDyn} fill="rgba(0, 240, 255, 0.1)" stroke="#00f0ff" strokeWidth="2" className="animate-pulse-fast" />
                
                <text x={center} y={center - radius - 10} textAnchor="middle" fill="#00f0ff" fontSize="9" fontWeight="bold">SOUL</text>
                <text x={center} y={center - radius - 2} textAnchor="middle" fill="#666" fontSize="8" fontFamily="monospace">{user.saat?.soul || "0"}</text>

                <text x={center + radius + 10} y={center + radius/2} textAnchor="start" fill="#ffb000" fontSize="9" fontWeight="bold">AURA</text>
                <text x={center + radius + 10} y={center + radius/2 + 10} textAnchor="start" fill="#666" fontSize="8" fontFamily="monospace">{user.saat?.aura || "0"}</text>

                <text x={center - radius - 10} y={center + radius/2} textAnchor="end" fill="#00ff41" fontSize="9" fontWeight="bold">POLE</text>
                <text x={center - radius - 10} y={center + radius/2 + 10} textAnchor="end" fill="#666" fontSize="8" fontFamily="monospace">{user.saat?.pole || "0"}</text>
            </svg>
            <div className="text-[9px] text-gray-500 mt-2 text-center w-full border-t border-gray-900 pt-1">
                Overlay: Current Power Amplification
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const Dashboard: React.FC<DashboardProps> = ({ user, setView, web3, addLog, setUser }) => {
  const [powerTokens, setPowerTokens] = useState<PowerTokenData[]>([]);
  const [ledger, setLedger] = useState<AssetLedgerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userEntropy, setUserEntropy] = useState<string>('0');
  
  // Tracked Assets (Local Storage)
  const [trackedAssets, setTrackedAssets] = useState<{symbol: string, address: string}[]>([]);

  // Interaction State
  const [transferModal, setTransferModal] = useState<{ 
      asset: AssetLedgerItem, 
      amount: string,
      source: LocationType,
      target: LocationType
  } | null>(null);
  
  const [needsChanOptIn, setNeedsChanOptIn] = useState(false);
  const [optInTarget, setOptInTarget] = useState<string>(ADDRESSES.CHAN);
  const [transferRiskAccepted, setTransferRiskAccepted] = useState(false);

  // Fabricator State
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [yueName, setYueName] = useState('');
  const [yueSymbol, setYueSymbol] = useState('');

  // Load tracked assets on mount
  useEffect(() => {
      const saved = localStorage.getItem('dys_tracked_assets');
      if (saved) {
          try { setTrackedAssets(JSON.parse(saved)); } catch {}
      }
  }, []);

  useEffect(() => {
      if(web3 && user.address) {
          fetchYuanLedger();
          if (user.lauAddress) {
              fetchAttributes(user.lauAddress);
              fetchPowerBalances();
              fetchBiologicals();
          }
      }
  }, [user.lauAddress, user.yue, web3, user.address, trackedAssets]);

  useEffect(() => {
      setTransferRiskAccepted(false);
      setNeedsChanOptIn(false);
  }, [transferModal]);

  // --- DATA FETCHING ---

  const fetchAttributes = async (lauAddr: string) => {
      if(!web3) return;
      try {
          const lau = web3.getContract(lauAddr, LAU_ABI);
          const [p, s, a, username] = await Promise.all([
              lau.Saat(0).catch(() => 0n),
              lau.Saat(1).catch(() => 0n),
              lau.Saat(2).catch(() => 0n),
              lau.Username().catch(() => null),
          ]);
          
          setUser(prev => ({
              ...prev,
              username: username || prev.username,
              saat: {
                  pole: p.toString(),
                  soul: s.toString(),
                  aura: a.toString()
              }
          }));
      } catch(e) { console.error(e); }
  };

  const fetchBiologicals = async () => {
      if(!web3 || !user.address) return;
      try {
          const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
          const userData = await cho.GetUser.staticCall();
          if(userData && userData.Entropy) {
              setUserEntropy(userData.Entropy.toString());
          }
      } catch(e) { }
  };

  const fetchPowerBalances = async () => {
      if (!web3 || !user.address) return;

      const tokens = [
          { name: 'ERIS', symbol: 'ERIS', address: POWER_TOKENS.ERIS, strategicTarget: 'YUE' },
          { name: 'FOMALHAUTE', symbol: 'FOMAL', address: POWER_TOKENS.FOMALHAUTE, strategicTarget: 'YUE' },
          { name: 'FORNAX', symbol: 'FORNAX', address: POWER_TOKENS.FORNAX, strategicTarget: 'LAU' }, 
          { name: 'TETHYS', symbol: 'TETHYS', address: POWER_TOKENS.TETHYS, strategicTarget: 'YUE' },
      ];

      const data: PowerTokenData[] = [];

      for (const t of tokens) {
          try {
              const contract = web3.getContract(t.address, ERC20_ABI);
              const [wBal, lBal, yBal] = await Promise.all([
                  contract.balanceOf(user.address).catch(() => 0n),
                  user.lauAddress ? contract.balanceOf(user.lauAddress).catch(() => 0n) : 0n,
                  user.yue ? contract.balanceOf(user.yue).catch(() => 0n) : 0n
              ]);

              data.push({
                  ...t,
                  balanceWallet: formatUnits(wBal, 18),
                  balanceLau: formatUnits(lBal, 18),
                  balanceYue: formatUnits(yBal, 18),
                  strategicTarget: t.strategicTarget as 'LAU' | 'YUE' | 'ANY'
              });
          } catch (e) { }
      }
      setPowerTokens(data);
  };

  const fetchYuanLedger = async () => {
      if (!web3 || !user.address) return;

      // 1. Static List
      const assets = [
          { s: 'WPLS', a: ADDRESSES.WPLS },
          { s: 'ATROPA', a: ADDRESSES.ATROPA },
          { s: 'AFFECTION', a: ADDRESSES.AFFECTION },
          { s: 'ERIS', a: POWER_TOKENS.ERIS },
          { s: 'FORNAX', a: POWER_TOKENS.FORNAX },
      ];

      // 2. Add Tracked Assets (Manual)
      trackedAssets.forEach(t => {
          if (!assets.find(a => a.a.toLowerCase() === t.address.toLowerCase())) {
              assets.push({ s: t.symbol, a: t.address });
          }
      });

      const items: AssetLedgerItem[] = [];

      for (const asset of assets) {
          try {
              const contract = web3.getContract(asset.a, ERC20_ABI);
              const [w, l, y, decimals] = await Promise.all([
                  contract.balanceOf(user.address).catch(() => 0n),
                  user.lauAddress ? contract.balanceOf(user.lauAddress).catch(() => 0n) : 0n,
                  user.yue ? contract.balanceOf(user.yue).catch(() => 0n) : 0n,
                  contract.decimals().catch(() => 18n)
              ]);

              // Simplified power calcs for non-native assets (0)
              const isPowerToken = Object.values(POWER_TOKENS).includes(asset.a) || asset.s === 'WPLS' || asset.s === 'ATROPA';
              const power = isPowerToken ? (w + (l * 10n) + (y * 40n)) : 0n;
              
              const isCustom = trackedAssets.some(t => t.address.toLowerCase() === asset.a.toLowerCase());

              items.push({
                  symbol: asset.s,
                  address: asset.a,
                  wallet: w,
                  lau: l,
                  yue: y,
                  power: power,
                  decimals: Number(decimals),
                  isCustom
              });
          } catch (e) {}
      }
      setLedger(items);
  };

  // --- ACTIONS ---

  const handleRemoveTracked = (address: string) => {
      const newTracked = trackedAssets.filter(a => a.address.toLowerCase() !== address.toLowerCase());
      setTrackedAssets(newTracked);
      localStorage.setItem('dys_tracked_assets', JSON.stringify(newTracked));
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: 'Asset removed from tracking.' });
  };

  const handleExecuteTransfer = async () => {
      if(!web3 || !transferModal || !user.address) return;
      setLoading(true);
      const { asset, amount, source, target } = transferModal;
      
      try {
          const parsedAmount = parseUnits(amount, asset.decimals);
          const token = web3.getContract(asset.address, ERC20_ABI);
          let tx;

          if (source === 'WALLET') {
              const destAddr = target === 'LAU' ? user.lauAddress : user.yue;
              if (!destAddr) throw new Error("Target address not found.");
              tx = await web3.sendTransaction(token, 'transfer', [destAddr, parsedAmount]);
          } else if (source === 'LAU') {
              if (target === 'WALLET') {
                  const lau = web3.getContract(user.lauAddress!, LAU_ABI);
                  tx = await web3.sendTransaction(lau, 'Withdraw', [asset.address, parsedAmount]);
              } else {
                  throw new Error("LAU assets can only be withdrawn to Wallet first.");
              }
          } else if (source === 'YUE') {
              const yue = web3.getContract(user.yue!, YUE_ABI);
              const destAddr = target === 'WALLET' ? user.address : user.lauAddress;
              if (!destAddr) throw new Error("Target address not found.");

              const origin = await yue.Origin();
              if (origin.toLowerCase() === user.address.toLowerCase()) {
                   tx = await web3.sendTransaction(yue, 'Withdraw', [asset.address, destAddr, parsedAmount]);
              } else {
                   const chan = web3.getContract(ADDRESSES.CHAN, CHAN_ABI);
                   tx = await web3.sendTransaction(chan, 'YueWithdraw', [user.yue, asset.address, destAddr, parsedAmount]);
              }
          }

          if (tx) {
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Transfer Initiated: ${tx.hash}` });
              await web3.waitForReceipt(tx);
              
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Transfer Complete.` });
              setTransferModal(null);
              setNeedsChanOptIn(false);
              fetchYuanLedger();
              fetchPowerBalances();
          }

      } catch(e: any) {
          const errMsg = web3.parseError(e);
          const errData = e.data || e.error?.data || e.transaction?.data || e.payload?.error?.data;
          
          if ((errData && typeof errData === 'string' && errData.includes('0be6bab5')) || errMsg.includes('PlayerMustOptIn')) {
              if (source === 'YUE' && user.address) {
                  setOptInTarget(user.address);
              } else {
                  try {
                      const normalized = errData.startsWith('0x') ? errData.slice(2) : errData;
                      const idx = normalized.indexOf('0be6bab5');
                      if (idx !== -1 && normalized.length >= idx + 136 + 64) {
                          const contractHex = normalized.substr(idx + 136, 64);
                          const targetAddr = "0x" + contractHex.slice(24);
                          setOptInTarget(targetAddr);
                      } else {
                          setOptInTarget(ADDRESSES.CHAN);
                      }
                  } catch (parseError) {
                      setOptInTarget(ADDRESSES.CHAN);
                  }
              }
              setNeedsChanOptIn(true);
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transfer Halted: Authorization Required.` });
          } else {
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transfer Failed`, details: errMsg });
          }
      } finally {
          setLoading(false);
      }
  };

  const handleChanOptIn = async () => {
      if (!web3) return;
      setLoading(true);
      try {
          const chan = web3.getContract(ADDRESSES.CHAN, CHAN_ABI);
          const tx = await web3.sendTransaction(chan, 'OptIn', [optInTarget, true]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Authorizing: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Channel Authorized.` });
          setNeedsChanOptIn(false);
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Auth Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const createIdentity = async () => {
    if(!web3) return;
    setLoading(true);
    try {
        const factory = web3.getContract(ADDRESSES.LAU_FACTORY, LAU_FACTORY_ABI);
        const tx = await web3.sendTransaction(factory, 'New', [newName || "Pilot", newSymbol || "PLT"]);
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Fabrication Started: ${tx.hash}` });
        await web3.waitForReceipt(tx);
        window.location.reload(); 
    } catch(e: any) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Birth Failed: ${e.message}` });
        setLoading(false);
    }
  };

  const createVault = async () => {
      if(!web3 || !user.lauAddress) return;
      setLoading(true);
      try {
          const sei = web3.getContract(ADDRESSES.SEI, SEI_ABI);
          const tx = await web3.sendTransaction(sei, 'Start', [user.lauAddress, yueName || "Vault", yueSymbol || "VLT"]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Vault Fabrication: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          window.location.reload();
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Vault Failed: ${e.message}` });
          setLoading(false);
      }
  };

  const powerMetrics = useMemo(() => {
      const getScore = (name: string) => {
          const t = powerTokens.find(p => p.name === name);
          if (!t) return 0;
          const w = parseFloat(t.balanceWallet);
          const l = parseFloat(t.balanceLau) * 10;
          const y = parseFloat(t.balanceYue) * 40;
          return Math.min(1, (w + l + y) / 1000);
      };
      return {
          pole: getScore('FORNAX'),
          soul: getScore('ERIS'),
          aura: getScore('FOMALHAUTE')
      };
  }, [powerTokens]);

  const getShipAscii = () => {
    return `
      /|
     / |
    /  |  [ ATROPA ]
   /___|
  (_____)  STATUS: OK
   \\   /   
    \\ /    
     V
    `;
  };

  const renderIdentityColumn = () => (
      <div className="lg:col-span-3 bg-dys-panel border border-dys-border flex flex-col p-4 gap-4 h-full">
          <div className="text-xs text-dys-cyan font-bold tracking-widest border-b border-dys-cyan/30 pb-2">
              SOVEREIGN_PASSPORT
          </div>
          
          {!user.lauAddress ? (
              <div className="flex-1 flex flex-col gap-4">
                  <div className="p-4 border border-dys-red bg-dys-red/5 text-center">
                      <h3 className="text-dys-red font-bold text-sm animate-pulse">IDENTITY REQUIRED</h3>
                      <p className="text-[10px] text-gray-500 mt-2">
                          Access to command functions requires a Soul Shell (LAU).
                      </p>
                  </div>
                  <div className="space-y-4 pt-4 border-t border-dys-border">
                       <input 
                          className="w-full bg-black border border-dys-red/50 p-2 text-xs text-dys-red focus:outline-none text-center"
                          placeholder="CALLSIGN (e.g. NEO)"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                      />
                      <input 
                          className="w-full bg-black border border-dys-red/50 p-2 text-xs text-dys-red focus:outline-none text-center"
                          placeholder="SYMBOL (e.g. ONE)"
                          value={newSymbol}
                          onChange={(e) => setNewSymbol(e.target.value)}
                      />
                      <button 
                          onClick={createIdentity}
                          disabled={loading}
                          className="w-full bg-dys-red hover:bg-white text-black font-bold py-3 text-xs tracking-widest transition-all"
                      >
                          {loading ? 'FABRICATING...' : 'INITIATE GENESIS'}
                      </button>
                  </div>
              </div>
          ) : !user.yue ? (
              <div className="flex-1 flex flex-col gap-4">
                  <SoulSigil soulId={user.saat?.soul || "0"} size={80} className="mx-auto border-2 border-dys-gold" />
                  <div className="text-center">
                      <h2 className="text-white font-bold tracking-wider">{user.username}</h2>
                      <div className="text-[9px] text-dys-gold mt-1">SOUL: {user.saat?.soul}</div>
                  </div>
                  
                  <div className="p-4 border border-dys-gold bg-dys-gold/5 text-center mt-4">
                      <h3 className="text-dys-gold font-bold text-sm">VAULT REQUIRED</h3>
                      <p className="text-[10px] text-gray-500 mt-2">
                          Initialize YUE Bridge to enable power banking.
                      </p>
                  </div>
                  <div className="space-y-2">
                       <input 
                          className="w-full bg-black border border-dys-gold/50 p-2 text-xs text-dys-gold focus:outline-none text-center"
                          placeholder="VAULT NAME"
                          value={yueName}
                          onChange={(e) => setYueName(e.target.value)}
                      />
                      <button 
                          onClick={createVault}
                          disabled={loading}
                          className="w-full bg-dys-gold hover:bg-white text-black font-bold py-3 text-xs tracking-widest transition-all"
                      >
                          {loading ? '...' : 'INITIALIZE YUE'}
                      </button>
                  </div>
              </div>
          ) : (
              <>
                  <div className="flex flex-col items-center py-4 relative">
                        <SoulSigil soulId={user.saat?.soul || "0"} size={140} className="border-4 border-dys-cyan/20" />
                        <h2 className="text-2xl text-white font-bold mt-4 tracking-wider">{user.username || "UNKNOWN"}</h2>
                        
                        <div className="w-full mt-4 space-y-2 border-t border-gray-800 pt-4">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-bold">SOUL (LAU)</span>
                                <CopyButton text={user.lauAddress || ""} />
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-bold">VAULT (YUE)</span>
                                <CopyButton text={user.yue} />
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-bold">PILOT</span>
                                <CopyButton text={user.address || ""} />
                            </div>
                        </div>
                  </div>

                  <div className="border-t border-dys-border pt-4">
                        <h3 className="text-[10px] text-dys-gold font-bold mb-2 uppercase text-center">SAAT Matrix</h3>
                        <SaatRadar user={user} powerMetrics={powerMetrics} />
                  </div>
              </>
          )}

          {user.lauAddress && (
              <div className="mt-auto border border-dys-green/20 bg-dys-green/5 p-3">
                  <div className="text-[10px] text-dys-green font-bold tracking-widest mb-2 flex justify-between">
                      <span>BIOLOGICALS</span>
                      <span className="animate-pulse">●</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                          <div className="text-gray-500">ENTROPY</div>
                          <div className="font-mono text-white">{userEntropy}</div>
                      </div>
                      <div>
                          <div className="text-gray-500">PULSE</div>
                          <div className="font-mono text-dys-green">NORMAL</div>
                      </div>
                      <div className="col-span-2">
                          <div className="text-gray-500">REACTION_STATE</div>
                          <div className="font-mono text-dys-gold">STABLE</div>
                      </div>
                  </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="h-full w-full bg-dys-black p-4 overflow-y-auto font-mono text-gray-300 relative">
        {transferModal && (
            <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
                <div className="bg-dys-panel border border-dys-gold p-6 w-full max-w-md shadow-[0_0_30px_rgba(255,176,0,0.2)]">
                    <h3 className="text-dys-gold font-bold text-lg mb-4 tracking-widest">MATTER TRANSFER // {transferModal.asset.symbol}</h3>
                    {/* ... (Modal content same as before) ... */}
                    <div className="mb-6 space-y-4">
                        {/* ... (Source/Target Selectors same as before) ... */}
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <label className="text-[9px] text-gray-500 block mb-1">SOURCE</label>
                                <select 
                                    className="w-full bg-black border border-dys-border p-2 text-xs text-white"
                                    value={transferModal.source}
                                    onChange={(e) => {
                                        setTransferModal({...transferModal, source: e.target.value as LocationType});
                                        setNeedsChanOptIn(false);
                                    }}
                                >
                                    <option value="WALLET">WALLET</option>
                                    <option value="LAU" disabled={!user.lauAddress}>LAU (Identity)</option>
                                    <option value="YUE" disabled={!user.yue}>YUE (Vault)</option>
                                </select>
                            </div>
                            <div className="flex flex-col justify-end pb-1">
                                <button 
                                    onClick={() => {
                                        setTransferModal(prev => prev ? ({...prev, source: prev.target, target: prev.source}) : null);
                                        setNeedsChanOptIn(false);
                                    }}
                                    className="bg-dys-black border border-dys-border hover:border-dys-gold text-dys-gold rounded w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors"
                                    title="Swap Direction"
                                >
                                    ⇄
                                </button>
                            </div>
                            <div className="flex-1">
                                <label className="text-[9px] text-gray-500 block mb-1">TARGET</label>
                                <select 
                                    className="w-full bg-black border border-dys-border p-2 text-xs text-white"
                                    value={transferModal.target}
                                    onChange={(e) => setTransferModal({...transferModal, target: e.target.value as LocationType})}
                                >
                                    <option value="WALLET">WALLET</option>
                                    <option value="LAU" disabled={!user.lauAddress}>LAU (Identity)</option>
                                    <option value="YUE" disabled={!user.yue}>YUE (Vault)</option>
                                </select>
                            </div>
                        </div>

                        {transferModal.target === 'YUE' && (
                            <div className="bg-dys-red/10 border border-dys-red p-3 text-[10px] text-dys-red">
                                <strong className="block mb-1 text-xs">⚠️ CRITICAL WARNING</strong>
                                Funds sent to YUE are strictly controlled. Only specific Game Tokens (e.g. H2O, VITUS) implementing the Mint interface can be withdrawn.
                                <br/><br/>
                                <strong>STANDARD ASSETS (WPLS, ATROPA, ETC.) SENT HERE CANNOT BE WITHDRAWN AND MAY BE PERMANENTLY LOCKED/LOST.</strong>
                                <br/><br/>
                                <label className="flex items-center gap-2 mt-2 cursor-pointer text-white">
                                    <input 
                                        type="checkbox" 
                                        checked={transferRiskAccepted}
                                        onChange={(e) => setTransferRiskAccepted(e.target.checked)}
                                        className="accent-dys-red"
                                    />
                                    <span>I understand this transfer is irreversible for non-game tokens.</span>
                                </label>
                            </div>
                        )}
                        
                        {/* ... (Rest of modal content) ... */}

                        <div className="flex justify-between text-xs text-gray-500">
                            <span>AVAILABLE:</span>
                            <span className="text-white">
                                {formatUnits(
                                    transferModal.source === 'WALLET' ? transferModal.asset.wallet :
                                    transferModal.source === 'LAU' ? transferModal.asset.lau :
                                    transferModal.asset.yue, 
                                    transferModal.asset.decimals
                                )}
                            </span>
                        </div>
                        
                        <input 
                            className="w-full bg-black border border-dys-gold/50 p-3 text-white text-right font-mono focus:border-dys-gold outline-none"
                            value={transferModal.amount}
                            onChange={(e) => setTransferModal({...transferModal, amount: e.target.value})}
                            placeholder="0.0"
                        />
                        
                        <div className="flex gap-2">
                            {[25, 50, 75, 100].map(pct => (
                                <button 
                                    key={pct}
                                    onClick={() => {
                                        const bal = transferModal.source === 'WALLET' ? transferModal.asset.wallet :
                                                    transferModal.source === 'LAU' ? transferModal.asset.lau :
                                                    transferModal.asset.yue;
                                        const val = (bal * BigInt(pct)) / 100n;
                                        setTransferModal({...transferModal, amount: formatUnits(val, transferModal.asset.decimals)})
                                    }}
                                    className="flex-1 bg-dys-gold/10 hover:bg-dys-gold/30 text-dys-gold text-[10px] py-1"
                                >
                                    {pct === 100 ? 'MAX' : `${pct}%`}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-4">
                            <button 
                                onClick={() => { setTransferModal(null); setNeedsChanOptIn(false); setLoading(false); }}
                                className="flex-1 border border-gray-600 text-gray-400 hover:text-white py-3 font-bold text-xs"
                            >
                                CANCEL
                            </button>
                            {needsChanOptIn ? (
                                <button 
                                    onClick={handleChanOptIn}
                                    disabled={loading}
                                    className="flex-1 bg-dys-red text-black hover:bg-white font-bold py-3 text-xs tracking-widest animate-pulse"
                                >
                                    {loading ? 'AUTHORIZING...' : 'AUTHORIZE CHANNEL'}
                                </button>
                            ) : (
                                <button 
                                    onClick={handleExecuteTransfer}
                                    disabled={
                                        loading || 
                                        (transferModal.source === 'LAU' && transferModal.target === 'YUE') || 
                                        (transferModal.source === transferModal.target) ||
                                        (transferModal.target === 'YUE' && !transferRiskAccepted)
                                    }
                                    className="flex-1 bg-dys-gold text-black hover:bg-white font-bold py-3 text-xs tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'EXECUTING...' : 'CONFIRM TRANSFER'}
                                </button>
                            )}
                        </div>
                        {loading && (
                            <button onClick={() => setLoading(false)} className="text-[9px] text-dys-red hover:text-white uppercase font-bold mt-2">
                                [ FORCE RESET UI ]
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-[600px]">
            
            {renderIdentityColumn()}

            {/* CENTER: OPERATIONS (6/12) */}
            <div className="lg:col-span-6 flex flex-col gap-4">
                
                {/* POWER RACK */}
                <div className="bg-black border border-dys-gold/30 p-4 relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 right-0 bg-dys-gold/20 text-dys-gold text-[9px] font-bold px-2 py-1">
                        POWER_RACK // YEO: {powerMetrics.pole > 0.1 ? "EXPANDED" : "BASE"}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mt-6">
                        {powerTokens.map((pt, idx) => {
                            const onTarget = (pt.strategicTarget === 'LAU' && parseFloat(pt.balanceLau) > 0) ||
                                             (pt.strategicTarget === 'YUE' && parseFloat(pt.balanceYue) > 0);
                            
                            return (
                                <div key={idx} className={`border p-2 relative group ${onTarget ? 'border-dys-green/30 bg-dys-green/5' : 'border-dys-red/30 bg-dys-red/5'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`font-bold text-xs ${onTarget ? 'text-dys-green' : 'text-dys-red'}`}>{pt.name}</span>
                                        <span className="text-[8px] text-gray-500">OPT: {pt.strategicTarget}</span>
                                    </div>
                                    <div className="text-[9px] space-y-0.5 font-mono text-gray-400">
                                        <div className="flex justify-between">
                                            <span>W: {parseFloat(pt.balanceWallet).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>L: {parseFloat(pt.balanceLau).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Y: {parseFloat(pt.balanceYue).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* YUAN LEDGER */}
                <div className="flex-1 bg-dys-panel border border-dys-border p-4 flex flex-col min-h-[300px]">
                    <div className="flex justify-between items-center mb-3">
                         <span className="text-xs text-purple-400 font-bold tracking-widest">YUAN_LEDGER</span>
                         <span className="text-[9px] text-gray-500">POWER = W(1x) + L(10x) + Y(40x)</span>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[10px]">
                            <thead>
                                <tr className="text-gray-500 border-b border-gray-800">
                                    <th className="pb-2 pl-2">ASSET</th>
                                    <th className="pb-2 text-right">WALLET</th>
                                    <th className="pb-2 text-right">LAU</th>
                                    <th className="pb-2 text-right">YUE</th>
                                    <th className="pb-2 text-right text-purple-400 pl-8 pr-8">TOTAL PWR</th>
                                    <th className="pb-2 text-right">ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledger.map((item, i) => {
                                    const maxPwr = 1000000n * (10n ** BigInt(item.decimals)); 
                                    const pwrPct = Number((item.power * 100n) / maxPwr);
                                    
                                    return (
                                        <tr key={i} className={`border-b border-gray-800/50 hover:bg-white/5 transition-colors group ${item.isCustom ? 'bg-dys-cyan/5' : ''}`}>
                                            <td className="py-3 pl-2 font-bold text-dys-cyan flex items-center gap-1">
                                                {item.symbol}
                                                <CopyButton text={item.address} label=" " />
                                                {item.isCustom && (
                                                    <button 
                                                        onClick={() => handleRemoveTracked(item.address)}
                                                        className="ml-1 text-[8px] text-red-500 hover:text-white px-1 border border-transparent hover:border-red-500"
                                                        title="Remove from Tracker"
                                                    >
                                                        X
                                                    </button>
                                                )}
                                            </td>
                                            {/* CORRECTED DECIMAL FORMATTING HERE */}
                                            <td className="py-3 text-right font-mono text-gray-300">{parseFloat(formatUnits(item.wallet, item.decimals)).toFixed(4)}</td>
                                            <td className="py-3 text-right font-mono text-gray-500">{parseFloat(formatUnits(item.lau, item.decimals)).toFixed(4)}</td>
                                            <td className="py-3 text-right font-mono text-dys-gold">{parseFloat(formatUnits(item.yue, item.decimals)).toFixed(4)}</td>
                                            <td className="py-3 text-right font-bold text-purple-400 relative w-24 pl-8 pr-8">
                                                <div className="absolute inset-0 bg-purple-900/20 top-2 bottom-2 left-8 right-8">
                                                    <div className="h-full bg-purple-500/40" style={{ width: `${Math.min(100, pwrPct)}%` }}></div>
                                                </div>
                                                <span className="relative z-10">{parseFloat(formatUnits(item.power, item.decimals)).toFixed(2)}</span>
                                            </td>
                                            <td className="py-3 text-right">
                                                <button 
                                                    onClick={() => setTransferModal({ 
                                                        asset: item, 
                                                        amount: formatUnits(item.wallet, item.decimals),
                                                        source: 'WALLET',
                                                        target: 'YUE'
                                                    })}
                                                    className="bg-dys-green/10 hover:bg-dys-green hover:text-black text-dys-green border border-dys-green/30 px-2 py-1 text-[9px] font-bold transition-all"
                                                >
                                                    TRANSFER
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {ledger.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-10 italic text-gray-600">Scanning Assets...</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            {/* RIGHT: SHIP & MAP (3/12) */}
            <div className="lg:col-span-3 flex flex-col gap-4">
                 {/* ASCII SHIP */}
                 <div className="bg-black border border-dys-border p-4 flex items-center justify-center min-h-[160px] relative overflow-hidden">
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                      <pre className="text-[9px] text-dys-gold font-bold whitespace-pre leading-none z-10">
                          {getShipAscii()}
                      </pre>
                 </div>

                 {/* MINI MAP */}
                 <div className="flex-1 border border-dys-cyan/30 relative min-h-[180px] max-h-[300px] group bg-black">
                      <div className="absolute top-0 left-0 bg-black/80 text-dys-cyan text-[9px] px-2 py-1 z-10 border-b border-r border-dys-cyan/30 font-bold">
                          SECTOR_SCAN
                      </div>
                      
                      <div className="w-full h-full opacity-60 group-hover:opacity-100 transition-opacity">
                           <QingMap 
                                web3={web3} 
                                addLog={() => {}} 
                                onSelectSector={(addr) => {
                                    sessionStorage.setItem('dys_selected_sector', addr);
                                    setView(AppView.NAVIGATION);
                                }} 
                                viewOnly={true} 
                           />
                      </div>
                      
                      {/* Click overlay */}
                      <button 
                        onClick={() => setView(AppView.NAVIGATION)}
                        className="absolute inset-0 z-20 cursor-pointer" 
                        title="Open Full Navigation"
                      />
                 </div>
            </div>
        </div>
    </div>
  );
};

export default Dashboard;
