import React, { useState, useEffect } from 'react';
import { Web3Service } from '../../services/web3Service';
import { LogEntry, AtropaView, UserContext } from '../../types';
import { getCrowsBalance, canVote as checkCanVote } from '../../services/atropaService';
import { ATROPA_ADDRESSES, ATROPA_VOTE_ABI, ERC20_ABI } from '../../constants';

interface GovernanceProps {
    web3: Web3Service;
    user: UserContext;
    addLog: (entry: LogEntry) => void;
    onNavigate: (view: AtropaView, context?: any) => void;
}

interface Proposal {
    id: number;
    tokenAddress: string;
    proposer: string;
    logoURI: string;
    yesVotes: number;
    noVotes: number;
    active: boolean;
    approved: boolean;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const truncAddr = (a: string) => a ? `${a.substring(0, 6)}...${a.substring(a.length - 4)}` : '';

const Governance: React.FC<GovernanceProps> = ({ web3, user, addLog, onNavigate }) => {
    const [crowsBalance, setCrowsBalance] = useState('0');
    const [eligible, setEligible] = useState(false);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(false);
    const [voting, setVoting] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'ACTIVE' | 'APPROVED'>('ACTIVE');

    // Load CROWS balance
    useEffect(() => {
        if (!user.address) return;
        const load = async () => {
            const bal = await getCrowsBalance(web3, user.address!);
            setCrowsBalance(bal);
            const can = await checkCanVote(web3, user.address!);
            setEligible(can);
        };
        load();
    }, [web3, user.address]);

    // Load proposals
    const loadProposals = async () => {
        setLoading(true);
        try {
            const vote = web3.getContract(ATROPA_ADDRESSES.VOTE_CONTRACT, ATROPA_VOTE_ABI);
            const activeIds = await vote.getActiveProposals();

            const loaded: Proposal[] = [];
            for (const id of activeIds) {
                try {
                    const p = await vote.getProposal(id);
                    loaded.push({
                        id: Number(id),
                        tokenAddress: p.token || p[0],
                        proposer: p.proposer || p[1],
                        logoURI: p.logoURI || p[2],
                        yesVotes: Number(p.yesVotes || p[3]),
                        noVotes: Number(p.noVotes || p[4]),
                        active: p.active ?? p[5],
                        approved: p.approved ?? p[6],
                    });
                } catch {}
            }
            setProposals(loaded);
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Gov: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadProposals(); }, [web3]);

    const handleVote = async (proposalId: number, vote: boolean) => {
        if (!user.isConnected || !eligible) return;
        setVoting(proposalId);
        try {
            const voteContract = web3.getContract(ATROPA_ADDRESSES.VOTE_CONTRACT, ATROPA_VOTE_ABI);
            const tx = await voteContract.vote(proposalId, vote);
            await tx.wait();
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Voted ${vote ? 'YES' : 'NO'} on proposal #${proposalId}` });
            await loadProposals();
        } catch (e: any) {
            addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Vote Failed: ${e.reason || e.message}` });
        } finally {
            setVoting(null);
        }
    };

    const activeProposals = proposals.filter(p => p.active && !p.approved);
    const approvedProposals = proposals.filter(p => p.approved);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-green-900/30 bg-green-950/10 shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h2 className="text-green-400 font-bold text-lg tracking-wider">CROWS GOVERNANCE</h2>
                        <p className="text-green-400/40 text-[10px] tracking-widest uppercase">
                            Community token logo proposals &amp; voting
                        </p>
                    </div>
                    <button
                        onClick={loadProposals}
                        disabled={loading}
                        className="px-3 py-1 text-xs font-bold border border-green-400/30 text-green-400 hover:bg-green-400/10 disabled:opacity-50"
                    >
                        {loading ? '⟳ ...' : '⟳ REFRESH'}
                    </button>
                </div>

                {/* Eligibility Banner */}
                <div className={`border p-2 flex items-center justify-between text-xs ${
                    eligible
                        ? 'border-green-400/20 bg-green-950/20 text-green-400'
                        : 'border-red-400/20 bg-red-950/10 text-red-400'
                }`}>
                    <span>
                        CROWS Balance: <strong>{parseFloat(crowsBalance).toFixed(2)}</strong>
                    </span>
                    <span className="font-bold">
                        {eligible ? '✓ VOTING ELIGIBLE' : '✗ Need ≥ 25 CROWS to vote'}
                    </span>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-2">
                    <button
                        onClick={() => setActiveTab('ACTIVE')}
                        className={`px-3 py-1 text-xs font-bold border transition-all ${
                            activeTab === 'ACTIVE'
                                ? 'border-green-400 text-black bg-green-400'
                                : 'border-green-400/20 text-green-400/50 hover:text-green-400'
                        }`}
                    >
                        ACTIVE ({activeProposals.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('APPROVED')}
                        className={`px-3 py-1 text-xs font-bold border transition-all ${
                            activeTab === 'APPROVED'
                                ? 'border-green-400 text-black bg-green-400'
                                : 'border-green-400/20 text-green-400/50 hover:text-green-400'
                        }`}
                    >
                        APPROVED ({approvedProposals.length})
                    </button>
                </div>
            </div>

            {/* Proposals */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="text-center text-green-400/40 py-10 animate-pulse">LOADING PROPOSALS...</div>
                ) : (activeTab === 'ACTIVE' ? activeProposals : approvedProposals).length === 0 ? (
                    <div className="text-center text-green-400/20 py-10">
                        <div className="text-4xl mb-2">🗳</div>
                        <div className="text-xs">No {activeTab.toLowerCase()} proposals</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(activeTab === 'ACTIVE' ? activeProposals : approvedProposals).map(p => (
                            <div key={p.id} className="border border-green-400/15 bg-black/40 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] text-gray-600 font-mono">#{p.id}</span>
                                    <span className="text-[10px] text-gray-600 font-mono">{truncAddr(p.proposer)}</span>
                                </div>

                                {/* Logo preview */}
                                {p.logoURI && (
                                    <div className="w-16 h-16 mx-auto mb-2 border border-green-400/10 bg-black/60 flex items-center justify-center overflow-hidden">
                                        <img
                                            src={p.logoURI}
                                            alt="Logo"
                                            className="max-w-full max-h-full object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>
                                )}

                                <div className="text-[10px] text-gray-500 font-mono text-center mb-2 truncate">
                                    {p.tokenAddress}
                                </div>

                                {/* Vote Counts */}
                                <div className="flex justify-between text-xs mb-3">
                                    <span className="text-green-400">YES: {p.yesVotes}</span>
                                    <span className="text-red-400">NO: {p.noVotes}</span>
                                </div>

                                {/* Vote Buttons */}
                                {p.active && !p.approved && (
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleVote(p.id, true)}
                                            disabled={!eligible || voting === p.id}
                                            className="flex-1 py-1.5 text-[10px] font-bold border border-green-400/30 text-green-400 hover:bg-green-400/20 disabled:opacity-30"
                                        >
                                            {voting === p.id ? '...' : '✓ YES'}
                                        </button>
                                        <button
                                            onClick={() => handleVote(p.id, false)}
                                            disabled={!eligible || voting === p.id}
                                            className="flex-1 py-1.5 text-[10px] font-bold border border-red-400/30 text-red-400 hover:bg-red-400/20 disabled:opacity-30"
                                        >
                                            {voting === p.id ? '...' : '✗ NO'}
                                        </button>
                                    </div>
                                )}

                                {p.approved && (
                                    <div className="text-center text-[10px] text-green-400 font-bold border border-green-400/20 py-1">
                                        ✓ APPROVED
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Governance;
