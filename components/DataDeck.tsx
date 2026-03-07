
import React, { useState, useRef, useEffect } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES } from '../constants';
import { Persistence, ChannelMeta, ExportMode } from '../services/persistenceService';

interface DataDeckProps {
  web3: Web3Service | null;
  user: UserContext;
  addLog: (entry: LogEntry) => void;
}

const DataDeck: React.FC<DataDeckProps> = ({ web3, user, addLog }) => {
  const [mapMeta, setMapMeta] = useState<ChannelMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      // Load map meta for topology viz
      Persistence.getChannelMeta(ADDRESSES.MAP).then(setMapMeta);
  }, [user.mapSync.isScanning]); // Refresh when sync updates

  const handleExport = async (mode: ExportMode) => {
      try {
          const json = await Persistence.exportData(mode);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `dysnomia_${mode.toLowerCase()}_${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Export [${mode}] Complete.` });
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
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Imported: ${result.sectorsAdded} Sectors, ${result.messagesAdded} Msgs.` });
              // Refresh meta
              Persistence.getChannelMeta(ADDRESSES.MAP).then(setMapMeta);
          } catch(e: any) {
              setLoading(false);
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Import Failed: ${e.message}` });
          }
      };
      reader.readAsText(file);
  };

  const handleResetMap = async () => {
      if (window.confirm("WARNING: This will clear all map data and sectors. Proceed?")) {
          await Persistence.clearMapData(ADDRESSES.MAP);
          setMapMeta(null);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Map Data Purged.` });
      }
  };

  const handleNukeDb = async () => {
      if (window.confirm("CRITICAL WARNING: This will wipe the ENTIRE local database. Are you sure?")) {
          await Persistence.clearDatabase();
          setMapMeta(null);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `SYSTEM RESET: Database Cleared.` });
          setTimeout(() => window.location.reload(), 1000);
      }
  };

  const renderTopology = (meta: ChannelMeta | null) => {
      if (!meta) return <div className="text-gray-600 italic p-4 text-xs">No Topology Data Available.</div>;
      
      const ranges = [...meta.scannedRanges].sort((a,b) => b.start - a.start); 
      const elements: React.ReactNode[] = [];
      let lastStart = 999999999; 
      
      ranges.forEach((range, i) => {
          // Detect gap
          if (lastStart < 999999999 && lastStart > range.end + 1) {
              const gapStart = range.end + 1;
              const gapEnd = lastStart - 1;
              elements.push(
                  <div key={`gap-${i}`} className="flex justify-between items-center text-[10px] bg-dys-red/10 border-l-2 border-dashed border-dys-red p-2 my-1 font-mono">
                      <span className="text-dys-red font-bold">GAP DETECTED</span>
                      <span>{gapEnd - gapStart} BLOCKS MISSING ({gapStart} - {gapEnd})</span>
                      <button 
                        onClick={user.mapSync.triggerSync} 
                        className="text-[9px] bg-dys-gold text-black px-2 font-bold hover:bg-white"
                      >
                          FILL
                      </button>
                  </div>
              );
          }
          
          elements.push(
              <div key={`range-${i}`} className="flex justify-between text-[10px] font-mono bg-dys-green/10 p-2 border-l-2 border-dys-green hover:bg-dys-green/20 transition-colors">
                  <span className="text-dys-green font-bold">CONTIGUOUS DATA</span>
                  <span>BLK: {range.start} ↔ {range.end}</span>
              </div>
          );
          lastStart = range.start;
      });

      return <div className="space-y-1 mt-4">{elements}</div>;
  };

  return (
    <div className="h-full bg-dys-black p-8 text-gray-300 font-mono overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Header */}
            <div className="border-b border-dys-gold pb-4">
                <h2 className="text-2xl text-dys-gold font-bold tracking-widest">DATA_IO // CHRONOSPHERE</h2>
                <p className="text-xs text-gray-500 mt-2">Manage local persistence, export archives, and visualize chain topology.</p>
            </div>

            {/* Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* EXPORT */}
                <div className="bg-dys-panel border border-dys-border p-6">
                    <h3 className="text-dys-cyan font-bold text-sm mb-4 border-b border-dys-cyan/30 pb-2">ARCHIVE EXPORT</h3>
                    <div className="space-y-3">
                        <button onClick={() => handleExport('FULL')} className="w-full bg-dys-cyan/10 border border-dys-cyan text-dys-cyan hover:bg-dys-cyan hover:text-black py-3 text-xs font-bold transition-all">
                            FULL DATABASE DUMP (JSON)
                        </button>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => handleExport('MAP')} className="bg-black border border-dys-cyan/50 text-gray-400 hover:text-white hover:border-white py-2 text-[10px] font-bold transition-all">
                                MAP TOPOLOGY ONLY
                            </button>
                            <button onClick={() => handleExport('CHAT')} className="bg-black border border-dys-cyan/50 text-gray-400 hover:text-white hover:border-white py-2 text-[10px] font-bold transition-all">
                                CHAT LOGS ONLY
                            </button>
                        </div>
                    </div>
                </div>

                {/* IMPORT & RESET */}
                <div className="bg-dys-panel border border-dys-border p-6">
                    <h3 className="text-dys-gold font-bold text-sm mb-4 border-b border-dys-gold/30 pb-2">RESTORE & PURGE</h3>
                    <div className="space-y-3">
                        <label className="w-full bg-dys-gold/10 border border-dashed border-dys-gold text-dys-gold hover:bg-dys-gold hover:text-black py-3 text-xs font-bold transition-all flex items-center justify-center cursor-pointer">
                            <span>{loading ? 'IMPORTING...' : 'IMPORT BACKUP FILE'}</span>
                            <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} disabled={loading} className="hidden" />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={handleResetMap} className="bg-dys-red/10 border border-dys-red/50 text-dys-red hover:bg-dys-red hover:text-black py-2 text-[10px] font-bold transition-all">
                                RESET MAP
                            </button>
                            <button onClick={handleNukeDb} className="bg-black border border-dys-red text-dys-red hover:bg-red-950 py-2 text-[10px] font-bold transition-all animate-pulse">
                                NUKE DATABASE
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Topology Viz */}
            <div className="bg-black border border-dys-border p-6">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <h3 className="text-white font-bold text-xs tracking-widest">SYSTEM MAP TOPOLOGY</h3>
                    <div className="flex items-center gap-4 text-[10px]">
                        <span className="text-gray-500">
                            STATUS: {user.mapSync.isScanning ? <span className="text-dys-green animate-pulse">SYNCING ({user.mapSync.progress})</span> : 'IDLE'}
                        </span>
                        <button 
                            onClick={user.mapSync.isScanning ? user.mapSync.stopSync : user.mapSync.triggerSync}
                            className={`border px-2 py-1 font-bold ${user.mapSync.isScanning ? 'border-dys-red text-dys-red hover:bg-dys-red hover:text-black' : 'border-dys-gold text-dys-gold hover:bg-dys-gold hover:text-black'}`}
                        >
                            {user.mapSync.isScanning ? 'STOP' : 'FORCE SYNC'}
                        </button>
                    </div>
                </div>
                {renderTopology(mapMeta)}
            </div>

        </div>
    </div>
  );
};

export default DataDeck;
