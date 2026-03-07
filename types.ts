
import { Contract, InterfaceAbi } from "ethers";

export enum AppView {
  COMMAND_DECK = 'COMMAND_DECK', // Merged Dashboard + Identity
  NAVIGATION = 'NAVIGATION', // QingMap
  COMMS = 'COMMS', // VoidChat + Channels
  OPERATIONS = 'OPERATIONS', // Game Loop (Cheon/War/World)
  MARKET = 'MARKET', // Exchange
  LAU_REGISTRY = 'LAU_REGISTRY',
  CONTRACT_STUDIO = 'CONTRACT_STUDIO',
  SETTINGS = 'SETTINGS',
  QING = 'QING',
  DATA_IO = 'DATA_IO'
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'ERROR' | 'TX' | 'AI' | 'SUCCESS';
  message: string;
  details?: any;
}

export interface UserContext {
  address: string | null;
  isConnected: boolean;
  providerType: 'INJECTED' | 'MNEMONIC' | 'READ_ONLY';
  balance: string;
  lauAddress: string | null;
  username: string | null;
  currentArea: string | null; // The address of the QING or VOID the user is in
  yue: string | null; // Linked YUE address
  qings: string[]; // List of known QING addresses
  saat?: {
      pole: string;
      soul: string;
      aura: string;
  };
  // Unified Map Sync State
  mapSync: {
      isScanning: boolean;
      progress: string;
      lastUpdate: number; // Timestamp of last successful chunk scan
      triggerSync: () => void;
      stopSync: () => void;
  };
}

export interface DysnomiaContract {
  name: string;
  address: string;
  type: 'CORE' | 'ASSET' | 'USER' | 'CUSTOM';
  abi: InterfaceAbi;
}

export interface ChatMessage {
  id: string;
  sender: string;
  username?: string;
  content: string;
  timestamp: number;
  blockNumber: number;
  isMe: boolean;
}

export interface ContractInteractionRequest {
    contractName: string; // The name in the registry, or "CUSTOM"
    address?: string; // Optional override or for instances
    functionName?: string;
    args?: any[];
    description?: string;
}

export interface PowerTokenData {
    name: string;
    symbol: string;
    address: string;
    balanceWallet: string;
    balanceLau: string;
    balanceYue: string;
    strategicTarget: 'LAU' | 'YUE' | 'ANY'; // Where it "should" be
}
