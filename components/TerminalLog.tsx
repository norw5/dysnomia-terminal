
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface TerminalLogProps {
  logs: LogEntry[];
}

const TerminalLog: React.FC<TerminalLogProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex-1 bg-black overflow-y-auto p-2 space-y-2 font-mono text-[10px] scrollbar-thin">
        {logs.length === 0 && (
            <div className="text-gray-700 text-center mt-10 italic">SYSTEM IDLE</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex flex-col gap-0.5 border-l-2 pl-2 border-gray-800 hover:bg-white/5 py-1">
            <div className="flex justify-between opacity-50 text-[8px]">
                <span>{log.timestamp}</span>
                <span className={`font-bold ${
                log.type === 'ERROR' ? 'text-dys-red' :
                log.type === 'SUCCESS' ? 'text-dys-green' :
                log.type === 'AI' ? 'text-dys-gold' :
                log.type === 'TX' ? 'text-purple-400' :
                'text-blue-400'
                }`}>
                {log.type}
                </span>
            </div>
            <span className="text-gray-300 leading-tight break-all whitespace-pre-wrap">{log.message}</span>
            {log.details && (
                <div className="text-gray-600 break-all whitespace-pre-wrap mt-1 border-t border-gray-900 pt-1">
                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
    </div>
  );
};

export default TerminalLog;
