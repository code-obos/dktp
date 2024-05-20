export type Password = string & { __type: 'password' };
export type PasswordVerifier = string & { __type: 'password_verifier' };
export type Plaintext = string & { __type: 'plaintext' };
export type Ciphertext = string & { __type: 'ciphertext' };
export type CipherData = {
    ciphertext: Ciphertext;
    salt: string;
    iv: string;
    verifier: PasswordVerifier;
};

export class Encryption {
    static asPassword(password: string): Password {
        return password as Password;
    }

    static asPlaintext(data: string): Plaintext {
        return data as Plaintext;
    }

    static async encrypt(password: Password, data: Plaintext): Promise<CipherData> {
        const encoder = new TextEncoder();
        const salt = getRandomBits(128);
        const [key, verifier] = await expandAndSplitPassword(password, salt);

        const iv = getRandomBits(256);
        const params: AesGcmParams = {
            name: 'AES-GCM',
            iv,
        };

        const ciphertext = await crypto.subtle.encrypt(params, key, encoder.encode(data));

        return {
            ciphertext: Buffer.from(ciphertext).toString('base64') as Ciphertext,
            salt: Buffer.from(salt).toString('base64'),
            iv: Buffer.from(iv).toString('base64'),
            verifier,
        };
    }

    static async decrypt(password: Password, data: CipherData): Promise<Plaintext> {
        const decoder = new TextDecoder();
        const salt = new Uint8Array(Buffer.from(data.salt, 'base64'));
        const iv = new Uint8Array(Buffer.from(data.iv, 'base64'));

        const [key, verifier] = await expandAndSplitPassword(password, salt);
        if (verifier !== data.verifier) throw new Error('Password mistmach');

        const ciphertext = new Uint8Array(Buffer.from(data.ciphertext, 'base64'));

        const params: AesGcmParams = {
            name: 'AES-GCM',
            iv,
        };

        const plaintext = await crypto.subtle.decrypt(params, key, ciphertext);

        return decoder.decode(plaintext) as Plaintext;
    }
}

function getRandomBits(bits: number): NodeJS.TypedArray {
    const data = new Uint8Array(bits / 8);
    crypto.getRandomValues(data);
    return data;
}

async function createCryptoKey(data: ArrayBuffer, keyUsages: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', data, { name: 'AES-GCM', length: data.byteLength * 8 }, false, keyUsages);
}

async function expandAndSplitPassword(
    password: Password,
    salt: NodeJS.TypedArray,
    iterations: number = 100_000,
): Promise<[CryptoKey, PasswordVerifier]> {
    const encoder = new TextEncoder();

    const key: CryptoKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
        'deriveBits',
    ]);

    const expandedKey = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            hash: 'SHA-512',
            salt,
            iterations,
        },
        key,
        512,
    );

    const firstHalf = expandedKey.slice(0, 32);
    const lastHalf = expandedKey.slice(32);

    const cryptokey: CryptoKey = await createCryptoKey(firstHalf, ['encrypt', 'decrypt']);
    const verifier: PasswordVerifier = Buffer.from(lastHalf).toString('base64') as PasswordVerifier;

    return [cryptokey, verifier];
}
