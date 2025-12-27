import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Grid,
  CircularProgress,
  Divider,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { toast } from 'react-toastify';
import { format, subDays } from 'date-fns';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import AgentDailySummary from '../components/summaries/AgentDailySummary';

interface User {
  id: string;
  full_name: string;
}

interface StoredSummary {
  id: string;
  summary_type: string;
  content: string;
  agent_id: string | null;
  agent_name: string | null;
  summary_date: string | null;
  total_leads: number;
  created_at: string;
  created_by_name: string;
}

export default function SummariesPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [summaryType, setSummaryType] = useState<'overall' | 'agent' | 'daily'>('overall');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState('');
  const [agents, setAgents] = useState<User[]>([]);

  // Stored summaries
  const [storedSummaries, setStoredSummaries] = useState<StoredSummary[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(true);

  const fetchStoredSummaries = useCallback(async () => {
    try {
      const response = await api.get<{ summaries: StoredSummary[] }>('/dashboard/summaries');
      setStoredSummaries(response.data.summaries || []);
    } catch (error) {
      console.error('Failed to fetch summaries:', error);
    } finally {
      setLoadingSummaries(false);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch agents for admin
      if (isAdmin) {
        try {
          const usersResponse = await api.get<{ users: User[] }>('/users');
          setAgents(usersResponse.data.users || []);
        } catch (error) {
          console.error('Failed to fetch users:', error);
        }
      }

      // Fetch stored summaries
      await fetchStoredSummaries();
    };

    fetchData();
  }, [isAdmin, fetchStoredSummaries]);

  const buildSummaryPrompt = (type: string, data: Record<string, unknown>) => {
    const dateRange = data.date_range as { from?: string; to?: string } | undefined;
    const basePrompt = `You are a CRM analytics assistant for Tulip Healthcare (a maternity care program). Generate a concise, professional summary in bullet points.

Data:
- Total Leads: ${data.total_leads}
- Status Distribution: ${JSON.stringify(data.status_distribution)}
- Source Distribution: ${JSON.stringify(data.source_distribution)}
- Service Distribution: ${JSON.stringify(data.service_distribution)}
- Date Range: ${dateRange?.from || 'All time'} to ${dateRange?.to || 'Today'}
`;

    if (type === 'agent' && data.agent_name) {
      return `${basePrompt}
Agent: ${data.agent_name}

Generate a performance summary for this agent including:
1. Total leads handled
2. Status breakdown and conversion insights
3. Key recommendations for improvement`;
    }

    if (type === 'daily') {
      return `${basePrompt}

Generate a daily/period summary including:
1. Leads received in the selected period
2. Status distribution
3. Notable trends or concerns`;
    }

    return `${basePrompt}

Generate an overall summary including:
1. Total lead overview
2. Status distribution analysis
3. Source effectiveness
4. Service enrollment insights
5. Key recommendations`;
  };

  const generateSummary = async () => {
    setGenerating(true);
    setSummary('');

    try {
      // Get summary data from backend
      const params = new URLSearchParams();
      params.append('summary_type', summaryType);
      if (summaryType === 'agent' && selectedAgent) {
        params.append('agent_id', selectedAgent);
      }
      // Always include date range
      if (dateFrom) {
        params.append('date_from', dateFrom);
      }
      if (dateTo) {
        params.append('date_to', dateTo);
      }

      const dataResponse = await api.get(`/dashboard/summary-data?${params.toString()}`);
      const summaryData = dataResponse.data;

      // Call Gemini API for summary
      const prompt = buildSummaryPrompt(summaryType, summaryData);
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
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate summary.';
      setSummary(generatedText);

      // Save summary to backend
      const agentName = selectedAgent
        ? agents.find((a) => a.id === selectedAgent)?.full_name
        : null;

      await api.post('/dashboard/summaries', {
        summary_type: summaryType,
        content: generatedText,
        agent_id: summaryType === 'agent' ? selectedAgent : null,
        agent_name: summaryType === 'agent' ? agentName : null,
        summary_date: `${dateFrom} to ${dateTo}`,
        total_leads: summaryData.total_leads,
        status_distribution: summaryData.status_distribution,
        source_distribution: summaryData.source_distribution,
        service_distribution: summaryData.service_distribution,
      });

      // Refresh stored summaries
      await fetchStoredSummaries();

      toast.success('Summary generated and saved!');
    } catch (error) {
      console.error('Failed to generate summary:', error);
      setSummary('Failed to generate summary. Please try again.');
      toast.error('Failed to generate summary');
    } finally {
      setGenerating(false);
    }
  };

  const deleteSummary = async (summaryId: string) => {
    try {
      await api.delete(`/dashboard/summaries/${summaryId}`);
      setStoredSummaries((prev) => prev.filter((s) => s.id !== summaryId));
      toast.success('Summary deleted');
    } catch (error) {
      console.error('Failed to delete summary:', error);
      toast.error('Failed to delete summary');
    }
  };

  const getSummaryTypeLabel = (type: string) => {
    switch (type) {
      case 'overall':
        return 'Overall';
      case 'agent':
        return 'Agent-wise';
      case 'daily':
        return 'Daily';
      default:
        return type;
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        AI Summaries
      </Typography>

      {/* Agent Daily Activity Summary */}
      <Box sx={{ mb: 3 }}>
        <AgentDailySummary />
      </Box>

      {/* Generate Summary Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AutoAwesomeIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Generate New Summary
          </Typography>
        </Box>

        <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              size="small"
              select
              label="Summary Type"
              value={summaryType}
              onChange={(e) => setSummaryType(e.target.value as 'overall' | 'agent' | 'daily')}
            >
              <MenuItem value="overall">Overall Summary</MenuItem>
              <MenuItem value="agent">Agent-wise Summary</MenuItem>
              <MenuItem value="daily">Day-wise Summary</MenuItem>
            </TextField>
          </Grid>

          {summaryType === 'agent' && (
            <Grid item xs={12} sm={2}>
              <TextField
                fullWidth
                size="small"
                select
                label="Select Agent"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <MenuItem value="">All Agents</MenuItem>
                {agents.map((agent) => (
                  <MenuItem key={agent.id} value={agent.id}>
                    {agent.full_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}

          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="From Date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="To Date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={2}>
            <Button
              variant="contained"
              onClick={generateSummary}
              disabled={generating}
              startIcon={generating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
              fullWidth
            >
              {generating ? 'Generating...' : 'Generate'}
            </Button>
          </Grid>
        </Grid>

        {summary && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box
              sx={{
                p: 2,
                bgcolor: '#e3f2fd',
                borderRadius: 2,
                whiteSpace: 'pre-wrap',
                border: '1px solid #90caf9',
              }}
            >
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                Latest Generated Summary
              </Typography>
              <Box
                component="div"
                sx={{
                  lineHeight: 1.8,
                  fontSize: '0.875rem',
                  '& strong': { fontWeight: 700 },
                }}
                dangerouslySetInnerHTML={{
                  __html: summary
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br />')
                }}
              />
            </Box>
          </>
        )}
      </Paper>

      {/* Summary History Section */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Summary History
          </Typography>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchStoredSummaries} color="primary" size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {loadingSummaries ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : storedSummaries.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {storedSummaries.map((s) => (
              <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={getSummaryTypeLabel(s.summary_type)}
                      size="small"
                      color={s.summary_type === 'overall' ? 'primary' : s.summary_type === 'agent' ? 'secondary' : 'info'}
                    />
                    {s.agent_name && (
                      <Typography variant="body2" color="text.secondary">
                        Agent: {s.agent_name}
                      </Typography>
                    )}
                    {s.summary_date && (
                      <Typography variant="body2" color="text.secondary">
                        Period: {s.summary_date}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      ({s.total_leads} leads)
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(s.created_at), 'dd MMM yyyy, hh:mm a')}
                    </Typography>
                    {isAdmin && (
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => deleteSummary(s.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                <Box
                  component="div"
                  sx={{
                    lineHeight: 1.6,
                    fontSize: '0.875rem',
                    '& strong': { fontWeight: 700 },
                  }}
                  dangerouslySetInnerHTML={{
                    __html: s.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br />')
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Generated by: {s.created_by_name}
                </Typography>
              </Paper>
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 6,
              color: 'text.secondary',
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
            <Typography variant="body1">No summaries generated yet</Typography>
            <Typography variant="body2">
              Click "Generate" above to create your first AI-powered summary
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
