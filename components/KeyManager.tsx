import React, { useState, useEffect } from 'react';
import { CryptoService } from '../services/cryptoService';
import { Web3Service } from '../services/web3Service';
import { LogEntry, UserContext } from '../types';
import { LAU_ABI } from '../constants';
import { ethers } from 'ethers';

interface KeyManagerProps {
    web3: Web3Service;
    user: UserContext;
    addLog: (log: LogEntry) => void;
    onClose: () => void;
}

export default function KeyManager({ web3, user, addLog, onClose }: KeyManagerProps) {
    const mySoulIdStr = user.saat?.soul || "";
    const myLauAddress = user.lauAddress || "";

    const [hasECDH, setHasECDH] = useState(false);
    const [hasPGP, setHasPGP] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Import/Export States
    const [pgpImportData, setPgpImportData] = useState('');
    const [ecdhImportData, setEcdhImportData] = useState('');
    const [showExportPGP, setShowExportPGP] = useState(false);
    const [showExportECDH, setShowExportECDH] = useState(false);
    const [showExportPubPGP, setShowExportPubPGP] = useState(false);
    const [showExportPubECDH, setShowExportPubECDH] = useState(false);
    const [myPGPPubKey, setMyPGPPubKey] = useState<string | null>(null);
    const [myECDHPubKey, setMyECDHPubKey] = useState<string | null>(null);

    const PUBKEY_PREFIX = '[PUBKEY:';

    useEffect(() => {
        if (mySoulIdStr) {
            setHasECDH(CryptoService.hasPrivateKey(mySoulIdStr));
            setHasPGP(CryptoService.hasPGPPrivateKey(mySoulIdStr));
        }
    }, [mySoulIdStr]);

    const loadMyPubKeys = async () => {
        if (hasPGP) setMyPGPPubKey(await CryptoService.getPGPPublicKey(mySoulIdStr));
        if (hasECDH) setMyECDHPubKey(await CryptoService.getPublicKey(mySoulIdStr));
    };

    useEffect(() => {
        loadMyPubKeys();
    }, [hasPGP, hasECDH]);

    const handleGeneratePGP = async () => {
        setIsGenerating(true);
        try {
            await CryptoService.generatePGPKeyPair(mySoulIdStr, `Soul ${mySoulIdStr}`, `soul_${mySoulIdStr}@dysnomia.local`, 'rsa');
            setHasPGP(true);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'PGP RSA (4096-bit) Key Generated Locally' });
        } catch (e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `PGP Key Gen Failed: ${e.message}` });
        }
        setIsGenerating(false);
    };

    const handleImportPGP = async () => {
        if (!pgpImportData.trim()) return;
        const success = await CryptoService.importPGPPrivateKey(mySoulIdStr, pgpImportData.trim());
        if (success) {
            setHasPGP(true);
            setPgpImportData('');
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'PGP Key Imported Successfully' });
        } else {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: 'Failed to import PGP Key. Invalid format.' });
        }
    };

    const handleGenerateECDH = async () => {
        setIsGenerating(true);
        try {
            await CryptoService.generateKeyPair(mySoulIdStr);
            setHasECDH(true);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'ECDH P-256 Key Generated Locally' });
        } catch (e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `ECDH Key Gen Failed: ${e.message}` });
        }
        setIsGenerating(false);
    };

    const handleImportECDH = () => {
        if (!ecdhImportData.trim()) return;
        const success = CryptoService.importECDHPrivateKey(mySoulIdStr, ecdhImportData.trim());
        if (success) {
            setHasECDH(true);
            setEcdhImportData('');
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'ECDH Key Imported Successfully' });
        } else {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: 'Failed to import ECDH Key. Invalid format.' });
        }
    };

    const handleBroadcastPGP = async () => {
        if (!hasPGP) return;
        setIsGenerating(true);
        try {
            const lauContract = web3.getContract(myLauAddress, LAU_ABI);
            const pgpPub = await CryptoService.getPGPPublicKey(mySoulIdStr);
            if (!pgpPub) throw new Error("Could not retrieve PGP public key");
            const tx = await web3.sendTransaction(lauContract, 'Chat', [pgpPub]);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Broadcasting PGP Public Key: ${tx.hash}` });
            await web3.waitForReceipt(tx);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'PGP Key Broadcasted' });
        } catch (e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `PGP Broadcast Failed: ${e.message}` });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleBroadcastECDH = async () => {
        if (!hasECDH) return;
        setIsGenerating(true);
        try {
            const lauContract = web3.getContract(myLauAddress, LAU_ABI);
            const ecdhPub = await CryptoService.getPublicKey(mySoulIdStr);
            if (!ecdhPub) throw new Error("Could not retrieve ECDH public key");
            const msg = `${PUBKEY_PREFIX}${mySoulIdStr}]${ecdhPub}`;
            const tx = await web3.sendTransaction(lauContract, 'Chat', [msg]);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Broadcasting ECDH Public Key: ${tx.hash}` });
            await web3.waitForReceipt(tx);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'ECDH Key Broadcasted' });
        } catch (e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `ECDH Broadcast Failed: ${e.message}` });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto bg-black text-xs font-mono scrollbar-thin">
            <div className="flex justify-between items-center mb-6 border-b border-dys-border pb-3 shrink-0">
                <h2 className="text-dys-cyan text-lg font-bold tracking-widest">CRYPTOGRAPHY DASHBOARD</h2>
                <button onClick={onClose} className="text-gray-500 hover:text-white px-3 py-1 border border-gray-700">CLOSE [X]</button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 pb-8">
                {/* PGP Card */}
                <div className="border border-dys-border bg-dys-panel/50 p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <div className={`w-3 h-3 ${hasPGP ? 'bg-dys-green' : 'bg-dys-gold'}`}></div>
                        <h3 className="font-bold text-sm tracking-widest">PGP ASYMMETRIC (RECOMMENDED)</h3>
                    </div>
                    <p className="text-gray-400 mb-4 flex-1">Provides highly compatible standard offline PGP encryption.</p>
                    
                    <div className="space-y-2">
                        {hasPGP ? (
                            <>
                                <div className="text-dys-green mb-4 border border-dys-green/30 p-2 text-center">Local PGP Key Pair Active.</div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowExportPubPGP(!showExportPubPGP)} className="flex-1 bg-dys-cyan/10 text-dys-cyan border border-dys-cyan/30 py-2 hover:bg-dys-cyan hover:text-black">
                                            {showExportPubPGP ? 'HIDE PUB' : 'EXPORT PUB'}
                                        </button>
                                        <button onClick={() => setShowExportPGP(!showExportPGP)} className="flex-1 bg-dys-panel text-gray-400 border border-gray-700 py-2 hover:bg-white hover:text-black">
                                            {showExportPGP ? 'HIDE PRIV' : 'EXPORT PRIV'}
                                        </button>
                                        <button onClick={() => { localStorage.removeItem(`dys_pgp_priv_key_${mySoulIdStr}`); setHasPGP(false); }} className="px-3 bg-dys-red/10 text-dys-red border border-dys-red/50 py-2 hover:bg-dys-red hover:text-black">
                                            WIPE
                                        </button>
                                    </div>
                                    <button onClick={handleBroadcastPGP} disabled={isGenerating} className="w-full bg-dys-cyan/20 text-dys-cyan border border-dys-cyan/50 py-2 hover:bg-dys-cyan hover:text-black disabled:opacity-50">
                                        {isGenerating ? 'BROADCASTING...' : 'BROADCAST PGP PUBLIC KEY'}
                                    </button>
                                </div>
                                {showExportPubPGP && (
                                    <div className="mt-2 p-2 border border-dys-cyan/30 bg-black">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[10px] text-dys-cyan">PUBLIC KEY (ASC ARMORED)</p>
                                            <button onClick={() => { navigator.clipboard.writeText(myPGPPubKey || ''); addLog({id:Date.now().toString(), timestamp:new Date().toLocaleTimeString(), type:'SUCCESS', message:'PGP PubKey Copied'}); }} className="text-[9px] underline">COPY</button>
                                        </div>
                                        <textarea className="w-full h-32 bg-gray-900 text-gray-300 text-[10px] p-2 font-mono scrollbar-none" readOnly value={myPGPPubKey || ''}></textarea>
                                    </div>
                                )}
                                {showExportPGP && (
                                    <div className="mt-2 p-2 border border-dys-red/30 bg-black">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[10px] text-dys-red">PRIVATE KEY BLOCK - KEEP SECRET!</p>
                                            <button onClick={() => { navigator.clipboard.writeText(CryptoService.getPGPPrivateKeyString(mySoulIdStr) || ''); addLog({id:Date.now().toString(), timestamp:new Date().toLocaleTimeString(), type:'SUCCESS', message:'PGP PrivKey Copied'}); }} className="text-[9px] underline text-dys-red">COPY</button>
                                        </div>
                                        <textarea className="w-full h-32 bg-gray-900 text-gray-300 text-[10px] p-2 font-mono scrollbar-none" readOnly value={CryptoService.getPGPPrivateKeyString(mySoulIdStr) || ''}></textarea>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <button onClick={handleGeneratePGP} disabled={isGenerating} className="w-full bg-dys-cyan/20 text-dys-cyan border border-dys-cyan/50 py-2 hover:bg-dys-cyan hover:text-black disabled:opacity-50 font-bold tracking-widest">
                                    {isGenerating ? 'WORKING...' : 'GENERATE RSA PAIR (4096-bit)'}
                                </button>
                                <div className="mt-4 pt-4 border-t border-dys-border">
                                    <p className="text-[10px] text-gray-500 mb-2">OR IMPORT EXISTING ARMORED PRIVATE KEY:</p>
                                    <textarea value={pgpImportData} onChange={e => setPgpImportData(e.target.value)} className="w-full h-24 bg-black border border-dys-border p-2 mb-2 text-[10px] focus:border-dys-cyan" placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"></textarea>
                                    <button onClick={handleImportPGP} className="w-full border border-gray-600 py-1 hover:bg-white hover:text-black">IMPORT PGP</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ECDH Card */}
                <div className="border border-dys-border bg-dys-panel/50 p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <div className={`w-3 h-3 ${hasECDH ? 'bg-dys-green' : 'bg-dys-gold'}`}></div>
                        <h3 className="font-bold text-sm tracking-widest">ECDH SECRETS (ENCRYPT LIB)</h3>
                    </div>
                    <p className="text-gray-400 mb-4 flex-1">Required for native Smart Contract ENCRYPT functionality.</p>
                    
                    <div className="space-y-2">
                        {hasECDH ? (
                            <>
                                <div className="text-dys-green mb-4 border border-dys-green/30 p-2 text-center">Local ECDH Secret Active.</div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowExportPubECDH(!showExportPubECDH)} className="flex-1 bg-dys-green/10 text-dys-green border border-dys-green/30 py-2 hover:bg-dys-green hover:text-black">
                                            {showExportPubECDH ? 'HIDE PUB' : 'EXPORT PUB'}
                                        </button>
                                        <button onClick={() => setShowExportECDH(!showExportECDH)} className="flex-1 bg-dys-panel text-gray-400 border border-gray-700 py-2 hover:bg-white hover:text-black">
                                            {showExportECDH ? 'HIDE PRIV' : 'EXPORT PRIV'}
                                        </button>
                                        <button onClick={() => { localStorage.removeItem(`dys_priv_key_${mySoulIdStr}`); setHasECDH(false); }} className="px-3 bg-dys-red/10 text-dys-red border border-dys-red/50 py-2 hover:bg-dys-red hover:text-black">
                                            WIPE
                                        </button>
                                    </div>
                                    <button onClick={handleBroadcastECDH} disabled={isGenerating} className="w-full bg-dys-green/20 text-dys-green border border-dys-green/50 py-2 hover:bg-dys-green hover:text-black disabled:opacity-50">
                                        {isGenerating ? 'BROADCASTING...' : 'BROADCAST ECDH PUBLIC KEY'}
                                    </button>
                                </div>
                                {showExportPubECDH && (
                                    <div className="mt-2 p-2 border border-dys-green/30 bg-black">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[10px] text-dys-green">PUBLIC KEY (BASE64 SPKI)</p>
                                            <button onClick={() => { navigator.clipboard.writeText(myECDHPubKey || ''); addLog({id:Date.now().toString(), timestamp:new Date().toLocaleTimeString(), type:'SUCCESS', message:'ECDH PubKey Copied'}); }} className="text-[9px] underline">COPY</button>
                                        </div>
                                        <textarea className="w-full h-16 bg-gray-900 text-gray-300 text-[10px] p-2 font-mono" readOnly value={myECDHPubKey || ''}></textarea>
                                    </div>
                                )}
                                {showExportECDH && (
                                    <div className="mt-2 p-2 border border-dys-red/30 bg-black">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[10px] text-dys-red">PRIVATE KEY (JWK JSON) - KEEP SECRET!</p>
                                            <button onClick={() => { navigator.clipboard.writeText(CryptoService.getECDHPrivateKeyString(mySoulIdStr) || ''); addLog({id:Date.now().toString(), timestamp:new Date().toLocaleTimeString(), type:'SUCCESS', message:'ECDH PrivKey Copied'}); }} className="text-[9px] underline text-dys-red">COPY</button>
                                        </div>
                                        <textarea className="w-full h-32 bg-gray-900 text-gray-300 text-[10px] p-2 font-mono" readOnly value={CryptoService.getECDHPrivateKeyString(mySoulIdStr) || ''}></textarea>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <button onClick={handleGenerateECDH} disabled={isGenerating} className="w-full border border-gray-600 text-gray-400 py-2 hover:bg-gray-800 disabled:opacity-50">
                                    {isGenerating ? 'WORKING...' : 'GENERATE P-256 PAIR'}
                                </button>
                                <div className="mt-4 pt-4 border-t border-dys-border">
                                    <p className="text-[10px] text-gray-500 mb-2">OR IMPORT EXISTING JWK KEY:</p>
                                    <textarea value={ecdhImportData} onChange={e => setEcdhImportData(e.target.value)} className="w-full h-24 bg-black border border-dys-border p-2 mb-2 text-[10px] focus:border-gray-500" placeholder='{"crv":"P-256","ext":true,...}'></textarea>
                                    <button onClick={handleImportECDH} className="w-full border border-gray-600 py-1 hover:bg-white hover:text-black">IMPORT ECDH</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-auto border border-dys-cyan/30 p-4 bg-dys-cyan/5 text-center shrink-0">
                <h3 className="text-dys-cyan font-bold mb-2">NETWORK PUBLICATION</h3>
                <p className="text-gray-400 mb-4">Your public keys must be broadcasted on-chain so other Pilots can encrypt messages meant for you. You can now broadcast them independently.</p>
            </div>
        </div>
    );
}