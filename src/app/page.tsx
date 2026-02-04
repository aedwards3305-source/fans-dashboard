'use client';

import { useState, useMemo } from 'react';
import {
  Building2,
  DollarSign,
  Users,
  Filter,
  Download,
  BarChart3
} from 'lucide-react';
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

export default function Dashboard() {
  const [selectedHealthSystem, setSelectedHealthSystem] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [censusRange, setCensusRange] = useState<[number, number]>([0, 1000]);
  const [activeTab, setActiveTab] = useState<'overview' | 'compare' | 'trends'>('overview');

  const data = benchmarkData as BenchmarkRecord[];
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
            <Filter size={20} className="text-gray-500" />
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
                <p className="mt-4 text-sm text-gray-500 text-center">
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
            {summary.total_facilities} facilities | {summary.total_records} records | {summary.total_periods} periods
          </p>
          <p className="mt-4 text-xs">
            Powered by JBH Advisory Group
          </p>
        </div>
      </footer>
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
