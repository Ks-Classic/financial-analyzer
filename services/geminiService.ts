import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, AnalysisStatus, PdfPageContent, ProgressUpdate, AnalysisData, GeminiServiceStream, MonthlyComparisonResult } from '../types';
import Decimal from 'decimal.js';

// This function attempts to retrieve the API key.
// It's structured to ensure it always returns a string or undefined.
function getApiKeyFromEnvironment(): string | undefined {
  try {
    // Check if 'process' and 'process.env' are available, typical for Node.js environments
    // or environments where they are polyfilled/defined by a build tool.
    if (typeof process === 'object' && process !== null &&
        typeof process.env === 'object' && process.env !== null) {
      
      const apiKeyVal = process.env.API_KEY;

      if (typeof apiKeyVal === 'string' && apiKeyVal.length > 0) {
        return apiKeyVal;
      }
    }
  } catch (e) {
    console.warn("Error during API_KEY retrieval from process.env:", e);
  }
  return undefined;
}

const API_KEY: string | undefined = getApiKeyFromEnvironment();

if (!API_KEY) {
  console.warn(
    "GeminiのAPIキーが設定されていません。AI分析は機能しません。\n" +
    "解決策: API_KEY環境変数がビルドプロセスまたは実行環境で正しく設定・注入されているか確認してください。\n" +
    "詳細: このアプリケーションは 'process.env.API_KEY' からAPIキーを取得するよう設計されています。\n" +
    "もし 'index.html' を直接ブラウザで開いてこのエラーが発生している場合、ブラウザ環境では 'process.env' が標準では利用できません。\n" +
    "その場合、開発サーバーやビルドツールが 'process.env.API_KEY' を実際のキー文字列に置き換えるか、\n" +
    "または別の安全な方法でAPIキーをアプリケーションに提供する設定が必要です。\n" +
    "現在のエラー(SyntaxError)は、この置き換え処理が不適切に行われ、不正なJavaScriptコードが生成された可能性を示唆しています。"
  );
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// Helper function to determine the multiplier based on unit strings
function getUnitMultiplierFromString(valueStr: string): Decimal {
  if (!valueStr || typeof valueStr !== 'string') return new Decimal(1);

  const s = String(valueStr).trim();
  if (s.endsWith('百万円')) return new Decimal(1000000);
  if (s.endsWith('千円')) return new Decimal(1000);
  if (s.endsWith('億円')) return new Decimal(100000000);
  if (s.endsWith('円')) return new Decimal(1);
  return new Decimal(1);
}


export function parseFinancialNumber(input: string | number | undefined | null): Decimal | null {
  if (input === undefined || input === null) return null;

  let s: string;
  if (typeof input === 'number') {
    try {
      return new Decimal(input);
    } catch (e) {
      console.warn(`parseFinancialNumber: Failed to parse number "${input}" directly as Decimal:`, e);
      return null;
    }
  }

  s = String(input).trim();

  s = s.replace(/[０-９．％－（）¥]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code === 0xA5) return '¥';
    return String.fromCharCode(code - 0xFEE0);
  });
  s = s.replace(/　/g, ' ');

  let isNegativeBySymbol = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.substring(1, s.length - 1);
    isNegativeBySymbol = true;
  } else if (s.startsWith('△') || s.startsWith('▲')) {
    s = s.substring(1);
    isNegativeBySymbol = true;
  }
  s = s.replace('－', '-').trim();

  s = s.replace(/^¥\s*/, '').trim();
  s = s.replace(/,/g, '');

  let multiplier = new Decimal(1);
  let isPercentage = false;
  const units = [
    { unit: '百万円', value: 1000000 },
    { unit: '千円', value: 1000 },
    { unit: '億円', value: 100000000 },
    { unit: '円', value: 1 },
  ];

  for (const { unit, value } of units) {
    if (s.endsWith(unit)) {
      multiplier = new Decimal(value);
      s = s.substring(0, s.length - unit.length).trim();
      break;
    }
  }
  if (s.endsWith('%')) {
    isPercentage = true;
    s = s.substring(0, s.length - 1).trim();
  }

  s = s.replace(/(\s*[\*※]\d*)$/, '').trim();
  s = s.replace(/(\s*\*+)$/, '').trim();

  try {
    if (s === "") {
        console.warn(`parseFinancialNumber: String became empty after cleaning. Original input: "${input}"`);
        return null;
    }
    let num = new Decimal(s);
    if (isNegativeBySymbol && num.isPositive()) {
      num = num.negated();
    }
    if (isPercentage) {
      num = num.div(100);
    } else {
      num = num.mul(multiplier);
    }
    return num;
  } catch (e) {
    console.warn(`parseFinancialNumber: Primary parsing failed for input "${input}" (processed to "${s}", isNegativeBySymbol: ${isNegativeBySymbol}, multiplier: ${multiplier.toString()}, isPercentage: ${isPercentage}). Error:`, e);

    const fallbackMatch = s.match(/-?\d+(\.\d+)?/);
    if (fallbackMatch && fallbackMatch[0]) {
      try {
        console.warn(`parseFinancialNumber: Attempting fallback parsing of "${fallbackMatch[0]}" from processed string "${s}".`);
        let num = new Decimal(fallbackMatch[0]);
        if (isNegativeBySymbol && num.isPositive() && !fallbackMatch[0].startsWith('-')) {
            num = num.negated();
        }
        if (isPercentage) {
          num = num.div(100);
        } else {
          num = num.mul(multiplier);
        }
        console.info(`parseFinancialNumber: Fallback parsing successful for "${input}", yielding ${num.toString()}`);
        return num;
      } catch (fallbackError) {
        console.warn(`parseFinancialNumber: Fallback parsing of "${fallbackMatch[0]}" also failed for input "${input}". Error:`, fallbackError);
        return null;
      }
    }
    console.warn(`parseFinancialNumber: All parsing attempts failed for input "${input}". Could not extract a valid number. Returning null.`);
    return null;
  }
}

// Type alias for the raw item structure expected from the AI, before full processing
type RawAiOutputItem = Omit<AnalysisResult, 'id' | 'pdfPhysicalPageNumber' | 'displayPageNumber'>;

export async function* analyzeFinancialData(
  pages: PdfPageContent[]
): AsyncGenerator<GeminiServiceStream, void, unknown> {
  if (!ai) {
     console.error("Gemini APIクライアントが初期化されていません (APIキーの問題の可能性があります)。モックエラーを返します。");
     yield {
        type: 'data',
        results: [{
            id: 'no-api-key-error',
            status: AnalysisStatus.Error,
            message: "Gemini APIクライアントが初期化されていません。APIキーが正しく設定されているか、上記の警告メッセージを確認してください。",
            page: 0,
            displayPageNumber: 1,
            pdfPhysicalPageNumber: 2,
            pageTitle: "システムエラー",
            itemPath: "システム全体",
            aiComment: "APIキーの設定を確認し、アプリケーションをリロードしてください。"
        }]
     };
     return;
  }

  if (pages.length === 0) {
    yield {
        type: 'data',
        results: [{
            id: 'no-pages-to-analyze',
            status: AnalysisStatus.Attention,
            message: "分析対象のページコンテンツがありません。PDFが2ページ以上あることを確認してください。",
            page: 0,
            displayPageNumber: 1,
            pdfPhysicalPageNumber: 2,
            pageTitle: "データ不足",
            itemPath: "入力データ",
            aiComment: "PDFの2ページ目以降が分析対象となります。"
        }]
    };
    return;
  }

  const model = ai.models;
  const reportContent = pages.map(p => `分析対象ページ ${p.pageNumber} (PDF実P.${p.physicalPageNumber}, 表示P.${p.pageNumber + 1}):\n${p.content}`).join("\n\n---\n\n");

  const prompt = `
    あなたは高精度な財務分析アシスタントです。あなたの主な役割は、提供された財務レポートのデータから、以下の観点で情報を抽出することです。
    
    **【分析観点】:**
    1.  **数値間の計算関係の特定**:
        *   レポート内の表や記述で、計算（合計、差引、比率など）が行われている箇所を特定してください。
        *   その計算に使用されている数値（オペランド）を、PDFに記載されている**そのままの書式（単位、通貨記号、括弧や△によるマイナス表現、%記号などを含む）を保持した文字列**として抽出してください。これらを "calculationOperands" フィールドに配列として含めます。
        *   どのような計算操作が行われているか（例: "sum", "subtract", "divide", "percentage_of_total"など、具体的な操作を示す文字列）を特定し、"calculationOperation" フィールドに含めてください。
        *   表から数値を抽出する際は、行と列の関連性を正確に捉え、例えば同じ項目の当期と前期の値など、対応する正しい数値をオペランドとして選択してください。
        *   実際の計算とレポート記載値との比較・検証はシステム側が Decimal.js を用いて精密に行います。あなたは、計算に必要な要素（オペランドと操作）の正確な特定に集中してください。

    2.  **コメントと数値データの整合性チェック**:
        *   レポート内のコメント（解説文など）が、関連する表中の数値や計算結果と著しく矛盾する場合（例：コメントでは「増加」とあるが、対応する数値は「減少」している。コメントで「約50%」と記述されているが、実際の数値は「10%」であるなど、許容範囲を超えた乖離がある場合）は「エラー」として報告してください。
        *   コメントが数値を自然な範囲で丸めていたり、一般的な傾向を述べていてデータと著しく矛盾しない場合は問題ありません（OK扱い、報告不要）。
        *   コメントの記述が曖昧であったり、数値的な根拠が不明瞭である場合は「注意」として報告してください。
        *   一番最初のページで「月次レポート（25/5月）」などでいつの年月に関するレポートかを理解した上で、コメントが当年月に関するものかもチェックして。前月以前のもののコメントでも当月に関連するものであれば指摘は不要。
        *   文脈から判断可能な誤字脱字（特に月や年の表記に関するもの、例：「5も」→「5月も」）や、前月分のコメントが残っているなど、レポート対象月と記述内容の時期が一致しない問題（更新漏れ）は「その他」のカテゴリとして指摘してください。


    **分析結果のJSON形式:**
    各指摘事項はJSONオブジェクトの配列で、以下のキーを含めてください。
    期待される出力は、次のようなJSON配列の形式です。各JSONオブジェクト間はカンマ（,）で区切られ、配列全体が角括弧（[]）で囲まれます:
    
    [
      {
        "page": 0,
        "pageTitle": "損益計算書",
        "itemPath": "売上総利益 > 計算結果",
        "valueType": "計算値の検証",
        "originalValue": "1,234百万円",
        "calculationOperands": ["2,000百万円", "766百万円"],
        "calculationOperation": "subtract",
        "status": "エラー",
        "message": "レポート記載の売上総利益と計算結果が一致しません。",
        "aiComment": "売上2,000百万円 - 売上原価766百万円 = 1,234百万円となるところ、レポートでは1,230百万円と記載されています。"
      },
      {
        "page": 1,
        "pageTitle": "貸借対照表",
        "itemPath": "流動資産 > 現金及び預金",
        "valueType": "コメントと数値の整合性",
        "originalValue": "コメント: 現金及び預金は前期比で大幅に増加しました。",
        "calculatedValue": "500百万円",
        "status": "注意",
        "message": "コメントと数値データの関連性が不明瞭です。",
        "aiComment": "コメントでは「大幅に増加」とありますが、具体的な増加額や比較対象の前期数値がレポート内で明確に特定できませんでした。関連データとして表示P.2の貸借対照表を参照しましたが、詳細な内訳が必要です。"
      }
    ]
    \`\`\`
    以下が各オブジェクトのキーの詳細です:
    - "page": 指摘箇所がある分析対象ページの番号 (0始まりの内部インデックス。例えば、PDFの物理的な2ページ目は内部インデックス0、表示上はP.1となります)。
    - "pageTitle": 該当ページの主要タイトル (例: "損益計算書")。見つからなければ空欄でも可。
    - "itemPath": 指摘箇所を特定するパス (例: "売上総利益 > 計算結果", "営業キャッシュフロー > 小計", "注記3 > 固定資産の増減コメント")。
    - "valueType": 分析対象の種類 (例: "計算値の検証", "コメントと数値の整合性", "その他", "売上高成長率")。パーセンテージ関連の場合は「パーセント」または「率」を文字列に含めてください。
    - "originalValue": レポートに記載されている値やコメントの記述。PDFから**極めて正確に**引用し、元の書式や単位を保持してください。
    - "calculatedValue": (任意) AIがコメント分析の際に比較対象として認識した数値、または計算検証における参考値。システム側での計算が優先されるため、このフィールドは補助的なものとします。
    - "calculationOperands": (計算関係の特定の場合、必須) AIが特定したオペランドの文字列配列。例: ["1,234百万円", "(567百万円)", "8.5%"]
    - "calculationOperation": (計算関係の特定の場合、必須) AIが特定した操作の種類。例: "sum", "subtract", "divide_first_by_second_as_percentage"
    - "status": "エラー"、"注意" のいずれか。システムが最終的な判断を行うため、AIは矛盾の可能性や注目すべき点を報告することに集中してください。**"OK"と判断した場合は結果に含めないでください。**
    - "message": 指摘の概要（簡潔に）。AIはこのメッセージ内に具体的な「差額」の計算を含める必要はありません。システムが差額を計算します。
    - "aiComment": 指摘の詳細な根拠やAIの思考プロセス。計算関係の場合、なぜそのオペランドと操作を選んだのか、どの数値を比較対象としたのか等を記述。コメント整合性の場合、どのコメント部分とどの数値データが矛盾すると判断したのか、その理由を具体的に説明してください。

    **ページ番号の言及について:**
    

    **JSON出力の厳格な注意:**
    - 生成するJSONは必ず全体として有効な形式でなければなりません。
    - 配列内のJSONオブジェクト間は必ずカンマ（,）で区切ってください。配列の最後のJSONオブジェクトの後にはカンマを付けないでください。
    - 全てのJSON文字列値は、開始と終了のダブルクォート（"）で正しく囲んでください。
    - 文字列値の内部にダブルクォート（"）が含まれる場合は、必ずバックスラッシュでエスケープしてください（例: \\"文字列内の引用\\"）。
    - 文字列値の内部にバックスラッシュ（\\\\）が含まれる場合は、必ずエスケープしてください（例: \\"パス C:\\\\\\\\folder\\"）。
    - 改行（\\n）、タブ（\\t）、その他の制御文字が文字列値に含まれる場合は、必ず適切にエスケープしてください。
    - 特に、"originalValue", "message", "aiComment" のような長いテキストを含む可能性のあるフィールドでは、これらのエスケープルールと文字列の終端を厳格に守ってください。

    分析対象の財務レポートデータ:
    ${reportContent}

    上記データに基づき、指定JSON形式で監査結果を複数提示してください。"status"が"OK"となる項目は結果に含めないでください。
    `;

  try {
    yield { type: 'progress', message: 'AIモデルによるレポート全体の分析処理を実行中です。結果生成まで少々お待ちください...' };
    
    const response: GenerateContentResponse = await model.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            temperature: 0.1,
            topK: 40,
            topP: 0.95,
        },
    });

    if (!response) {
        console.error("AIから応答がありません (null または undefined)。");
        throw new Error("AIから有効な応答が返されませんでした。");
    }

    const responseTextValue = response.text;

    if (typeof responseTextValue !== 'string') {
        console.error(
            "AI応答の'text'プロパティが文字列ではありませんでした。",
            "タイプ:", typeof responseTextValue,
            "値:", responseTextValue,
            "応答全体:", response
        );
        throw new Error(`AI応答のテキスト部分を解析できませんでした (予期しない型: ${typeof responseTextValue})。SDKのバージョンや応答内容を確認してください。`);
    }
    
    yield { type: 'progress', message: 'AIからの分析結果(JSON)を受信しました。内容を検証・整形しています...' };

    let jsonStrForParsing = responseTextValue.trim();
    const fenceRegex = /^\`\`\`(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStrForParsing.match(fenceRegex);
    if (match && match[2]) {
      jsonStrForParsing = match[2].trim();
    }

    let parsedJson: any;
    try {
        parsedJson = JSON.parse(jsonStrForParsing);

        if (typeof parsedJson === 'string') {
            // This case handles if the AI returned a string that is itself a JSON string.
            // e.g., "\"[{\\\"key\\\":\\\"value\\\"}]\""
            // The first parse would yield "[{\\\"key\\\":\\\"value\\\"}]" (a string).
            // We then try to parse this resulting string.
            console.warn("AI response was initially parsed into a string. Attempting to parse this string as JSON. String content for second parse attempt:", parsedJson);
            jsonStrForParsing = parsedJson; // Update the string to be parsed for the next attempt (and for error reporting)
            parsedJson = JSON.parse(jsonStrForParsing);
        }
    } catch (e) {
        const error = e as Error; // Type assertion
        // Log the string that actually caused the error
        console.error("JSON.parse failed. String content that failed parsing:", `>>>${jsonStrForParsing}<<<`, "Error Name:", error.name, "Error Message:", error.message, "Stack:", error.stack);
        
        let errorMessage = "AIでのデータ分析に失敗しました。AIの応答形式が正しくない可能性があります。";
        errorMessage += ` 詳細: ${error.message}.`;
        
        // Check for common JSON error messages to provide a snippet
        if (error.message.toLowerCase().includes("unexpected token") || 
            error.message.toLowerCase().includes("unterminated string") || 
            error.message.toLowerCase().includes("expected") && jsonStrForParsing.length > 0) {
            
            const errorPosMatch = error.message.match(/position\s+(\d+)/);
            let errorSnippet = "";
            if (errorPosMatch && errorPosMatch[1]) {
                const pos = parseInt(errorPosMatch[1], 10);
                const start = Math.max(0, pos - 50);
                const end = Math.min(jsonStrForParsing.length, pos + 50);
                errorSnippet = `...${jsonStrForParsing.substring(start, end)}...`;
            } else {
                // If no position, show a larger initial chunk for context
                errorSnippet = jsonStrForParsing.substring(0, Math.min(150, jsonStrForParsing.length));
            }
            errorMessage += ` 応答データ(エラー箇所周辺または冒頭): ${errorSnippet}`;
        }
        const finalError = new Error(errorMessage);
        // Attach original error details for deeper debugging if needed
        (finalError as any).originalErrorName = error.name;
        (finalError as any).originalErrorMessage = error.message;
        (finalError as any).stringAttemptedToParse = jsonStrForParsing; // The actual string that failed
        throw finalError;
    }


    const rawResults = (Array.isArray(parsedJson) ? parsedJson : []) as Array<RawAiOutputItem>;

    // Helper function for safe formatting of Decimals to percentage strings
    const safeFormatToPercentageString = (val: Decimal | null, places: number = 2): string => {
        if (val === null) return "N/A";
        if (!val.isFinite()) return val.toString(); // Handles NaN, Infinity
        return val.mul(100).toDecimalPlaces(places).toString();
    };

    const processedResults = rawResults.map((rawResult: RawAiOutputItem, index): AnalysisResult => {
      let statusFromAI: AnalysisStatus = (Object.values(AnalysisStatus) as string[]).includes(rawResult.status as string)
          ? rawResult.status as AnalysisStatus
          : AnalysisStatus.Attention;

      if ((rawResult.status as string) === '警告') {
        statusFromAI = AnalysisStatus.Attention;
      }

      const internalPageNumber = rawResult.page !== undefined && typeof rawResult.page === 'number' && rawResult.page >= 0 ? rawResult.page : 0;

      const result: AnalysisResult = {
        ...rawResult,
        id: `result-${Date.now()}-${index}`,
        page: internalPageNumber,
        displayPageNumber: internalPageNumber + 1,
        pageTitle: rawResult.pageTitle || `P.${internalPageNumber + 1} タイトル不明`,
        status: statusFromAI,
        calculatedValue: rawResult.calculatedValue,
      };

      let systemValidationMessage = "";
      let systemCalculatedValueString: string | undefined = undefined;
      let operationPerformed = ""; 

      if (rawResult.calculationOperands && rawResult.calculationOperands.length > 0 && rawResult.calculationOperation) {
          const operandsDecimal = rawResult.calculationOperands.map(opStr => parseFinancialNumber(opStr));
          
          if (operandsDecimal.every(op => op !== null)) {
              const decimalOperands = operandsDecimal as Decimal[];
              let systemCalculatedDecimal: Decimal | null = null;
              try {
                  switch (rawResult.calculationOperation.toLowerCase()) {
                      case 'sum':
                      case 'add':
                          systemCalculatedDecimal = decimalOperands.reduce((acc, val) => acc.plus(val), new Decimal(0));
                          operationPerformed = `${decimalOperands.map(d => d.toString()).join(' + ')} = ${systemCalculatedDecimal.toString()}`;
                          break;
                      case 'subtract':
                          if (decimalOperands.length >= 2) {
                            systemCalculatedDecimal = decimalOperands[0].minus(decimalOperands[1]);
                            operationPerformed = `${decimalOperands[0].toString()} - ${decimalOperands[1].toString()} = ${systemCalculatedDecimal.toString()}`;
                          }
                          break;
                      case 'multiply':
                          if (decimalOperands.length >= 2) {
                            systemCalculatedDecimal = decimalOperands[0].times(decimalOperands[1]);
                            operationPerformed = `${decimalOperands[0].toString()} * ${decimalOperands[1].toString()} = ${systemCalculatedDecimal.toString()}`;
                          }
                          break;
                      case 'divide':
                      case 'divide_first_by_second_as_percentage':
                      case 'percentage_of_total': 
                          if (decimalOperands.length >= 2 && !decimalOperands[1].isZero()) {
                            systemCalculatedDecimal = decimalOperands[0].div(decimalOperands[1]);
                            operationPerformed = `${decimalOperands[0].toString()} / ${decimalOperands[1].toString()} = ${systemCalculatedDecimal.toString()}`;
                            if (rawResult.calculationOperation.toLowerCase().includes('percentage')) {
                                operationPerformed += ` ( = ${safeFormatToPercentageString(systemCalculatedDecimal)}%)`;
                            }
                          } else if (decimalOperands.length >= 2 && decimalOperands[1].isZero()) {
                             systemValidationMessage += "システムエラー: ゼロによる除算が試みられました。";
                             result.status = AnalysisStatus.Error;
                          }
                          break;
                      default:
                          systemValidationMessage += `未対応の計算操作: ${rawResult.calculationOperation}。`;
                  }

                  if (systemCalculatedDecimal !== null) {
                    systemCalculatedValueString = systemCalculatedDecimal.toString(); 
                    result.calculatedValue = systemCalculatedValueString; 

                    const originalDecimal = parseFinancialNumber(rawResult.originalValue);

                    if (originalDecimal) {
                        const diff = originalDecimal.minus(systemCalculatedDecimal); 
                        const originalValueStr = String(rawResult.originalValue || '');
                        const originalUnitMultiplier = getUnitMultiplierFromString(originalValueStr);

                        let diffInUnit: Decimal;
                        if (originalUnitMultiplier.isZero() || !originalUnitMultiplier.isFinite()) {
                            console.warn(`Original unit multiplier for "${originalValueStr}" is zero or non-finite (${originalUnitMultiplier.toString()}). Using absolute difference.`);
                            diffInUnit = diff.abs();
                        } else {
                            diffInUnit = diff.abs().div(originalUnitMultiplier);
                        }

                        const isIntegerComparison = originalDecimal.isInteger() && systemCalculatedDecimal.isInteger();
                        
                        const diffFormatted = diffInUnit.isFinite()
                                              ? (isIntegerComparison ? diffInUnit.toFixed(0) : diffInUnit.toFixed(2))
                                              : diffInUnit.toString();

                        const originalValueUnit = originalValueStr.replace(/[\d.,()\-△▲＋¥\s]/g, '').trim() || '単位';

                        const tolerancePercentage = new Decimal('0.01'); 
                        const toleranceAbsoluteInBaseUnits = new Decimal('1'); 
                                                                    
                        const isPercentageComparison = result.valueType && (result.valueType.includes('パーセント') || result.valueType.includes('率'));
                        let withinTolerance = false;

                        if (isPercentageComparison) {
                            withinTolerance = diff.abs().lte(new Decimal('0.01')); // 1 percentage point tolerance for percentages
                            const originalPercentValStr = safeFormatToPercentageString(originalDecimal);
                            const calculatedPercentValStr = safeFormatToPercentageString(systemCalculatedDecimal);
                            const diffAbsPercentPointsStr = safeFormatToPercentageString(diff.abs(), 2); // Use 2 decimal places for the difference in pp

                            systemValidationMessage += `システム検証: レポート記載値 (${originalPercentValStr}%) と計算値 (${calculatedPercentValStr}%) の差は ${diffAbsPercentPointsStr} パーセントポイントです。`;
                        } else {
                            const absoluteDiffInOriginalScale = diff.abs();
                            const scaledAbsoluteTolerance = toleranceAbsoluteInBaseUnits.mul(originalUnitMultiplier);

                            if (originalDecimal.isZero()) { 
                                withinTolerance = absoluteDiffInOriginalScale.lte(scaledAbsoluteTolerance);
                                let calcValueInUnitStr = "計算不能";
                                if (systemCalculatedDecimal.isFinite() && originalUnitMultiplier.isFinite() && !originalUnitMultiplier.isZero()) {
                                   calcValueInUnitStr = systemCalculatedDecimal.div(originalUnitMultiplier).toString();
                                } else if (systemCalculatedDecimal.isFinite()) {
                                   calcValueInUnitStr = systemCalculatedDecimal.toString(); 
                                }
                                systemValidationMessage += `システム検証: レポート記載値は0、計算値は ${calcValueInUnitStr} ${originalValueUnit}。差額は ${diffFormatted} ${originalValueUnit}です。`;
                            } else {
                                const relativeDifference = absoluteDiffInOriginalScale.div(originalDecimal.abs());
                                withinTolerance = relativeDifference.lte(tolerancePercentage) || absoluteDiffInOriginalScale.lte(scaledAbsoluteTolerance);

                                let formattedRelativeDiffForDisplay: string;
                                if (relativeDifference.isFinite()) {
                                    formattedRelativeDiffForDisplay = relativeDifference.mul(100).toDecimalPlaces(2).toString() + "%";
                                } else {
                                    formattedRelativeDiffForDisplay = relativeDifference.toString();
                                }
                                systemValidationMessage += `システム検証: 差額 ${diffFormatted} ${originalValueUnit} (相対差 ${formattedRelativeDiffForDisplay}). `;
                            }
                        }

                        if (withinTolerance) {
                            result.status = AnalysisStatus.MinorError; 
                            systemValidationMessage += "この差は許容範囲内です。";
                        } else {
                            result.status = AnalysisStatus.Error;
                            systemValidationMessage += "この差は許容範囲を超えています。";
                        }
                    } else {
                         systemValidationMessage += "システム検証: レポート記載値の数値解釈に失敗したため、比較できませんでした。";
                         result.status = AnalysisStatus.Attention;
                    }
                  } else if (systemValidationMessage && !systemValidationMessage.includes("ゼロによる除算")) { 
                     systemValidationMessage += "AIが指定した計算を実行できませんでした。";
                     result.status = AnalysisStatus.Attention; 
                  }
              } catch (calcError: any) {
                  console.error("System calculation error:", calcError);
                  systemValidationMessage += `システム計算エラー: ${calcError.message}.`;
                  result.status = AnalysisStatus.Error;
              }
          } else {
              systemValidationMessage = "システム検証: AIが抽出したオペランドの一部または全部を数値として解釈できませんでした。";
              result.status = AnalysisStatus.Attention;
          }
          const currentAiCommentFromRaw: string | undefined = rawResult['aiComment'];
          result.aiComment = (currentAiCommentFromRaw ? currentAiCommentFromRaw + "\n---\n" : "") +
                             (operationPerformed ? `実行された計算: ${operationPerformed}\n` : "") +
                             systemValidationMessage;
      }
      return result;
    });

    yield { type: 'data', results: processedResults };

  } catch (error: any) {
    console.error("Error in analyzeFinancialData:", error);
    let detailedMessage = "AIによる財務データ分析中に予期せぬエラーが発生しました。";
    if (error.message) {
        detailedMessage += `エラー詳細: ${error.message}`;
    }
    // Access custom properties if they exist from the re-thrown error
    if (error.originalErrorName && error.originalErrorMessage) {
        detailedMessage += `根本原因(${error.originalErrorName}): ${error.originalErrorMessage}`;
    }
    if (error.stringAttemptedToParse) { // For easier debugging
        console.error("String that was attempted to be parsed when error occurred:", error.stringAttemptedToParse);
    }

    yield {
        type: 'data',
        results: [{
            id: 'generic-ai-error',
            status: AnalysisStatus.Error,
            message: detailedMessage,
            page: 0,
            displayPageNumber: 1,
            pdfPhysicalPageNumber: 2,
            pageTitle: "AI分析エラー",
            itemPath: "AI処理全体",
            aiComment: error.stack || "スタックトレースなし"
        }]
    };
  }
}

// 前月比較分析用の関数
export async function* analyzeMonthlyComparison(
  previousPages: PdfPageContent[],
  currentPages: PdfPageContent[]
): AsyncGenerator<GeminiServiceStream, void, unknown> {
  if (!ai) {
     console.error("Gemini APIクライアントが初期化されていません (APIキーの問題の可能性があります)。モックエラーを返します。");
     yield {
        type: 'data',
        results: [{
            id: 'no-api-key-error',
            status: AnalysisStatus.Error,
            message: "Gemini APIクライアントが初期化されていません。APIキーが正しく設定されているか、上記の警告メッセージを確認してください。",
            page: 0,
            displayPageNumber: 1,
            pdfPhysicalPageNumber: 2,
            pageTitle: "システムエラー",
            itemPath: "システム全体",
            aiComment: "APIキーの設定を確認し、アプリケーションをリロードしてください。"
        }]
     };
     return;
  }

  if (previousPages.length === 0 || currentPages.length === 0) {
    yield {
        type: 'data',
        results: [{
            id: 'no-pages-to-compare',
            status: AnalysisStatus.Attention,
            message: "比較対象のページコンテンツが不足しています。前月と当月の両方のPDFが2ページ以上あることを確認してください。",
            page: 0,
            displayPageNumber: 1,
            pdfPhysicalPageNumber: 2,
            pageTitle: "データ不足",
            itemPath: "入力データ",
            aiComment: "前月と当月のPDFの2ページ目以降が分析対象となります。"
        }]
    };
    return;
  }

  const model = ai.models;
  
  // 前月と当月のデータを整理
  const previousContent = previousPages.map(p => 
    `前月データ ページ ${p.pageNumber} (PDF実P.${p.physicalPageNumber}, 表示P.${p.pageNumber + 1}):\n${p.content}`
  ).join("\n\n---\n\n");
  
  const currentContent = currentPages.map(p => 
    `当月データ ページ ${p.pageNumber} (PDF実P.${p.physicalPageNumber}, 表示P.${p.pageNumber + 1}):\n${p.content}`
  ).join("\n\n---\n\n");

  const prompt = `
    あなたは高精度な財務レポート前月比較分析アシスタントです。前月のコメントあり版レポートと当月のコメントなし版レポートを比較し、ページタイトルごとに前月の文量や観点に合わせてコメントを生成してください。

    **【レポートの特徴】:**
    - 約20ページの財務レポート（損益計算書、貸借対照表、キャッシュフロー計算書など）
    - 各ページに詳細な数値データとコメントが記載
    - 前月のコメント文体、文量、観点を参考にしたコメント生成
    - ページタイトルごとの特性を考慮した分析

    **【分析観点】:**
    1. **同軸比較**: 同じ項目の数値変化を分析（例：売上高の前月比変化）
    2. **異軸比較**: 関連する異なる項目間の変化を分析（例：売上高と営業利益の関係）
    3. **新規項目**: 当月に新たに追加された項目の分析
    4. **削除項目**: 前月にあったが当月に削除された項目の分析
    5. **累計推移**: 当月分追加後の累計値の変化分析

    **【コメント生成方針】:**
    - 前月のコメントの文量、文体、観点を詳細に分析し、それに合わせてコメントを生成
    - ページタイトルごとの特性（損益計算書、貸借対照表など）を考慮
    - 前月のコメントで言及されている項目や観点を優先的に分析
    - 数値の変化率や変化額を具体的に示す
    - 前月のコメントと同じレベルの詳細さで記述
    - 変化の要因や背景を推測してコメントに含める
    - 重要度（高・中・低）を適切に判定

    **【ページタイトル別の特徴】:**
    - **損益計算書**: 売上、費用、利益の詳細分析、利益率の変化
    - **貸借対照表**: 資産、負債、純資産の構成変化、流動性分析
    - **キャッシュフロー計算書**: 営業、投資、財務キャッシュフローの分析
    - **その他**: 各ページの特性に応じた分析観点

    **分析結果のJSON形式:**
    各比較項目はJSONオブジェクトの配列で、以下のキーを含めてください。

    [
      {
        "page": 0,
        "pageTitle": "損益計算書(1/2)",
        "comparisonType": "同軸比較",
        "itemPath": "売上高 > ラボ",
        "currentValue": "18,010千円",
        "previousValue": "19,500千円",
        "changeAmount": "-1,490千円",
        "changePercentage": "-7.6%",
        "comment": "ラボ売上高は前月比で1,490千円（7.6%）減少しました。",
        "generatedComment": "ラボ売上高は前月比で1,490千円（7.6%）減少しました。Miracle Fit IおよびMiracle Fit Vの販売数量減少が主因ですが、単価の上昇により前年同月比では増加しています。季節的な需要変動の影響も考慮する必要があります。",
        "reasoning": "同軸比較: 売上高の減少率が5%を超えており、重要な変化として判断。前月のコメントで言及されているMiracle Fit製品の動向を踏まえた分析を実施。",
        "significance": "高",
        "category": "売上"
      }
    ]

    **各フィールドの説明:**
    - "page": 該当ページの番号 (0始まり)
    - "pageTitle": 該当ページの主要タイトル（例: "損益計算書(1/2)"）
    - "comparisonType": "同軸比較"、"異軸比較"、"新規項目"、"削除項目"、"累計推移"のいずれか
    - "itemPath": 比較対象項目のパス（例: "売上高 > ラボ"）
    - "currentValue": 当月の数値
    - "previousValue": 前月の数値
    - "changeAmount": 変化額（+1,490千円、-500千円など）
    - "changePercentage": 変化率（+7.6%、-5.2%など）
    - "comment": 基本的な変化の記述
    - "generatedComment": AI生成された詳細なコメント（前月の文量・観点に合わせた記述）
    - "reasoning": AIの判断理由
    - "significance": "高"、"中"、"低"のいずれか
    - "category": "売上"、"利益"、"費用"、"資産"、"負債"、"その他"のいずれか

    **前月データ（コメントあり版）:**
    ${previousContent}

    **当月データ（コメントなし版）:**
    ${currentContent}

    上記データに基づき、前月と当月の数値変化を分析し、ページタイトルごとに前月の文量や観点に合わせた適切なコメントを生成してください。前月のコメントで言及されている項目や観点を優先的に分析し、同じレベルの詳細さで記述してください。
    `;

  try {
    yield { type: 'progress', message: '前月比較分析を実行中です。数値の変化を分析してコメントを生成しています...' };
    
    const response: GenerateContentResponse = await model.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            temperature: 0.1,
            topK: 40,
            topP: 0.95,
        },
    });

    if (!response) {
        console.error("AIから応答がありません (null または undefined)。");
        throw new Error("AIから有効な応答が返されませんでした。");
    }

    const responseTextValue = response.text;

    if (typeof responseTextValue !== 'string') {
        console.error(
            "AI応答の'text'プロパティが文字列ではありませんでした。",
            "タイプ:", typeof responseTextValue,
            "値:", responseTextValue,
            "応答全体:", response
        );
        throw new Error(`AI応答のテキスト部分を解析できませんでした (予期しない型: ${typeof responseTextValue})。SDKのバージョンや応答内容を確認してください。`);
    }
    
    yield { type: 'progress', message: 'AIからの前月比較分析結果(JSON)を受信しました。内容を検証・整形しています...' };

    let jsonStrForParsing = responseTextValue.trim();
    const fenceRegex = /^\`\`\`(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStrForParsing.match(fenceRegex);
    if (match && match[2]) {
      jsonStrForParsing = match[2].trim();
    }

    let parsedJson: any;
    try {
        parsedJson = JSON.parse(jsonStrForParsing);

        if (typeof parsedJson === 'string') {
            console.warn("AI response was initially parsed into a string. Attempting to parse this string as JSON. String content for second parse attempt:", parsedJson);
            jsonStrForParsing = parsedJson;
            parsedJson = JSON.parse(jsonStrForParsing);
        }
    } catch (e) {
        const error = e as Error;
        console.error("JSON.parse failed. String content that failed parsing:", `>>>${jsonStrForParsing}<<<`, "Error Name:", error.name, "Error Message:", error.message, "Stack:", error.stack);
        
        let errorMessage = "AIでの前月比較分析に失敗しました。AIの応答形式が正しくない可能性があります。";
        errorMessage += ` 詳細: ${error.message}.`;
        
        if (error.message.toLowerCase().includes("unexpected token") || 
            error.message.toLowerCase().includes("unterminated string") || 
            error.message.toLowerCase().includes("expected") && jsonStrForParsing.length > 0) {
            
            const errorPosMatch = error.message.match(/position\s+(\d+)/);
            let errorSnippet = "";
            if (errorPosMatch && errorPosMatch[1]) {
                const pos = parseInt(errorPosMatch[1], 10);
                const start = Math.max(0, pos - 50);
                const end = Math.min(jsonStrForParsing.length, pos + 50);
                errorSnippet = `...${jsonStrForParsing.substring(start, end)}...`;
            } else {
                errorSnippet = jsonStrForParsing.substring(0, Math.min(150, jsonStrForParsing.length));
            }
            errorMessage += ` 応答データ(エラー箇所周辺または冒頭): ${errorSnippet}`;
        }
        const finalError = new Error(errorMessage);
        (finalError as any).originalErrorName = error.name;
        (finalError as any).originalErrorMessage = error.message;
        (finalError as any).stringAttemptedToParse = jsonStrForParsing;
        throw finalError;
    }

    const rawResults = (Array.isArray(parsedJson) ? parsedJson : []) as Array<any>;

    const processedResults = rawResults.map((rawResult: any, index): MonthlyComparisonResult => {
      const internalPageNumber = rawResult.page !== undefined && typeof rawResult.page === 'number' && rawResult.page >= 0 ? rawResult.page : 0;

      return {
        id: `monthly-comparison-${Date.now()}-${index}`,
        page: internalPageNumber,
        pageTitle: rawResult.pageTitle || `P.${internalPageNumber + 1} タイトル不明`,
        comparisonType: rawResult.comparisonType || '同軸比較',
        itemPath: rawResult.itemPath || '項目不明',
        currentValue: rawResult.currentValue,
        previousValue: rawResult.previousValue,
        changeAmount: rawResult.changeAmount,
        changePercentage: rawResult.changePercentage,
        comment: rawResult.comment || '',
        generatedComment: rawResult.generatedComment || rawResult.comment || '',
        reasoning: rawResult.reasoning || '',
        significance: rawResult.significance || '中',
        category: rawResult.category || 'その他',
        timestamp: new Date().toISOString()
      };
    });

    yield { type: 'data', results: processedResults };

  } catch (error: any) {
    console.error("Error in analyzeMonthlyComparison:", error);
    let detailedMessage = "AIによる前月比較分析中に予期せぬエラーが発生しました。";
    if (error.message) {
        detailedMessage += `エラー詳細: ${error.message}`;
    }
    if (error.originalErrorName && error.originalErrorMessage) {
        detailedMessage += `根本原因(${error.originalErrorName}): ${error.originalErrorMessage}`;
    }
    if (error.stringAttemptedToParse) {
        console.error("String that was attempted to be parsed when error occurred:", error.stringAttemptedToParse);
    }

    yield {
        type: 'data',
        results: [{
            id: 'monthly-comparison-error',
            status: AnalysisStatus.Error,
            message: detailedMessage,
            page: 0,
            displayPageNumber: 1,
            pdfPhysicalPageNumber: 2,
            pageTitle: "前月比較分析エラー",
            itemPath: "AI処理全体",
            aiComment: error.stack || "スタックトレースなし"
        }]
    };
  }
}
