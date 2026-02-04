'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Building2,
  TrendingDown,
  TrendingUp,
  Target,
  Filter,
  Download,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Award,
  ArrowUpDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  ComposedChart,
  Line
} from 'recharts';

import benchmarkData from '@/data/benchmarks.json';
import summaryData from '@/data/summary.json';

interface BenchmarkRecord {
  facility_name: string;
  display_name: string;
  health_system: string;
  period: string;
  daily_census: number | null;
  aoe_ppd: number | null;
  aoe_peer_min: number | null;
  aoe_peer_mid: number | null;
  aoe_peer_max: number | null;
  revenue_ppd: number | null;
  revenue_peer_min: number | null;
  revenue_peer_mid: number | null;
  revenue_peer_max: number | null;
  cogs_ppd: number | null;
  cogs_peer_min: number | null;
  cogs_peer_mid: number | null;
  cogs_peer_max: number | null;
  labor_ppd: number | null;
  labor_peer_min: number | null;
  labor_peer_mid: number | null;
  labor_peer_max: number | null;
  productive_ftes: number | null;
  [key: string]: string | number | null;
}

interface PeerBenchmark {
  census_label: string;
  count: number;
  aoe_ppd: { p25: number; p50: number; p75: number };
  labor_ppd: { p25: number; p50: number; p75: number };
  cogs_ppd: { p25: number; p50: number; p75: number };
  revenue_ppd: { p25: number; p50: number; p75: number };
}

interface Summary {
  total_facilities: number;
  total_health_systems: number;
  total_periods: number;
  total_records: number;
  health_systems: { name: string; facilities: number; records: number }[];
  periods: { label: string; records: number }[];
  peer_benchmarks: PeerBenchmark[];
}

interface ImportedRow {
  facility_name: string;
  health_system: string;
  period: string;
  daily_census: number | null;
  aoe_ppd: number | null;
  labor_ppd: number | null;
  cogs_ppd: number | null;
  revenue_ppd: number | null;
  productive_ftes: number | null;
}

interface ImportResult {
  success: boolean;
  recordsImported: number;
  errors: string[];
  warnings: string[];
}

interface FacilityWithVariance extends BenchmarkRecord {
  aoe_variance: number | null;
  aoe_variance_pct: number | null;
  labor_variance: number | null;
  labor_variance_pct: number | null;
  cogs_variance: number | null;
  cogs_variance_pct: number | null;
  revenue_variance: number | null;
  revenue_variance_pct: number | null;
  total_variance: number | null;
  performance_score: number | null;
}

// Column mapping configuration
const COLUMN_MAPPINGS: Record<string, string[]> = {
  facility_name: ['Facility Name', 'Facility', 'Hospital Name', 'Hospital', 'Name', 'Site'],
  health_system: ['Health System', 'System', 'Source', 'Organization', 'Parent'],
  period: ['Period', 'Time Period', 'Date Range', 'Fiscal Year', 'Year'],
  daily_census: ['Daily Census', 'Census', 'ADC', 'Average Daily Census', 'Avg Census'],
  aoe_ppd: ['AOE PPD', 'AOE', 'Operating Expense PPD', 'Total AOE PPD'],
  labor_ppd: ['Labor PPD', 'Labor', 'Labor Cost PPD', 'Total Labor PPD'],
  cogs_ppd: ['COGS PPD', 'COGS', 'Food Cost PPD', 'Cost of Goods PPD'],
  revenue_ppd: ['Revenue PPD', 'Revenue', 'Total Revenue PPD', 'Sales PPD'],
  productive_ftes: ['Productive FTEs', 'FTEs', 'FTE', 'Productive FTE', 'Total FTEs'],
};

export default function Dashboard() {
  const [selectedHealthSystem, setSelectedHealthSystem] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedFacility, setSelectedFacility] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'facility' | 'rankings' | 'systems'>('facility');
  const [sortField, setSortField] = useState<string>('aoe_variance_pct');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedData, setImportedData] = useState<BenchmarkRecord[]>([]);
  const [importPreview, setImportPreview] = useState<ImportedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [detectedMapping, setDetectedMapping] = useState<Record<string, string>>({});
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseData = benchmarkData as BenchmarkRecord[];
  const data = useMemo(() => [...baseData, ...importedData], [baseData, importedData]);
  const summary = summaryData as Summary;

  // Filter data
  const filteredData = useMemo(() => {
    return data.filter(record => {
      if (selectedHealthSystem !== 'all' && record.health_system !== selectedHealthSystem) {
        return false;
      }
      if (selectedPeriod !== 'all' && record.period !== selectedPeriod) {
        return false;
      }
      return true;
    });
  }, [data, selectedHealthSystem, selectedPeriod]);

  // Calculate variances for each facility
  const facilitiesWithVariance: FacilityWithVariance[] = useMemo(() => {
    return filteredData.map(record => {
      const aoe_variance = record.aoe_ppd && record.aoe_peer_mid
        ? record.aoe_ppd - record.aoe_peer_mid : null;
      const aoe_variance_pct = record.aoe_ppd && record.aoe_peer_mid
        ? ((record.aoe_ppd - record.aoe_peer_mid) / record.aoe_peer_mid) * 100 : null;

      const labor_variance = record.labor_ppd && record.labor_peer_mid
        ? record.labor_ppd - record.labor_peer_mid : null;
      const labor_variance_pct = record.labor_ppd && record.labor_peer_mid
        ? ((record.labor_ppd - record.labor_peer_mid) / record.labor_peer_mid) * 100 : null;

      const cogs_variance = record.cogs_ppd && record.cogs_peer_mid
        ? record.cogs_ppd - record.cogs_peer_mid : null;
      const cogs_variance_pct = record.cogs_ppd && record.cogs_peer_mid
        ? ((record.cogs_ppd - record.cogs_peer_mid) / record.cogs_peer_mid) * 100 : null;

      const revenue_variance = record.revenue_ppd && record.revenue_peer_mid
        ? record.revenue_ppd - record.revenue_peer_mid : null;
      const revenue_variance_pct = record.revenue_ppd && record.revenue_peer_mid
        ? ((record.revenue_ppd - record.revenue_peer_mid) / record.revenue_peer_mid) * 100 : null;

      const total_variance = aoe_variance;
      const performance_score = aoe_variance_pct !== null ? -aoe_variance_pct : null;

      return {
        ...record,
        aoe_variance,
        aoe_variance_pct,
        labor_variance,
        labor_variance_pct,
        cogs_variance,
        cogs_variance_pct,
        revenue_variance,
        revenue_variance_pct,
        total_variance,
        performance_score,
      };
    }).filter(r => r.aoe_ppd !== null && r.aoe_peer_mid !== null);
  }, [filteredData]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    const valid = facilitiesWithVariance.filter(f => f.aoe_variance_pct !== null);
    if (valid.length === 0) return { avgVariance: 0, belowMedian: 0, aboveMedian: 0, potentialSavings: 0, topPerformer: null };

    const avgVariance = valid.reduce((sum, f) => sum + (f.aoe_variance_pct || 0), 0) / valid.length;
    const belowMedian = valid.filter(f => (f.aoe_variance_pct || 0) < 0).length;
    const aboveMedian = valid.filter(f => (f.aoe_variance_pct || 0) >= 0).length;

    const potentialSavings = valid
      .filter(f => (f.aoe_variance || 0) > 0)
      .reduce((sum, f) => sum + ((f.aoe_variance || 0) * (f.daily_census || 0) * 365), 0);

    const sorted = [...valid].sort((a, b) => (a.aoe_variance_pct || 0) - (b.aoe_variance_pct || 0));
    const topPerformer = sorted[0];

    return { avgVariance, belowMedian, aboveMedian, potentialSavings, topPerformer };
  }, [facilitiesWithVariance]);

  // Unique values for filters
  const healthSystems = [...new Set(data.map(r => r.health_system))].sort();
  const periods = [...new Set(data.map(r => r.period))].sort();
  const facilities = [...new Set(filteredData.map(r => r.facility_name))].sort();

  // Set default facility
  useMemo(() => {
    if (!selectedFacility && facilities.length > 0) {
      setSelectedFacility(facilities[0]);
    }
  }, [facilities, selectedFacility]);

  // Get selected facility data
  const selectedFacilityData = useMemo(() => {
    return facilitiesWithVariance.find(f => f.facility_name === selectedFacility) || null;
  }, [facilitiesWithVariance, selectedFacility]);

  // Sorted rankings
  const sortedRankings = useMemo(() => {
    return [...facilitiesWithVariance].sort((a, b) => {
      const aVal = a[sortField as keyof FacilityWithVariance] as number | null;
      const bVal = b[sortField as keyof FacilityWithVariance] as number | null;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [facilitiesWithVariance, sortField, sortDirection]);

  // Health system aggregates
  const systemComparison = useMemo(() => {
    const systems = new Map<string, FacilityWithVariance[]>();
    facilitiesWithVariance.forEach(f => {
      const arr = systems.get(f.health_system) || [];
      arr.push(f);
      systems.set(f.health_system, arr);
    });

    return Array.from(systems.entries()).map(([name, facs]) => {
      const validFacilities = facs.filter(f => f.aoe_variance_pct !== null);
      const avgAoeVariance = validFacilities.length > 0
        ? validFacilities.reduce((sum, f) => sum + (f.aoe_variance_pct || 0), 0) / validFacilities.length : 0;
      const avgLaborVariance = validFacilities.length > 0
        ? validFacilities.reduce((sum, f) => sum + (f.labor_variance_pct || 0), 0) / validFacilities.length : 0;
      const avgCogsVariance = validFacilities.length > 0
        ? validFacilities.reduce((sum, f) => sum + (f.cogs_variance_pct || 0), 0) / validFacilities.length : 0;
      const belowMedianCount = validFacilities.filter(f => (f.aoe_variance_pct || 0) < 0).length;

      return {
        name,
        facilityCount: validFacilities.length,
        avgAoeVariance,
        avgLaborVariance,
        avgCogsVariance,
        belowMedianCount,
        belowMedianPct: validFacilities.length > 0 ? (belowMedianCount / validFacilities.length) * 100 : 0,
      };
    }).sort((a, b) => a.avgAoeVariance - b.avgAoeVariance);
  }, [facilitiesWithVariance]);

  // Import functions
  const findColumnMatch = useCallback((headers: string[], targetField: string): string | null => {
    const possibleNames = COLUMN_MAPPINGS[targetField] || [];
    const normalizedHeaders = headers.map(h => h?.toString().toLowerCase().trim());
    for (const name of possibleNames) {
      const idx = normalizedHeaders.indexOf(name.toLowerCase());
      if (idx !== -1) return headers[idx];
    }
    return null;
  }, []);

  const parseNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
    return isNaN(num) ? null : num;
  };

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setImportResult(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });

      if (rawData.length === 0) {
        setImportResult({ success: false, recordsImported: 0, errors: ['No data found'], warnings: [] });
        setImportStep('result');
        return;
      }

      const headers = Object.keys(rawData[0]);
      const mapping: Record<string, string> = {};
      const warnings: string[] = [];

      for (const field of Object.keys(COLUMN_MAPPINGS)) {
        const match = findColumnMatch(headers, field);
        if (match) mapping[field] = match;
        else if (field === 'facility_name') warnings.push('Required column "Facility Name" not found');
      }

      setDetectedMapping(mapping);
      const preview: ImportedRow[] = rawData.slice(0, 100).map(row => ({
        facility_name: String(row[mapping.facility_name] || 'Unknown'),
        health_system: String(row[mapping.health_system] || 'Imported'),
        period: String(row[mapping.period] || 'Imported'),
        daily_census: parseNumber(row[mapping.daily_census]),
        aoe_ppd: parseNumber(row[mapping.aoe_ppd]),
        labor_ppd: parseNumber(row[mapping.labor_ppd]),
        cogs_ppd: parseNumber(row[mapping.cogs_ppd]),
        revenue_ppd: parseNumber(row[mapping.revenue_ppd]),
        productive_ftes: parseNumber(row[mapping.productive_ftes]),
      }));

      setImportPreview(preview);
      setImportStep('preview');
      if (warnings.length > 0) setImportResult({ success: true, recordsImported: 0, errors: [], warnings });
    } catch (error) {
      setImportResult({ success: false, recordsImported: 0, errors: [`Error: ${error instanceof Error ? error.message : 'Unknown'}`], warnings: [] });
      setImportStep('result');
    } finally {
      setIsProcessing(false);
    }
  }, [findColumnMatch]);

  const confirmImport = useCallback(() => {
    const newRecords: BenchmarkRecord[] = importPreview.map(row => ({
      facility_name: row.facility_name,
      display_name: row.facility_name,
      health_system: row.health_system,
      period: row.period,
      daily_census: row.daily_census,
      aoe_ppd: row.aoe_ppd,
      aoe_peer_min: null, aoe_peer_mid: null, aoe_peer_max: null,
      revenue_ppd: row.revenue_ppd,
      revenue_peer_min: null, revenue_peer_mid: null, revenue_peer_max: null,
      cogs_ppd: row.cogs_ppd,
      cogs_peer_min: null, cogs_peer_mid: null, cogs_peer_max: null,
      labor_ppd: row.labor_ppd,
      labor_peer_min: null, labor_peer_mid: null, labor_peer_max: null,
      productive_ftes: row.productive_ftes,
    }));
    setImportedData(prev => [...prev, ...newRecords]);
    setImportResult({ success: true, recordsImported: newRecords.length, errors: [], warnings: [] });
    setImportStep('result');
  }, [importPreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      processFile(file);
    }
  };

  const resetImport = () => {
    setImportPreview([]);
    setImportResult(null);
    setDetectedMapping({});
    setImportStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    resetImport();
  };

  const handleExport = () => {
    const csv = [
      ['Facility', 'Health System', 'Period', 'Census', 'AOE PPD', 'Peer Median', 'Variance %', 'Labor PPD', 'COGS PPD'].join(','),
      ...sortedRankings.map(r => [
        `"${r.facility_name}"`,
        `"${r.health_system}"`,
        r.period,
        r.daily_census?.toFixed(0) || '',
        r.aoe_ppd?.toFixed(2) || '',
        r.aoe_peer_mid?.toFixed(2) || '',
        r.aoe_variance_pct?.toFixed(1) || '',
        r.labor_ppd?.toFixed(2) || '',
        r.cogs_ppd?.toFixed(2) || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fans_peer_comparison_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Chart data for selected facility
  const facilityChartData = useMemo(() => {
    if (!selectedFacilityData) return [];
    return [
      { metric: 'AOE', actual: selectedFacilityData.aoe_ppd, peerMin: selectedFacilityData.aoe_peer_min, peerMid: selectedFacilityData.aoe_peer_mid, peerMax: selectedFacilityData.aoe_peer_max, variance: selectedFacilityData.aoe_variance_pct },
      { metric: 'Labor', actual: selectedFacilityData.labor_ppd, peerMin: selectedFacilityData.labor_peer_min, peerMid: selectedFacilityData.labor_peer_mid, peerMax: selectedFacilityData.labor_peer_max, variance: selectedFacilityData.labor_variance_pct },
      { metric: 'COGS', actual: selectedFacilityData.cogs_ppd, peerMin: selectedFacilityData.cogs_peer_min, peerMid: selectedFacilityData.cogs_peer_mid, peerMax: selectedFacilityData.cogs_peer_max, variance: selectedFacilityData.cogs_variance_pct },
      { metric: 'Revenue', actual: selectedFacilityData.revenue_ppd, peerMin: selectedFacilityData.revenue_peer_min, peerMid: selectedFacilityData.revenue_peer_mid, peerMax: selectedFacilityData.revenue_peer_max, variance: selectedFacilityData.revenue_variance_pct },
    ];
  }, [selectedFacilityData]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">FANS Peer Comparison Dashboard</h1>
              <p className="text-blue-200 mt-1">Benchmark Your Performance Against Peers</p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setShowImportModal(true)} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg flex items-center gap-2 transition">
                <Upload size={18} />
                Import
              </button>
              <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg flex items-center gap-2 transition">
                <Download size={18} />
                Export
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards - Peer Comparison Focused */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${metrics.avgVariance > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                {metrics.avgVariance > 0 ? <TrendingUp className="text-red-600" /> : <TrendingDown className="text-green-600" />}
              </div>
            </div>
            <h3 className="text-black text-sm font-medium">Avg AOE Variance</h3>
            <p className={`text-2xl font-bold mt-1 ${metrics.avgVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {metrics.avgVariance > 0 ? '+' : ''}{metrics.avgVariance.toFixed(1)}%
            </p>
            <p className="text-sm text-black mt-2">vs peer median</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-100 rounded-lg"><Target className="text-green-600" /></div>
            </div>
            <h3 className="text-black text-sm font-medium">Below Peer Median</h3>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {metrics.belowMedian} <span className="text-lg font-normal text-black">/ {metrics.belowMedian + metrics.aboveMedian}</span>
            </p>
            <p className="text-sm text-black mt-2">{((metrics.belowMedian / Math.max(1, metrics.belowMedian + metrics.aboveMedian)) * 100).toFixed(0)}% performing well</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-orange-100 rounded-lg"><TrendingUp className="text-orange-600" /></div>
            </div>
            <h3 className="text-black text-sm font-medium">Potential Annual Savings</h3>
            <p className="text-2xl font-bold text-orange-600 mt-1">${(metrics.potentialSavings / 1000000).toFixed(1)}M</p>
            <p className="text-sm text-black mt-2">if above-median facilities improve</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-100 rounded-lg"><Award className="text-blue-600" /></div>
            </div>
            <h3 className="text-black text-sm font-medium">Top Performer</h3>
            <p className="text-lg font-bold text-gray-900 mt-1 truncate" title={metrics.topPerformer?.facility_name}>
              {metrics.topPerformer?.facility_name?.substring(0, 20) || '-'}
            </p>
            <p className="text-sm text-green-600 mt-2 font-medium">
              {metrics.topPerformer?.aoe_variance_pct?.toFixed(1)}% below median
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-black" />
            <h2 className="text-lg font-semibold">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-1">Health System</label>
              <select value={selectedHealthSystem} onChange={(e) => setSelectedHealthSystem(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Health Systems</option>
                {healthSystems.map(hs => <option key={hs} value={hs}>{hs}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-1">Period</label>
              <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Periods</option>
                {periods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-1">Facility</label>
              <select value={selectedFacility} onChange={(e) => setSelectedFacility(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                {facilities.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {([{ id: 'facility', label: 'Facility Analysis' }, { id: 'rankings', label: 'Performance Rankings' }, { id: 'systems', label: 'System Comparison' }] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-white text-black hover:bg-gray-100'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Facility Analysis Tab */}
        {activeTab === 'facility' && selectedFacilityData && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedFacilityData.facility_name}</h3>
                  <p className="text-black mt-1">{selectedFacilityData.health_system} | {selectedFacilityData.period}</p>
                  <p className="text-black">Daily Census: {selectedFacilityData.daily_census?.toFixed(0)}</p>
                </div>
                <div className={`text-right px-4 py-2 rounded-lg ${(selectedFacilityData.aoe_variance_pct || 0) > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className="text-sm text-black">Overall AOE Variance</p>
                  <p className={`text-2xl font-bold ${(selectedFacilityData.aoe_variance_pct || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(selectedFacilityData.aoe_variance_pct || 0) > 0 ? '+' : ''}{selectedFacilityData.aoe_variance_pct?.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h4 className="text-lg font-semibold mb-4">Variance vs Peer Median</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={facilityChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`} />
                    <YAxis dataKey="metric" type="category" width={80} />
                    <Tooltip formatter={(value) => [`${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`, 'Variance']} />
                    <ReferenceLine x={0} stroke="#666" />
                    <Bar dataKey="variance" name="Variance %">
                      {facilityChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.metric === 'Revenue' ? ((entry.variance || 0) >= 0 ? '#22c55e' : '#ef4444') : ((entry.variance || 0) <= 0 ? '#22c55e' : '#ef4444')} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h4 className="text-lg font-semibold mb-4">Actual vs Peer Range (PPD)</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={facilityChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis dataKey="metric" type="category" width={80} />
                    <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="peerMin" name="Peer Min" fill="#93c5fd" />
                    <Bar dataKey="peerMid" name="Peer Median" fill="#3b82f6" />
                    <Bar dataKey="peerMax" name="Peer Max" fill="#1e40af" />
                    <Line type="monotone" dataKey="actual" name="Actual" stroke="#ef4444" strokeWidth={3} dot={{ r: 6, fill: '#ef4444' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h4 className="text-lg font-semibold mb-4">Detailed Cost Breakdown</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-black">Metric</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Actual PPD</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Peer Min</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Peer Median</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Peer Max</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Variance $</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Variance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Total AOE', actual: selectedFacilityData.aoe_ppd, min: selectedFacilityData.aoe_peer_min, mid: selectedFacilityData.aoe_peer_mid, max: selectedFacilityData.aoe_peer_max, variance: selectedFacilityData.aoe_variance, variancePct: selectedFacilityData.aoe_variance_pct, isCost: true },
                      { label: 'Labor', actual: selectedFacilityData.labor_ppd, min: selectedFacilityData.labor_peer_min, mid: selectedFacilityData.labor_peer_mid, max: selectedFacilityData.labor_peer_max, variance: selectedFacilityData.labor_variance, variancePct: selectedFacilityData.labor_variance_pct, isCost: true },
                      { label: 'COGS', actual: selectedFacilityData.cogs_ppd, min: selectedFacilityData.cogs_peer_min, mid: selectedFacilityData.cogs_peer_mid, max: selectedFacilityData.cogs_peer_max, variance: selectedFacilityData.cogs_variance, variancePct: selectedFacilityData.cogs_variance_pct, isCost: true },
                      { label: 'Revenue', actual: selectedFacilityData.revenue_ppd, min: selectedFacilityData.revenue_peer_min, mid: selectedFacilityData.revenue_peer_mid, max: selectedFacilityData.revenue_peer_max, variance: selectedFacilityData.revenue_variance, variancePct: selectedFacilityData.revenue_variance_pct, isCost: false },
                    ].map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-3 px-4 font-medium">{row.label}</td>
                        <td className="py-3 px-4 text-right font-medium">${row.actual?.toFixed(2) || '-'}</td>
                        <td className="py-3 px-4 text-right text-black">${row.min?.toFixed(2) || '-'}</td>
                        <td className="py-3 px-4 text-right text-black">${row.mid?.toFixed(2) || '-'}</td>
                        <td className="py-3 px-4 text-right text-black">${row.max?.toFixed(2) || '-'}</td>
                        <td className={`py-3 px-4 text-right font-medium ${row.variance !== null ? (row.isCost ? (row.variance > 0 ? 'text-red-600' : 'text-green-600') : (row.variance >= 0 ? 'text-green-600' : 'text-red-600')) : ''}`}>
                          {row.variance !== null ? `${row.variance > 0 ? '+' : ''}$${row.variance.toFixed(2)}` : '-'}
                        </td>
                        <td className={`py-3 px-4 text-right font-medium ${row.variancePct !== null ? (row.isCost ? (row.variancePct > 0 ? 'text-red-600' : 'text-green-600') : (row.variancePct >= 0 ? 'text-green-600' : 'text-red-600')) : ''}`}>
                          {row.variancePct !== null ? `${row.variancePct > 0 ? '+' : ''}${row.variancePct.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Rankings Tab */}
        {activeTab === 'rankings' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Facility Performance Rankings</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-black">#</th>
                    <th className="text-left py-3 px-4 font-semibold text-black">Facility</th>
                    <th className="text-left py-3 px-4 font-semibold text-black">Health System</th>
                    <th className="text-right py-3 px-4 font-semibold text-black">Census</th>
                    <th className="text-right py-3 px-4 font-semibold text-black cursor-pointer hover:bg-gray-50" onClick={() => handleSort('aoe_ppd')}>
                      <div className="flex items-center justify-end gap-1">AOE PPD <ArrowUpDown size={14} /></div>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-black">Peer Median</th>
                    <th className="text-right py-3 px-4 font-semibold text-black cursor-pointer hover:bg-gray-50" onClick={() => handleSort('aoe_variance_pct')}>
                      <div className="flex items-center justify-end gap-1">Variance % <ArrowUpDown size={14} /></div>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-black cursor-pointer hover:bg-gray-50" onClick={() => handleSort('labor_variance_pct')}>
                      <div className="flex items-center justify-end gap-1">Labor Var % <ArrowUpDown size={14} /></div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.slice(0, 50).map((record, idx) => (
                    <tr key={idx} className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${record.facility_name === selectedFacility ? 'bg-blue-50' : ''}`} onClick={() => { setSelectedFacility(record.facility_name); setActiveTab('facility'); }}>
                      <td className="py-3 px-4 text-black">{idx + 1}</td>
                      <td className="py-3 px-4 font-medium">{record.facility_name}</td>
                      <td className="py-3 px-4 text-black">{record.health_system}</td>
                      <td className="py-3 px-4 text-right">{record.daily_census?.toFixed(0) || '-'}</td>
                      <td className="py-3 px-4 text-right font-medium">${record.aoe_ppd?.toFixed(2) || '-'}</td>
                      <td className="py-3 px-4 text-right text-black">${record.aoe_peer_mid?.toFixed(2) || '-'}</td>
                      <td className={`py-3 px-4 text-right font-medium ${(record.aoe_variance_pct || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {record.aoe_variance_pct !== null ? `${record.aoe_variance_pct > 0 ? '+' : ''}${record.aoe_variance_pct.toFixed(1)}%` : '-'}
                      </td>
                      <td className={`py-3 px-4 text-right font-medium ${(record.labor_variance_pct || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {record.labor_variance_pct !== null ? `${record.labor_variance_pct > 0 ? '+' : ''}${record.labor_variance_pct.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedRankings.length > 50 && <p className="mt-4 text-sm text-black text-center">Showing top 50 of {sortedRankings.length} facilities</p>}
          </div>
        )}

        {/* Systems Tab */}
        {activeTab === 'systems' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Health System AOE Variance Comparison</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={systemComparison} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`} />
                  <YAxis dataKey="name" type="category" width={180} />
                  <Tooltip formatter={(value) => [`${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`, 'Avg Variance']} />
                  <ReferenceLine x={0} stroke="#666" />
                  <Bar dataKey="avgAoeVariance" name="Avg AOE Variance">
                    {systemComparison.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.avgAoeVariance <= 0 ? '#22c55e' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Health System Performance Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-black">Health System</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Facilities</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Avg AOE Var %</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Avg Labor Var %</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Avg COGS Var %</th>
                      <th className="text-right py-3 px-4 font-semibold text-black">Below Median</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemComparison.map((system, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{system.name}</td>
                        <td className="py-3 px-4 text-right">{system.facilityCount}</td>
                        <td className={`py-3 px-4 text-right font-medium ${system.avgAoeVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {system.avgAoeVariance > 0 ? '+' : ''}{system.avgAoeVariance.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-4 text-right font-medium ${system.avgLaborVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {system.avgLaborVariance > 0 ? '+' : ''}{system.avgLaborVariance.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-4 text-right font-medium ${system.avgCogsVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {system.avgCogsVariance > 0 ? '+' : ''}{system.avgCogsVariance.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-green-600 font-medium">{system.belowMedianCount}</span>
                          <span className="text-black"> ({system.belowMedianPct.toFixed(0)}%)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="font-semibold text-white">FANS Peer Comparison Platform</p>
          <p className="mt-2 text-sm">{facilitiesWithVariance.length} facilities with peer data | {summary.total_health_systems} health systems</p>
          <p className="mt-4 text-xs">Powered by JBH Advisory Group</p>
        </div>
      </footer>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={24} />
                <div>
                  <h2 className="text-xl font-bold">Import Data</h2>
                  <p className="text-green-100 text-sm">Upload Excel or CSV files</p>
                </div>
              </div>
              <button onClick={closeImportModal} className="text-white hover:bg-white/20 rounded-lg p-2 transition"><X size={24} /></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {importStep === 'upload' && (
                <div>
                  <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-12 text-center transition ${dragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400'}`}>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                    <Upload size={48} className={`mx-auto mb-4 ${dragActive ? 'text-green-500' : 'text-gray-400'}`} />
                    <p className="text-lg font-medium text-black mb-2">{dragActive ? 'Drop file here' : 'Drag and drop your file here'}</p>
                    <p className="text-black mb-4">or</p>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-medium transition">Browse Files</button>
                  </div>
                  {isProcessing && (
                    <div className="mt-6 text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-green-500 border-t-transparent"></div>
                      <p className="mt-2 text-black">Processing...</p>
                    </div>
                  )}
                </div>
              )}

              {importStep === 'preview' && (
                <div>
                  <div className="bg-blue-50 rounded-xl p-4 mb-6">
                    <h4 className="font-semibold text-blue-800 mb-2">Detected Columns</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(detectedMapping).map(([field, column]) => (
                        <span key={field} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">{field.replace('_', ' ')}: <span className="font-medium">{column}</span></span>
                      ))}
                    </div>
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <div className="bg-gray-100 px-4 py-3 font-semibold text-black">Preview ({importPreview.length} records)</div>
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-black">Facility</th>
                            <th className="text-left py-2 px-3 font-medium text-black">System</th>
                            <th className="text-right py-2 px-3 font-medium text-black">AOE PPD</th>
                            <th className="text-right py-2 px-3 font-medium text-black">Labor PPD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.slice(0, 10).map((row, idx) => (
                            <tr key={idx} className="border-t border-gray-100">
                              <td className="py-2 px-3">{row.facility_name}</td>
                              <td className="py-2 px-3 text-black">{row.health_system}</td>
                              <td className="py-2 px-3 text-right">${row.aoe_ppd?.toFixed(2) || '-'}</td>
                              <td className="py-2 px-3 text-right">${row.labor_ppd?.toFixed(2) || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {importStep === 'result' && importResult && (
                <div className="text-center py-8">
                  {importResult.success && importResult.recordsImported > 0 ? (
                    <>
                      <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
                      <h3 className="text-2xl font-bold text-gray-800 mb-2">Import Successful!</h3>
                      <p className="text-black">{importResult.recordsImported} records imported</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={64} className="mx-auto text-red-500 mb-4" />
                      <h3 className="text-2xl font-bold text-gray-800 mb-2">Import Failed</h3>
                      {importResult.errors.map((err, i) => <p key={i} className="text-red-600">{err}</p>)}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
              {importStep === 'preview' && (
                <>
                  <button onClick={resetImport} className="px-4 py-2 text-black hover:bg-gray-200 rounded-lg transition">Back</button>
                  <button onClick={confirmImport} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2"><CheckCircle size={18} />Import {importPreview.length} Records</button>
                </>
              )}
              {importStep === 'result' && <button onClick={closeImportModal} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition">Done</button>}
              {importStep === 'upload' && <button onClick={closeImportModal} className="px-4 py-2 text-black hover:bg-gray-200 rounded-lg transition">Cancel</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
