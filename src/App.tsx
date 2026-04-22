import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileJson, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ShieldCheck,
  Download, 
  Hash, 
  Layers,
  ChevronRight,
  Database,
  ArrowLeft,
  RefreshCcw,
  Filter,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Search,
  Check,
  X
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

  const [loading, setLoading] = useState(false);
  const [oneWayComplete, setOneWayComplete] = useState(false);
  const [maxReachedIdx, setMaxReachedIdx] = useState(0);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [dupSortDir, setDupSortDir] = useState<'NONE' | 'ASC' | 'DESC'>('NONE');
  const [activeDupView, setActiveDupView] = useState<'1-WAY' | '2-WAY'>('1-WAY');

  const activeResults = currentStep === 'COMPARE_1WAY' ? data.results1Way : data.results2Way;
  const filteredResults = activeResults.filter(res => 
    statusFilters.length === 0 || statusFilters.includes(res.status)
  );
  const uniqueStatuses: string[] = Array.from(new Set(activeResults.map(r => r.status as string)));

  React.useEffect(() => {
    setStatusFilters([]); // Clear filters when navigating between 1-WAY and 2-WAY views
  }, [currentStep]);

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

  const [dragState, setDragState] = useState<{ [key: string]: boolean }>({ static: false, ats: false });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [lookupRefId, setLookupRefId] = useState('');
  const [lookupResults, setLookupResults] = useState<{key: string, value: string}[]>([]);
  const [copied, setCopied] = useState(false);
  const [show2WayLookup, setShow2WayLookup] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lookupError, setLookupError] = useState('');

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
      setMaxReachedIdx(prev => Math.max(prev, 1));
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

    if (dupes1Way.entries.length > 0) {
      setActiveDupView('1-WAY');
    } else if (dupes2Way.entries.length > 0) {
      setActiveDupView('2-WAY');
    }

    setCurrentStep('DUPLICATES');
    setMaxReachedIdx(prev => Math.max(prev, 2));
  };

  const getFilePrefix = () => {
    if (!files.static) return "";
    const fullName = files.static.name;
    const nameWithoutExt = fullName.substring(0, fullName.lastIndexOf('.')) || fullName;
    const firstUnderscoreIndex = nameWithoutExt.indexOf('_');
    
    if (firstUnderscoreIndex !== -1) {
      return nameWithoutExt.substring(0, firstUnderscoreIndex);
    }
    return nameWithoutExt;
  };

  const downloadDuplicates = (type: '1-WAY' | '2-WAY') => {
    const targetData = type === '1-WAY' ? data.dupes1Way.entries : data.dupes2Way.entries;
    const csv = convertToCSV(targetData, ['referenceID', 'label']);
    const prefix = getFilePrefix();
    const fileName = prefix ? `${prefix}_duplicates_${type.toLowerCase()}.csv` : `duplicates_${type.toLowerCase()}.csv`;
    downloadFile(csv, fileName, 'text/csv');
  };

  const downloadResults = (type: '1-WAY' | '2-WAY') => {
    const targetData = type === '1-WAY' ? data.results1Way : data.results2Way;
    const csv = convertToCSV(targetData, [
      'type', 'staticKey', 'staticLabel', 'staticReferenceID', 'staticStage', 
      'atsReferenceID', 'atsLabel', 'atsStage', 'status'
    ]);
    const prefix = getFilePrefix();
    const fileName = prefix ? `${prefix}_comparison_${type.toLowerCase()}.csv` : `comparison_${type.toLowerCase()}.csv`;
    downloadFile(csv, fileName, 'text/csv');
  };

  const downloadClassifiedJSON = (type: '1-WAY' | '2-WAY') => {
    const mappings = type === '1-WAY' ? data.oneWay : data.twoWay;
    const obj: Record<string, string> = {};
    
    if (type === '1-WAY') {
      mappings.forEach(m => { obj[m.referenceID] = m.label; });
    } else {
      mappings.forEach(m => { obj[m.label] = m.referenceID; });
    }
    
    const prefix = getFilePrefix();
    const fileName = prefix 
      ? `${prefix}_classified_${type.toLowerCase()}.json` 
      : `classified_${type.toLowerCase()}.json`;
    
    downloadFile(JSON.stringify(obj, null, 2), fileName, 'application/json');
  };

  const performLookup = () => {
    if (!lookupRefId.trim()) {
      setLookupError('Please enter a referenceID');
      setLookupResults([]);
      setHasSearched(true);
      return;
    }
    setLookupError('');
    const results = data.twoWay
      .filter(m => m.referenceID.trim() === lookupRefId.trim())
      .map(m => ({ key: m.label, value: m.referenceID }));
    setLookupResults(results);
    setHasSearched(true);
  };

  const copyLookupResults = () => {
    if (lookupResults.length === 0) return;
    const obj: Record<string, string> = {};
    lookupResults.forEach(r => { obj[r.key] = r.value; });
    const text = JSON.stringify(obj, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allDuplicates = React.useMemo(() => {
    const list1 = data.dupes1Way.entries.map(d => ({...d, t: '1-WAY' as const, det: data.dupes1Way.type}));
    const list2 = data.dupes2Way.entries.map(d => ({...d, t: '2-WAY' as const, det: data.dupes2Way.type}));
    
    const base = activeDupView === '1-WAY' ? list1 : list2;
    
    if (dupSortDir === 'NONE') return base;
    
    return [...base].sort((a, b) => {
      const valA = String(a.referenceID || '');
      const valB = String(b.referenceID || '');
      if (dupSortDir === 'ASC') return valA < valB ? -1 : (valA > valB ? 1 : 0);
      return valA < valB ? 1 : (valA > valB ? -1 : 0);
    });
  }, [data.dupes1Way, data.dupes2Way, dupSortDir, activeDupView]);

  const toggleDupSort = () => {
    setDupSortDir(prev => prev === 'NONE' ? 'ASC' : (prev === 'ASC' ? 'DESC' : 'NONE'));
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status) 
        : [...prev, status]
    );
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
    setMaxReachedIdx(0);
    setStatusFilters([]);
    setShowFilterDropdown(false);
    setDupSortDir('NONE');
    setActiveDupView('1-WAY');
    setCurrentStep('UPLOAD');
    setShowResetConfirm(false);
    setShow2WayLookup(false);
    setHasSearched(false);
    setLookupError('');
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {/* Header Section */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-sm">
            <Database className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Static BPD Comparision</h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
          <button 
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 border-2 border-slate-200 text-slate-600 rounded-lg hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 active:scale-95 transition-all flex items-center gap-2 font-bold shadow-sm"
          >
            <RefreshCcw size={15} />
            Reset Workflow
          </button>
        </div>
      </header>

      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-100"
            >
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mb-6">
                <RefreshCcw size={24} />
              </div>
              <h3 className="text-xl font-extrabold tracking-tight mb-2">Reset Workflow?</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                This will clear all uploaded files, classification results, and comparison data. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={resetWorkflow}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-amber-600 text-white rounded-xl shadow-lg shadow-amber-200 hover:bg-amber-700 active:scale-95 transition-all"
                >
                  Yes, Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {show2WayLookup && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShow2WayLookup(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-amber-50 px-8 py-4 border-b border-amber-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
                    <Search size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 leading-tight">2-Way Mapping Quick Lookup</h3>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Search within classified 2-way values</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShow2WayLookup(false)} 
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 flex flex-col gap-6">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      placeholder="Enter exact ReferenceID (e.g., AD_APPLICATION_START)" 
                      className={`w-full px-5 py-3 text-sm border rounded-xl focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 pr-12 shadow-sm transition-all ${lookupError ? 'border-rose-300' : 'border-slate-200'}`}
                      value={lookupRefId}
                      onChange={(e) => {
                        setLookupRefId(e.target.value);
                        setHasSearched(false);
                        setLookupResults([]);
                        setLookupError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && performLookup()}
                      autoFocus
                    />
                    <div className="absolute right-4 top-3.5 text-slate-300">
                      <Hash size={18} />
                    </div>
                  </div>
                  <button 
                    onClick={performLookup}
                    className="bg-amber-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-700 active:scale-95 transition-all shadow-lg shadow-amber-200 flex items-center gap-2"
                  >
                    <Search size={18} />
                    Search
                  </button>
                </div>

                {hasSearched && (
                  lookupError ? (
                    <div className="py-6 text-center bg-rose-50 rounded-xl border border-dashed border-rose-200">
                      <p className="text-sm text-rose-600 font-medium">{lookupError}</p>
                    </div>
                  ) : lookupResults.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Results found: {lookupResults.length}</span>
                        <button 
                          onClick={copyLookupResults}
                          className={`flex items-center gap-2 text-xs font-bold transition-all px-3 py-1.5 rounded-lg ${copied ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-700'}`}
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          {copied ? 'Copied' : 'Copy results'}
                        </button>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-6 font-mono text-xs text-amber-200 overflow-x-auto max-h-[400px] shadow-inner leading-relaxed border border-slate-800">
                        {lookupResults.map((r, i) => (
                          <div key={i} className="mb-2 last:mb-0 hover:bg-slate-800/50 -mx-2 px-2 rounded transition-colors group">
                            <span className="text-emerald-400 font-medium group-hover:text-emerald-300">"{r.key}"</span>
                            <span className="text-slate-500"> : </span>
                            <span className="text-sky-300 font-medium group-hover:text-sky-200">"{r.value}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 shadow-sm">
                        <Search size={24} />
                      </div>
                      <p className="text-sm text-slate-600 font-medium">No matches found</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto leading-normal">
                        The ReferenceID "{lookupRefId}" does not exist in the 2-way mapping dataset.
                      </p>
                    </div>
                  )
                )}
              </div>
              <div className="bg-slate-50 p-4 px-8 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShow2WayLookup(false)}
                  className="px-6 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Stepper */}
        <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 shrink-0">
          <div className="space-y-6">
            {STEPS.map((step, idx) => {
              const mainStepIdx = STEPS.findIndex(s => s.id === currentStep);
              // For comparison views, we treat them as being at a depth beyond the 'ACTIONS' selection screen
              const currentEffectiveIdx = mainStepIdx !== -1 ? mainStepIdx : (['COMPARE_1WAY', 'COMPARE_2WAY'].includes(currentStep) ? 4 : -1);
              
              const isCompleted = currentEffectiveIdx > idx;
              const isActive = mainStepIdx === idx || (idx === 3 && currentEffectiveIdx === 4);
              const isPending = currentEffectiveIdx < idx;
              
              // NEW logic: Navigation allowed for any stage already reached/unlocked
              const canNavigate = idx <= maxReachedIdx;
              
              return (
                <div 
                  key={step.id} 
                  onClick={() => {
                    if (canNavigate) {
                      setCurrentStep(step.id);
                    }
                  }}
                  className={`flex gap-4 items-start relative last:mb-0 transition-opacity ${canNavigate ? 'cursor-pointer hover:opacity-100' : 'cursor-default'} ${isActive ? 'opacity-100' : (canNavigate ? 'opacity-70' : 'opacity-40')}`}
                >
                  <div className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold z-10 transition-colors
                    ${isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : ''}
                    ${isCompleted ? 'bg-indigo-50 border border-indigo-200 text-indigo-600' : ''}
                    ${isPending && !canNavigate ? 'bg-slate-50 border border-slate-100 text-slate-300' : ''}
                    ${isPending && canNavigate ? 'bg-indigo-50 border border-indigo-200 text-indigo-400' : ''}
                    ${canNavigate ? 'group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600' : ''}
                  `}>
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${isActive ? 'text-indigo-600' : (canNavigate ? 'text-slate-500' : 'text-slate-300')}`}>
                      {step.label}
                    </span>
                    <span className={`text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : (canNavigate ? 'text-slate-600' : 'text-slate-400')}`}>
                      {step.sub}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="absolute left-3 top-6 w-[1px] h-10 bg-slate-100 -z-0"></div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-auto">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Selected Files</h4>
              
              {/* Static File Scrollable Container */}
              <div className="relative group overflow-hidden mb-1.5">
                <div className="text-xs font-semibold text-slate-600 flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap scroll-smooth py-0.5 pr-4">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${files.static ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <span className="shrink-0">{files.static ? files.static.name : 'No static file'}</span>
                </div>
                {/* Visual hint: Gradient fade on the right */}
                <div className="absolute top-0 right-0 h-full w-6 bg-gradient-to-l from-slate-50 via-slate-50/80 to-transparent pointer-events-none transition-opacity" />
              </div>

              {/* ATS File Scrollable Container */}
              <div className="relative group overflow-hidden">
                <div className="text-xs font-semibold text-slate-600 flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap scroll-smooth py-0.5 pr-4">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${files.ats ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <span className="shrink-0">{files.ats ? files.ats.name : 'No status file'}</span>
                </div>
                {/* Visual hint: Gradient fade on the right */}
                <div className="absolute top-0 right-0 h-full w-6 bg-gradient-to-l from-slate-50 via-slate-50/80 to-transparent pointer-events-none transition-opacity" />
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
                  </p>
                  <div className="flex gap-3">
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
                    <div 
                      key={section.type} 
                      className={`card p-5 transition-all ${section.type === '2-WAY' ? 'cursor-pointer hover:border-amber-400 hover:shadow-md' : ''}`}
                      onClick={() => section.type === '2-WAY' && setShow2WayLookup(true)}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className={`text-[10px] font-bold text-${section.color}-600 uppercase tracking-widest`}>{section.type} HSI Mapping</span>
                        <div className="flex gap-2">
                          {section.type === '2-WAY' ? (
                            <div className="relative p-[1.5px] overflow-hidden rounded-full transition-transform active:scale-95 group/lookup bg-amber-100 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                              {/* Moving Border Layer - Enhanced visibility with wider sweep and higher opacity */}
                              <motion.div 
                                animate={{ 
                                  rotate: [0, 360],
                                }}
                                transition={{ 
                                  duration: 2.5, 
                                  repeat: Infinity, 
                                  ease: "linear" 
                                }}
                                className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_240deg,#4ade80_300deg,#22c55e_360deg)] opacity-80"
                              />
                              
                              <motion.span 
                                animate={{ 
                                  scale: [1, 1.05, 1],
                                }}
                                transition={{ 
                                  duration: 2, 
                                  repeat: Infinity, 
                                  ease: "easeInOut" 
                                }}
                                className="relative z-10 text-[9px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md"
                              >
                                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                                CLICK TO LOOKUP
                              </motion.span>
                            </div>
                          ) : (
                            <>
                              {section.analysis.type !== 'NONE' && (
                                <span className={`px-2 py-0.5 bg-${section.color}-600 text-white text-[9px] font-black rounded uppercase`}>
                                  {section.analysis.type.replace('_', ' ')}
                                </span>
                              )}
                              <span className={`px-2 py-0.5 bg-${section.color}-50 text-${section.color}-700 text-[10px] font-bold rounded-full`} >
                                {section.analysis.entries.length > 0 ? `${section.analysis.entries.length} Flags` : 'Clean'}
                              </span>
                            </>
                          )}
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
                        <div className="flex gap-2">
                          <button 
                            onClick={() => downloadClassifiedJSON(section.type as '1-WAY' | '2-WAY')} 
                            className="btn-dense bg-slate-700 hover:bg-slate-800"
                            title="Download full classified mapping as JSON"
                          >
                            <FileJson size={12} />
                            JSON
                          </button>
                          {section.analysis.entries.length > 0 && (
                            <button 
                              onClick={() => downloadDuplicates(section.type as '1-WAY' | '2-WAY')} 
                              className="btn-dense"
                              title="Download duplicates only as CSV"
                            >
                              <Download size={12} />
                              CSV
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {(data.dupes1Way.entries.length > 0 || data.dupes2Way.entries.length > 0) ? (
                  <div className="flex-1 card flex flex-col min-h-0">
                    <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Duplicate Manifest</h3>
                        
                        {/* Toggle logic: Only show if both have duplicates */}
                        {data.dupes1Way.entries.length > 0 && data.dupes2Way.entries.length > 0 && (
                          <div className="flex bg-slate-200 p-0.5 rounded-lg ml-2">
                            <button 
                              onClick={() => setActiveDupView('1-WAY')}
                              className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all ${activeDupView === '1-WAY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              1-WAY VIEW
                            </button>
                            <button 
                              onClick={() => setActiveDupView('2-WAY')}
                              className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all ${activeDupView === '2-WAY' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              2-WAY VIEW
                            </button>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          setCurrentStep('ACTIONS');
                          setMaxReachedIdx(prev => Math.max(prev, 3));
                        }} 
                        className="btn-action btn-primary px-6 text-xs flex items-center gap-2"
                      >
                        Continue to Comparison
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="overflow-auto flex-1">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="text-[10px] font-bold text-slate-400 bg-white border-b border-slate-100 uppercase tracking-tighter">
                            <th className="px-6 py-4">TYPE</th>
                            <th className="px-6 py-4">DETECTION</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors" onClick={toggleDupSort}>
                              <div className="flex items-center gap-2">
                                REFERENCE ID
                                {dupSortDir === 'NONE' && <ArrowUpDown size={12} className="opacity-30" />}
                                {dupSortDir === 'ASC' && <ArrowUp size={12} className="text-indigo-600" />}
                                {dupSortDir === 'DESC' && <ArrowDown size={12} className="text-indigo-600" />}
                              </div>
                            </th>
                            <th className="px-6 py-4">ALTERNATE NAME (LABEL)</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs">
                          {allDuplicates.slice(0, 100).map((m, i) => (
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
                ) : (
                  <div className="flex-1 card p-12 text-center flex flex-col items-center justify-center border-dashed bg-slate-50/50">
                    <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-6">
                      <ShieldCheck size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">Clear Data Environment</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto mt-2 mb-8">
                      No duplicate reference identifiers or labels detected across analyzed mappings.
                    </p>
                    <button 
                      onClick={() => {
                        setCurrentStep('ACTIONS');
                        setMaxReachedIdx(prev => Math.max(prev, 3));
                      }} 
                      className="btn-action btn-primary px-8 flex items-center gap-2"
                    >
                      Proceed to Comparison
                      <ArrowRight size={18} />
                    </button>
                  </div>
                )}


                <div className="pt-4 border-t border-slate-200">
                  <span className="text-xs text-slate-400 font-medium italic">
                    {data.dupes1Way.entries.length > 0 || data.dupes2Way.entries.length > 0 
                      ? "Duplicates detected. Please review before proceeding." 
                      : "Environment is clean. Ready for full logic comparison."}
                  </span>
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
                    onClick={() => setCurrentStep('COMPARE_2WAY')}
                    className="flex-1 card p-8 transition-all text-center group hover:border-slate-800 hover:ring-1 hover:ring-slate-800"
                  >
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 transition-colors bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white">
                      <ChevronRight size={24} />
                    </div>
                    <span className="text-xl font-bold block mb-1">Process 2-WAY</span>
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{data.twoWay.length} Records Detected</span>
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
                    {statusFilters.length > 0 && (
                      <button 
                        onClick={() => setStatusFilters([])}
                        className="text-[10px] font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full hover:bg-rose-100 transition-colors flex items-center gap-1.5"
                      >
                        <RefreshCcw size={12} />
                        Clear {statusFilters.length} Filters
                      </button>
                    )}
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
                        {statusFilters.length > 0 
                          ? `Showing ${filteredResults.length} of ${activeResults.length} Records` 
                          : `${activeResults.length} Records Analyzed`}
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
                          <th className="px-6 py-4 bg-white relative">
                            <div 
                              className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors"
                              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                            >
                              STATUS
                              <Filter size={12} className={statusFilters.length > 0 ? 'text-indigo-600' : ''} />
                              <ChevronDown size={12} />
                            </div>
                            
                            {showFilterDropdown && (
                              <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowFilterDropdown(false)} />
                                <div className="absolute right-6 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-30 py-2 normal-case font-medium">
                                  <div className="px-3 py-1 border-b border-slate-100 mb-2 flex justify-between items-center bg-slate-50">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Filter Status</span>
                                    <button onClick={() => setStatusFilters([])} className="text-[9px] text-indigo-600 hover:underline">Reset</button>
                                  </div>
                                  <div className="max-h-48 overflow-auto px-1">
                                    {uniqueStatuses.map(status => (
                                      <label key={status} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer rounded-md transition-colors text-slate-600">
                                        <input 
                                          type="checkbox" 
                                          checked={statusFilters.includes(status)}
                                          onChange={() => toggleStatusFilter(status)}
                                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs">{status.replace('_', ' ')}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-xs">
                        {filteredResults.map((res, i) => {
                          const statusTheme = {
                            'PERFECT_MATCH': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <CheckCircle2 size={12} />, row: 'bg-emerald-50/50 hover:bg-emerald-50' },
                            'REFERENCE_ID_CHANGE': { bg: 'bg-blue-50', text: 'text-blue-700', icon: <CheckCircle2 size={12} />, row: 'bg-blue-50/50 hover:bg-blue-50' },
                            'STAGE_CHANGE': { bg: 'bg-sky-50', text: 'text-sky-700', icon: <AlertCircle size={12} />, row: 'bg-sky-50/50 hover:bg-sky-50' },
                            'LABEL_CHANGE': { bg: 'bg-amber-50', text: 'text-amber-700', icon: <AlertCircle size={12} />, row: 'bg-amber-50/50 hover:bg-amber-50' },
                            'NO_MATCH': { bg: 'bg-rose-50', text: 'text-rose-700', icon: <AlertCircle size={12} />, row: 'bg-rose-50/50 hover:bg-rose-50' }
                          }[res.status] || { bg: 'bg-slate-50', text: 'text-slate-700', icon: null, row: 'bg-slate-50/50 hover:bg-slate-50' };

                          return (
                            <tr key={i} className={`border-b border-slate-50 transition-colors ${statusTheme.row}`}>
                              <td className="px-6 py-4 font-mono font-medium break-all min-w-[240px]">{res.staticReferenceID}</td>
                              <td className="px-6 py-4 min-w-[200px]">{res.staticLabel}</td>
                              <td className="px-6 py-4 text-slate-400 italic font-medium">{res.staticStage || 'N/A'}</td>
                              <td className="px-6 py-4 font-mono font-medium break-all min-w-[240px]">{res.atsReferenceID}</td>
                              <td className="px-6 py-4 min-w-[200px]">{res.atsLabel}</td>
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


