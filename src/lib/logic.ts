import { MappingEntry, DuplicateAnalysis, ATSStep, ComparisonResult, ComparisonStatus } from '../types';

// Helper to normalize ATS data
const normalizeAtsLabel = (label: string) => {
  return label.replace(/^Conclusion:\s*/i, '').trim();
};

const extractAtsStage = (workflowStep: string) => {
  const parts = workflowStep.split(/\s+from\s+/i);
  return parts.length > 1 ? parts[1].trim() : '';
};

export const runComparison1Way = (staticMappings: MappingEntry[], atsSteps: ATSStep[]): ComparisonResult[] => {
  return staticMappings.map(entry => {
    const atsMatch = atsSteps.find(ats => ats.referenceID === entry.referenceID);

    if (!atsMatch) {
      return {
        type: '1-WAY',
        staticKey: entry.originalKey,
        staticLabel: entry.label,
        staticReferenceID: entry.referenceID,
        atsReferenceID: 'NOT_FOUND',
        atsLabel: 'N/A',
        atsStage: 'N/A',
        status: 'NO_MATCH'
      };
    }

    const labelsMatch = atsMatch.Workflow_Step_Alternate_Name.trim() === entry.label.trim();
    
    return {
      type: '1-WAY',
      staticKey: entry.originalKey,
      staticLabel: entry.label,
      staticReferenceID: entry.referenceID,
      atsReferenceID: atsMatch.referenceID,
      atsLabel: atsMatch.Workflow_Step_Alternate_Name,
      atsStage: extractAtsStage(atsMatch.Workflow_Step),
      status: labelsMatch ? 'PERFECT_MATCH' : 'NO_MATCH'
    };
  });
};

export const runComparison2Way = (staticMappings: MappingEntry[], atsSteps: ATSStep[]): ComparisonResult[] => {
  return staticMappings.map(entry => {
    // Step 1: Extract Label and Stage from Static Key "label from stage"
    let staticLabel = entry.label;
    let staticStage = '';
    
    if (entry.originalKey.toLowerCase().includes(' from ')) {
      const parts = entry.originalKey.split(/\s+from\s+/i);
      staticLabel = parts[0].trim();
      staticStage = parts[1].trim();
    }

    // Step 2: Normalize ATS Steps for comparison
    const normalizedAtsSteps = atsSteps.map(ats => ({
      ...ats,
      normLabel: normalizeAtsLabel(ats.Workflow_Step_Alternate_Name),
      normStage: extractAtsStage(ats.Workflow_Step)
    }));

    // Step 3: Match Logic
    const atsById = normalizedAtsSteps.find(ats => ats.referenceID === entry.referenceID);
    
    if (atsById) {
      const labelMatches = atsById.normLabel === staticLabel;
      const stageMatches = atsById.normStage === staticStage;

      let status: ComparisonStatus = 'NO_MATCH';
      if (labelMatches && stageMatches) status = 'PERFECT_MATCH';
      else if (labelMatches && !stageMatches) status = 'STAGE_CHANGE';
      else if (!labelMatches && stageMatches) status = 'LABEL_CHANGE';

      return {
        type: '2-WAY',
        staticKey: entry.originalKey,
        staticLabel: staticLabel,
        staticReferenceID: entry.referenceID,
        staticStage: staticStage,
        atsReferenceID: atsById.referenceID,
        atsLabel: atsById.Workflow_Step_Alternate_Name,
        atsStage: atsById.normStage,
        status
      };
    }

    // Step 4: REFERENCE_ID_CHANGE check
    const atsByLabelStage = normalizedAtsSteps.find(ats => 
      ats.normLabel === staticLabel && ats.normStage === staticStage
    );

    if (atsByLabelStage) {
      return {
        type: '2-WAY',
        staticKey: entry.originalKey,
        staticLabel: staticLabel,
        staticReferenceID: entry.referenceID,
        staticStage: staticStage,
        atsReferenceID: atsByLabelStage.referenceID,
        atsLabel: atsByLabelStage.Workflow_Step_Alternate_Name,
        atsStage: atsByLabelStage.normStage,
        status: 'REFERENCE_ID_CHANGE'
      };
    }

    return {
      type: '2-WAY',
      staticKey: entry.originalKey,
      staticLabel: staticLabel,
      staticReferenceID: entry.referenceID,
      staticStage: staticStage,
      atsReferenceID: 'NOT_FOUND',
      atsLabel: 'N/A',
      atsStage: 'N/A',
      status: 'NO_MATCH'
    };
  });
};

export const classifyMappings = (rawData: Record<string, any>) => {
  const oneWay: MappingEntry[] = [];
  const twoWay: MappingEntry[] = [];
  let isTwoWayStarted = false;
  let splitIndex = -1;

  // Iterate in strict order
  const entries = Object.entries(rawData);

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    
    // A Reference ID strictly follows these rules according to requirements:
    // 1. No spaces
    // 2. Contains underscores
    // 3. No lowercase letters (Uppercase + Symbols/Digits only)
    const isReferenceIdPattern = !key.includes(' ') && key.includes('_') && !/[a-z]/.test(key);

    // Detect transition point: first entry that does not look like a 1-way Reference ID
    if (!isTwoWayStarted && !isReferenceIdPattern) {
      isTwoWayStarted = true;
      splitIndex = i;
    }

    if (!isTwoWayStarted) {
      // 1-WAY: Key is referenceID, Value is label
      oneWay.push({
        referenceID: key,
        label: String(value),
        originalKey: key
      });
    } else {
      // 2-WAY: Once started, all remaining entries are 2-WAY
      // Optional validation check
      if (isReferenceIdPattern) {
        console.warn(`Unexpected 1-WAY pattern found after 2-WAY mappings started: ${key}`);
      }
      
      // 2-WAY: Key is label, Value is referenceID
      twoWay.push({
        referenceID: String(value),
        label: key,
        originalKey: key
      });
    }
  }

  return { oneWayMappings: oneWay, twoWayMappings: twoWay, splitIndex };
};

export const findDuplicates = (mappings: MappingEntry[]): DuplicateAnalysis => {
  if (mappings.length === 0) return { entries: [], type: 'NONE' };

  // Step 1: Full Match Duplicate Check (Key + Value)
  const fullMatchCounts = new Map<string, number>();
  mappings.forEach(m => {
    const key = `${m.referenceID.trim()}|${m.label.trim()}`;
    fullMatchCounts.set(key, (fullMatchCounts.get(key) || 0) + 1);
  });

  const fullMatches = mappings.filter(m => {
    const key = `${m.referenceID.trim()}|${m.label.trim()}`;
    return (fullMatchCounts.get(key) || 0) > 1;
  });

  if (fullMatches.length > 0) {
    return { entries: fullMatches, type: 'FULL_MATCH' };
  }

  // Step 2: ReferenceID Duplicate Check (Only if Step 1 finds none)
  const refIdCounts = new Map<string, number>();
  mappings.forEach(m => {
    const refId = m.referenceID.trim();
    refIdCounts.set(refId, (refIdCounts.get(refId) || 0) + 1);
  });

  const refIdDuplicates = mappings.filter(m => {
    const refId = m.referenceID.trim();
    return (refIdCounts.get(refId) || 0) > 1;
  });

  if (refIdDuplicates.length > 0) {
    return { entries: refIdDuplicates, type: 'REFERENCE_ID' };
  }

  return { entries: [], type: 'NONE' };
};

export const convertToCSV = (data: any[], columns: string[]) => {
  const header = columns.join(',');
  const rows = data.map(row => 
    columns.map(col => `"${String(row[col] || '').replace(/"/g, '""')}"`).join(',')
  );
  return [header, ...rows].join('\n');
};

export const downloadFile = (content: string, fileName: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
