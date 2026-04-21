import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileJson, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Download, 
  Hash, 
  Layers,
  ChevronRight,
  Database,
  ArrowLeft,
  RefreshCcw
} from 'lucide-react';
import { Step, MappingEntry, ATSStep, DuplicateAnalysis, ComparisonResult } from './types';
import { 
  classifyMappings, 
  findDuplicates, 
  convertToCSV, 
  downloadFile,
  runComparison1Way,
  runComparison2Way
} from './lib/logic';

const STEPS: { id: Step; label: string; sub: string }[] = [
  { id: 'UPLOAD', label: 'File Upload', sub: 'Extract Data' },
  { id: 'PARSED', label: 'Classification', sub: 'Separate Flows' },
  { id: 'DUPLICATES', label: 'Duplicate Check', sub: 'Finding Pairs' },
  { id: 'ACTIONS', label: 'Next Actions', sub: 'Run Comparison' },
];

export default function App() {
  const [currentStep, setCurrentStep] = useState<Step>('UPLOAD');
  const [files, setFiles] = useState<{ static: File | null; ats: File | null }>({ static: null, ats: null });
  const [data, setData] = useState<{
    oneWay: MappingEntry[];
    twoWay: MappingEntry[];
    dupes1Way: DuplicateAnalysis;
    dupes2Way: DuplicateAnalysis;
    atsSteps: ATSStep[];
    splitIndex: number;
    results1Way: ComparisonResult[];
    results2Way: ComparisonResult[];
  }>({ 
    oneWay: [], 
    twoWay: [], 
    dupes1Way: { entries: [], type: 'NONE' }, 
    dupes2Way: { entries: [], type: 'NONE' }, 
    atsSteps: [], 
    splitIndex: -1,
    results1Way: [],
    results2Way: []
  });

  React.useEffect(() => {
    if (currentStep === 'COMPARE_1WAY' && data.results1Way.length === 0) {
      const results = runComparison1Way(data.oneWay, data.atsSteps);
      setData(prev => ({ ...prev, results1Way: results }));
    }
    if (currentStep === 'COMPARE_2WAY' && data.results2Way.length === 0) {
      const results = runComparison2Way(data.twoWay, data.atsSteps);
      setData(prev => ({ ...prev, results2Way: results }));
    }
  }, [currentStep]);
  
  const [loading, setLoading] = useState(false);
  const [oneWayComplete, setOneWayComplete] = useState(false);

  const [dragState, setDragState] = useState<{ [key: string]: boolean }>({ static: false, ats: false });

  const handleFileUpload = (type: 'static' | 'ats', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const onDragOver = (type: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragState(prev => ({ ...prev, [type]: true }));
  };

  const onDragLeave = (type: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragState(prev => ({ ...prev, [type]: false }));
  };

  const onDrop = (type: 'static' | 'ats', e: React.DragEvent) => {
    e.preventDefault();
    setDragState(prev => ({ ...prev, [type]: false }));
    const file = e.dataTransfer.files?.[0] || null;
    if (file && file.type === 'application/json') {
      setFiles(prev => ({ ...prev, [type]: file }));
    } else if (file) {
      alert('Highly recommended to upload .json files only.');
    }
  };

  const processFiles = async () => {
    if (!files.static || !files.ats) return;
    setLoading(true);

    try {
      // 1. Process Static Mapping
      const staticText = await files.static.text();
      const staticJson = JSON.parse(staticText);
      
      let mappingsToProcess = staticJson;

      if (staticJson && typeof staticJson === 'object') {
        if ('statusConfig' in staticJson) {
          mappingsToProcess = staticJson.statusConfig;
        } else {
          alert("Invalid Static Mapping file: 'statusConfig' not found");
          setLoading(false);
          return;
        }
      }

      if (!mappingsToProcess || typeof mappingsToProcess !== 'object' || Array.isArray(mappingsToProcess)) {
        alert("Invalid Static Mapping file: 'statusConfig' is not a valid object");
        setLoading(false);
        return;
      }

      if (Object.keys(mappingsToProcess).length === 0) {
        alert("No mappings found inside statusConfig");
        setLoading(false);
        return;
      }

      // 2. Process ATS Mapping
      const atsText = await files.ats.text();
      const atsJson = JSON.parse(atsText);

      if (!atsJson || !atsJson.Report_Entry || !Array.isArray(atsJson.Report_Entry)) {
        alert("Invalid ATS file: 'Report_Entry' not found or is not an array");
        setLoading(false);
        return;
      }

      if (atsJson.Report_Entry.length === 0) {
        alert("Invalid ATS file: 'Report_Entry' is empty");
        setLoading(false);
        return;
      }

      const extractedAtsSteps: ATSStep[] = [];
      for (const entry of atsJson.Report_Entry) {
        if (entry.Business_Process_Steps_group) {
          if (Array.isArray(entry.Business_Process_Steps_group)) {
            extractedAtsSteps.push(...entry.Business_Process_Steps_group);
          } else {
            // Keep going if some are weird, but warn if necessary
          }
        }
      }

      if (extractedAtsSteps.length === 0) {
        alert("No workflow steps found in ATS file (Business_Process_Steps_group missing or empty)");
        setLoading(false);
        return;
      }
      
      const { oneWayMappings, twoWayMappings, splitIndex } = classifyMappings(mappingsToProcess);
      
      setData(prev => ({
        ...prev,
        oneWay: oneWayMappings,
        twoWay: twoWayMappings,
        atsSteps: extractedAtsSteps,
        splitIndex
      }));
      setCurrentStep('PARSED');
    } catch (err) {
      alert('Error parsing JSON files. Please ensure they are valid JSON.');
    } finally {
      setLoading(false);
    }
  };

  const runDuplicateCheck = () => {
    const dupes1Way = findDuplicates(data.oneWay);
    const dupes2Way = findDuplicates(data.twoWay);
    
    setData(prev => ({ ...prev, dupes1Way, dupes2Way }));
    setCurrentStep('DUPLICATES');
  };

  const downloadDuplicates = (type: '1-WAY' | '2-WAY') => {
    const targetData = type === '1-WAY' ? data.dupes1Way.entries : data.dupes2Way.entries;
    const csv = convertToCSV(targetData, ['referenceID', 'label']);
    downloadFile(csv, `duplicates_${type.toLowerCase()}.csv`, 'text/csv');
  };

  const downloadResults = (type: '1-WAY' | '2-WAY') => {
    const targetData = type === '1-WAY' ? data.results1Way : data.results2Way;
    const csv = convertToCSV(targetData, [
      'type', 'staticKey', 'staticLabel', 'staticReferenceID', 'staticStage', 
      'atsReferenceID', 'atsLabel', 'atsStage', 'status'
    ]);
    downloadFile(csv, `comparison_${type.toLowerCase()}.csv`, 'text/csv');
  };

  const resetWorkflow = () => {
    setFiles({ static: null, ats: null });
    setData({ 
      oneWay: [], 
      twoWay: [], 
      dupes1Way: { entries: [], type: 'NONE' }, 
      dupes2Way: { entries: [], type: 'NONE' }, 
      atsSteps: [], 
      splitIndex: -1,
      results1Way: [],
      results2Way: []
    });
    setOneWayComplete(false);
    setCurrentStep('UPLOAD');
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {/* Header Section */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-sm">
            <Database className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">MappingFlow <span className="text-slate-400 font-normal">v1.2</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-green-500 rounded-full"></span> Session Active</span>
          <button 
            onClick={resetWorkflow}
            className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <RefreshCcw size={14} />
            Reset Workflow
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Stepper */}
        <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 shrink-0">
          <div className="space-y-6">
            {STEPS.map((step, idx) => {
              const stepIdx = STEPS.findIndex(s => s.id === currentStep);
              const isCompleted = stepIdx > idx;
              const isActive = stepIdx === idx;
              const isPending = stepIdx < idx;
              
              return (
                <div key={step.id} className="flex gap-4 items-start relative last:mb-0">
                  <div className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold z-10
                    ${isActive ? 'bg-indigo-600 text-white' : ''}
                    ${isCompleted ? 'bg-indigo-100 border border-indigo-600 text-indigo-600' : ''}
                    ${isPending ? 'bg-slate-100 border border-slate-200 text-slate-400' : ''}
                  `}>
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <div className={`flex flex-col ${isPending ? 'opacity-50' : ''}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                    <span className={`text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-slate-700'}`}>
                      {step.sub}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="absolute left-3 top-6 w-[1px] h-10 bg-slate-200 -z-0"></div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-auto">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Selected Files</h4>
              <div className="text-xs font-semibold text-slate-600 truncate flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${files.static ? 'bg-green-500' : 'bg-slate-300'}`} />
                {files.static ? files.static.name : 'No static file'}
              </div>
              <div className="text-xs font-semibold text-slate-600 truncate flex items-center gap-2 mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${files.ats ? 'bg-green-500' : 'bg-slate-300'}`} />
                {files.ats ? files.ats.name : 'No status file'}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Stage */}
        <main className="flex-1 p-8 overflow-auto flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {currentStep === 'UPLOAD' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-bold">Initiate Mapping Workflow</h2>
                  <p className="text-slate-500 text-sm italic font-serif">Upload the registry files to classify and audit HSI mappings.</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {[
                    { key: 'static', title: 'Static Client Mapping', icon: <Database /> },
                    { key: 'ats', title: 'ATS Get_Status_Mappings', icon: <FileJson /> }
                  ].map(card => (
                    <div 
                      key={card.key} 
                      onDragOver={(e) => onDragOver(card.key, e)}
                      onDragLeave={(e) => onDragLeave(card.key, e)}
                      onDrop={(e) => onDrop(card.key as 'static' | 'ats', e)}
                      className={`card p-8 flex flex-col items-center text-center group bg-white transition-all duration-200 border-2 ${
                        dragState[card.key] ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-slate-200'
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-colors ${
                        files[card.key as keyof typeof files] ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-100'
                      }`}>
                        {files[card.key as keyof typeof files] ? <CheckCircle2 size={24} /> : card.icon}
                      </div>
                      <h3 className="text-base font-bold mb-2">{card.title}</h3>
                      
                      {files[card.key as keyof typeof files] ? (
                        <div className="mb-6 flex flex-col items-center gap-1">
                          <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 max-w-[200px] truncate">
                            {files[card.key as keyof typeof files]?.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">File Uploaded</span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mb-6 max-w-[200px]">Drag & drop or click to choose a .json file.</p>
                      )}
                      
                      <label className="btn-action btn-secondary cursor-pointer inline-flex items-center gap-2">
                        <Upload size={16} />
                        {files[card.key as keyof typeof files] ? 'Change File' : 'Choose Data Source'}
                        <input type="file" accept=".json" className="hidden" onChange={(e) => handleFileUpload(card.key as 'static', e)} />
                      </label>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 flex justify-center">
                  <button 
                    onClick={processFiles}
                    disabled={!files.static || !files.ats || loading}
                    className="btn-action btn-primary px-8 flex items-center gap-2"
                  >
                    {loading ? 'Processing...' : 'Run Classification Process'}
                    <ChevronRight size={18} />
                  </button>
                </div>
              </motion.div>
            )}

            {currentStep === 'PARSED' && (
              <motion.div 
                key="parsed"
                initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-bold">Classification Success</h2>
                  <p className="text-slate-500 text-sm">Detected {data.oneWay.length + data.twoWay.length} total mapping entries definitions.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: '1-Way HSI Mapping', count: data.oneWay.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: '2-Way HSI Mapping', count: data.twoWay.length, color: 'text-amber-600', bg: 'bg-amber-50' }
                  ].map(stat => (
                    <div key={stat.label} className="card p-5 flex items-center justify-between">
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${stat.color}`}>{stat.label}</span>
                        <div className="text-2xl font-bold mt-1">{stat.count} Entries</div>
                      </div>
                      <div className={`p-3 rounded-lg ${stat.bg} ${stat.color}`}>
                        <Layers size={24} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card p-10 text-center flex flex-col items-center">
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-xl font-bold mb-4">Integrity Check Required</h3>
                  <p className="text-slate-500 text-sm mb-8 max-w-sm">
                    Workflow entries have been successfully mapped into directional collections. 
                    {data.splitIndex !== -1 && (
                      <span className="block mt-2 font-semibold text-indigo-600">
                        * Transition point detected at row {data.splitIndex + 1}
                      </span>
                    )}
                    Please proceed to verify unique reference identifiers.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setCurrentStep('UPLOAD')} className="btn-action btn-secondary px-6">Modify Uploads</button>
                    <button onClick={runDuplicateCheck} className="btn-action btn-primary px-8 flex items-center gap-2">
                      Analyze Duplicates
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep === 'DUPLICATES' && (
              <motion.div 
                key="duplicates"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-bold">Duplicate Analysis</h2>
                  <p className="text-slate-500 text-sm">Identifying conflicting Reference ID + Label pairs.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { type: '1-WAY', analysis: data.dupes1Way, color: 'indigo' },
                    { type: '2-WAY', analysis: data.dupes2Way, color: 'amber' }
                  ].map(section => (
                    <div key={section.type} className="card p-5">
                      <div className="flex justify-between items-center mb-3">
                        <span className={`text-[10px] font-bold text-${section.color}-600 uppercase tracking-widest`}>{section.type} HSI Mapping</span>
                        <div className="flex gap-2">
                          {section.analysis.type !== 'NONE' && (
                            <span className={`px-2 py-0.5 bg-${section.color}-600 text-white text-[9px] font-black rounded uppercase`}>
                              {section.analysis.type.replace('_', ' ')}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 bg-${section.color}-50 text-${section.color}-700 text-[10px] font-bold rounded-full`}>
                            {section.analysis.entries.length > 0 ? `${section.analysis.entries.length} Flags` : 'Clean'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Status Report</p>
                          <p className={`text-xl font-bold ${section.analysis.entries.length > 0 ? `text-rose-600` : 'text-green-600'}`}>
                            {section.analysis.entries.length > 0 
                              ? `${section.analysis.entries.length} Duplicate Entries` 
                              : 'No Duplicates Found'}
                          </p>
                        </div>
                        {section.analysis.entries.length > 0 && (
                          <button onClick={() => downloadDuplicates(section.type as '1-WAY')} className="btn-dense">
                            <Download size={12} />
                            DOWNLOAD CSV
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex-1 card flex flex-col min-h-0">
                  <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Merged Duplicate Manifest</h3>
                  </div>
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] font-bold text-slate-400 bg-white sticky top-0 border-b border-slate-100 uppercase tracking-tighter">
                          <th className="px-6 py-4">TYPE</th>
                          <th className="px-6 py-4">DETECTION</th>
                          <th className="px-6 py-4">REFERENCE ID</th>
                          <th className="px-6 py-4">ALTERNATE NAME (LABEL)</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs">
                        {[
                          ...data.dupes1Way.entries.map(d => ({...d, t: '1-WAY', det: data.dupes1Way.type})), 
                          ...data.dupes2Way.entries.map(d => ({...d, t: '2-WAY', det: data.dupes2Way.type}))
                        ].slice(0, 100).map((m, i) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${m.t === '1-WAY' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                {m.t}
                              </span>
                            </td>
                            <td className="px-6 py-3">
                              <span className="text-[10px] font-bold text-slate-400">{m.det.replace('_', ' ')}</span>
                            </td>
                            <td className="px-6 py-3 font-mono font-medium">{m.referenceID}</td>
                            <td className="px-6 py-3">{m.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium italic">Proceed to Next Actions section to run full comparison logic.</span>
                  <button onClick={() => setCurrentStep('ACTIONS')} className="btn-action btn-primary px-10">Continue to Comparison</button>
                </div>
              </motion.div>
            )}

            {currentStep === 'ACTIONS' && (
              <motion.div key="actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-12 py-12">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Hash className="w-8 h-8 text-slate-400" />
                  </div>
                  <h2 className="text-3xl font-extrabold tracking-tight">Ready for Comparison</h2>
                  <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed">
                    Identity validation complete. Select a mapping flow to execute the comparative logic engine.
                  </p>
                </div>
                
                <div className="flex gap-6 justify-center max-w-2xl mx-auto w-full">
                  <button 
                    onClick={() => setCurrentStep('COMPARE_1WAY')}
                    className="flex-1 card p-8 hover:border-indigo-600 hover:ring-1 hover:ring-indigo-600 transition-all text-center group"
                  >
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <ChevronRight size={24} />
                    </div>
                    <span className="text-xl font-bold block mb-1">Process 1-WAY</span>
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{data.oneWay.length} Records Detected</span>
                  </button>
                  <button 
                    onClick={() => {
                      if (!oneWayComplete) return;
                      setCurrentStep('COMPARE_2WAY');
                    }}
                    disabled={!oneWayComplete}
                    className={`flex-1 card p-8 transition-all text-center group ${
                      oneWayComplete 
                        ? 'hover:border-slate-800 hover:ring-1 hover:ring-slate-800' 
                        : 'opacity-50 grayscale cursor-not-allowed border-dashed'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 transition-colors ${
                      oneWayComplete ? 'bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white' : 'bg-slate-100 text-slate-300'
                    }`}>
                      <ChevronRight size={24} />
                    </div>
                    <span className="text-xl font-bold block mb-1">Process 2-WAY</span>
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{data.twoWay.length} Records Detected</span>
                    {!oneWayComplete && (
                      <span className="mt-3 block text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Requires 1-WAY Completion</span>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {['COMPARE_1WAY', 'COMPARE_2WAY'].includes(currentStep) && (
              <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 h-full overflow-hidden">
                <div className="flex items-center justify-between shrink-0">
                  <button onClick={() => setCurrentStep('ACTIONS')} className="text-slate-400 hover:text-black transition-colors flex items-center gap-2 text-sm font-semibold">
                    <ArrowLeft size={16} />
                    Back to Selection
                  </button>
                  <div className="flex items-center gap-4">
                    {currentStep === 'COMPARE_1WAY' && !oneWayComplete && (
                      <button 
                        onClick={() => setOneWayComplete(true)}
                        className="text-[10px] font-bold bg-green-600 text-white px-4 py-1.5 rounded-full hover:bg-green-700 transition-colors flex items-center gap-2 uppercase tracking-widest"
                      >
                        <CheckCircle2 size={14} />
                        Complete Logic Audit
                      </button>
                    )}
                    <div className="bg-slate-900 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                      {currentStep === 'COMPARE_1WAY' ? '1-WAY ENGINE' : '2-WAY ENGINE'} ACTIVE
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-8 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">
                        {currentStep === 'COMPARE_1WAY' ? '1-Way Mapping Comparison' : '2-Way Mapping Comparison'}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        {currentStep === 'COMPARE_1WAY' ? data.results1Way.length : data.results2Way.length} Records Analyzed
                      </p>
                    </div>
                    <button 
                      onClick={() => downloadResults(currentStep === 'COMPARE_1WAY' ? '1-WAY' : '2-WAY')}
                      className="btn-dense bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      <Download size={14} />
                      Export CSV
                    </button>
                  </div>
                  
                  <div className="overflow-auto flex-1 h-full">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                      <thead>
                        <tr className="text-[10px] font-bold text-slate-400 bg-white sticky top-0 border-b border-slate-100 uppercase tracking-tighter z-10">
                          <th className="px-6 py-4 bg-white">STATIC REF ID / KEY</th>
                          <th className="px-6 py-4 bg-white">STATIC LABEL</th>
                          <th className="px-6 py-4 bg-white">STATIC STAGE</th>
                          <th className="px-6 py-4 bg-white">ATS REF ID</th>
                          <th className="px-6 py-4 bg-white">ATS LABEL</th>
                          <th className="px-6 py-4 bg-white">ATS STAGE</th>
                          <th className="px-6 py-4 bg-white">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs">
                        {(currentStep === 'COMPARE_1WAY' ? data.results1Way : data.results2Way).map((res, i) => {
                          const statusTheme = {
                            'PERFECT_MATCH': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <CheckCircle2 size={12} /> },
                            'REFERENCE_ID_CHANGE': { bg: 'bg-blue-50', text: 'text-blue-700', icon: <CheckCircle2 size={12} /> },
                            'STAGE_CHANGE': { bg: 'bg-amber-50', text: 'text-amber-700', icon: <AlertCircle size={12} /> },
                            'LABEL_CHANGE': { bg: 'bg-amber-50', text: 'text-amber-700', icon: <AlertCircle size={12} /> },
                            'NO_MATCH': { bg: 'bg-rose-50', text: 'text-rose-700', icon: <AlertCircle size={12} /> }
                          }[res.status] || { bg: 'bg-slate-50', text: 'text-slate-700', icon: null };

                          return (
                            <tr key={i} className={`border-b border-slate-50 transition-colors ${statusTheme.bg}/50 hover:${statusTheme.bg}`}>
                              <td className="px-6 py-4 font-mono font-medium truncate max-w-[200px]">{res.staticReferenceID}</td>
                              <td className="px-6 py-4 max-w-[200px]">{res.staticLabel}</td>
                              <td className="px-6 py-4 text-slate-400 italic font-medium">{res.staticStage || 'N/A'}</td>
                              <td className="px-6 py-4 font-mono font-medium truncate max-w-[200px]">{res.atsReferenceID}</td>
                              <td className="px-6 py-4 max-w-[200px]">{res.atsLabel}</td>
                              <td className="px-6 py-4 text-slate-400 italic font-medium">{res.atsStage}</td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${statusTheme.bg} ${statusTheme.text} border`}>
                                  {statusTheme.icon}
                                  {res.status.replace('_', ' ')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {currentStep === 'COMPARE_1WAY' && oneWayComplete && (
                  <div className="shrink-0 flex justify-center py-4">
                    <button 
                      onClick={() => setCurrentStep('COMPARE_2WAY')}
                      className="btn-action bg-indigo-600 text-white px-12 animate-bounce-subtle"
                    >
                      Audit 2-Way Pipeline
                      <ArrowRight size={18} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}


