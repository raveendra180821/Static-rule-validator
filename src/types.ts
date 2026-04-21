export type Step = 'UPLOAD' | 'PARSED' | 'DUPLICATES' | 'ACTIONS' | 'COMPARE_1WAY' | 'COMPARE_2WAY';

export interface MappingEntry {
  referenceID: string;
  label: string; // Workflow_Step_Alternate_Name
  originalKey: string;
}

export interface DuplicateGroup {
  referenceID: string;
  label: string;
  count: number;
}

export interface ATSStep {
  Workflow_Step: string;
  Workflow_Step_Alternate_Name: string;
  referenceID: string;
  Step_Type: string;
}

export type DuplicateType = 'NONE' | 'FULL_MATCH' | 'REFERENCE_ID';

export interface DuplicateAnalysis {
  entries: MappingEntry[];
  type: DuplicateType;
}

export type ComparisonStatus = 
  | 'PERFECT_MATCH' 
  | 'REFERENCE_ID_CHANGE' 
  | 'STAGE_CHANGE' 
  | 'LABEL_CHANGE' 
  | 'NO_MATCH';

export interface ComparisonResult {
  type: '1-WAY' | '2-WAY';
  staticKey: string;
  staticLabel: string;
  staticReferenceID: string;
  staticStage?: string;
  atsReferenceID: string;
  atsLabel: string;
  atsStage: string;
  status: ComparisonStatus;
}

export interface AppState {
  currentStep: Step;
  staticMappingFile: File | null;
  atsMappingFile: File | null;
  oneWayMappings: MappingEntry[];
  twoWayMappings: MappingEntry[];
  duplicates1Way: DuplicateAnalysis;
  duplicates2Way: DuplicateAnalysis;
  atsSteps: ATSStep[];
  splitIndex: number;
  results1Way: ComparisonResult[];
  results2Way: ComparisonResult[];
}
