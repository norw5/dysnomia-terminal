
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
  DATA_IO = 'DATA_IO',
  SECURE_COMMS = 'SECURE_COMMS'
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
  message: string;
  type: string; // The type field serves as the sender's Soul ID
  timestamp: number;
  channelParams?: any;
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

export interface Contact {
    address: string;
    soulId: string;
    username: string;
    pubKey?: string;
}

// ---------------------------------------------------------------------------
// ATROPA TYPES
// ---------------------------------------------------------------------------

export enum AtropaView {
    TREASURY_DECK = 'TREASURY_DECK',
    MINT_LAB = 'MINT_LAB',
    SPINE_MANAGER = 'SPINE_MANAGER',
    GOVERNANCE = 'GOVERNANCE',
    TOKEN_EXPLORER = 'TOKEN_EXPLORER',
}

export interface TreasuryToken {
    address: string;
    name: string;
    symbol: string;
    minterType: 'CORE' | 'V1' | 'V2' | 'V3' | 'V4';
    coreSubCategory?: 'INFRASTRUCTURE' | 'NATIVE' | 'GOVERNANCE' | 'ECONOMY';
    isVerified?: boolean;
    minterAddress: string;
    parentAddress: string;
    parentName?: string;
    parentSymbol?: string;
    debenture: boolean;
    totalSupply: string;
    creatorAddress?: string;
    userBalance?: string;
    userHu?: number;
    multiplier?: string;
    initialMint?: string;
    logoUrl?: string;
    
    // Feature: Progress/Parity Hydration
    isHydrated?: boolean;
    parityRatio?: string;
    parityStatus?: 'UNDER' | 'OVER' | 'PARITY' | 'UNKNOWN';
    parityDeviation?: number;
    parityMultiple?: number;
}

export interface FederalSpine {
    id: string;
    name: string;
    tokens: TreasuryToken[];
    rootAddress: string;
    tipAddress: string;
}

export interface AtropaUserContext {
    crowsBalance: string;
    canVote: boolean; // crowsBalance >= 25
    importedTokens: string[]; // User-imported token addresses
    importedSpines: FederalSpine[];
}
