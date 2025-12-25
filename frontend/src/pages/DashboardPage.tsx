import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EventIcon from '@mui/icons-material/Event';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import { format } from 'date-fns';
import { toast } from 'react-toastify';

interface DashboardMetrics {
  total_leads: number;
  unique_users: number;
  new_leads_today: number;
  follow_ups_today: number;
  leads_by_status: Record<string, number>;
  leads_by_source: Record<string, number>;
  leads_by_service: Record<string, number>;
  daily_trends: Array<{ date: string; count: number }>;
}

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

const COLORS = ['#1E4088', '#E84A8A', '#7B4B94', '#4CAF50', '#FF9800', '#2196F3', '#9C27B0'];

function MetricCard({ title, value, icon, color }: MetricCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="text.secondary" variant="body2" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}15`,
              borderRadius: 2,
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box sx={{ color }}>{icon}</Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const fetchDashboardData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const endpoint = isAdmin ? '/dashboard/metrics' : '/dashboard/agent';
      const response = await api.get<DashboardMetrics>(endpoint);
      setMetrics(response.data);

      if (showRefreshing) toast.success('Dashboard refreshed');
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setMetrics({
        total_leads: 0,
        unique_users: 0,
        new_leads_today: 0,
        follow_ups_today: 0,
        leads_by_status: {},
        leads_by_source: {},
        leads_by_service: {},
        daily_trends: [],
      });
      if (showRefreshing) toast.error('Failed to refresh data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    fetchDashboardData(true);
  };

  const generateSummary = async () => {
    if (!metrics || metrics.total_leads === 0) {
      toast.warning('No leads data available to generate summary');
      return;
    }

    setGeneratingSummary(true);
    try {
      const prompt = `You are a CRM analytics assistant for Tulip Healthcare (a maternity care program). Generate a VERY SHORT summary (3-4 bullet points max) of the current dashboard metrics.

Data:
- Total Leads: ${metrics.total_leads}
- Unique Users: ${metrics.unique_users}
- New Leads Today: ${metrics.new_leads_today}
- Follow-ups Today: ${metrics.follow_ups_today}
- Status Distribution: ${JSON.stringify(metrics.leads_by_status)}
- Source Distribution: ${JSON.stringify(metrics.leads_by_source)}

Generate a brief, professional summary highlighting:
1. Key numbers at a glance
2. Most important insight or trend
3. Immediate action item (if any)

Keep it concise - this is for a dashboard quick view.`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyABOdHz94WEqV4sc8id1lRo-vPPUo0ne20`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const geminiData = await geminiResponse.json();
      const generatedText =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (generatedText) {
        setAiSummary(generatedText);
        toast.success('AI Summary generated!');
      } else {
        toast.error('Failed to generate summary');
      }
    } catch (error) {
      console.error('Failed to generate AI summary:', error);
      toast.error('Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Transform data for charts
  const statusChartData = metrics?.leads_by_status
    ? Object.entries(metrics.leads_by_status).map(([name, value]) => ({ name, value }))
    : [];

  const sourceChartData = metrics?.leads_by_source
    ? Object.entries(metrics.leads_by_source).map(([name, value]) => ({ name, value }))
    : [];

  const serviceChartData = metrics?.leads_by_service
    ? Object.entries(metrics.leads_by_service).map(([name, value]) => ({ name, value }))
    : [];

  const trendChartData =
    metrics?.daily_trends?.map((item) => ({
      date: format(new Date(item.date), 'dd MMM'),
      leads: item.count,
    })) || [];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Welcome back, {user?.full_name}!
        </Typography>
        <Tooltip title="Refresh Dashboard">
          <IconButton onClick={handleRefresh} color="primary" disabled={refreshing}>
            {refreshing ? <CircularProgress size={24} /> : <RefreshIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Metric Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="Total Leads"
            value={metrics?.total_leads || 0}
            icon={<PeopleIcon fontSize="large" />}
            color="#1E4088"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="Unique Users"
            value={metrics?.unique_users || 0}
            icon={<PersonIcon fontSize="large" />}
            color="#7B4B94"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="New Today"
            value={metrics?.new_leads_today || 0}
            icon={<TrendingUpIcon fontSize="large" />}
            color="#4CAF50"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            title="Follow-ups Today"
            value={metrics?.follow_ups_today || 0}
            icon={<EventIcon fontSize="large" />}
            color="#E84A8A"
          />
        </Grid>
      </Grid>

      {/* AI Quick Summary */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon sx={{ color: '#1E4088', fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1E4088' }}>
              AI Quick Summary
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={generateSummary}
            disabled={generatingSummary || !metrics || metrics.total_leads === 0}
            startIcon={generatingSummary ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon />}
            sx={{ textTransform: 'none' }}
          >
            {generatingSummary ? 'Generating...' : aiSummary ? 'Regenerate' : 'Generate AI Summary'}
          </Button>
        </Box>
        {aiSummary ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'text.secondary', mt: 1 }}>
            {aiSummary}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Click "Generate AI Summary" to get an AI-powered overview of your dashboard metrics.
          </Typography>
        )}
      </Paper>

      {/* Charts Row 1 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Status Bifurcation - Pie Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Status Bifurcation
            </Typography>
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {statusChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Daily Leads Trend - Line Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Daily Leads Trend (Last 7 Days)
            </Typography>
            {trendChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Line
                    type="monotone"
                    dataKey="leads"
                    stroke="#1E4088"
                    strokeWidth={2}
                    dot={{ fill: '#1E4088' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Charts Row 2 */}
      <Grid container spacing={2}>
        {/* Service Distribution - Bar Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Service Type Distribution
            </Typography>
            {serviceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serviceChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill="#7B4B94" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No service data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Source Distribution - Bar Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Leads by Source
            </Typography>
            {sourceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sourceChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill="#E84A8A" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
