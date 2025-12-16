import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url'; // Viteの ?url を使用

// PDF.js workerをCDNから読み込む
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(pdfWorkerURL, import.meta.url).toString();
}

interface PDFViewerProps {
  pdfFile: File | null;
  highlights?: Array<{
    page: number;
    text: string;
    type: 'error' | 'warning' | 'info';
  }>;
}

const PDFViewer: React.FC<PDFViewerProps> = ({
  pdfFile,
  highlights = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1.5); // ユーザーが操作するスケール
  const [autoScale, setAutoScale] = useState(1.0); // 自動調整スケール
  const [isUserZooming, setIsUserZooming] = useState(false); // ユーザーがズーム操作中かどうか
  const pageOriginalWidth = useRef<number | null>(null);
  const renderTask = useRef<any>(null); // レンダリングタスクを保持するrefを追加
  const isRenderingRef = useRef<boolean>(false); // レンダリング中フラグ
  
  // ページキャッシュの実装
  const pageCache = useRef<Map<number, any>>(new Map());
  const maxCacheSize = 10; // 最大10ページをキャッシュ
  const preloadPagesRef = useRef<Set<number>>(new Set());

  // PDFファイルのロード
  useEffect(() => {
    if (!pdfFile) return;

    setLoading(true);
    setError(null);

    // キャッシュをクリア
    pageCache.current.clear();
    preloadPagesRef.current.clear();

    // 既存のレンダリングタスクをキャンセル
    if (renderTask.current) {
      renderTask.current.cancel();
      renderTask.current = null;
    }
    isRenderingRef.current = false;

    const loadPDF = async () => {
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1); // PDFがロードされたら1ページ目に戻る

      } catch (err) {
        console.error('PDF読み込みエラー:', err);
        setError('PDFの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };
    loadPDF();
  }, [pdfFile]);

  // ページのプリロード
  const preloadPages = useCallback(async (centerPage: number) => {
    if (!pdfDoc) return;

    // プリロードする範囲を決定（前後2ページ）
    const pagesToPreload = [];
    for (let i = Math.max(1, centerPage - 2); i <= Math.min(totalPages, centerPage + 2); i++) {
      if (!pageCache.current.has(i) && !preloadPagesRef.current.has(i)) {
        pagesToPreload.push(i);
        preloadPagesRef.current.add(i);
      }
    }

    // 非同期でプリロード
    pagesToPreload.forEach(async (pageNum) => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        
        // キャッシュサイズ管理
        if (pageCache.current.size >= maxCacheSize) {
          // 最も古いページを削除（現在のページから最も遠いページ）
          let furthestPage = 1;
          let maxDistance = 0;
          
          pageCache.current.forEach((_, cachedPageNum) => {
            const distance = Math.abs(cachedPageNum - centerPage);
            if (distance > maxDistance) {
              maxDistance = distance;
              furthestPage = cachedPageNum;
            }
          });
          
          pageCache.current.delete(furthestPage);
        }
        
        pageCache.current.set(pageNum, page);
        preloadPagesRef.current.delete(pageNum);
      } catch (err) {
        console.warn(`ページ ${pageNum} のプリロードに失敗:`, err);
        preloadPagesRef.current.delete(pageNum);
      }
    });
  }, [pdfDoc, totalPages]);

  // ページの取得（キャッシュから優先）
  const getPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return null;

    // キャッシュから取得
    if (pageCache.current.has(pageNum)) {
      return pageCache.current.get(pageNum);
    }

    // キャッシュにない場合は読み込む
    try {
      const page = await pdfDoc.getPage(pageNum);
      
      // キャッシュに追加
      if (pageCache.current.size >= maxCacheSize) {
        // 最も古いページを削除
        const firstKey = pageCache.current.keys().next().value;
        pageCache.current.delete(firstKey);
      }
      pageCache.current.set(pageNum, page);
      
      return page;
    } catch (err) {
      console.error(`ページ ${pageNum} の取得エラー:`, err);
      throw err;
    }
  }, [pdfDoc]);

  // ページのレンダリング
  const renderPage = useCallback(async (pageNum: number, scale: number) => {
    if (isRenderingRef.current) {
      console.log('レンダリング中のため、新しいレンダリングをスキップします');
      return;
    }

    isRenderingRef.current = true;

    try {
      const page = await getPage(pageNum);
      if (!page) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // renderTaskをキャンセル
      if (renderTask.current) {
        renderTask.current.cancel();
        renderTask.current = null;
      }

      // シンプルなズーム実装: 指定されたスケールをそのまま使用
      let finalScale = scale;
      
      // ユーザーズーム中でない場合のみ自動フィット
      if (!isUserZooming) {
        const container = containerRef.current;
        if (container) {
          const viewport = page.getViewport({ scale: 1.0 });
          const containerWidth = container.clientWidth - 8; // 最小限のパディング
          const containerHeight = Math.max(container.clientHeight - 60, 50); // ナビゲーション分を60pxに修正、最小50px確保
          
          // 幅と高さの両方を考慮したスケール計算（枠いっぱいに表示）
          const widthScale = containerWidth / viewport.width;
          const heightScale = containerHeight / viewport.height;
          finalScale = Math.min(widthScale, heightScale, 3.0); // 最大3倍まで
          console.log(`📐 レンダリング時 自動フィット適用: コンテナ=${containerWidth}x${containerHeight}, 幅スケール=${widthScale.toFixed(3)}, 高さスケール=${heightScale.toFixed(3)}, 採用=${finalScale.toFixed(3)}`);
        }
      } else {
        console.log(`🔍 ズーム中: ユーザー指定スケール=${scale.toFixed(3)}を使用`);
      }
      
      // 最終的なviewportを計算
      const finalViewport = page.getViewport({ scale: finalScale });
      
      canvas.height = finalViewport.height;
      canvas.width = finalViewport.width;
      
      // キャンバスのスタイル設定
      if (isUserZooming) {
        // ズーム時：自然なサイズで表示（枠を超えてもOK）
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.width = `${finalViewport.width}px`;
        canvas.style.height = `${finalViewport.height}px`;
        console.log('🔍 Phase 1-4 CSS適用（ズーム時）:', {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          cssWidth: canvas.style.width,
          cssHeight: canvas.style.height,
          display: canvas.style.display,
          margin: canvas.style.margin
        });
      } else {
        // 通常時：枠いっぱいに表示
        canvas.style.display = 'block';
        canvas.style.margin = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
        console.log('🔍 Phase 1-4 CSS適用（通常時）:', {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          cssWidth: canvas.style.width,
          cssHeight: canvas.style.height,
          objectFit: canvas.style.objectFit,
          display: canvas.style.display,
          margin: canvas.style.margin
        });
      }
      
      // コンテナの高さを設定
      const container = containerRef.current;
      if (container && isUserZooming) {
        container.style.minHeight = `${finalViewport.height + 32}px`;
      }
      
      // キャンバスをクリア
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: finalViewport,
      };

      renderTask.current = page.render(renderContext);
      await renderTask.current.promise;
      renderTask.current = null;

      drawHighlights(context, finalViewport, pageNum);
    } catch (err: any) {
      if (err.name === 'RenderingCancelledException') {
        console.log('ページ描画がキャンセルされました');
      } else {
        console.error('ページ描画エラー:', err);
        setError('ページの描画に失敗しました');
      }
    } finally {
      isRenderingRef.current = false;
    }
  }, [getPage, isUserZooming]);

  // ページが変更されたときの処理
  useEffect(() => {
    if (!pdfDoc || !currentPage) return;

    const timeoutId = setTimeout(async () => {
      try {
        const page = await getPage(currentPage);
        if (!page || !containerRef.current) return;

        // 初回読み込み時の自動スケール計算
        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = containerRef.current.clientWidth - 8; // 最小限のパディング
        const containerHeight = Math.max(containerRef.current.clientHeight - 60, 50); // ナビゲーション分を60pxに修正、最小50px確保
        
        // 🔍 Phase 1 デバッグログ
        console.log('🔍 Phase 1-1 コンテナサイズ測定:', {
          clientWidth: containerRef.current.clientWidth,
          clientHeight: containerRef.current.clientHeight,
          calculatedWidth: containerWidth,
          calculatedHeight: containerHeight,
          heightReduction: '修正後: -60px (最小50px確保)'
        });
        console.log('🔍 Phase 1-2 PDF元サイズ:', {
          pdfWidth: viewport.width,
          pdfHeight: viewport.height
        });
        
        // 幅と高さの両方を考慮したスケール計算（枠いっぱいに表示）
        const widthScale = containerWidth / viewport.width;
        const heightScale = containerHeight / viewport.height;
        const newAutoScale = Math.min(widthScale, heightScale, 3.0); // 最大3倍まで
        
        console.log('🔍 Phase 1-3 スケール計算:', {
          widthScale: widthScale,
          heightScale: heightScale,
          selectedScale: newAutoScale,
          reasoning: widthScale < heightScale ? 'width-limited' : 'height-limited'
        });
        
        // ページサイズが変わった場合のみ更新
        if (pageOriginalWidth.current !== viewport.width) {
          pageOriginalWidth.current = viewport.width;
          setAutoScale(newAutoScale);
          
          // ユーザーズーム中でない場合のみ自動スケールを適用
          if (!isUserZooming) {
            setCurrentScale(newAutoScale);
          }
        }

        // レンダリング実行
        if (currentScale > 0) {
          await renderPage(currentPage, currentScale);
        }

        // プリロードを開始
        preloadPages(currentPage);
      } catch (err) {
        console.error('ページ読み込みエラー:', err);
        setError('ページの読み込みに失敗しました');
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [pdfDoc, currentPage, getPage, renderPage, preloadPages, currentScale, isUserZooming]);

  // スケールが変わった時のレンダリング
  useEffect(() => {
    if (pdfDoc && currentPage && currentScale > 0) {
      const timeoutId = setTimeout(() => {
        renderPage(currentPage, currentScale);
      }, 50); // より短いデバウンス時間
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentScale, currentPage, renderPage, pdfDoc]);

  // ResizeObserverの改善: ユーザーズーム中は自動フィットを無効化
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // ユーザーがズーム操作中の場合はリサイズイベントを無視
          if (isUserZooming) {
            console.log('📐 ユーザーズーム中: リサイズイベントを無視');
            return;
          }

          console.log('📐 コンテナリサイズ: 自動フィットを実行');
          
          // パネルリサイズ時のみ自動フィット
          if (currentPage && pdfDoc) {
            const timeoutId = setTimeout(async () => {
              try {
                const page = await getPage(currentPage);
                if (page && containerRef.current) {
                  const viewport = page.getViewport({ scale: 1.0 });
                  const containerWidth = containerRef.current.clientWidth - 8; // 最小限のパディング
                  const containerHeight = Math.max(containerRef.current.clientHeight - 60, 50); // ナビゲーション分を60pxに修正、最小50px確保
                  
                  // 幅と高さの両方を考慮したスケール計算（枠いっぱいに表示）
                  const widthScale = containerWidth / viewport.width;
                  const heightScale = containerHeight / viewport.height;
                  const newAutoScale = Math.min(widthScale, heightScale, 3.0); // 最大3倍まで
                  
                  console.log(`📐 自動フィット計算: コンテナ=${containerWidth}x${containerHeight}, 幅スケール=${widthScale.toFixed(3)}, 高さスケール=${heightScale.toFixed(3)}, 採用=${newAutoScale.toFixed(3)}`);
                  
                  setAutoScale(newAutoScale);
                  setCurrentScale(newAutoScale);
                  
                  // レンダリングを実行
                  renderPage(currentPage, newAutoScale);
                }
              } catch (err) {
                console.error('リサイズ時のスケール再計算エラー:', err);
              }
            }, 100);
            
            return () => clearTimeout(timeoutId);
          }
        }
      });
      
      resizeObserver.observe(containerRef.current);
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [currentPage, getPage, pdfDoc, isUserZooming, renderPage]);

  const drawHighlights = useCallback((context: CanvasRenderingContext2D, viewport: any, pageNum: number) => {
    const pageHighlights = highlights.filter(h => h.page === pageNum);

    pageHighlights.forEach(highlight => {
      context.save();
      context.globalAlpha = 0.2;

      switch (highlight.type) {
        case 'error':
          context.fillStyle = '#ef4444'; // 赤
          break;
        case 'warning':
          context.fillStyle = '#f59e0b'; // オレンジ
          break;
        case 'info':
          context.fillStyle = '#3b82f6'; // 青
          break;
      }

      context.fillRect(0, 0, viewport.width, 20);
      context.restore();
    });
  }, [highlights]);

  const goToPage = useCallback((pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  }, [totalPages]);

  // シンプルなズーム関数
  const zoomIn = useCallback(() => {
    console.log('🔍 ズームイン開始');
    setIsUserZooming(true);
    setCurrentScale(prev => {
      const newScale = Math.min(prev + 0.2, 3.0);
      console.log(`🔍 ズームイン: ${prev.toFixed(3)} → ${newScale.toFixed(3)}`);
      return newScale;
    });
  }, []);
  
  const zoomOut = useCallback(() => {
    console.log('🔍 ズームアウト開始');
    setIsUserZooming(true);
    setCurrentScale(prev => {
      const newScale = Math.max(prev - 0.2, 0.5);
      console.log(`🔍 ズームアウト: ${prev.toFixed(3)} → ${newScale.toFixed(3)}`);
      return newScale;
    });
  }, []);
  
  const resetZoom = useCallback(() => {
    console.log('🔍 ズームリセット: 自動フィットに戻す');
    setIsUserZooming(false);
    setCurrentScale(autoScale);
  }, [autoScale]);

  return (
    <div className="relative h-full flex flex-col items-center justify-center bg-gray-100">
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10 text-blue-600">PDFを読み込み中...</div>}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-red-50 bg-opacity-75 z-10 text-red-700 p-4 rounded-lg">{error}</div>}

      <div ref={containerRef} className={`relative w-full flex-1 flex items-center justify-center p-4 ${isUserZooming ? 'overflow-auto' : 'overflow-hidden'}`}>
        <canvas ref={canvasRef} 
          className={`shadow-lg ${isUserZooming ? '' : 'w-full h-full object-contain'}`}
          style={!isUserZooming ? { 
            width: '100%', 
            height: '100%', 
            objectFit: 'contain',
            display: 'block',
            margin: '0'
          } : {}}
        ></canvas>
      </div>

      {pdfDoc && ( // pdfDocが存在する場合のみ表示
        <div className="flex-shrink-0 mt-4 mb-4 flex items-center justify-center space-x-2">
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">前へ</button>
          <span>ページ {currentPage} / {totalPages}</span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">次へ</button>
          <span className="ml-4">ズーム:</span>
          <button onClick={zoomOut} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300">-</button>
          <span>{(currentScale * 100).toFixed(0)}%</span>
          <button onClick={zoomIn} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300">+</button>
          <button onClick={resetZoom} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300">リセット</button>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;