
import React, { useState, useEffect } from 'react';
import { Web3Service } from '../services/web3Service';
import { LogEntry, ContractInteractionRequest } from '../types';
import { Interface, FunctionFragment, isAddress } from "ethers";
import { CONTRACT_CATALOG, DYSNOMIA_ABIS, ERC20_ABI, ContractDoc, DYSNOMIA_ERRORS } from '../constants';

interface ContractStudioProps {
  web3: Web3Service;
  addLog: (entry: LogEntry) => void;
  initialState?: ContractInteractionRequest | null;
  onClearState?: () => void;
}

interface ContractInfo {
    address: string;
    name: string;
    type: string;
    description?: string;
    functions: FunctionFragment[];
    abi: any[];
    functionDocs?: Record<string, string>;
    bytecode?: string;
    isTemplate?: boolean;
}

const ContractStudio: React.FC<ContractStudioProps> = ({ web3, addLog, initialState, onClearState }) => {
  const [activeTab, setActiveTab] = useState<'READ' | 'WRITE'>('READ');
  const [addressInput, setAddressInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  
  // Function execution state
  const [inputs, setInputs] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [expandedFunc, setExpandedFunc] = useState<string | null>(null);
  const [showBytecode, setShowBytecode] = useState(false);

  // Categories
  const CATEGORY_ORDER = ['CORE', 'DAN', 'SKY', 'TANG', 'SOENG', 'LIBRARY', 'TEMPLATE'];

  const categorizedContracts = CONTRACT_CATALOG.reduce((acc, contract) => {
      if (!acc[contract.category]) acc[contract.category] = [];
      acc[contract.category].push(contract);
      return acc;
  }, {} as Record<string, ContractDoc[]>);

  // Load Deep Link
  useEffect(() => {
      if (initialState && web3) {
          handleDeepLink(initialState);
      }
  }, [initialState, web3]);

  const handleDeepLink = async (req: ContractInteractionRequest) => {
      const catalogEntry = CONTRACT_CATALOG.find(c => c.name === req.contractName);
      
      // Determine target address
      let targetAddress = req.address;
      if (!targetAddress && catalogEntry && !catalogEntry.isDynamic) {
          targetAddress = catalogEntry.address;
      }
      
      // Load
      if (!targetAddress && catalogEntry?.isDynamic) {
          await loadContract("TEMPLATE", catalogEntry);
      } else if (targetAddress) {
          await loadContract(targetAddress, catalogEntry);
      }

      // Pre-fill function
      if (req.functionName) {
           setTimeout(() => {
               // Auto-expansion logic handled in loadContract
           }, 500);
      }
      
      if (onClearState) onClearState();
  };

  const loadContract = async (addr: string, catalogEntry?: ContractDoc) => {
    setLoading(true);
    // If it's a template but we have a valid address override (deep link), use it
    const effectiveAddress = (addr === "TEMPLATE" && !isAddress(addr)) ? "" : addr;
    
    setAddressInput(effectiveAddress);
    setContractInfo(null);
    setResults({});
    setInputs({});

    try {
        let abi = ERC20_ABI;
        let type = 'ERC20';
        let name = 'Unknown';
        let description = '';
        let functionDocs: Record<string, string> = {};
        let isTemplate = false;

        if (catalogEntry) {
            name = catalogEntry.name;
            description = catalogEntry.description;
            type = catalogEntry.category;
            isTemplate = !!catalogEntry.isDynamic;
            functionDocs = catalogEntry.functionDocs || {};
            
            if (DYSNOMIA_ABIS[catalogEntry.name]) {
                abi = DYSNOMIA_ABIS[catalogEntry.name] as any;
            }
        } else if (isAddress(addr)) {
             // Auto-detect logic
             try {
                const basicContract = web3.getContract(addr, ["function Type() view returns (string)", "function name() view returns (string)"]);
                const detectedType = await basicContract.Type();
                if (detectedType && DYSNOMIA_ABIS[detectedType]) {
                    type = detectedType;
                    abi = [...ERC20_ABI, ...DYSNOMIA_ABIS[detectedType]]; 
                    const catEntry = CONTRACT_CATALOG.find(c => c.name === detectedType);
                    if(catEntry) {
                        functionDocs = catEntry.functionDocs || {};
                        description = catEntry.description;
                    }
                }
                const detectedName = await basicContract.name();
                if (detectedName) name = detectedName;
            } catch (e) {}
        }

        let bytecode = '';
        if (isAddress(effectiveAddress)) {
            try { bytecode = await web3.getCode(effectiveAddress); } catch (e) {}
        }

        const iface = new Interface(abi);
        const functions: FunctionFragment[] = [];
        iface.forEachFunction((f) => functions.push(f));
        
        const newInfo = {
            address: effectiveAddress,
            name,
            type,
            description,
            functions,
            abi: abi as any[],
            functionDocs,
            bytecode,
            isTemplate
        };
        
        setContractInfo(newInfo);

        // Auto-expand deep linked function
        if (initialState && initialState.functionName && initialState.contractName === name) {
            const func = functions.find(f => f.name === initialState.functionName);
            if (func) {
                const key = func.format();
                setExpandedFunc(key);
                if (initialState.args) {
                    setInputs(prev => ({ ...prev, [key]: initialState.args || [] }));
                }
                const isRead = ['view', 'pure'].includes(func.stateMutability);
                setActiveTab(isRead ? 'READ' : 'WRITE');
            }
        }

    } catch (e: any) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Load Failed: ${e.message}` });
    } finally {
        setLoading(false);
    }
  };

  const handleExecute = async (func: FunctionFragment, args: string[]) => {
      if(!contractInfo) return;
      if(!isAddress(contractInfo.address)) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Execution Failed: Valid Address Required.` });
          return;
      }
      
      const funcKey = func.format();
      setResults(prev => ({ ...prev, [funcKey]: 'Executing...' }));

      try {
        const contract = web3.getContract(contractInfo.address, contractInfo.abi);
        
        if (['view', 'pure'].includes(func.stateMutability)) {
            const res = await contract[func.name](...args);
            setResults(prev => ({ ...prev, [funcKey]: res.toString() }));
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Query ${func.name}: Success` });
        } else {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Simulating ${func.name}...` });
            const sim = await web3.simulateTransaction(contract, func.name, args);
            
            if(sim.success) {
                const tx = await web3.sendTransaction(contract, func.name, args);
                setResults(prev => ({ ...prev, [funcKey]: `Tx Sent: ${tx.hash}` }));
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Tx Hash: ${tx.hash}` });
            } else {
                let errorDetails = sim.error;
                
                // Attempt to decode error data using DYSNOMIA_ERRORS + Current ABI
                if (sim.rawData) {
                    try {
                        const extendedAbi = [...contractInfo.abi, ...DYSNOMIA_ERRORS];
                        const iface = new Interface(extendedAbi);
                        const parsedError = iface.parseError(sim.rawData);
                        if (parsedError) {
                            errorDetails = `Revert: ${parsedError.name}(${parsedError.args.join(', ')})`;
                        }
                    } catch (decodeErr) {
                         // Fallback to raw data if decode fails
                         console.warn("Decode failed", decodeErr);
                    }
                }

                setResults(prev => ({ ...prev, [funcKey]: `Sim Fail: ${errorDetails}` }));
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Simulation Failed` });
            }
        }
      } catch (e: any) {
         setResults(prev => ({ ...prev, [funcKey]: `Error: ${e.message}` }));
         addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Exec Error`, details: e.message });
      }
  };

  const handleCopyABI = () => {
      if (contractInfo?.abi) {
          navigator.clipboard.writeText(JSON.stringify(contractInfo.abi, null, 2));
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'ABI Copied to Clipboard.' });
      }
  };

  const clearTemplateInput = () => {
      setAddressInput('');
      setContractInfo(prev => prev ? ({ ...prev, address: '' }) : null);
  };

  const visibleFunctions = contractInfo?.functions.filter(f => {
      const isRead = ['view', 'pure'].includes(f.stateMutability);
      return activeTab === 'READ' ? isRead : !isRead;
  }).sort((a,b) => a.name.localeCompare(b.name)) || [];

  return (
    <div className="flex h-full bg-dys-black text-gray-300 font-mono overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-64 bg-dys-panel border-r border-dys-border flex flex-col shrink-0">
            <div className="p-4 border-b border-dys-border bg-black/20">
                <h3 className="text-dys-cyan font-bold tracking-widest text-sm mb-2">ENGINEERING DECK</h3>
                <div className="relative">
                    <input 
                        className="w-full bg-black border border-dys-border p-2 text-xs text-dys-green placeholder-gray-700 focus:border-dys-cyan outline-none"
                        placeholder="Load Address..."
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadContract(addressInput)}
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin">
                {CATEGORY_ORDER.map(cat => {
                    const items = categorizedContracts[cat];
                    if (!items) return null;
                    return (
                        <div key={cat}>
                            <div className="text-[10px] text-gray-500 font-bold uppercase mb-1 px-2 border-b border-gray-800 pb-1 flex justify-between">
                                <span>{cat}</span>
                                <span className="text-gray-700">{items.length}</span>
                            </div>
                            <div className="space-y-1">
                                {items.map((c) => (
                                    <button
                                        key={c.name}
                                        onClick={() => loadContract(c.isDynamic ? "TEMPLATE" : (c.address || ""), c)}
                                        className={`w-full text-left px-3 py-2 text-xs hover:bg-dys-cyan/10 hover:text-dys-cyan border-l-2 transition-all ${
                                            contractInfo?.name === c.name 
                                            ? 'border-dys-cyan bg-dys-cyan/10 text-dys-cyan' 
                                            : 'border-transparent text-gray-400'
                                        }`}
                                    >
                                        <div className="font-bold truncate">{c.name}</div>
                                        <div className="text-[9px] opacity-50 truncate font-mono">
                                            {c.isDynamic ? "TEMPLATE" : (c.address ? c.address.substring(0,10) + "..." : "NO ADDRESS")}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
            {contractInfo ? (
                <>
                    {/* Contract Header */}
                    <div className="p-6 border-b border-dys-border bg-gradient-to-r from-dys-panel to-black">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl text-white font-bold tracking-tight flex items-center gap-3">
                                    {contractInfo.name}
                                    <span className="text-xs bg-dys-border px-2 py-0.5 rounded text-dys-gold border border-dys-gold/30">
                                        {contractInfo.type}
                                    </span>
                                </h2>
                                
                                {contractInfo.isTemplate ? (
                                    <div className="mt-2 bg-dys-gold/10 border border-dys-gold p-2 max-w-lg">
                                        <p className="text-[10px] text-dys-gold mb-1 font-bold">TEMPLATE MODE</p>
                                        <div className="flex gap-2 relative">
                                            <input 
                                                className="flex-1 bg-black border border-dys-gold/50 p-2 text-sm text-dys-gold focus:outline-none pr-8"
                                                placeholder={`Enter ${contractInfo.name} Address...`}
                                                value={addressInput}
                                                onChange={(e) => {
                                                    setAddressInput(e.target.value);
                                                    setContractInfo(prev => prev ? ({ ...prev, address: e.target.value }) : null);
                                                }}
                                            />
                                            {addressInput && (
                                                <button 
                                                    onClick={clearTemplateInput}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-dys-gold hover:text-white"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 font-mono">
                                        <span>{contractInfo.address}</span>
                                    </div>
                                )}

                                {contractInfo.description && (
                                    <p className="mt-2 text-xs text-gray-400 max-w-2xl italic border-l-2 border-gray-700 pl-3">
                                        {contractInfo.description}
                                    </p>
                                )}
                            </div>
                            
                            <div className="flex gap-2">
                                <button onClick={handleCopyABI} className="text-[10px] border border-gray-700 hover:border-white hover:text-white px-2 py-1 transition-colors">COPY ABI</button>
                                <button onClick={() => setShowBytecode(!showBytecode)} className="text-[10px] border border-gray-700 hover:border-white hover:text-white px-2 py-1 transition-colors">CODE</button>
                            </div>
                        </div>
                        {showBytecode && contractInfo.bytecode && (
                            <div className="mt-4 p-2 bg-black border border-gray-800 font-mono text-[9px] text-gray-600 break-all h-24 overflow-y-auto">
                                {contractInfo.bytecode}
                            </div>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-dys-border bg-dys-panel">
                        <button onClick={() => setActiveTab('READ')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${activeTab === 'READ' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-500'}`}>READ DATA</button>
                        <button onClick={() => setActiveTab('WRITE')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${activeTab === 'WRITE' ? 'border-dys-red text-dys-red bg-dys-red/5' : 'border-transparent text-gray-500'}`}>WRITE / EXECUTE</button>
                    </div>

                    {/* Functions List */}
                    <div className="flex-1 overflow-y-auto p-6 bg-black/50">
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {visibleFunctions.map((func) => {
                                const funcKey = func.format();
                                const isExpanded = expandedFunc === funcKey;
                                const doc = contractInfo.functionDocs?.[func.name];
                                
                                return (
                                    <div key={funcKey} className={`border transition-all duration-200 ${isExpanded ? 'border-dys-cyan bg-dys-panel' : 'border-dys-border bg-black hover:border-gray-600'}`}>
                                        <button onClick={() => setExpandedFunc(isExpanded ? null : funcKey)} className="w-full text-left px-4 py-3 flex justify-between items-center group">
                                            <div className="flex flex-col gap-1 w-full">
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-bold text-sm ${activeTab === 'READ' ? 'text-blue-300' : 'text-orange-300'}`}>{func.name}</span>
                                                    {func.stateMutability === 'view' && <span className="text-[9px] border border-blue-900 text-blue-500 px-1">VIEW</span>}
                                                    {func.stateMutability === 'payable' && <span className="text-[9px] border border-red-900 text-red-500 px-1">PAYABLE</span>}
                                                </div>
                                                <div className="text-[10px] text-gray-500 font-mono truncate w-full pr-8">
                                                    {/* Better Function Signature Display */}
                                                    <span className="text-gray-600">inputs: </span>
                                                    {func.inputs.length > 0 ? (
                                                        func.inputs.map((i, idx) => (
                                                            <span key={idx}>
                                                                {i.name || `arg${idx}`}: <span className="text-dys-cyan">{i.type}</span>
                                                                {idx < func.inputs.length - 1 ? ', ' : ''}
                                                            </span>
                                                        ))
                                                    ) : "()"}
                                                    <span className="mx-2">→</span>
                                                    <span className="text-gray-600">returns: </span>
                                                    {func.outputs && func.outputs.length > 0 ? (
                                                        func.outputs.map((o, idx) => (
                                                            <span key={idx} className="text-green-500">
                                                                {o.type}
                                                                {idx < func.outputs.length - 1 ? ', ' : ''}
                                                            </span>
                                                        ))
                                                    ) : "void"}
                                                </div>
                                                {doc && <div className="text-[10px] text-gray-400 mt-1 italic border-l border-gray-600 pl-2">{doc}</div>}
                                            </div>
                                            <span className="text-xs text-gray-600 group-hover:text-white transition-colors">{isExpanded ? '−' : '+'}</span>
                                        </button>

                                        {isExpanded && (
                                            <div className="px-4 pb-4 pt-0 border-t border-dys-border/50">
                                                <div className="space-y-3 mt-4">
                                                    {func.inputs.map((input, idx) => (
                                                        <div key={idx}>
                                                            <div className="flex justify-between mb-1">
                                                                <label className="text-[10px] uppercase text-gray-400 font-bold">{input.name || `Argument ${idx}`}</label>
                                                                <span className="text-[10px] text-dys-cyan">{input.type}</span>
                                                            </div>
                                                            <input 
                                                                className="w-full bg-black border border-dys-border p-2 text-sm text-white focus:border-dys-cyan outline-none placeholder-gray-800"
                                                                placeholder={`${input.type} value...`}
                                                                value={inputs[funcKey]?.[idx] || ''}
                                                                onChange={(e) => {
                                                                    setInputs(prev => {
                                                                        const newArgs = [...(prev[funcKey] || [])];
                                                                        newArgs[idx] = e.target.value;
                                                                        return { ...prev, [funcKey]: newArgs };
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    <button 
                                                        onClick={() => handleExecute(func, inputs[funcKey] || [])}
                                                        className={`w-full py-2 font-bold text-sm transition-colors mt-2 ${activeTab === 'READ' ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-dys-red hover:bg-red-500 text-black'}`}
                                                    >
                                                        {activeTab === 'READ' ? 'QUERY' : 'TRANSACT'}
                                                    </button>
                                                </div>
                                                {results[funcKey] && (
                                                    <div className="mt-4 p-3 bg-black border border-gray-800 relative group/res">
                                                        <span className="block text-[10px] text-gray-500 mb-1">RESULT</span>
                                                        <div className="text-sm font-mono text-dys-green break-all whitespace-pre-wrap max-h-60 overflow-y-auto">{results[funcKey]}</div>
                                                        <button 
                                                            onClick={() => navigator.clipboard.writeText(results[funcKey])}
                                                            className="absolute top-2 right-2 text-[9px] text-gray-600 hover:text-white opacity-0 group-hover/res:opacity-100 transition-opacity"
                                                        >
                                                            COPY
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                    <div className="text-6xl mb-4 opacity-20">⚙</div>
                    <p className="text-lg">Select a system module from the Engineering Deck</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default ContractStudio;
