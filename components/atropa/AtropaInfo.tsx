import React from 'react';

export default function AtropaInfo() {
    return (
        <div className="p-6 max-w-4xl mx-auto space-y-8 text-green-400 font-mono text-xs overflow-y-auto pb-20">
            <h2 className="text-xl font-bold border-b border-green-500/30 pb-2 text-white">
                ATROPA TREASURY SYSTEM: Architecture & Mechanics
            </h2>

            <section className="space-y-3">
                <h3 className="text-sm font-bold text-green-300">Overview</h3>
                <p className="opacity-80 leading-relaxed">
                    The Atropa ecosystem on PulseChain abandons the standard flat-token model in favor of deeply nested parent-child relationships, algorithmic minting multipliers, and dense liquidity bonding webs. The primary decentralized interface for interacting with the core Atropa tokenomics is the Treasury System, which categorizes tokens under various "Minter" typologies (V1 through V4).
                </p>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-bold text-[#00ff41] border-l-2 border-[#00ff41] pl-3 py-1 bg-[#00ff41]/5">V1: Treasury Bill Minter (1:1 Ratio)</h3>
                <p className="opacity-80 leading-relaxed pl-4">
                    The V1 minter utilizes a static 1:1 parental peg strictly hardcoded to the Treasury Bill (0x1a4E...EBe3). For every one Treasury Bill a user deposits into the contract, the minter generates exactly one unit of the designated child token. The deposited Treasury Bills are irretrievably locked within the minter contract forever, continuously contracting the circulating supply of Treasury Bills.
                </p>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-bold text-[#ff6b35] border-l-2 border-[#ff6b35] pl-3 py-1 bg-[#ff6b35]/5">V2: Federal Minter (Debenture Mechanics)</h3>
                <p className="opacity-80 leading-relaxed pl-4">
                    Unlike V1, which relies on value destruction (locking Treasury Bills forever), the V2 Federal Minter enables cyclic recursive liquidity generation without destroying the parent asset. A token creator defines an existing parent token, and users deposit that parent token into the V2 minter. However, the V2 minter contains the experimental `Debenture` variable. Rather than locking the deposited parent tokens, it funnels them directly to an external "recipient" address (often a liquidity pair).
                </p>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-bold text-[#00f0ff] border-l-2 border-[#00f0ff] pl-3 py-1 bg-[#00f0ff]/5">V3 & V4: Algorithmic Multipliers</h3>
                <p className="opacity-80 leading-relaxed pl-4">
                    The V3 (Index) and V4 (Personal) minters rely on algorithmic supply expansion constraints. They utilize a Multiplier function that scales the cost of minting as the total supply of the child token increases.
                    <br /><br />
                    • <strong className="text-white">V3 Index:</strong> The multiplier scales based on hardcoded constants (e.g. 1.11 billion supply intervals point to a multiplier of 2x).<br />
                    • <strong className="text-white">V4 Personal:</strong> The multiplier scales identically, but utilizing the `Mint` variable, which represents the exact initial supply defined by the creator at deployment.
                </p>
            </section>

            <section className="space-y-3">
                <h3 className="text-sm font-bold text-purple-400">Federal Spines & Token Routing</h3>
                <p className="opacity-80 leading-relaxed">
                    Because V2, V3, and V4 tokens inherently allow users to designate existing tokens as their foundational "parents," the ecosystem generates mathematically dense dependency graphs. Linear dependency graphs—where Token A acts as the parent of Token B, which in turn acts as the parent of Token C—are formally referred to as "Federal Spines". Every interaction flows upstream to create deep liquidity routing loops.
                </p>
            </section>
        </div>
    );
}
