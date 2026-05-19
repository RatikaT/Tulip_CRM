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
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import TodayIcon from '@mui/icons-material/Today';
import AssignmentIcon from '@mui/icons-material/Assignment';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventNoteIcon from '@mui/icons-material/EventNote';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
  Label,
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
  total_enrollments: number;
  enrollments_by_partner: Record<string, number>;
  enrollments_by_action: Record<string, number>;
  // Enrollment stats for agents
  new_enrollments_today: number;
  enrollments_assigned_today: number;
  enrollments_followup_today: number;
  // New admin metrics
  leads_enrolled_today: number;
  leads_followup_today: number;
}

interface MetricCardProps {
  title: string;
  subtitle?: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

const COLORS = ['#1E4088', '#E84A8A', '#7B4B94', '#4CAF50', '#FF9800', '#2196F3', '#9C27B0'];

function MetricCard({ title, subtitle, value, icon, color }: MetricCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="text.secondary" variant="body2" gutterBottom>
              {title}
            </Typography>
            {subtitle && (
              <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                {subtitle}
              </Typography>
            )}
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
        total_enrollments: 0,
        enrollments_by_partner: {},
        enrollments_by_action: {},
        new_enrollments_today: 0,
        enrollments_assigned_today: 0,
        enrollments_followup_today: 0,
        leads_enrolled_today: 0,
        leads_followup_today: 0,
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

  // Roll up long-tail distributions: keep top N, sum the rest into "Other".
  // Solves the dirty-category problem (e.g. "PreConception" vs "Pre-Conception")
  // without touching the data.
  const topNWithOther = (
    data: Array<{ name: string; value: number }>,
    n: number,
  ): Array<{ name: string; value: number }> => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    if (sorted.length <= n) return sorted;
    const top = sorted.slice(0, n);
    const otherTotal = sorted.slice(n).reduce((sum, item) => sum + item.value, 0);
    return otherTotal > 0 ? [...top, { name: 'Other', value: otherTotal }] : top;
  };

  const statusChartData = topNWithOther(
    metrics?.leads_by_status
      ? Object.entries(metrics.leads_by_status).map(([name, value]) => ({ name, value }))
      : [],
    6,
  );

  const sourceChartData = topNWithOther(
    metrics?.leads_by_source
      ? Object.entries(metrics.leads_by_source).map(([name, value]) => ({ name, value }))
      : [],
    6,
  );

  const serviceChartData = topNWithOther(
    metrics?.leads_by_service
      ? Object.entries(metrics.leads_by_service).map(([name, value]) => ({ name, value }))
      : [],
    5,
  );

  const trendChartData =
    metrics?.daily_trends?.map((item, idx, arr) => ({
      date: format(new Date(item.date), 'dd MMM'),
      leads: item.count,
      isToday: idx === arr.length - 1,
    })) || [];
  const trendAverage =
    trendChartData.length > 0
      ? trendChartData.reduce((sum, d) => sum + d.leads, 0) / trendChartData.length
      : 0;

  const enrollmentsByPartnerData = topNWithOther(
    metrics?.enrollments_by_partner
      ? Object.entries(metrics.enrollments_by_partner).map(([name, value]) => ({ name, value }))
      : [],
    6,
  );

  const enrollmentsByActionData = topNWithOther(
    metrics?.enrollments_by_action
      ? Object.entries(metrics.enrollments_by_action).map(([name, value]) => ({ name, value }))
      : [],
    5,
  );
  const totalEnrollmentsCharted = enrollmentsByActionData.reduce((sum, d) => sum + d.value, 0);

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

      {/* Agent View: 4 Enrollment Stats Cards */}
      {!isAdmin && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={6} md={3}>
            <MetricCard
              title="Total Enrollments"
              subtitle="Assigned or Reassigned"
              value={metrics?.total_enrollments || 0}
              icon={<AssignmentTurnedInIcon fontSize="large" />}
              color="#1E4088"
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <MetricCard
              title="New Enrollments Today"
              subtitle="Assigned Today"
              value={metrics?.new_enrollments_today || 0}
              icon={<TodayIcon fontSize="large" />}
              color="#4CAF50"
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <MetricCard
              title="Enrollments Assigned Today"
              subtitle="All Assignments"
              value={metrics?.enrollments_assigned_today || 0}
              icon={<AssignmentIcon fontSize="large" />}
              color="#FF9800"
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <MetricCard
              title="Follow-ups Today"
              subtitle="Enrollments"
              value={metrics?.enrollments_followup_today || 0}
              icon={<NotificationsActiveIcon fontSize="large" />}
              color="#E84A8A"
            />
          </Grid>
        </Grid>
      )}

      {/* Admin View: 7 Metric Cards */}
      {isAdmin && (
        <>
          {/* First Row - 4 cards */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} sm={6} md={3}>
              <MetricCard
                title="Total Enrollments"
                value={metrics?.total_enrollments || 0}
                icon={<AssignmentTurnedInIcon fontSize="large" />}
                color="#1E4088"
              />
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <MetricCard
                title="Total Leads"
                value={metrics?.total_leads || 0}
                icon={<PeopleIcon fontSize="large" />}
                color="#7B4B94"
              />
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <MetricCard
                title="New Leads"
                subtitle="Created Today"
                value={metrics?.new_leads_today || 0}
                icon={<TrendingUpIcon fontSize="large" />}
                color="#4CAF50"
              />
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <MetricCard
                title="New Enrollments"
                subtitle="Created Today"
                value={metrics?.new_enrollments_today || 0}
                icon={<TodayIcon fontSize="large" />}
                color="#FF9800"
              />
            </Grid>
          </Grid>
          {/* Second Row - 3 new cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={6} md={4}>
              <MetricCard
                title="Leads Enrolled Today"
                subtitle="Status changed to Enrolled"
                value={metrics?.leads_enrolled_today || 0}
                icon={<CheckCircleIcon fontSize="large" />}
                color="#2196F3"
              />
            </Grid>
            <Grid item xs={6} sm={6} md={4}>
              <MetricCard
                title="Leads Follow-up Today"
                subtitle="Follow-up scheduled"
                value={metrics?.leads_followup_today || 0}
                icon={<EventNoteIcon fontSize="large" />}
                color="#9C27B0"
              />
            </Grid>
            <Grid item xs={6} sm={6} md={4}>
              <MetricCard
                title="Enrollments Follow-up Today"
                subtitle="Next follow-up date"
                value={metrics?.enrollments_followup_today || 0}
                icon={<NotificationsActiveIcon fontSize="large" />}
                color="#E84A8A"
              />
            </Grid>
          </Grid>
        </>
      )}

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
          <Box
            component="div"
            sx={{
              mt: 1,
              lineHeight: 1.6,
              color: 'text.secondary',
              '& strong': { fontWeight: 700, color: 'text.primary' },
            }}
            dangerouslySetInnerHTML={{
              __html: aiSummary
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br />')
            }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Click "Generate AI Summary" to get an AI-powered overview of your dashboard metrics.
          </Typography>
        )}
      </Paper>

      {/* Charts Row 1 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Status Bifurcation - Sorted Horizontal Bar */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Status Bifurcation
            </Typography>
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={statusChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 12 }}
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="value" fill="#1E4088" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#333' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Daily Leads Trend - Bar Chart with today highlighted + avg line */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Daily Leads Trend (Last 7 Days)
            </Typography>
            {trendChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trendChartData} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  {trendAverage > 0 && (
                    <ReferenceLine y={trendAverage} stroke="#999" strokeDasharray="4 4">
                      <Label
                        value={`avg ${trendAverage.toFixed(1)}`}
                        position="insideTopRight"
                        fill="#666"
                        fontSize={11}
                      />
                    </ReferenceLine>
                  )}
                  <Bar dataKey="leads" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="leads" position="top" style={{ fontSize: 11, fill: '#333' }} />
                    {trendChartData.map((entry, index) => (
                      <Cell key={`tcell-${index}`} fill={entry.isToday ? '#1E4088' : '#A8B5D1'} />
                    ))}
                  </Bar>
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

      {/* Charts Row 2 */}
      <Grid container spacing={2}>
        {/* Service Type - Top 5 + Other, horizontal bar */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Service Type Distribution
            </Typography>
            {serviceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={serviceChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 12 }}
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="value" fill="#7B4B94" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#333' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No service data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Leads by Source - Top 6 + Other, horizontal bar */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Leads by Source
            </Typography>
            {sourceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={sourceChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 12 }}
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="value" fill="#E84A8A" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#333' }} />
                  </Bar>
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

      {/* Charts Row 3 - Enrollment Charts */}
      <Grid container spacing={2} sx={{ mt: 1 }}>
        {/* Enrollments by Service Partner - Top 6 + Other, horizontal bar */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Enrollments by Service Partner
            </Typography>
            {enrollmentsByPartnerData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={enrollmentsByPartnerData}
                  layout="vertical"
                  margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 12 }}
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="value" fill="#FF9800" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#333' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No enrollment data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Enrollments by Action Taken - Donut with total in center */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 320 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Enrollments by Action Taken
            </Typography>
            {enrollmentsByActionData.length > 0 ? (
              <Box sx={{ position: 'relative', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={enrollmentsByActionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {enrollmentsByActionData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E4088' }}>
                    {totalEnrollmentsCharted}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    enrollments
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                <Typography color="text.secondary">No enrollment data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
