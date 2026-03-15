// services/cryptoService.ts

// Web Crypto API Wrapper for ECDH + AES-GCM Encrypted DMs

export class CryptoService {
    private static keyStorePrefix = 'dys_priv_key';

    /**
     * Internal: Derive an AES-GCM key from an ECDH shared secret
     */
    private static async deriveAESKey(sharedSecretBits: ArrayBuffer): Promise<CryptoKey> {
        // We use HKDF or simply SHA-256 for KDF
        const hash = await crypto.subtle.digest('SHA-256', sharedSecretBits);
        return await crypto.subtle.importKey(
            'raw',
            hash,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Generate new ECDH P-256 Key Pair.
     * Stores the private key in localStorage and returns the public key as Base64 SPKI.
     */
    static async generateKeyPair(soulId: string): Promise<string> {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            true, // extractable
            ["deriveKey", "deriveBits"]
        );

        // Export private key to JWK and save to localStorage
        const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
        localStorage.setItem(`${this.keyStorePrefix}_${soulId}`, JSON.stringify(privJwk));

        // Export public key to SPKI buffer
        const pubSpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
        return this.arrayBufferToBase64(pubSpki);
    }

    /**
     * Get the stored private key for a given Soul ID
     */
    static async getPrivateKey(soulId: string): Promise<CryptoKey | null> {
        const jwkStr = localStorage.getItem(`${this.keyStorePrefix}_${soulId}`);
        if (!jwkStr) return null;

        const jwk = JSON.parse(jwkStr);
        return await crypto.subtle.importKey(
            "jwk",
            jwk,
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            true,
            ["deriveKey", "deriveBits"]
        );
    }

    /**
     * Check if a soul ID has an initialized private key
     */
    static hasPrivateKey(soulId: string): boolean {
        return !!localStorage.getItem(`${this.keyStorePrefix}_${soulId}`);
    }

    /**
     * Encrypt a message for a recipient using their Public Key (Base64 SPKI)
     * Returns: "IV:Ciphertext" (Base64 encoded)
     */
    static async encryptMessage(mySoulId: string, recipientPubKeyBase64: string, plaintext: string): Promise<string | null> {
        try {
            const myPrivKey = await this.getPrivateKey(mySoulId);
            if (!myPrivKey) throw new Error("Private key not found");

            // Import recipient public key
            const recipientSpki = this.base64ToArrayBuffer(recipientPubKeyBase64);
            const recipientPubKey = await crypto.subtle.importKey(
                "spki",
                recipientSpki,
                {
                    name: "ECDH",
                    namedCurve: "P-256",
                },
                true,
                []
            );

            // Derive shared secret
            const sharedSecret = await crypto.subtle.deriveBits(
                {
                    name: "ECDH",
                    public: recipientPubKey,
                },
                myPrivKey,
                256
            );

            // Derive AES Key from shared secret
            const aesKey = await this.deriveAESKey(sharedSecret);

            // Encrypt message
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encodedText = new TextEncoder().encode(plaintext);

            const ciphertext = await crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv,
                },
                aesKey,
                encodedText
            );

            const ivBase64 = this.arrayBufferToBase64(iv.buffer);
            const cipherBase64 = this.arrayBufferToBase64(ciphertext);

            return `${ivBase64}:${cipherBase64}`;
        } catch (error) {
            console.error("Encryption failed:", error);
            return null;
        }
    }

    /**
     * Derive raw shared secret bytes for use in on-chain cryptography (like ENCRYPT lib)
     * Returns a Uint8Array (32 bytes)
     */
    static async deriveSharedSecretBytes(mySoulId: string, recipientPubKeyBase64: string): Promise<Uint8Array> {
        const myPrivKey = await this.getPrivateKey(mySoulId);
        if (!myPrivKey) throw new Error("Private key not found");

        const recipientSpki = this.base64ToArrayBuffer(recipientPubKeyBase64);
        const recipientPubKey = await crypto.subtle.importKey(
            "spki",
            recipientSpki,
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            true,
            []
        );

        const sharedSecret = await crypto.subtle.deriveBits(
            {
                name: "ECDH",
                public: recipientPubKey,
            },
            myPrivKey,
            256
        );

        return new Uint8Array(sharedSecret);
    }

    /**
     * Decrypt a message from a sender using their Public Key (Base64 SPKI)
     * Payload should be "IV:Ciphertext" (Base64 encoded)
     */
    static async decryptMessage(mySoulId: string, senderPubKeyBase64: string, payload: string): Promise<string | null> {
        try {
            const myPrivKey = await this.getPrivateKey(mySoulId);
            if (!myPrivKey) throw new Error("Private key not found");

            const [ivBase64, cipherBase64] = payload.split(":");
            if (!ivBase64 || !cipherBase64) throw new Error("Invalid payload format");

            // Import sender public key
            const senderSpki = this.base64ToArrayBuffer(senderPubKeyBase64);
            const senderPubKey = await crypto.subtle.importKey(
                "spki",
                senderSpki,
                {
                    name: "ECDH",
                    namedCurve: "P-256",
                },
                true,
                []
            );

            // Derive shared secret
            const sharedSecret = await crypto.subtle.deriveBits(
                {
                    name: "ECDH",
                    public: senderPubKey,
                },
                myPrivKey,
                256
            );

            // Derive AES key
            const aesKey = await this.deriveAESKey(sharedSecret);

            const iv = new Uint8Array(this.base64ToArrayBuffer(ivBase64));
            const ciphertext = this.base64ToArrayBuffer(cipherBase64);

            const decryptedData = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv,
                },
                aesKey,
                ciphertext
            );

            return new TextDecoder().decode(decryptedData);
        } catch (error) {
            console.warn("Decryption failed:", error);
            return null;
        }
    }

    // --- Helpers ---
    private static arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    private static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
