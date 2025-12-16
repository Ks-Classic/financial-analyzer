import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js workerをCDNから読み込む
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AdvancedHighlight {
  page: number;
  text: string;
  type: 'error' | 'warning' | 'info';
  boundingBoxes?: BoundingBox[]; // Document AIから取得した座標情報
}

interface AdvancedPDFViewerProps {
  pdfFile: File | null;
  highlights?: AdvancedHighlight[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  engineType?: 'pdf-parse' | 'document-ai' | 'auto';
}

const AdvancedPDFViewer: React.FC<AdvancedPDFViewerProps> = ({ 
  pdfFile, 
  highlights = [], 
  isCollapsed = false, 
  onToggleCollapse,
  engineType = 'auto'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pageViewport, setPageViewport] = useState<any>(null);

  useEffect(() => {
    if (pdfFile) {
      loadPDF();
    }
  }, [pdfFile]);

  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, scale]);

  const loadPDF = async () => {
    if (!pdfFile) return;

    setLoading(true);
    setError(null);

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    } catch (err) {
      console.error('PDF読み込みエラー:', err);
      setError('PDFの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      const viewport = page.getViewport({ scale });
      setPageViewport(viewport);
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // オーバーレイでハイライトを描画
      renderHighlightOverlay(viewport, pageNum);
    } catch (err) {
      console.error('ページ描画エラー:', err);
      setError('ページの描画に失敗しました');
    }
  };

  const renderHighlightOverlay = (viewport: any, pageNum: number) => {
    if (!overlayRef.current) return;

    const overlay = overlayRef.current;
    overlay.innerHTML = ''; // 既存のハイライトをクリア

    const pageHighlights = highlights.filter(h => h.page === pageNum);
    
    pageHighlights.forEach((highlight, index) => {
      if (engineType === 'document-ai' && highlight.boundingBoxes) {
        // Document AIの座標情報を使用した精密なハイライト
        highlight.boundingBoxes.forEach((bbox, bboxIndex) => {
          const highlightDiv = document.createElement('div');
          highlightDiv.className = `absolute pointer-events-none ${getHighlightClass(highlight.type)}`;
          highlightDiv.style.left = `${bbox.x * scale}px`;
          highlightDiv.style.top = `${bbox.y * scale}px`;
          highlightDiv.style.width = `${bbox.width * scale}px`;
          highlightDiv.style.height = `${bbox.height * scale}px`;
          highlightDiv.title = `${highlight.type}: ${highlight.text}`;
          overlay.appendChild(highlightDiv);
        });
      } else {
        // 通常モード（pdf-parse）の場合は簡易ハイライト
        const highlightDiv = document.createElement('div');
        highlightDiv.className = `absolute pointer-events-none ${getHighlightClass(highlight.type)} opacity-30`;
        highlightDiv.style.left = '0px';
        highlightDiv.style.top = `${(index * 30)}px`;
        highlightDiv.style.width = '100%';
        highlightDiv.style.height = '20px';
        highlightDiv.title = `${highlight.type}: ${highlight.text}`;
        overlay.appendChild(highlightDiv);
      }
    });
  };

  const getHighlightClass = (type: string) => {
    switch (type) {
      case 'error':
        return 'bg-red-400 opacity-40';
      case 'warning':
        return 'bg-yellow-400 opacity-40';
      case 'info':
        return 'bg-blue-400 opacity-40';
      default:
        return 'bg-gray-400 opacity-40';
    }
  };

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const resetZoom = () => setScale(1.0);

  if (isCollapsed) {
    return (
      <div className="w-12 bg-white border-r border-gray-200 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="PDFビューアーを展開"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {pdfFile && (
          <div className="mt-4 text-xs text-gray-500 writing-mode-vertical-rl text-orientation-mixed">
            PDF
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-800">PDFビューアー</h3>
          {pdfFile && (
            <span className="text-sm text-gray-600">
              ({pdfFile.name})
            </span>
          )}
          {engineType && (
            <span className={`px-2 py-1 text-xs rounded-full ${
              engineType === 'document-ai' ? 'bg-green-100 text-green-800' :
              engineType === 'pdf-parse' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {engineType === 'document-ai' ? '高精度ハイライト' :
               engineType === 'pdf-parse' ? '簡易ハイライト' :
               '自動選択'}
            </span>
          )}
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
          title="PDFビューアーを折りたたむ"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!pdfFile ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>PDFファイルをアップロードしてください</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">PDFを読み込み中...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-red-600">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>{error}</p>
            </div>
          </div>
        ) : (
          <>
            {/* ツールバー */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="p-1 text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm text-gray-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="p-1 text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={zoomOut}
                  className="p-1 text-gray-600 hover:text-gray-800"
                  title="縮小"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-sm text-gray-600 min-w-[3rem] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={zoomIn}
                  className="p-1 text-gray-600 hover:text-gray-800"
                  title="拡大"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={resetZoom}
                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                  title="100%に戻す"
                >
                  リセット
                </button>
              </div>
            </div>

            {/* PDF表示エリア */}
            <div 
              ref={containerRef}
              className="flex-1 overflow-auto bg-gray-100 p-4"
            >
              <div className="flex justify-center relative">
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="border border-gray-300 shadow-lg bg-white"
                  />
                  {/* ハイライトオーバーレイ */}
                  <div
                    ref={overlayRef}
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{
                      width: pageViewport?.width || 0,
                      height: pageViewport?.height || 0,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ハイライト凡例と情報 */}
            {highlights.length > 0 && (
              <div className="p-3 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-gray-600">ハイライト凡例:</div>
                  <div className="text-xs text-gray-500">
                    {engineType === 'document-ai' ? '精密な位置指定' : '簡易ハイライト'}
                  </div>
                </div>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-400 rounded"></div>
                    <span>エラー</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-400 rounded"></div>
                    <span>警告</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-400 rounded"></div>
                    <span>情報</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdvancedPDFViewer; 