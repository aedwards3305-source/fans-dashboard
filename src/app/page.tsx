'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Building2,
  DollarSign,
  Users,
  Filter,
  Download,
  BarChart3,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet
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
  ScatterChart,
  Scatter,
  ZAxis
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
  cogs_ppd: number | null;
  labor_ppd: number | null;
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
  const [censusRange, setCensusRange] = useState<[number, number]>([0, 1000]);
  const [activeTab, setActiveTab] = useState<'overview' | 'compare' | 'trends'>('overview');

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
      if (record.daily_census !== null) {
        if (record.daily_census < censusRange[0] || record.daily_census > censusRange[1]) {
          return false;
        }
      }
      return true;
    });
  }, [data, selectedHealthSystem, selectedPeriod, censusRange]);

  // Calculate averages for filtered data
  const averages = useMemo(() => {
    const validRecords = filteredData.filter(r => r.aoe_ppd !== null);
    if (validRecords.length === 0) return { aoe: 0, labor: 0, cogs: 0, revenue: 0 };

    return {
      aoe: validRecords.reduce((sum, r) => sum + (r.aoe_ppd || 0), 0) / validRecords.length,
      labor: validRecords.reduce((sum, r) => sum + (r.labor_ppd || 0), 0) / validRecords.length,
      cogs: validRecords.reduce((sum, r) => sum + (r.cogs_ppd || 0), 0) / validRecords.length,
      revenue: validRecords.reduce((sum, r) => sum + (r.revenue_ppd || 0), 0) / validRecords.length,
    };
  }, [filteredData]);

  // Unique health systems and periods
  const healthSystems = [...new Set(data.map(r => r.health_system))].sort();
  const periods = [...new Set(data.map(r => r.period))].sort();

  // Find matching column in Excel headers
  const findColumnMatch = useCallback((headers: string[], targetField: string): string | null => {
    const possibleNames = COLUMN_MAPPINGS[targetField] || [];
    const normalizedHeaders = headers.map(h => h?.toString().toLowerCase().trim());

    for (const name of possibleNames) {
      const idx = normalizedHeaders.indexOf(name.toLowerCase());
      if (idx !== -1) return headers[idx];
    }
    return null;
  }, []);

  // Process uploaded Excel file
  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });

      if (rawData.length === 0) {
        setImportResult({
          success: false,
          recordsImported: 0,
          errors: ['No data found in the file'],
          warnings: []
        });
        setImportStep('result');
        return;
      }

      // Get headers
      const headers = Object.keys(rawData[0]);

      // Detect column mappings
      const mapping: Record<string, string> = {};
      const warnings: string[] = [];

      for (const field of Object.keys(COLUMN_MAPPINGS)) {
        const match = findColumnMatch(headers, field);
        if (match) {
          mapping[field] = match;
        } else if (field === 'facility_name') {
          warnings.push(`Required column "Facility Name" not found`);
        }
      }

      setDetectedMapping(mapping);

      // Transform data to our format
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

      if (warnings.length > 0) {
        setImportResult({
          success: true,
          recordsImported: 0,
          errors: [],
          warnings
        });
      }

    } catch (error) {
      setImportResult({
        success: false,
        recordsImported: 0,
        errors: [`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      });
      setImportStep('result');
    } finally {
      setIsProcessing(false);
    }
  }, [findColumnMatch]);

  // Parse number helper
  const parseNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
    return isNaN(num) ? null : num;
  };

  // Confirm import
  const confirmImport = useCallback(() => {
    const newRecords: BenchmarkRecord[] = importPreview.map(row => ({
      facility_name: row.facility_name,
      display_name: row.facility_name,
      health_system: row.health_system,
      period: row.period,
      daily_census: row.daily_census,
      aoe_ppd: row.aoe_ppd,
      aoe_peer_min: null,
      aoe_peer_mid: null,
      aoe_peer_max: null,
      revenue_ppd: row.revenue_ppd,
      cogs_ppd: row.cogs_ppd,
      labor_ppd: row.labor_ppd,
      productive_ftes: row.productive_ftes,
    }));

    setImportedData(prev => [...prev, ...newRecords]);
    setImportResult({
      success: true,
      recordsImported: newRecords.length,
      errors: [],
      warnings: []
    });
    setImportStep('result');
  }, [importPreview]);

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
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

  // Reset import modal
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

  // Export function
  const handleExport = () => {
    const csv = [
      ['Facility', 'Health System', 'Period', 'Census', 'AOE PPD', 'Labor PPD', 'COGS PPD', 'Revenue PPD'].join(','),
      ...filteredData.map(r => [
        `"${r.facility_name}"`,
        `"${r.health_system}"`,
        r.period,
        r.daily_census?.toFixed(0) || '',
        r.aoe_ppd?.toFixed(2) || '',
        r.labor_ppd?.toFixed(2) || '',
        r.cogs_ppd?.toFixed(2) || '',
        r.revenue_ppd?.toFixed(2) || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fans_benchmarks_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">FANS Benchmarking Dashboard</h1>
              <p className="text-blue-200 mt-1">Food & Nutrition Services Performance Analytics</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowImportModal(true)}
                className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg flex items-center gap-2 transition"
              >
                <Upload size={18} />
                Import Data
              </button>
              <button
                onClick={handleExport}
                className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg flex items-center gap-2 transition"
              >
                <Download size={18} />
                Export Report
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Facilities"
            value={summary.total_facilities}
            icon={<Building2 className="text-blue-600" />}
            trend={`${summary.total_health_systems} health systems`}
          />
          <StatsCard
            title="Avg AOE PPD"
            value={`$${averages.aoe.toFixed(2)}`}
            icon={<DollarSign className="text-green-600" />}
            trend="Operating expense per patient day"
          />
          <StatsCard
            title="Avg Labor PPD"
            value={`$${averages.labor.toFixed(2)}`}
            icon={<Users className="text-purple-600" />}
            trend="Largest cost driver"
          />
          <StatsCard
            title="Data Records"
            value={summary.total_records}
            icon={<BarChart3 className="text-orange-600" />}
            trend={`${summary.total_periods} periods`}
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Health System</label>
              <select
                value={selectedHealthSystem}
                onChange={(e) => setSelectedHealthSystem(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Health Systems</option>
                {healthSystems.map(hs => (
                  <option key={hs} value={hs}>{hs}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Periods</option>
                {periods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Census Range: {censusRange[0]} - {censusRange[1]}
              </label>
              <input
                type="range"
                min={0}
                max={1000}
                value={censusRange[1]}
                onChange={(e) => setCensusRange([0, parseInt(e.target.value)])}
                className="w-full"
              />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredData.length} of {data.length} records
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'compare', 'trends'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Peer Benchmarks Chart */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">AOE PPD by Census Range</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={summary.peer_benchmarks}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="census_label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="aoe_ppd.p25" name="25th %" fill="#93c5fd" />
                  <Bar dataKey="aoe_ppd.p50" name="Median" fill="#3b82f6" />
                  <Bar dataKey="aoe_ppd.p75" name="75th %" fill="#1e40af" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Health System Breakdown */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Records by Health System</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={summary.health_systems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip />
                  <Bar dataKey="records" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Facility Benchmarks</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Facility</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Health System</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Period</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Census</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">AOE PPD</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Peer Mid</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.slice(0, 20).map((record, idx) => {
                      const variance = record.aoe_ppd && record.aoe_peer_mid
                        ? ((record.aoe_ppd - record.aoe_peer_mid) / record.aoe_peer_mid * 100)
                        : null;
                      return (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">{record.facility_name}</td>
                          <td className="py-3 px-4 text-gray-600">{record.health_system}</td>
                          <td className="py-3 px-4 text-gray-600">{record.period}</td>
                          <td className="py-3 px-4 text-right">{record.daily_census?.toFixed(0) || '-'}</td>
                          <td className="py-3 px-4 text-right font-medium">
                            ${record.aoe_ppd?.toFixed(2) || '-'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            ${record.aoe_peer_mid?.toFixed(2) || '-'}
                          </td>
                          <td className={`py-3 px-4 text-right font-medium ${
                            variance !== null
                              ? variance > 0 ? 'text-red-600' : 'text-green-600'
                              : ''
                          }`}>
                            {variance !== null ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredData.length > 20 && (
                <p className="mt-4 text-sm text-gray-600 text-center">
                  Showing 20 of {filteredData.length} records
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Scatter Plot */}
            <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Census vs AOE PPD</h3>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="daily_census" name="Census" type="number" />
                  <YAxis dataKey="aoe_ppd" name="AOE PPD" type="number" />
                  <ZAxis range={[50, 50]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter
                    name="Facilities"
                    data={filteredData.filter(r => r.daily_census && r.aoe_ppd)}
                    fill="#3b82f6"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Labor vs COGS comparison */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Labor PPD by Census</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={summary.peer_benchmarks}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="census_label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="labor_ppd.p50" name="Median Labor PPD" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">COGS PPD by Census</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={summary.peer_benchmarks}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="census_label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cogs_ppd.p50" name="Median COGS PPD" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Records by Period</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={summary.periods}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="records" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="font-semibold text-white">FANS Benchmarking Platform</p>
          <p className="mt-2 text-sm">
            {summary.total_facilities + importedData.length} facilities | {summary.total_records + importedData.length} records | {summary.total_periods} periods
          </p>
          {importedData.length > 0 && (
            <p className="mt-1 text-xs text-green-400">
              +{importedData.length} imported records this session
            </p>
          )}
          <p className="mt-4 text-xs">
            Powered by JBH Advisory Group
          </p>
        </div>
      </footer>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={24} />
                <div>
                  <h2 className="text-xl font-bold">Import Data</h2>
                  <p className="text-green-100 text-sm">Upload Excel or CSV files with FANS benchmark data</p>
                </div>
              </div>
              <button
                onClick={closeImportModal}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Step 1: Upload */}
              {importStep === 'upload' && (
                <div>
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-12 text-center transition ${
                      dragActive
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Upload size={48} className={`mx-auto mb-4 ${dragActive ? 'text-green-500' : 'text-gray-400'}`} />
                    <p className="text-lg font-medium text-gray-700 mb-2">
                      {dragActive ? 'Drop file here' : 'Drag and drop your file here'}
                    </p>
                    <p className="text-gray-600 mb-4">or</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-medium transition"
                    >
                      Browse Files
                    </button>
                    <p className="text-sm text-gray-600 mt-4">
                      Supports .xlsx, .xls, and .csv files
                    </p>
                  </div>

                  {isProcessing && (
                    <div className="mt-6 text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-green-500 border-t-transparent"></div>
                      <p className="mt-2 text-gray-600">Processing file...</p>
                    </div>
                  )}

                  {/* Expected Format Info */}
                  <div className="mt-8 bg-gray-50 rounded-xl p-6">
                    <h4 className="font-semibold text-gray-800 mb-3">Expected Column Names</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Facility:</span>
                        <span className="text-gray-600 ml-1">Facility Name, Hospital</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Census:</span>
                        <span className="text-gray-600 ml-1">Daily Census, ADC</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">AOE:</span>
                        <span className="text-gray-600 ml-1">AOE PPD, Operating Expense</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Labor:</span>
                        <span className="text-gray-600 ml-1">Labor PPD, Labor Cost</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">COGS:</span>
                        <span className="text-gray-600 ml-1">COGS PPD, Food Cost</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Revenue:</span>
                        <span className="text-gray-600 ml-1">Revenue PPD, Sales</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Preview */}
              {importStep === 'preview' && (
                <div>
                  {/* Mapping Summary */}
                  <div className="bg-blue-50 rounded-xl p-4 mb-6">
                    <h4 className="font-semibold text-blue-800 mb-2">Detected Columns</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(detectedMapping).map(([field, column]) => (
                        <span key={field} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                          {field.replace('_', ' ')}: <span className="font-medium">{column}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Warnings */}
                  {importResult?.warnings && importResult.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                      <div className="flex items-center gap-2 text-yellow-800 mb-2">
                        <AlertCircle size={20} />
                        <span className="font-semibold">Warnings</span>
                      </div>
                      <ul className="list-disc list-inside text-yellow-700 text-sm">
                        {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Preview Table */}
                  <div className="border rounded-xl overflow-hidden">
                    <div className="bg-gray-100 px-4 py-3 font-semibold text-gray-700">
                      Preview ({importPreview.length} records)
                    </div>
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">Facility</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">System</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">Period</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-700">Census</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-700">AOE PPD</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-700">Labor PPD</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-700">COGS PPD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.slice(0, 20).map((row, idx) => (
                            <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3">{row.facility_name}</td>
                              <td className="py-2 px-3 text-gray-600">{row.health_system}</td>
                              <td className="py-2 px-3 text-gray-600">{row.period}</td>
                              <td className="py-2 px-3 text-right">{row.daily_census?.toFixed(0) || '-'}</td>
                              <td className="py-2 px-3 text-right">${row.aoe_ppd?.toFixed(2) || '-'}</td>
                              <td className="py-2 px-3 text-right">${row.labor_ppd?.toFixed(2) || '-'}</td>
                              <td className="py-2 px-3 text-right">${row.cogs_ppd?.toFixed(2) || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importPreview.length > 20 && (
                      <div className="bg-gray-50 px-4 py-2 text-sm text-gray-500 text-center">
                        Showing 20 of {importPreview.length} records
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Result */}
              {importStep === 'result' && importResult && (
                <div className="text-center py-8">
                  {importResult.success && importResult.recordsImported > 0 ? (
                    <>
                      <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
                      <h3 className="text-2xl font-bold text-gray-800 mb-2">Import Successful!</h3>
                      <p className="text-gray-600 mb-6">
                        {importResult.recordsImported} records have been added to your dashboard
                      </p>
                      <div className="bg-green-50 rounded-xl p-6 max-w-md mx-auto">
                        <div className="grid grid-cols-2 gap-4 text-left">
                          <div>
                            <p className="text-sm text-gray-600">Records Imported</p>
                            <p className="text-2xl font-bold text-green-600">{importResult.recordsImported}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total Records</p>
                            <p className="text-2xl font-bold text-gray-800">{data.length}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={64} className="mx-auto text-red-500 mb-4" />
                      <h3 className="text-2xl font-bold text-gray-800 mb-2">Import Failed</h3>
                      {importResult.errors.map((err, i) => (
                        <p key={i} className="text-red-600 mb-2">{err}</p>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
              <div className="text-sm text-gray-500">
                {importStep === 'preview' && `${importPreview.length} records ready to import`}
                {importStep === 'result' && importResult?.success && 'Data added to current session'}
              </div>
              <div className="flex gap-3">
                {importStep === 'preview' && (
                  <>
                    <button
                      onClick={resetImport}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition"
                    >
                      Back
                    </button>
                    <button
                      onClick={confirmImport}
                      className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2"
                    >
                      <CheckCircle size={18} />
                      Import {importPreview.length} Records
                    </button>
                  </>
                )}
                {importStep === 'result' && (
                  <>
                    <button
                      onClick={resetImport}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition"
                    >
                      Import Another
                    </button>
                    <button
                      onClick={closeImportModal}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition"
                    >
                      Done
                    </button>
                  </>
                )}
                {importStep === 'upload' && (
                  <button
                    onClick={closeImportModal}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  trend
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-gray-100 rounded-lg">{icon}</div>
      </div>
      <h3 className="text-gray-600 text-sm font-medium">{title}</h3>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm text-gray-500 mt-2">{trend}</p>
    </div>
  );
}
