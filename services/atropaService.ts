import { formatUnits, parseUnits, ZeroAddress } from 'ethers';
import { Web3Service } from './web3Service';
import { TreasuryToken, FederalSpine } from '../types';
import {
    ATROPA_ADDRESSES,
    ATROPA_MINTER_ABI,
    ATROPA_TT_ABI,
    ATROPA_TT_V4_ABI,
    ATROPA_VOTE_ABI,
    ERC20_ABI,
    MinterType,
    ATROPA_TOKEN_REGISTRY,
    getRegistryTokensByMinter,
    isInRegistry,
    ADDRESSES,
    PULSEX_ROUTER_ABI
} from '../constants';

// ---------------------------------------------------------------------------
// Atropa Service — On-chain interaction layer for the Treasury System
// ---------------------------------------------------------------------------

const MINTER_ADDRESSES: Record<MinterType, string> = {
    CORE: ZeroAddress,
    V1: ATROPA_ADDRESSES.V1_TBILL_MINTER,
    V2: ATROPA_ADDRESSES.V2_FEDERAL_MINTER,
    V3: ATROPA_ADDRESSES.V3_INDEX_MINTER,
    V4: ATROPA_ADDRESSES.V4_PERSONAL_MINTER,
};

function getTTAbi(minterType: MinterType) {
    return minterType === 'V4' ? ATROPA_TT_V4_ABI : ATROPA_TT_ABI;
}

// ---------------------------------------------------------------------------
// Token Details Caching (In-Memory + Persistent)
// ---------------------------------------------------------------------------

interface CacheEntry {
    data: TreasuryToken;
    timestamp: number;
}
const tokenCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const LS_CACHE_KEY = 'DYSNOMIA_ATROPA_STATIC_CACHE';

// Global static map to persist names, symbols, parents which NEVER change
const staticCache: Record<string, Partial<TreasuryToken>> = {};

function initCache() {
    if (typeof window === 'undefined') return;
    try {
        const stored = localStorage.getItem(LS_CACHE_KEY);
        if (stored) {
            Object.assign(staticCache, JSON.parse(stored));
        }
    } catch {}
}
initCache();

export function clearTokenCache() {
    for (const key in tokenCache) {
        delete tokenCache[key];
    }
    if (typeof window !== 'undefined') {
        localStorage.removeItem(LS_CACHE_KEY);
        for (const key in staticCache) delete staticCache[key];
    }
}

function updateStaticCache(token: TreasuryToken) {
    if (typeof window === 'undefined') return;
    const addr = token.address.toLowerCase();
    
    // Only save what we need to bypass static RPC reads
    staticCache[addr] = {
        name: token.name,
        symbol: token.symbol,
        parentAddress: token.parentAddress,
        parentName: token.parentName,
        parentSymbol: token.parentSymbol,
        creatorAddress: token.creatorAddress,
        debenture: token.debenture,
        multiplier: token.multiplier,
        initialMint: token.initialMint,
        minterAddress: token.minterAddress,
        minterType: token.minterType,
    };
    
    try {
        localStorage.setItem(LS_CACHE_KEY, JSON.stringify(staticCache));
    } catch {} // ignore quota errors
}

// ---------------------------------------------------------------------------
// Token Details
// ---------------------------------------------------------------------------

export async function getTokenDetails(
    web3: Web3Service,
    tokenAddress: string,
    minterType?: MinterType,
    userAddress?: string | null,
    forceRefresh: boolean = false
): Promise<TreasuryToken> {
    const cacheKey = `${tokenAddress.toLowerCase()}_${userAddress || 'none'}`;
    const staticData = staticCache[tokenAddress.toLowerCase()];
    const now = Date.now();

    if (!forceRefresh && tokenCache[cacheKey] && (now - tokenCache[cacheKey].timestamp) < CACHE_TTL_MS) {
        return tokenCache[cacheKey].data;
    }

    const abi = minterType ? getTTAbi(minterType) : ATROPA_TT_ABI;
    const token = web3.getContract(tokenAddress, abi);

    // Reuse static properties if available to save RPC calls
    const [name, symbol, parentAddr] = await Promise.all([
        staticData?.name || token.name().catch(() => 'Unknown'),
        staticData?.symbol || token.symbol().catch(() => '???'),
        minterType === 'V1' ? Promise.resolve('0x463413c579D29c26D59a65312657DFCe30D545A1') : (staticData?.parentAddress || token.Parent().catch(() => ZeroAddress)),
    ]);
    
    // Total supply is always dynamic
    const totalSupplyWei = await token.totalSupply().catch(() => 0n);

    // Debenture — only relevant for V2+ tokens
    let debenture = staticData?.debenture ?? false;
    if (staticData?.debenture === undefined) {
        try {
            debenture = await token.Debenture();
        } catch { /* V1 tokens don't have Debenture */ }
    }

    // Multiplier — only V3/V4
    let multiplier = staticData?.multiplier;
    if (multiplier === undefined && (minterType === 'V3' || minterType === 'V4')) {
        try {
            const m = await token.Multiplier(0);
            multiplier = m.toString();
        } catch { }
    }

    // Initial mint (V4 only)
    let initialMint = staticData?.initialMint;
    if (initialMint === undefined && minterType === 'V4') {
        try {
            const m = await token.Mint();
            initialMint = formatUnits(m, 18);
        } catch { }
    }

    // Creator
    let creatorAddress = staticData?.creatorAddress;
    if (creatorAddress === undefined) {
        try {
            creatorAddress = await token.Creator();
        } catch { }
    }

    // Parent name/symbol
    let parentName = staticData?.parentName;
    let parentSymbol = staticData?.parentSymbol;
    
    if (minterType === 'V1') {
        parentName = 'Treasury Bill';
        parentSymbol = 'TBILL';
    } else if (!parentName && parentAddr && parentAddr !== ZeroAddress) {
        try {
            const parentToken = web3.getContract(parentAddr, ERC20_ABI);
            [parentName, parentSymbol] = await Promise.all([
                parentToken.name(),
                parentToken.symbol(),
            ]);
        } catch { }
    }

    // User-specific data
    let userBalance: string | undefined;
    let userHu: number | undefined;
    if (userAddress) {
        try {
            const bal = await token.balanceOf(userAddress);
            userBalance = formatUnits(bal, 18);
        } catch { }
        try {
            const hu = await token._hu(userAddress);
            userHu = Number(hu);
        } catch { }
    }

    // Determine minterAddress
    const minterAddr = minterType ? MINTER_ADDRESSES[minterType] : '';

    const tokenData: TreasuryToken = {
        address: tokenAddress,
        name,
        symbol,
        minterType: minterType || staticData?.minterType || 'V1',
        minterAddress: minterAddr,
        parentAddress: parentAddr,
        parentName,
        parentSymbol,
        debenture,
        totalSupply: formatUnits(totalSupplyWei, 18),
        creatorAddress,
        userBalance,
        userHu,
        multiplier,
        initialMint,
    };

    tokenCache[cacheKey] = { data: tokenData, timestamp: now };
    
    // Save to static tracking
    if (tokenData.name && tokenData.name !== 'Unknown') {
        updateStaticCache(tokenData);
    }
    
    return tokenData;
}

// ---------------------------------------------------------------------------
// Batch token loading for system tokens
// ---------------------------------------------------------------------------

export async function getSystemTokensByMinter(
    web3: Web3Service,
    minterType: MinterType,
    userAddress?: string | null,
    forceRefresh: boolean = false
): Promise<TreasuryToken[]> {
    const registryTokens = getRegistryTokensByMinter(minterType);

    // Return unhydrated tokens instantly
    const loadedTokens: TreasuryToken[] = registryTokens.map(entry => {
        const minterAddr = minterType ? MINTER_ADDRESSES[minterType] : ZeroAddress;
        // Check cache first if forceRefresh is false
        const cacheKey = `${entry.address.toLowerCase()}_${userAddress || 'none'}`;
        if (!forceRefresh && tokenCache[cacheKey] && (Date.now() - tokenCache[cacheKey].timestamp) < CACHE_TTL_MS) {
             const cached = tokenCache[cacheKey].data;
             cached.isVerified = true;
             cached.coreSubCategory = entry.coreSubCategory;
             return cached;
        }
        
        return {
            address: entry.address,
            name: entry.name,
            symbol: entry.symbol || 'UNK',
            minterType: entry.minterType,
            coreSubCategory: entry.coreSubCategory,
            isVerified: true,
            minterAddress: minterAddr,
            parentAddress: entry.minterType === 'V1' ? '0x463413c579D29c26D59a65312657DFCe30D545A1' : ZeroAddress,
            parentName: entry.minterType === 'V1' ? 'Treasury Bill' : undefined,
            parentSymbol: entry.minterType === 'V1' ? 'TBILL' : undefined,
            debenture: false,
            totalSupply: '0',
            creatorAddress: ZeroAddress,
            isHydrated: false,
        };
    });

    return loadedTokens;
}

// ---------------------------------------------------------------------------
// Lazy Hydration & Parity
// ---------------------------------------------------------------------------

export async function getTokenMarketParity(web3: Web3Service, token: TreasuryToken): Promise<{ratio: string, status: 'UNDER' | 'OVER' | 'PARITY', deviation: number, parityRatio: number} | null> {
    if (!token.parentAddress || token.parentAddress === ZeroAddress || !token.multiplier) return null;
    
    try {
        const router = web3.getContract(ADDRESSES.PULSEX_V2_ROUTER, PULSEX_ROUTER_ABI);
        const amountIn = parseUnits("1", 18);
        
        // Path: Child -> Parent directly via PulseX
        // If no direct pair, it reverts
        const amounts = await router.getAmountsOut(amountIn, [token.address, token.parentAddress]);
        const marketOutput = amounts[amounts.length - 1];
        
        // Multiplier dictates how much Parent you need for 1 Child
        // So 1 Child = Multiplier Parent.
        const mintMultiplierWei = parseUnits(token.multiplier, 18);
        
        const marketOutputFloat = parseFloat(formatUnits(marketOutput, 18));
        const mintCostFloat = parseFloat(token.multiplier);
        
        const deviation = ((marketOutputFloat - mintCostFloat) / mintCostFloat) * 100;
        const parityRatio = mintCostFloat > 0 ? (marketOutputFloat / mintCostFloat) : 0;
        
        // Tolerance for parity = 1%
        let status: 'UNDER' | 'OVER' | 'PARITY' = 'PARITY';
        if (deviation > 1) status = 'OVER';
        else if (deviation < -1) status = 'UNDER';
        
        return {
            ratio: `1 : ${marketOutputFloat.toFixed(4)}`,
            status,
            deviation,
            parityRatio
        };
    } catch {
        return null;
    }
}

export async function hydrateTokenData(
    web3: Web3Service,
    token: TreasuryToken,
    userAddress?: string | null
): Promise<TreasuryToken> {
   if (token.isHydrated) return token;
   
   const hydratedToken = await getTokenDetails(web3, token.address, token.minterType, userAddress, true);
   
   if (token.minterType === 'V3' || token.minterType === 'V4') {
       const parityData = await getTokenMarketParity(web3, hydratedToken);
       if (parityData) {
           hydratedToken.parityRatio = parityData.ratio;
           hydratedToken.parityStatus = parityData.status;
           hydratedToken.parityDeviation = parityData.deviation;
           hydratedToken.parityMultiple = parityData.parityRatio;
       } else {
           hydratedToken.parityStatus = 'UNKNOWN';
       }
   }
   
   const entry = isInRegistry(hydratedToken.address);
   if (entry) {
       hydratedToken.isVerified = true;
       hydratedToken.coreSubCategory = entry.coreSubCategory;
   }
   
   hydratedToken.isHydrated = true;
   
   // Update cache
   const cacheKey = `${hydratedToken.address.toLowerCase()}_${userAddress || 'none'}`;
   tokenCache[cacheKey] = { data: hydratedToken, timestamp: Date.now() };
   
   return hydratedToken;
}

// ---------------------------------------------------------------------------
// Multiplier Calculation (V3/V4)
// ---------------------------------------------------------------------------

export async function calculateMintCost(
    web3: Web3Service,
    tokenAddress: string,
    amount: bigint,
    minterType: MinterType
): Promise<bigint> {
    if (minterType === 'V1' || minterType === 'V2') {
        return amount; // 1:1 ratio
    }

    const token = web3.getContract(tokenAddress, getTTAbi(minterType));
    const multiplier = await token.Multiplier(amount);
    return amount * multiplier;
}

// ---------------------------------------------------------------------------
// Minting — uses web3.getContract() which auto-connects signer
// ---------------------------------------------------------------------------

export async function mintTokens(
    web3: Web3Service,
    tokenAddress: string,
    amount: bigint,
    minterType: MinterType
): Promise<string> {
    const token = web3.getContract(tokenAddress, getTTAbi(minterType));

    // Get parent and compute cost
    const parentAddr = await token.Parent();
    const cost = await calculateMintCost(web3, tokenAddress, amount, minterType);

    // Approve parent token via web3 helper
    const approveTx = await web3.approve(parentAddr, tokenAddress, cost);
    await web3.waitForReceipt(approveTx);

    // Execute mint
    const mintTx = await token.mint(amount);
    const receipt = await web3.waitForReceipt(mintTx);
    return receipt?.hash || '';
}

// ---------------------------------------------------------------------------
// Claim (V2 Infinite Mint)
// ---------------------------------------------------------------------------

export async function claimV2(
    web3: Web3Service,
    tokenAddress: string,
    childContract: string,
    amount: bigint
): Promise<string> {
    const token = web3.getContract(tokenAddress, ATROPA_TT_ABI);

    // Approve the child token to be sent to the claiming token
    const approveTx = await web3.approve(childContract, tokenAddress, amount);
    await web3.waitForReceipt(approveTx);

    // Execute claim
    const claimTx = await token.Claim(childContract, amount);
    const receipt = await web3.waitForReceipt(claimTx);
    return receipt?.hash || '';
}

// ---------------------------------------------------------------------------
// Claim (V4 Personal - different signature)
// ---------------------------------------------------------------------------

export async function claimV4(
    web3: Web3Service,
    tokenAddress: string,
    amount: bigint
): Promise<string> {
    const token = web3.getContract(tokenAddress, ATROPA_TT_V4_ABI);

    // Approve token to spend itself
    const approveTx = await web3.approve(tokenAddress, tokenAddress, amount);
    await web3.waitForReceipt(approveTx);

    const claimTx = await token.Claim(amount);
    const receipt = await web3.waitForReceipt(claimTx);
    return receipt?.hash || '';
}

// ---------------------------------------------------------------------------
// Publish (V2)
// ---------------------------------------------------------------------------

export async function publishToken(
    web3: Web3Service,
    tokenAddress: string
): Promise<string> {
    const token = web3.getContract(tokenAddress, ATROPA_TT_ABI);
    const tx = await token.publish();
    const receipt = await web3.waitForReceipt(tx);
    return receipt?.hash || '';
}

// ---------------------------------------------------------------------------
// Permission management
// ---------------------------------------------------------------------------

export async function getUserPermission(
    web3: Web3Service,
    tokenAddress: string,
    userAddress: string
): Promise<number> {
    const token = web3.getContract(tokenAddress, ATROPA_TT_ABI);
    try {
        const hu = await token._hu(userAddress);
        return Number(hu);
    } catch {
        return 0;
    }
}

export async function setPermission(
    web3: Web3Service,
    tokenAddress: string,
    target: string,
    level: number
): Promise<string> {
    const token = web3.getContract(tokenAddress, ATROPA_TT_ABI);
    const tx = await token.hu(target, level);
    const receipt = await web3.waitForReceipt(tx);
    return receipt?.hash || '';
}

// ---------------------------------------------------------------------------
// Parent Chain / Spine Traversal
// ---------------------------------------------------------------------------

export async function traceParentChain(
    web3: Web3Service,
    tipAddress: string,
    maxDepth: number = 50
): Promise<TreasuryToken[]> {
    const chain: TreasuryToken[] = [];
    let currentAddress = tipAddress;

    for (let i = 0; i < maxDepth; i++) {
        try {
            const regInfo = await isRegisteredToken(web3, currentAddress);
            const resolvedMinterType = regInfo.registered && regInfo.minterType ? regInfo.minterType : 'V2';
            
            const token = await getTokenDetails(web3, currentAddress, resolvedMinterType);
            chain.unshift(token); // Add to front (building root -> tip)

            if (
                !token.parentAddress ||
                token.parentAddress === ZeroAddress ||
                token.parentAddress === ATROPA_ADDRESSES.FED
            ) {
                // Reached root — add FED as final entry
                if (token.parentAddress === ATROPA_ADDRESSES.FED) {
                    try {
                        const fed = await getTokenDetails(web3, ATROPA_ADDRESSES.FED, 'V2');
                        chain.unshift(fed);
                    } catch { }
                }
                break;
            }

            currentAddress = token.parentAddress;
        } catch {
            break;
        }
    }

    return chain;
}

// ---------------------------------------------------------------------------
// CROWS Governance
// ---------------------------------------------------------------------------

export async function getCrowsBalance(
    web3: Web3Service,
    userAddress: string
): Promise<string> {
    const crows = web3.getContract(ATROPA_ADDRESSES.CROWS, ERC20_ABI);
    try {
        const bal = await crows.balanceOf(userAddress);
        return formatUnits(bal, 18);
    } catch {
        return '0';
    }
}

export async function canVote(web3: Web3Service, userAddress: string): Promise<boolean> {
    const balance = await getCrowsBalance(web3, userAddress);
    return parseFloat(balance) >= 25;
}

// ---------------------------------------------------------------------------
// Token Ownership Check (is this a registered treasury token?)
// ---------------------------------------------------------------------------

export async function isRegisteredToken(
    web3: Web3Service,
    tokenAddress: string
): Promise<{ registered: boolean; minterType?: MinterType; owner?: string }> {
    for (const [type, addr] of Object.entries(MINTER_ADDRESSES)) {
        try {
            const minter = web3.getContract(addr, ATROPA_MINTER_ABI);
            const owner = await minter.GetTreasuryTokenOwner(tokenAddress);
            if (owner && owner !== ZeroAddress) {
                return { registered: true, minterType: type as MinterType, owner };
            }
        } catch { }
    }
    return { registered: false };
}

// ---------------------------------------------------------------------------
// Create new Treasury Token
// ---------------------------------------------------------------------------

export async function createToken(
    web3: Web3Service,
    minterType: MinterType,
    name: string,
    symbol: string,
    initialMint: bigint,
    parentAddress: string
): Promise<string> {
    const minterAddr = MINTER_ADDRESSES[minterType];
    const minter = web3.getContract(minterAddr, ATROPA_MINTER_ABI);

    // Approve WM token for the creation fee (= initialMint)
    const approveTx = await web3.approve(ATROPA_ADDRESSES.WM, minterAddr, initialMint);
    await web3.waitForReceipt(approveTx);

    // Create the token
    const tx = await minter.New(name, symbol, initialMint, parentAddress);
    const receipt = await web3.waitForReceipt(tx);
    return receipt?.hash || '';
}

// ---------------------------------------------------------------------------
// LocalStorage helpers for imported tokens and spines
// ---------------------------------------------------------------------------

const STORAGE_KEY_TOKENS = 'atropa_imported_tokens';
const STORAGE_KEY_SPINES = 'atropa_imported_spines';

export function getImportedTokenAddresses(): string[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_TOKENS);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function saveImportedToken(address: string): void {
    const tokens = getImportedTokenAddresses();
    if (!tokens.includes(address.toLowerCase())) {
        tokens.push(address.toLowerCase());
        localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(tokens));
    }
}

export function removeImportedToken(address: string): void {
    const tokens = getImportedTokenAddresses().filter(
        t => t !== address.toLowerCase()
    );
    localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(tokens));
}

export function getImportedSpines(): FederalSpine[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_SPINES);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function saveImportedSpine(spine: FederalSpine): void {
    const spines = getImportedSpines();
    const idx = spines.findIndex(s => s.id === spine.id);
    if (idx >= 0) {
        spines[idx] = spine;
    } else {
        spines.push(spine);
    }
    localStorage.setItem(STORAGE_KEY_SPINES, JSON.stringify(spines));
}

export function removeImportedSpine(spineId: string): void {
    const spines = getImportedSpines().filter(s => s.id !== spineId);
    localStorage.setItem(STORAGE_KEY_SPINES, JSON.stringify(spines));
}
