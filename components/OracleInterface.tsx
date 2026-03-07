import React, { useState } from 'react';
import { getGeminiResponse } from '../services/geminiService';
import { LogEntry, UserContext } from '../types';

interface OracleInterfaceProps {
  userContext: UserContext;
  addLog: (entry: LogEntry) => void;
  currentView: string;
}

const OracleInterface: React.FC<OracleInterfaceProps> = ({ userContext, addLog, currentView }) => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!prompt) return;
    setLoading(true);
    setResponse(''); // Clear previous

    try {
      const contextStr = JSON.stringify({
        ...userContext,
        currentView
      });
      
      const res = await getGeminiResponse(prompt, contextStr);
      setResponse(res);
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'AI',
        message: 'Oracle response received.'
      });
    } catch (err: any) {
      setResponse("Oracle Unreachable: " + err.message);
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'ERROR',
        message: 'Oracle Error',
        details: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-dys-panel border-l border-dys-border w-80 md:w-96 shrink-0 relative">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/400/800?grayscale&blur=2')] opacity-5 pointer-events-none"></div>
      
      <div className="p-4 border-b border-dys-border bg-dys-black/50 z-10">
        <h2 className="text-dys-gold font-bold font-sans tracking-widest text-lg flex items-center gap-2">
            <span className="text-2xl">👁</span> ORACLE
        </h2>
        <p className="text-xs text-gray-500 font-mono mt-1">Gemini-2.5-Flash-Preview</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm z-10">
        {response ? (
            <div className="prose prose-invert prose-sm text-gray-300">
                <div className="whitespace-pre-wrap">{response}</div>
            </div>
        ) : (
            <div className="text-gray-600 italic text-center mt-10">
                Awaiting query...
            </div>
        )}
      </div>

      <div className="p-4 border-t border-dys-border bg-dys-black/50 z-10">
        <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask the Oracle about Dysnomia..."
            className="w-full bg-black border border-dys-border text-dys-gold p-2 text-sm font-mono focus:outline-none focus:border-dys-gold resize-none h-24 mb-2"
        />
        <button
            onClick={handleAsk}
            disabled={loading}
            className="w-full bg-dys-border hover:bg-dys-gold text-dys-gold hover:text-black font-bold py-2 transition-colors disabled:opacity-50"
        >
            {loading ? 'DIVINING...' : 'CONSULT'}
        </button>
      </div>
    </div>
  );
};

export default OracleInterface;
