
import { BrowserProvider, JsonRpcProvider, Wallet, Contract, formatEther, InterfaceAbi, parseEther, TransactionResponse, TransactionReceipt, MaxUint256, WebSocketProvider, AbstractProvider, Network } from "ethers";
import { DEFAULT_RPC_URL, LAU_ABI } from "../constants";

export class Web3Service {
  private provider: AbstractProvider;
  private signer: any; // Signer or Wallet

  constructor(rpcUrl: string = DEFAULT_RPC_URL, privateKey?: string) {
    // Explicitly define PulseChain network (Chain ID 369)
    // Using 369n (BigInt) to ensure type compatibility with Ethers v6
    const pulseNetwork = new Network("pulsechain", 369n);

    // Initialize Provider with explicit network to avoid 'network changed' errors
    if (rpcUrl.startsWith('wss')) {
        this.provider = new WebSocketProvider(rpcUrl, pulseNetwork);
    } else {
        // staticNetwork optimization to prevent chainId polling
        this.provider = new JsonRpcProvider(rpcUrl, pulseNetwork, { staticNetwork: pulseNetwork });
    }

    if (privateKey) {
      // Backend/Node Mode
      this.signer = new Wallet(privateKey, this.provider);
    } 
  }

  async connect(): Promise<string> {
    if (this.signer && this.signer.getAddress) {
      return await this.signer.getAddress();
    } 
    
    // Handle Injected Provider (Metamask)
    if ((window as any).ethereum) {
       // Create a BrowserProvider specifically for signing
       // "any" allows the provider to be flexible with underlying network changes handled by the wallet
       const browserProvider = new BrowserProvider((window as any).ethereum, "any");
       
       await browserProvider.send("eth_requestAccounts", []);
       this.signer = await browserProvider.getSigner();
       return await this.signer.getAddress();
    }
    
    throw new Error("Cannot connect: No wallet found");
  }

  hasSigner(): boolean {
      return !!this.signer;
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return formatEther(balance);
  }

  async getCode(address: string): Promise<string> {
    return await this.provider.getCode(address);
  }

  getContract(address: string, abi: InterfaceAbi) {
    if (!this.signer) return new Contract(address, abi, this.provider);
    return new Contract(address, abi, this.signer);
  }

  async simulateTransaction(contract: Contract, method: string, args: any[]): Promise<any> {
    try {
      // Static call simulates execution without mining
      const result = await contract[method].staticCall(...args);
      return { success: true, result };
    } catch (error: any) {
      // Pass raw error data if available for decoding
      const data = error?.data || error?.transaction?.data || error?.info?.error?.data;
      return { success: false, error: this.parseError(error), rawData: data };
    }
  }

  async sendTransaction(contract: Contract, method: string, args: any[]): Promise<TransactionResponse> {
    const tx = await contract[method](...args);
    return tx;
  }

  /**
   * Protocol Identity Wrapper
   * Routes interaction through the User's LAU (Soul Shell) if available/applicable
   * to ensure Aura/Soul accumulation on the identity node.
   */
  async protocolCall(
      targetContract: Contract, 
      method: string, 
      args: any[], 
      userLauAddress: string | null
  ): Promise<TransactionResponse> {
      
      // IDENTITY ROUTING: CHAT
      // If the user is trying to Chat, and has a LAU, we route it through the LAU contract
      // so the protocol knows WHO is speaking (Identity Layer).
      if (method === 'Chat' && userLauAddress) {
          const lauContract = this.getContract(userLauAddress, LAU_ABI);
          // LAU.Chat(string) automatically broadcasts to the current area of the LAU
          return await lauContract.Chat(args[0]);
      }

      // Default: Direct Interaction
      return await targetContract[method](...args);
  }
  
  async waitForReceipt(tx: TransactionResponse): Promise<TransactionReceipt | null> {
      try {
          // Ethers v6 tx.wait handles replacements (speed ups) automatically
          return await tx.wait();
      } catch (error: any) {
          if (error.code === 'TRANSACTION_REPLACED') {
              // The transaction was replaced (speed up or cancel)
              // Return the receipt of the replacement transaction
              if (error.receipt) {
                  return error.receipt;
              }
          }
          // Re-throw other errors (reverts, network issues)
          throw error;
      }
  }

  getProvider() {
    return this.provider;
  }

  // --- ERC20 Helpers ---

  async checkAllowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
    try {
        const token = this.getContract(tokenAddress, ["function allowance(address,address) view returns (uint256)"]);
        return await token.allowance(owner, spender);
    } catch (e) {
        console.warn("Failed to check allowance", e);
        return 0n;
    }
  }

  async approve(tokenAddress: string, spender: string, amount: bigint = MaxUint256): Promise<TransactionResponse> {
    const token = this.getContract(tokenAddress, ["function approve(address,uint256) returns (bool)"]);
    return await token.approve(spender, amount);
  }

  // --- Error Handling ---

  parseError(error: any): string {
      // 1. Try to get the Revert Reason String directly
      if (error?.reason) return `Revert: ${error.reason}`;

      // 2. Dig into data payload (common in Ethers call exceptions)
      const data = error?.data || error?.transaction?.data || error?.info?.error?.data;
      if (data && typeof data === 'string' && data.length > 10) {
          return `Revert Data: ${data}`;
      }

      // 3. Handle specific error codes
      if (error?.code === 'CALL_EXCEPTION') {
          return "Transaction Reverted by Contract. Possible Causes: 1) Insufficient LAU Balance 2) Invalid Address 3) Not Admitted 4) Allowance Missing.";
      }
      if (error?.code === 'ACTION_REJECTED' || error?.code === 4001) {
          return "User Rejected Transaction.";
      }
      if (error?.code === 'UNSUPPORTED_OPERATION' && error?.operation === 'sendTransaction') {
          return "Wallet Not Connected. Read-Only Mode.";
      }
      if (error?.code === 'TRANSACTION_REPLACED') {
          return "Transaction Replaced (Speed Up/Cancel).";
      }

      // 4. Return Full Message
      if (error?.message) {
          return error.message;
      }
      
      return "Unknown Interaction Error";
  }
}
