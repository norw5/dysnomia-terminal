
import React, { useState, useEffect, useRef } from 'react';
import { getGeminiResponse } from '../services/geminiService';
import { LogEntry, UserContext, ContractInteractionRequest } from '../types';

interface NavAIProps {
  userContext: UserContext;
  addLog: (entry: LogEntry) => void;
  currentView: string;
  onNavigateToContract?: (req: ContractInteractionRequest) => void;
  activeModel?: string;
}

interface AIMessage {
    id: string;
    role: 'USER' | 'AI';
    content: string;
    contextSnapshot?: string;
}

const NavAI: React.FC<NavAIProps> = ({ userContext, addLog, currentView, onNavigateToContract, activeModel = 'gemini-2.5-flash-preview-09-2025' }) => {
  const [prompt, setPrompt] = useState('');
  const [conversation, setConversation] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const handleAsk = async () => {
    if (!prompt) return;
    setLoading(true);
    
    // Prepare Context
    const contextStr = JSON.stringify({
        pilot_address: userContext.address,
        lau_shell: userContext.lauAddress || "NONE",
        yue_bank: userContext.yue || "NONE",
        current_sector: userContext.currentArea || "VOID",
        balance: userContext.balance,
        active_view: currentView
    }, null, 2);

    const userMsg: AIMessage = { 
        id: Date.now().toString(), 
        role: 'USER', 
        content: prompt, 
        contextSnapshot: contextStr 
    };
    
    setConversation(prev => [...prev, userMsg]);
    setPrompt('');

    try {
      const res = await getGeminiResponse(prompt, contextStr);
      
      const aiMsg: AIMessage = {
          id: (Date.now() + 1).toString(),
          role: 'AI',
          content: res || "NO RESPONSE"
      };
      setConversation(prev => [...prev, aiMsg]);
      
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'AI',
        message: 'Oracle Response Received.'
      });
    } catch (err: any) {
      const errorMsg: AIMessage = {
          id: (Date.now() + 1).toString(),
          role: 'AI',
          content: `SYSTEM ERROR: Oracle Unreachable. ${err.message}`
      };
      setConversation(prev => [...prev, errorMsg]);
      
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'ERROR',
        message: 'AI Error',
        details: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const resolvePlaceholders = (val: string) => {
      if (val === '{userLAU}') return userContext.lauAddress || "";
      if (val === '{userYUE}') return userContext.yue || "";
      if (val === '{userAddr}') return userContext.address || "";
      if (val === '{currentQing}') return userContext.currentArea || "";
      return val;
  };

  const resolveArgs = (args: any[]) => {
      return args.map(arg => {
          if (typeof arg === 'string') {
              return resolvePlaceholders(arg);
          }
          return arg;
      });
  };

  const renderContent = (content: string) => {
      if (showRaw) return <div className="whitespace-pre-wrap font-mono text-[10px] text-gray-400">{content}</div>;

      // Regex supports optional 4th group for TargetAddress
      // Format: <<<EXECUTE:Contract:Method:[Args]:Target>>>
      const parts = content.split(/(<<<EXECUTE:.*?:.*?:.*?(?::.*?)?>>>)/g);
      
      return parts.map((part, idx) => {
          const match = part.match(/<<<EXECUTE:([^:]+):([^:]+):(\[.*?\])(?::([^>]+))?>>>/);
          if (match) {
              const [_, contract, method, argsStr, targetAddrRaw] = match;
              let args = [];
              try { args = JSON.parse(argsStr); } catch (e) {}
              const resolvedArgs = resolveArgs(args);
              
              let targetAddress = targetAddrRaw ? resolvePlaceholders(targetAddrRaw) : undefined;
              
              // Smart Defaults if explicit target missing
              if (!targetAddress) {
                  if (contract === 'LAU') targetAddress = userContext.lauAddress || undefined;
                  if (contract === 'YUE') targetAddress = userContext.yue || undefined;
              }

              return (
                  <button 
                    key={idx}
                    onClick={() => {
                        if (onNavigateToContract) {
                            onNavigateToContract({
                                contractName: contract,
                                functionName: method,
                                args: resolvedArgs,
                                address: targetAddress
                            });
                        }
                    }}
                    className="block w-full my-2 bg-dys-gold/10 border border-dys-gold text-dys-gold hover:bg-dys-gold hover:text-black py-2 px-3 rounded font-bold text-xs transition-all text-left flex items-center justify-between group"
                  >
                      <div className="min-w-0 pr-2">
                          <div className="text-[9px] opacity-70 mb-1">RECOMMENDED ACTION</div>
                          <div className="font-mono truncate">{contract}.{method}()</div>
                          {targetAddress && <div className="text-[9px] text-gray-500 font-mono truncate">@{targetAddress}</div>}
                      </div>
                      <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
                  </button>
              );
          }
          // Simple bold formatting for **text**
          const boldParts = part.split(/(\*\*.*?\*\*)/g);
          return (
              <span key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {boldParts.map((sub, sIdx) => {
                      if (sub.startsWith('**') && sub.endsWith('**')) {
                          return <strong key={sIdx} className="text-white">{sub.slice(2, -2)}</strong>;
                      }
                      return sub;
                  })}
              </span>
          );
      });
  };

  const copyContext = (msg: AIMessage) => {
      if (msg.contextSnapshot) {
          navigator.clipboard.writeText(msg.contextSnapshot);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'Context Snapshot Copied.' });
      }
  };

  return (
    <div className="h-full flex flex-col bg-dys-black border-l border-dys-border w-full shadow-2xl">
      <div className="p-3 border-b border-dys-border bg-dys-panel z-10 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-dys-gold font-bold font-sans tracking-widest text-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-dys-gold rounded-full animate-pulse"></span>
                    NAV_AI
                </h2>
            </div>
            <div className="flex gap-2">
                <button onClick={() => setShowRaw(!showRaw)} className={`text-[9px] px-2 py-1 border ${showRaw ? 'bg-white text-black border-white' : 'text-gray-500 border-gray-700'}`}>RAW</button>
                <button onClick={() => setConversation([])} className="text-[9px] px-2 py-1 border border-dys-red text-dys-red hover:bg-dys-red hover:text-black">CLR</button>
            </div>
        </div>
        <div className="text-[9px] text-gray-600 font-mono truncate border-t border-white/5 pt-1">
            MODEL: {activeModel}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 font-mono text-xs z-10 scrollbar-thin">
        {conversation.length === 0 && (
            <div className="text-gray-600 italic text-center mt-10 p-4 border border-dashed border-gray-800 rounded">
                Awaiting Pilot Query...
            </div>
        )}
        
        {conversation.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'USER' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] p-3 rounded border ${
                    msg.role === 'USER' 
                    ? 'bg-dys-cyan/10 border-dys-cyan/30 text-dys-cyan' 
                    : 'bg-dys-panel border-gray-800 text-gray-300'
                }`}>
                    <div className="mb-1 flex justify-between items-center opacity-50 text-[9px] uppercase border-b border-white/10 pb-1">
                        <span>{msg.role}</span>
                        {msg.role === 'USER' && (
                            <button onClick={() => copyContext(msg)} className="hover:text-white" title="Copy Context JSON">
                                [CTX]
                            </button>
                        )}
                    </div>
                    <div>{renderContent(msg.content)}</div>
                </div>
            </div>
        ))}
        
        <div ref={responseEndRef} />
      </div>

      <div className="p-3 border-t border-dys-border bg-dys-panel z-10 shrink-0">
        <div className="relative">
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                    if(e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAsk();
                    }
                }}
                placeholder="Ask about Dysnomia, Contracts, or Navigation..."
                className="w-full bg-black border border-dys-border text-dys-gold p-3 text-xs font-mono focus:outline-none focus:border-dys-gold resize-none h-24 mb-2 placeholder-gray-700"
            />
            {loading && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-dys-gold text-xs animate-pulse">COMPUTING VECTOR...</span>
                </div>
            )}
        </div>
        <button
            onClick={handleAsk}
            disabled={loading}
            className="w-full bg-dys-gold/10 hover:bg-dys-gold hover:text-black text-dys-gold border border-dys-gold/50 font-bold py-2 transition-all text-xs tracking-wider"
        >
            TRANSMIT
        </button>
      </div>
    </div>
  );
};

export default NavAI;
