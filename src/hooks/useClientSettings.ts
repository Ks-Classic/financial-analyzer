// src/hooks/useClientSettings.ts
// 顧客別設定を管理するカスタムHook

import { useState, useCallback, useEffect } from 'react';
import { ClientSettings, PageCommentRegion } from '../types/multi-page-analysis';
import {
    saveClientImages,
    getClientImages,
    deleteClientImages,
    getStorageSize
} from '../lib/image-storage';

const STORAGE_KEY = 'financial-analyzer-client-settings';

interface UseClientSettingsResult {
    /** 全顧客設定の一覧 */
    clients: ClientSettings[];
    /** 現在選択中の顧客 */
    selectedClient: ClientSettings | null;
    /** 顧客を選択 */
    selectClient: (clientId: string | null) => void;
    /** 新規顧客を追加 */
    addClient: (clientName: string) => ClientSettings;
    /** 顧客を更新 */
    updateClient: (settings: ClientSettings) => void;
    /** 顧客を削除 */
    deleteClient: (clientId: string) => void;
    /** ページ範囲設定を更新 */
    updatePageRegion: (clientId: string, pageNumber: number, region: Partial<PageCommentRegion>) => void;
    /** ページ範囲設定を一括設定 */
    setPageRegions: (clientId: string, regions: PageCommentRegion[]) => void;
    /** 選択中顧客のページ範囲設定を取得 */
    getPageRegions: () => PageCommentRegion[];
    /** 読み込み中 */
    isLoading: boolean;
    /** 顧客の画像を保存 */
    saveImages: (clientId: string, images: Map<number, string>) => Promise<void>;
    /** 顧客の画像を読み込み */
    loadImages: (clientId: string) => Promise<Map<number, string>>;
    /** ストレージ使用量 */
    storageInfo: { used: number; count: number } | null;
}

/**
 * 一意のIDを生成
 */
function generateId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * LocalStorageから顧客設定を読み込む
 */
function loadClientsFromStorage(): ClientSettings[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            // Map型の復元
            return parsed.map((client: ClientSettings) => ({
                ...client,
                pagePromptTemplates: client.pagePromptTemplates
                    ? new Map(Object.entries(client.pagePromptTemplates))
                    : new Map(),
            }));
        }
    } catch (e) {
        console.error('Failed to load client settings:', e);
    }
    return [];
}

/**
 * LocalStorageに顧客設定を保存
 */
function saveClientsToStorage(clients: ClientSettings[]): void {
    try {
        // Map型をオブジェクトに変換して保存
        const serializable = clients.map(client => ({
            ...client,
            pagePromptTemplates: client.pagePromptTemplates
                ? Object.fromEntries(client.pagePromptTemplates)
                : {},
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
        console.error('Failed to save client settings:', e);
    }
}

/**
 * 顧客別設定を管理するカスタムHook
 */
export function useClientSettings(): UseClientSettingsResult {
    const [clients, setClients] = useState<ClientSettings[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 初期化時に読み込み
    useEffect(() => {
        const loaded = loadClientsFromStorage();
        setClients(loaded);
        setIsLoading(false);
    }, []);

    // 変更時に保存
    useEffect(() => {
        if (!isLoading) {
            saveClientsToStorage(clients);
        }
    }, [clients, isLoading]);

    // 選択中の顧客
    const selectedClient = clients.find(c => c.clientId === selectedClientId) || null;

    // 顧客を選択
    const selectClient = useCallback((clientId: string | null) => {
        setSelectedClientId(clientId);
    }, []);

    // 新規顧客を追加
    const addClient = useCallback((clientName: string): ClientSettings => {
        const now = new Date().toISOString();
        const newClient: ClientSettings = {
            clientId: generateId(),
            clientName,
            pageRegions: [],
            createdAt: now,
            updatedAt: now,
        };
        setClients(prev => [...prev, newClient]);
        setSelectedClientId(newClient.clientId);
        return newClient;
    }, []);

    // 顧客を更新
    const updateClient = useCallback((settings: ClientSettings) => {
        setClients(prev => prev.map(c =>
            c.clientId === settings.clientId
                ? { ...settings, updatedAt: new Date().toISOString() }
                : c
        ));
    }, []);

    // 顧客を削除
    const deleteClient = useCallback((clientId: string) => {
        setClients(prev => prev.filter(c => c.clientId !== clientId));
        if (selectedClientId === clientId) {
            setSelectedClientId(null);
        }
        // 画像データも削除
        deleteClientImages(clientId).catch(e => {
            console.error('Failed to delete client images:', e);
        });
    }, [selectedClientId]);

    // ページ範囲設定を更新
    const updatePageRegion = useCallback((
        clientId: string,
        pageNumber: number,
        regionUpdate: Partial<PageCommentRegion>
    ) => {
        setClients(prev => prev.map(client => {
            if (client.clientId !== clientId) return client;

            const existingIndex = client.pageRegions.findIndex(r => r.pageNumber === pageNumber);
            let newRegions: PageCommentRegion[];

            if (existingIndex >= 0) {
                // 既存の設定を更新
                newRegions = [...client.pageRegions];
                newRegions[existingIndex] = {
                    ...newRegions[existingIndex],
                    ...regionUpdate,
                };
            } else {
                // 新規追加
                const newRegion: PageCommentRegion = {
                    pageNumber,
                    region: { x: 0, y: 0.7, width: 1, height: 0.3 }, // デフォルト: 下部30%
                    isEnabled: true,
                    ...regionUpdate,
                };
                newRegions = [...client.pageRegions, newRegion].sort((a, b) => a.pageNumber - b.pageNumber);
            }

            return {
                ...client,
                pageRegions: newRegions,
                updatedAt: new Date().toISOString(),
            };
        }));
    }, []);

    // ページ範囲設定を一括設定
    const setPageRegions = useCallback((clientId: string, regions: PageCommentRegion[]) => {
        setClients(prev => prev.map(client => {
            if (client.clientId !== clientId) return client;
            return {
                ...client,
                pageRegions: regions.sort((a, b) => a.pageNumber - b.pageNumber),
                updatedAt: new Date().toISOString(),
            };
        }));
    }, []);

    // 選択中顧客のページ範囲設定を取得
    const getPageRegions = useCallback((): PageCommentRegion[] => {
        return selectedClient?.pageRegions || [];
    }, [selectedClient]);

    // ストレージ情報
    const [storageInfo, setStorageInfo] = useState<{ used: number; count: number } | null>(null);

    // ストレージ情報を更新
    const updateStorageInfo = useCallback(async () => {
        try {
            const info = await getStorageSize();
            setStorageInfo(info);
        } catch (e) {
            console.error('Failed to get storage size:', e);
        }
    }, []);

    // 初期化時にストレージ情報を取得
    useEffect(() => {
        updateStorageInfo();
    }, [updateStorageInfo]);

    // 顧客の画像を保存
    const saveImages = useCallback(async (clientId: string, images: Map<number, string>): Promise<void> => {
        await saveClientImages(clientId, images);
        await updateStorageInfo();
    }, [updateStorageInfo]);

    // 顧客の画像を読み込み
    const loadImages = useCallback(async (clientId: string): Promise<Map<number, string>> => {
        return await getClientImages(clientId);
    }, []);

    return {
        clients,
        selectedClient,
        selectClient,
        addClient,
        updateClient,
        deleteClient,
        updatePageRegion,
        setPageRegions,
        getPageRegions,
        isLoading,
        saveImages,
        loadImages,
        storageInfo,
    };
}
