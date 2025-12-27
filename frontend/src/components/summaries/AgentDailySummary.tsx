import { useState, useEffect } from 'react';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneIcon from '@mui/icons-material/Phone';
import EventIcon from '@mui/icons-material/Event';
import WarningIcon from '@mui/icons-material/Warning';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CommentIcon from '@mui/icons-material/Comment';
import UpdateIcon from '@mui/icons-material/Update';
import PeopleIcon from '@mui/icons-material/People';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveIcon from '@mui/icons-material/Save';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { dashboardService } from '../../services/dashboardService';
import api from '../../services/api';
import {
  AgentActivityResponse,
  AgentActivityMetrics,
  AgentActivityLeadDetails,
} from '../../types/summary.types';

interface User {
  id: string;
  full_name: string;
  role: string;
}

const GEMINI_API_KEY = 'AIzaSyABOdHz94WEqV4sc8id1lRo-vPPUo0ne20';

export default function AgentDailySummary() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedAgent, setSelectedAgent] = useState(user?.id || '');
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [activityData, setActivityData] = useState<AgentActivityResponse | null>(null);
  const [aiSummary, setAiSummary] = useState('');
  const [error, setError] = useState('');

  // Fetch agents list for admins
  useEffect(() => {
    const fetchAgents = async () => {
      if (isAdmin) {
        try {
          const response = await api.get<{ users: User[] }>('/users');
          setAgents(response.data.users || []);
        } catch (err) {
          console.error('Failed to fetch agents:', err);
        }
      }
    };
    fetchAgents();
  }, [isAdmin]);

  // Set default agent for non-admins
  useEffect(() => {
    if (!isAdmin && user?.id) {
      setSelectedAgent(user.id);
    }
  }, [isAdmin, user]);

  const fetchAgentActivity = async () => {
    if (!selectedAgent) {
      toast.warning('Please select an agent');
      return;
    }

    setLoading(true);
    setError('');
    setActivityData(null);
    setAiSummary('');

    try {
      const data = await dashboardService.getAgentActivity(selectedAgent, selectedDate);
      setActivityData(data);
    } catch (err: unknown) {
      console.error('Failed to fetch agent activity:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch agent activity';
      setError(errorMessage);
      toast.error('Failed to fetch agent activity');
    } finally {
      setLoading(false);
    }
  };

  const generateAISummary = async () => {
    if (!activityData) return;

    setGeneratingAI(true);
    try {
      const { summary, lead_details, agent_name, date } = activityData;

      const prompt = `You are a CRM analytics assistant for Tulip Healthcare (a maternity care program). Generate a concise daily performance summary for the agent.

Agent: ${agent_name}
Date: ${date}

Activity Metrics:
- Total Leads Assigned: ${summary.total_leads_assigned}
- Calls Made Today: ${summary.calls_made_today}
- Follow-ups Due Today: ${summary.followups_due_today}
- Overdue Follow-ups: ${summary.followups_overdue}
- Status Changes Made: ${summary.status_changes_today}
- Comments Added: ${summary.comments_added_today}
- Reassignments Requested: ${summary.reassignments_made}

${lead_details.calls_made.length > 0 ? `Calls Details:\n${lead_details.calls_made.map(c => `- ${c.name}: ${c.summary || 'No summary'}`).join('\n')}` : ''}

${lead_details.followups_overdue.length > 0 ? `Overdue Follow-ups:\n${lead_details.followups_overdue.map(f => `- ${f.name}: ${f.days_overdue} days overdue`).join('\n')}` : ''}

Generate a brief (3-5 bullet points) professional summary including:
1. Daily performance overview
2. Key activities completed
3. Areas needing attention (especially overdue follow-ups)
4. Recommendations for tomorrow`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const data = await response.json();
      const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate summary.';
      setAiSummary(generatedText);
    } catch (err) {
      console.error('Failed to generate AI summary:', err);
      toast.error('Failed to generate AI summary');
    } finally {
      setGeneratingAI(false);
    }
  };

  const saveSummary = async () => {
    if (!activityData || !aiSummary) {
      toast.warning('Please generate a summary first');
      return;
    }

    setSaving(true);
    try {
      await dashboardService.saveSummary({
        summary_type: 'daily',
        content: aiSummary,
        agent_id: activityData.agent_id,
        agent_name: activityData.agent_name,
        summary_date: activityData.date,
        total_leads: activityData.summary.total_leads_assigned,
        activity_metrics: activityData.summary,
        lead_details: activityData.lead_details,
      });
      toast.success('Summary saved successfully!');
    } catch (err) {
      console.error('Failed to save summary:', err);
      toast.error('Failed to save summary');
    } finally {
      setSaving(false);
    }
  };

  const handleLeadClick = (leadId: string) => {
    navigate(`/tulip/leads/${leadId}`);
  };

  const renderMetricCard = (label: string, value: number, icon: React.ReactNode, color: string) => (
    <Paper
      sx={{
        p: 2,
        textAlign: 'center',
        borderLeft: `4px solid ${color}`,
        minHeight: 90,
      }}
    >
      <Box sx={{ color, mb: 0.5 }}>{icon}</Box>
      <Typography variant="h4" sx={{ fontWeight: 700, color }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );

  const renderLeadLink = (leadId: string, name: string) => (
    <Box
      component="span"
      onClick={() => handleLeadClick(leadId)}
      sx={{
        color: 'primary.main',
        cursor: 'pointer',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      {name || leadId}
    </Box>
  );

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Agent Daily Activity Summary
      </Typography>

      {/* Controls */}
      <Grid container spacing={2} alignItems="center" sx={{ mb: 3 }}>
        {isAdmin && (
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              select
              label="Select Agent"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              {agents.map((agent) => (
                <MenuItem key={agent.id} value={agent.id}>
                  {agent.full_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}

        <Grid item xs={12} sm={isAdmin ? 3 : 4}>
          <TextField
            fullWidth
            size="small"
            type="date"
            label="Date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>

        <Grid item xs={12} sm={isAdmin ? 3 : 4}>
          <Button
            variant="contained"
            onClick={fetchAgentActivity}
            disabled={loading || !selectedAgent}
            startIcon={loading ? <CircularProgress size={16} /> : <EventIcon />}
            fullWidth
          >
            {loading ? 'Loading...' : 'Get Activity'}
          </Button>
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Activity Data Display */}
      {activityData && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {activityData.agent_name} - {format(new Date(activityData.date), 'dd MMM yyyy')}
            </Typography>
          </Box>

          {/* Metric Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3} md={2}>
              {renderMetricCard('Leads Assigned', activityData.summary.total_leads_assigned, <PeopleIcon />, '#1976d2')}
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              {renderMetricCard('Calls Made', activityData.summary.calls_made_today, <PhoneIcon />, '#2e7d32')}
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              {renderMetricCard('Due Today', activityData.summary.followups_due_today, <EventIcon />, '#ed6c02')}
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              {renderMetricCard('Overdue', activityData.summary.followups_overdue, <WarningIcon />, '#d32f2f')}
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              {renderMetricCard('Status Changes', activityData.summary.status_changes_today, <UpdateIcon />, '#9c27b0')}
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              {renderMetricCard('Comments', activityData.summary.comments_added_today, <CommentIcon />, '#0288d1')}
            </Grid>
          </Grid>

          {/* Expandable Sections */}
          <Box sx={{ mb: 3 }}>
            {/* Calls Made */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PhoneIcon color="success" fontSize="small" />
                  <Typography>Calls Made Today ({activityData.lead_details.calls_made.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {activityData.lead_details.calls_made.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lead</TableCell>
                          <TableCell>Call #</TableCell>
                          <TableCell>Time</TableCell>
                          <TableCell>Summary</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {activityData.lead_details.calls_made.map((call, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{renderLeadLink(call.lead_id, call.name)}</TableCell>
                            <TableCell>{call.call_number}</TableCell>
                            <TableCell>{call.call_time}</TableCell>
                            <TableCell>{call.summary || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">No calls made today</Typography>
                )}
              </AccordionDetails>
            </Accordion>

            {/* Follow-ups Due */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EventIcon color="warning" fontSize="small" />
                  <Typography>Follow-ups Due Today ({activityData.lead_details.followups_due.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {activityData.lead_details.followups_due.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lead</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Follow-up Time</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {activityData.lead_details.followups_due.map((fu, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{renderLeadLink(fu.lead_id, fu.name)}</TableCell>
                            <TableCell>
                              <Chip label={fu.status} size="small" />
                            </TableCell>
                            <TableCell>{fu.follow_up_date}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">No follow-ups due today</Typography>
                )}
              </AccordionDetails>
            </Accordion>

            {/* Overdue Follow-ups */}
            <Accordion defaultExpanded={activityData.lead_details.followups_overdue.length > 0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningIcon color="error" fontSize="small" />
                  <Typography>
                    Overdue Follow-ups ({activityData.lead_details.followups_overdue.length})
                    {activityData.lead_details.followups_overdue.length > 0 && (
                      <Chip label="Action Required" color="error" size="small" sx={{ ml: 1 }} />
                    )}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {activityData.lead_details.followups_overdue.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lead</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Due Date</TableCell>
                          <TableCell>Days Overdue</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {activityData.lead_details.followups_overdue.map((fu, idx) => (
                          <TableRow key={idx} sx={{ bgcolor: '#fff3e0' }}>
                            <TableCell>{renderLeadLink(fu.lead_id, fu.name)}</TableCell>
                            <TableCell>
                              <Chip label={fu.status} size="small" />
                            </TableCell>
                            <TableCell>{fu.follow_up_date}</TableCell>
                            <TableCell>
                              <Chip
                                label={`${fu.days_overdue} days`}
                                color="error"
                                size="small"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="success.main">No overdue follow-ups</Typography>
                )}
              </AccordionDetails>
            </Accordion>

            {/* Status Changes */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <UpdateIcon color="secondary" fontSize="small" />
                  <Typography>Status Changes ({activityData.lead_details.status_changes.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {activityData.lead_details.status_changes.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lead</TableCell>
                          <TableCell>From</TableCell>
                          <TableCell>To</TableCell>
                          <TableCell>Time</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {activityData.lead_details.status_changes.map((sc, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{renderLeadLink(sc.lead_id, sc.name)}</TableCell>
                            <TableCell>
                              <Chip label={sc.old_status} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Chip label={sc.new_status} size="small" color="primary" />
                            </TableCell>
                            <TableCell>{sc.changed_at}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">No status changes today</Typography>
                )}
              </AccordionDetails>
            </Accordion>

            {/* Comments Added */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CommentIcon color="info" fontSize="small" />
                  <Typography>Comments Added ({activityData.lead_details.comments_added.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {activityData.lead_details.comments_added.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lead</TableCell>
                          <TableCell>Comment</TableCell>
                          <TableCell>Time</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {activityData.lead_details.comments_added.map((c, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{renderLeadLink(c.lead_id, c.name)}</TableCell>
                            <TableCell>{c.comment_preview}</TableCell>
                            <TableCell>{c.added_at}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">No comments added today</Typography>
                )}
              </AccordionDetails>
            </Accordion>

            {/* Reassignments */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SwapHorizIcon color="action" fontSize="small" />
                  <Typography>Reassignments ({activityData.lead_details.reassignments.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {activityData.lead_details.reassignments.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lead</TableCell>
                          <TableCell>Reassigned To</TableCell>
                          <TableCell>Time</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {activityData.lead_details.reassignments.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{renderLeadLink(r.lead_id, r.name)}</TableCell>
                            <TableCell>{r.reassigned_to}</TableCell>
                            <TableCell>{r.reassigned_at}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">No reassignments today</Typography>
                )}
              </AccordionDetails>
            </Accordion>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* AI Summary Section */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AutoAwesomeIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              AI Summary
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              variant="outlined"
              onClick={generateAISummary}
              disabled={generatingAI}
              startIcon={generatingAI ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
            >
              {generatingAI ? 'Generating...' : 'Generate AI Summary'}
            </Button>
            {aiSummary && (
              <Button
                variant="contained"
                onClick={saveSummary}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              >
                {saving ? 'Saving...' : 'Save Summary'}
              </Button>
            )}
          </Box>

          {aiSummary && (
            <Box
              sx={{
                p: 2,
                bgcolor: '#e3f2fd',
                borderRadius: 2,
                border: '1px solid #90caf9',
              }}
            >
              <Box
                component="div"
                sx={{
                  lineHeight: 1.8,
                  fontSize: '0.875rem',
                  '& strong': { fontWeight: 700 },
                }}
                dangerouslySetInnerHTML={{
                  __html: aiSummary
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br />')
                }}
              />
            </Box>
          )}
        </>
      )}

      {!loading && !activityData && !error && (
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
          <EventIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
          <Typography variant="body1">Select a date and click "Get Activity"</Typography>
          <Typography variant="body2">
            to view daily activity summary
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
