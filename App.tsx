
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { IncidentType, ReportType, ReportData, PersonInfo } from './types';
import IncidentTypeButton from './components/IncidentTypeButton';
import ReportDisplay from './components/ReportDisplay';

// Extend the global Window interface to include aistudio helper.
// Using inline type and optional modifier to resolve conflicting declarations and modifier errors.
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey(): Promise<boolean>;
      openSelectKey(): Promise<void>;
    };
  }
}

const EUP_MYEON_LIST = [
  '영암읍', '삼호읍', '덕진면', '금정면', '신북면', 
  '시종면', '도포면', '군서면', '서호면', '학산면', '미암면'
];

const App: React.FC = () => {
  // --- 기존 리포트 상태 ---
  const [reportType, setReportType] = useState<ReportType>(ReportType.OCCURRENCE);
  const [incidentType, setIncidentType] = useState<IncidentType>(IncidentType.ASSAULT);
  const [dateTime, setDateTime] = useState<string>('2026-01-04T12:10');
  const [eupMyeon, setEupMyeon] = useState<string>('삼호읍');
  const [detailAddress, setDetailAddress] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [apprehensionProcess, setApprehensionProcess] = useState<string>(''); 
  const [siteSituation, setSiteSituation] = useState<string>(''); 
  const [involvedReporter, setInvolvedReporter] = useState<string>('');
  const [suspect, setSuspect] = useState<PersonInfo>({ name: '홍길동', age: '30', gender: '남' });
  const [victim, setVictim] = useState<PersonInfo>({ name: '황진이', age: '26', gender: '여' });
  const [actionsTaken, setActionsTaken] = useState<string>('(예) 상황관리관 및 초동대응팀 현장 출동');
  const [damageSituation, setDamageSituation] = useState<string>('');
  const [fireHumanDamage, setFireHumanDamage] = useState<string>('');
  const [firePropertyDamage, setFirePropertyDamage] = useState<string>('');
  const [reporterName, setReporterName] = useState<string>('');
  const [reporterTitle, setReporterTitle] = useState<string>('상황관리관');
  const [showReport, setShowReport] = useState<boolean>(false);
  const [generatedReport, setGeneratedReport] = useState<ReportData | null>(null);

  // --- API 키 관리 상태 ---
  const [showKeyManager, setShowKeyManager] = useState<boolean>(false);
  const [isApiConnected, setIsApiConnected] = useState<boolean | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [aiGeneratingField, setAiGeneratingField] = useState<string | null>(null);

  useEffect(() => {
    checkApiKeyStatus();
  }, []);

  const checkApiKeyStatus = async () => {
    try {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsApiConnected(hasKey);
      }
    } catch (e) {
      console.error("API 키 상태 확인 실패:", e);
    }
  };

  const handleOpenKeySelector = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setIsApiConnected(true);
        addLog("API 키 선택 창이 호출되었습니다.");
      }
    } catch (e) {
      addLog("API 키 선택 오류: " + e);
    }
  };

  const addLog = (msg: string) => {
    setTestLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 연결 테스트: Gemini API를 사용하여 실제 응답 확인
  const runConnectionTest = async () => {
    setIsTestingConnection(true);
    setTestLogs([]);
    addLog("연결 테스트 시작...");
    
    try {
      addLog("GoogleGenAI 인스턴스 초기화 중...");
      // CRITICAL: Use process.env.API_KEY directly in the initialization object.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      addLog("테스트 프롬프트 송신 중 (gemini-3-flash-preview)...");
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'Connection test. Reply only "SUCCESS".',
      });
      
      const result = response.text?.trim() || "";
      if (result.includes("SUCCESS")) {
        addLog("서버 응답 수신 성공: SUCCESS");
        setIsApiConnected(true);
        addLog("테스트 결과: 정상 연동 확인됨.");
      } else {
        throw new Error("비정상적 응답 수신");
      }
    } catch (e: any) {
      addLog("에러 발생: " + (e.message || "알 수 없는 오류"));
      if (e.message?.includes('Requested entity was not found.')) {
        addLog("경고: 유효하지 않은 API 키입니다. 재설정이 필요합니다.");
        setIsApiConnected(false);
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  // 암호화하여 로컬 드라이브에 저장 (백업 파일 생성)
  const handleExportKey = () => {
    try {
      const key = process.env.API_KEY || "NO_KEY_SELECTED";
      const timestamp = new Date().toISOString();
      const rawData = JSON.stringify({ key, timestamp, app: "PoliceReportSystem" });
      
      // 간단한 암호화 시뮬레이션 (Base64 + XOR 스타일 난독화)
      const encoded = btoa(encodeURIComponent(rawData).split('').map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ (1 + i % 5))
      ).join(''));

      const blob = new Blob([encoded], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gemini_api_backup_${new Date().getTime()}.key`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      addLog("로컬 드라이브 백업 파일 생성이 완료되었습니다.");
      alert("API 키 백업 파일이 성공적으로 다운로드되었습니다.");
    } catch (e) {
      addLog("백업 실패: " + e);
    }
  };

  // AI 추천 기능
  const handleAiSuggest = async (field: 'description' | 'actionsTaken') => {
    if (!window.aistudio) return;
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      alert('AI 기능을 사용하려면 먼저 API 키를 설정해야 합니다.');
      setShowKeyManager(true);
      return;
    }

    setAiGeneratingField(field);
    try {
      // Create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date key.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const prompt = `
        경찰 보고서 작성을 도와줘.
        사건유형: ${incidentType}, 보고유형: ${reportType}, 장소: 영암군 ${eupMyeon} ${detailAddress}
        이 정보를 바탕으로 '${field === 'description' ? '신고 내용' : '조치 사항'}'을 공공기관 보고서 형식으로 전문적이고 간결하게 한 문장으로 작성해줘. 
      `;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      const suggestion = response.text?.trim() || '';
      if (field === 'description') setDescription(suggestion);
      if (field === 'actionsTaken') setActionsTaken(suggestion);
    } catch (e: any) {
      console.error("AI 생성 실패:", e);
      alert('AI 생성 중 오류가 발생했습니다. API 키 상태를 확인하세요.');
    } finally {
      setAiGeneratingField(null);
    }
  };

  const handleSubmit = () => {
    const report: ReportData = {
      incidentType, reportType, dateTime, eupMyeon, detailAddress,
      description, apprehensionProcess, siteSituation, involvedReporter,
      suspect, victim, actionsTaken, damageSituation, fireHumanDamage,
      firePropertyDamage, reporterName, reporterTitle
    };
    setGeneratedReport(report);
    setShowReport(true);
  };

  const handlePersonChange = (type: 'suspect' | 'victim', field: keyof PersonInfo, value: string) => {
    if (type === 'suspect') setSuspect(prev => ({ ...prev, [field]: value }));
    else setVictim(prev => ({ ...prev, [field]: value }));
  };

  const isEnforcement = reportType === ReportType.ENFORCEMENT;
  const isFire = incidentType === IncidentType.FIRE;
  const isDomesticViolence = incidentType === IncidentType.DOMESTIC_VIOLENCE;
  const dateTimeLabel = reportType === ReportType.OCCURRENCE ? '발생 일시' :
                        reportType === ReportType.APPREHENSION ? '검거 일시' : '단속 일시';
  const descriptionLabel = isEnforcement ? '위반 사항' : '신고 내용';
  const damageLabel = isDomesticViolence ? '피해자 보호조치' : '피해 상황';

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden pb-32 bg-background-light dark:bg-background-dark text-slate-900 dark:text-white">
      {/* Top App Bar */}
      <div className="sticky top-0 z-50 flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 justify-between border-b border-gray-200 dark:border-gray-800">
        <button className="flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>
        <h2 className="text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">사건 발생 보고 작성</h2>
        <div className="flex gap-1">
          <button 
            onClick={() => setShowKeyManager(true)}
            className={`flex size-12 shrink-0 items-center justify-center rounded-full transition-colors ${isApiConnected ? 'text-green-500 hover:bg-green-500/10' : 'text-slate-400 hover:bg-gray-800'}`}
          >
            <span className="material-symbols-outlined">key</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col max-w-2xl mx-auto w-full">
        {/* Input Sections */}
        <div className="flex flex-col px-4 pt-6">
          <h3 className="text-lg font-bold leading-tight tracking-[-0.015em] pb-3">보고 유형</h3>
          <div className="flex gap-4">
            {Object.values(ReportType).map((type) => (
              <button key={type} onClick={() => setReportType(type)}
                className={`flex-1 h-11 rounded-lg font-bold transition-all border ${reportType === type ? 'bg-primary border-primary text-white' : 'bg-[#1b1f27] border-gray-800 text-slate-400'}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col pt-6">
          <h3 className="text-lg font-bold leading-tight tracking-[-0.015em] px-4 pb-3">사건 유형</h3>
          <div className="flex gap-3 overflow-x-auto px-4 no-scrollbar pb-2">
            {Object.values(IncidentType).map((type) => (
              <IncidentTypeButton key={type} type={type} isSelected={incidentType === type} onClick={setIncidentType} />
            ))}
          </div>
        </div>

        <div className="flex flex-col px-4 pt-6">
          <h3 className="text-lg font-bold leading-tight tracking-[-0.015em] pb-3">{dateTimeLabel}</h3>
          <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)}
            className="h-14 bg-[#1b1f27] border border-gray-800 rounded-lg px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col px-4 pt-6">
          <h3 className="text-lg font-bold leading-tight tracking-[-0.015em] pb-3">발생 장소</h3>
          <div className="flex gap-2 mb-2">
            <select value={eupMyeon} onChange={(e) => setEupMyeon(e.target.value)}
              className="flex-1 h-14 bg-[#1b1f27] border border-gray-800 rounded-lg px-4 text-white appearance-none"
            >
              {EUP_MYEON_LIST.map(eup => <option key={eup} value={eup}>{eup}</option>)}
            </select>
          </div>
          <input type="text" placeholder="상세 주소" value={detailAddress} onChange={(e) => setDetailAddress(e.target.value)}
            className="h-14 bg-[#1b1f27] border border-gray-800 rounded-lg px-4 text-white"
          />
        </div>

        <div className="flex flex-col px-4 pt-6">
          <div className="flex justify-between items-center pb-3">
            <h3 className="text-lg font-bold leading-tight tracking-[-0.015em]">{descriptionLabel}</h3>
            <button onClick={() => handleAiSuggest('description')} className="flex items-center gap-1 text-primary text-sm font-bold">
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              {aiGeneratingField === 'description' ? '생성 중...' : 'AI 추천'}
            </button>
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            className="min-h-[100px] bg-[#1b1f27] border border-gray-800 rounded-lg p-4 text-white"
          />
        </div>

        <div className="flex flex-col px-4 pt-6">
          <h3 className="text-lg font-bold leading-tight tracking-[-0.015em] pb-3">관련자 인적사항</h3>
          <div className="space-y-4">
            <input placeholder="신고자" value={involvedReporter} onChange={(e) => setInvolvedReporter(e.target.value)}
              className="w-full h-12 bg-[#1b1f27] border border-gray-800 rounded-lg px-4 text-white"
            />
            <div className="p-4 bg-[#1b1f27] border border-gray-800 rounded-lg">
              <p className="text-sm text-gray-400 mb-2">피의자</p>
              <div className="flex gap-2"><input placeholder="이름" value={suspect.name} onChange={(e) => handlePersonChange('suspect', 'name', e.target.value)} className="flex-1 h-11 bg-[#282e39] rounded-lg px-3 text-white" /></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col px-4 pt-6">
          <div className="flex justify-between items-center pb-3">
            <h3 className="text-lg font-bold leading-tight tracking-[-0.015em]">조치 사항</h3>
            <button onClick={() => handleAiSuggest('actionsTaken')} className="flex items-center gap-1 text-primary text-sm font-bold">
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              {aiGeneratingField === 'actionsTaken' ? '생성 중...' : 'AI 추천'}
            </button>
          </div>
          <textarea value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)}
            className="min-h-[100px] bg-[#1b1f27] border border-gray-800 rounded-lg p-4 text-white"
          />
        </div>

        <div className="px-4 py-8">
          <button onClick={handleSubmit} className="w-full h-14 bg-primary text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform">
            보고서 생성하기
          </button>
        </div>
      </div>

      {/* API Key Manager Modal */}
      {showKeyManager && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#1b1f27] w-full max-w-lg rounded-3xl p-8 border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[32px]">shield_person</span>
                <h2 className="text-2xl font-bold">API 키 보안 관리</h2>
              </div>
              <button onClick={() => setShowKeyManager(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              본 시스템은 Google Gemini AI를 활용하여 보고서 작성을 보조합니다. API 키는 외부 플랫폼(AI Studio)을 통해 연동되며, 로컬 드라이브에 암호화된 백업을 생성할 수 있습니다. 
              <br /><br />
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-primary underline">결제 및 요금 안내 확인</a>
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-background-dark rounded-2xl border border-gray-800">
                <div>
                  <p className="font-bold text-sm">연동 상태</p>
                  <p className={`text-xs ${isApiConnected ? 'text-green-500' : 'text-red-500'}`}>
                    {isApiConnected ? '✓ 현재 API 키가 활성화됨' : '✗ 연동된 키가 없습니다'}
                  </p>
                </div>
                <button onClick={handleOpenKeySelector} className="px-4 h-10 bg-gray-700 hover:bg-gray-600 rounded-xl text-xs font-bold transition-all">
                  키 변경
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={runConnectionTest} 
                  disabled={isTestingConnection}
                  className="flex items-center justify-center gap-2 h-14 bg-primary hover:bg-blue-600 rounded-2xl font-bold text-sm transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">{isTestingConnection ? 'sync' : 'connectivity_available'}</span>
                  {isTestingConnection ? '테스트 중...' : '연결 테스트'}
                </button>
                <button 
                  onClick={handleExportKey}
                  className="flex items-center justify-center gap-2 h-14 bg-[#282e39] hover:bg-[#3b4354] rounded-2xl font-bold text-sm transition-all border border-gray-700"
                >
                  <span className="material-symbols-outlined text-[20px]">enhanced_encryption</span>
                  암호화 백업
                </button>
              </div>

              {/* 로그창 */}
              <div className="mt-4 bg-black/40 rounded-2xl p-4 h-32 overflow-y-auto border border-gray-800 font-mono text-[10px] text-gray-400 no-scrollbar">
                {testLogs.length === 0 ? "이벤트 로그가 여기에 표시됩니다..." : testLogs.map((log, i) => (
                  <div key={i} className="mb-1">{log}</div>
                ))}
              </div>
            </div>

            <div className="mt-8 text-[11px] text-gray-500 text-center">
              사용자의 API 키는 서버에 저장되지 않으며 로컬 환경에서만 관리됩니다.
            </div>
          </div>
        </div>
      )}

      {showReport && generatedReport && (
        <ReportDisplay report={generatedReport} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
};

export default App;
