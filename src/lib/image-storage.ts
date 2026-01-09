// src/lib/image-storage.ts
// IndexedDBを使った画像永続化

const DB_NAME = 'financial-analyzer-images';
const DB_VERSION = 1;
const STORE_NAME = 'page-images';

interface StoredImage {
    key: string;           // clientId_pageNumber
    clientId: string;
    pageNumber: number;
    imageData: string;     // Base64
    createdAt: string;
    updatedAt: string;
}

/**
 * IndexedDBを開く
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('clientId', 'clientId', { unique: false });
                store.createIndex('pageNumber', 'pageNumber', { unique: false });
            }
        };
    });
}

/**
 * 画像を保存
 */
export async function saveImage(
    clientId: string,
    pageNumber: number,
    imageData: string
): Promise<void> {
    const db = await openDB();
    const key = `${clientId}_${pageNumber}`;
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const data: StoredImage = {
            key,
            clientId,
            pageNumber,
            imageData,
            createdAt: now,
            updatedAt: now,
        };

        const request = store.put(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * 画像を取得
 */
export async function getImage(
    clientId: string,
    pageNumber: number
): Promise<string | null> {
    const db = await openDB();
    const key = `${clientId}_${pageNumber}`;

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const result = request.result as StoredImage | undefined;
            resolve(result?.imageData || null);
        };
    });
}

/**
 * 顧客の全画像を取得
 */
export async function getClientImages(
    clientId: string
): Promise<Map<number, string>> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('clientId');

        const request = index.getAll(clientId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const results = request.result as StoredImage[];
            const map = new Map<number, string>();
            for (const item of results) {
                map.set(item.pageNumber, item.imageData);
            }
            resolve(map);
        };
    });
}

/**
 * 顧客の全画像を保存
 */
export async function saveClientImages(
    clientId: string,
    images: Map<number, string>
): Promise<void> {
    const db = await openDB();
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        for (const [pageNumber, imageData] of images.entries()) {
            const key = `${clientId}_${pageNumber}`;
            const data: StoredImage = {
                key,
                clientId,
                pageNumber,
                imageData,
                createdAt: now,
                updatedAt: now,
            };
            store.put(data);
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * 画像を削除
 */
export async function deleteImage(
    clientId: string,
    pageNumber: number
): Promise<void> {
    const db = await openDB();
    const key = `${clientId}_${pageNumber}`;

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * 顧客の全画像を削除
 */
export async function deleteClientImages(clientId: string): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('clientId');

        const request = index.getAllKeys(clientId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const keys = request.result;
            for (const key of keys) {
                store.delete(key);
            }
            transaction.oncomplete = () => resolve();
        };
    });
}

/**
 * ストレージ使用量を取得（概算）
 */
export async function getStorageSize(): Promise<{ used: number; count: number }> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const results = request.result as StoredImage[];
            let totalSize = 0;
            for (const item of results) {
                totalSize += item.imageData.length;
            }
            resolve({
                used: totalSize,
                count: results.length,
            });
        };
    });
}

/**
 * 全データをクリア
 */
export async function clearAllImages(): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
