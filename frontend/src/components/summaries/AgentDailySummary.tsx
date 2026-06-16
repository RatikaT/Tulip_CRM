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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Collapse,
  IconButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EventIcon from '@mui/icons-material/Event';
import EditIcon from '@mui/icons-material/Edit';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PeopleIcon from '@mui/icons-material/People';
import SchoolIcon from '@mui/icons-material/School';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveIcon from '@mui/icons-material/Save';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { dashboardService } from '../../services/dashboardService';
import api from '../../services/api';
import {
  AgentActivityResponse,
  LeadActionDetail,
  EnrollmentActionDetail,
} from '../../types/summary.types';
import { brandColors } from '../../theme';

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

  // Section collapse states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    leads: true,
    enrollments: true,
    followups: true,
    leadActions: true,
    enrollmentActions: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

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
      // Ensure data has the expected structure with defaults
      const normalizedData: AgentActivityResponse = {
        agent_id: data.agent_id || '',
        agent_name: data.agent_name || '',
        date: data.date || selectedDate,
        leads_assignment: data.leads_assignment || {
          new_leads: [],
          reassigned_to_agent: [],
          reassigned_from_agent: [],
        },
        enrollments_assignment: data.enrollments_assignment || {
          new_enrollments: [],
          reassigned_to_agent: [],
          reassigned_from_agent: [],
        },
        followups: data.followups || {
          leads: [],
          enrollments: [],
        },
        lead_actions: data.lead_actions || {
          total_actions: 0,
          by_type: { status_changes: 0, comments_added: 0, calls_logged: 0, field_updates: 0 },
          details: [],
        },
        enrollment_actions: data.enrollment_actions || {
          total_actions: 0,
          by_type: { status_changes: 0, follow_ups_added: 0, field_updates: 0 },
          details: [],
        },
        summary: data.summary || {
          total_leads_with_agent: 0,
          total_enrollments_with_agent: 0,
          total_leads_worked: 0,
          total_enrollments_worked: 0,
          new_leads_assigned: 0,
          leads_reassigned_in: 0,
          leads_reassigned_out: 0,
          new_enrollments_assigned: 0,
          enrollments_reassigned_in: 0,
          enrollments_reassigned_out: 0,
          total_lead_actions: 0,
          total_enrollment_actions: 0,
          followups_due_leads: 0,
          followups_due_enrollments: 0,
        },
      };
      setActivityData(normalizedData);
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
      const { summary, agent_name, date, lead_actions, enrollment_actions } = activityData;

      const prompt = `You are a CRM analytics assistant for Tulip Healthcare (a maternity care program). Generate a concise daily performance summary for the agent.

Agent: ${agent_name}
Date: ${date}

Activity Metrics:
- Leads Worked: ${summary.total_leads_worked}
- Enrollments Worked: ${summary.total_enrollments_worked}
- New Leads Assigned: ${summary.new_leads_assigned}
- Leads Reassigned In: ${summary.leads_reassigned_in}
- Leads Reassigned Out: ${summary.leads_reassigned_out}
- New Enrollments: ${summary.new_enrollments_assigned}
- Total Lead Actions: ${summary.total_lead_actions}
- Total Enrollment Actions: ${summary.total_enrollment_actions}
- Follow-ups Due (Leads): ${summary.followups_due_leads}
- Follow-ups Due (Enrollments): ${summary.followups_due_enrollments}

Lead Action Breakdown:
- Status Changes: ${lead_actions.by_type.status_changes}
- Comments Added: ${lead_actions.by_type.comments_added}
- Calls Logged: ${lead_actions.by_type.calls_logged}
- Field Updates: ${lead_actions.by_type.field_updates}

Enrollment Action Breakdown:
- Status Changes: ${enrollment_actions.by_type.status_changes}
- Follow-ups Added: ${enrollment_actions.by_type.follow_ups_added}
- Field Updates: ${enrollment_actions.by_type.field_updates}

Generate a brief (3-5 bullet points) professional summary including:
1. Daily performance overview
2. Key activities completed
3. Areas needing attention
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
        total_leads: activityData.summary.total_leads_worked,
        activity_metrics: {
          total_leads_assigned: activityData.summary.new_leads_assigned,
          calls_made_today: activityData.lead_actions.by_type.calls_logged,
          followups_due_today: activityData.summary.followups_due_leads,
          followups_overdue: 0,
          status_changes_today: activityData.lead_actions.by_type.status_changes,
          comments_added_today: activityData.lead_actions.by_type.comments_added,
          reassignments_made: activityData.summary.leads_reassigned_out,
        },
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

  const handleEnrollmentClick = (enrollmentId: string) => {
    navigate(`/tulip/enrollments/${enrollmentId}`);
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '-';
    try {
      return format(parseISO(timestamp), 'HH:mm');
    } catch {
      return timestamp;
    }
  };


  // Stat Card Component
  const StatCard = ({
    label,
    value,
    icon,
    color,
  }: {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string;
  }) => (
    <Card
      elevation={0}
      sx={{
        borderTop: `3px solid ${color}`,
        height: '100%',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        borderTopColor: color,
        boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 12px 24px rgba(16,24,40,0.10)',
        },
      }}
    >
      <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color }}>
            {value ?? 0}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          {label}
        </Typography>
      </CardContent>
    </Card>
  );

  // Clickable link components
  const LeadLink = ({ leadId, name }: { leadId: string; name: string }) => (
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

  const EnrollmentLink = ({ enrollmentId, name }: { enrollmentId: string; name: string }) => (
    <Box
      component="span"
      onClick={() => handleEnrollmentClick(enrollmentId)}
      sx={{
        color: 'secondary.main',
        cursor: 'pointer',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      {name || enrollmentId}
    </Box>
  );

  // Section Card Component
  const SectionCard = ({
    title,
    icon,
    count,
    sectionKey,
    color,
    children,
  }: {
    title: string;
    icon: React.ReactNode;
    count: number;
    sectionKey: string;
    color: string;
    children: React.ReactNode;
  }) => (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
        overflow: 'hidden',
      }}
    >
      <CardHeader
        sx={{
          py: 1,
          px: 1.5,
          bgcolor: `${color}10`,
          cursor: 'pointer',
          '&:hover': { bgcolor: `${color}20` },
        }}
        onClick={() => toggleSection(sectionKey)}
        avatar={<Box sx={{ color, display: 'flex' }}>{icon}</Box>}
        title={
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {title} ({count})
          </Typography>
        }
        action={
          <IconButton size="small">
            {expandedSections[sectionKey] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        }
      />
      <Collapse in={expandedSections[sectionKey]}>
        <CardContent sx={{ p: 1.5, pt: 1, flexGrow: 1, overflow: 'auto', maxHeight: 300 }}>
          {children}
        </CardContent>
      </Collapse>
    </Card>
  );

  // Format changes array into readable string
  const formatChanges = (changes: { field: string; old_value?: string | number | boolean | null; new_value?: string | number | boolean | null }[]) => {
    if (!changes || changes.length === 0) return 'updated';

    const changeDescriptions = changes.map(change => {
      const field = change.field?.toLowerCase().replace(/_/g, ' ') || 'field';

      // Special handling for common fields
      if (field === 'lead' && change.new_value === 'created') return 'lead created';
      if (field === 'status') return `status → ${change.new_value || 'updated'}`;
      if (field === 'comments') return 'comment added';
      if (field.includes('call')) return 'call logged';
      if (field === 'assigned to' || field === 'reassign to') return `reassigned`;
      if (field === 'doctor name') return 'doctor updated';
      if (field === 'doctor speciality') return 'doctor speciality added';
      if (field === 'follow up date' || field === 'next follow up date') return 'follow-up scheduled';
      if (field === 'connect status') return `connect status → ${change.new_value || 'updated'}`;
      if (field === 'action taken') return `action → ${change.new_value || 'updated'}`;

      // Generic format: field updated/added
      if (change.old_value === null || change.old_value === undefined || change.old_value === '') {
        return `${field} added`;
      }
      return `${field} updated`;
    });

    // Remove duplicates and join
    const unique = [...new Set(changeDescriptions)];
    return unique.join(', ');
  };

  // Shared header cell style for action tables (navy tint)
  const headCellSx = {
    py: 0.75,
    backgroundColor: `${brandColors.navyBlue}0D`,
    color: brandColors.navyBlue,
    fontWeight: 700,
    fontSize: '0.68rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${brandColors.navyBlue}26`,
  };

  const bodyRowSx = {
    '& td': { borderBottom: '1px solid #eef1f5' },
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2.5,
      '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(30,64,136,0.12)' },
    },
  };

  // Render action details table
  const renderLeadActionsTable = (actions: LeadActionDetail[]) => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...headCellSx, width: 50 }}>Time</TableCell>
            <TableCell sx={{ ...headCellSx, width: 100 }}>Lead</TableCell>
            <TableCell sx={headCellSx}>Changes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {actions.slice(0, 15).map((action, idx) => (
            <TableRow key={idx} hover sx={bodyRowSx}>
              <TableCell sx={{ py: 0.5, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                {formatTimestamp(action.timestamp)}
              </TableCell>
              <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>
                <LeadLink leadId={action.lead_id} name={action.lead_name} />
              </TableCell>
              <TableCell sx={{ py: 0.5, fontSize: '0.7rem', color: 'text.secondary' }}>
                {formatChanges(action.changes)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {actions.length > 15 && (
        <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
          +{actions.length - 15} more actions
        </Typography>
      )}
    </TableContainer>
  );

  const renderEnrollmentActionsTable = (actions: EnrollmentActionDetail[]) => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...headCellSx, width: 50 }}>Time</TableCell>
            <TableCell sx={{ ...headCellSx, width: 100 }}>Enrollment</TableCell>
            <TableCell sx={headCellSx}>Changes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {actions.slice(0, 15).map((action, idx) => (
            <TableRow key={idx} hover sx={bodyRowSx}>
              <TableCell sx={{ py: 0.5, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                {formatTimestamp(action.timestamp)}
              </TableCell>
              <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>
                <EnrollmentLink enrollmentId={action.enrollment_id} name={action.enrollment_name} />
              </TableCell>
              <TableCell sx={{ py: 0.5, fontSize: '0.7rem', color: 'text.secondary' }}>
                {formatChanges(action.changes)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {actions.length > 15 && (
        <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
          +{actions.length - 15} more actions
        </Typography>
      )}
    </TableContainer>
  );

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        Agent Daily Activity Summary
      </Typography>

      {/* Controls */}
      <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
        {isAdmin && (
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              select
              label="Select Agent"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              sx={inputSx}
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
            sx={inputSx}
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
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {activityData.agent_name} - {format(new Date(activityData.date), 'dd MMM yyyy')}
            </Typography>
          </Box>

          {/* Summary Stat Cards - Portfolio + Daily Activity */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Portfolio (Total Assigned)
          </Typography>
          <Grid container spacing={1} sx={{ mb: 1.5 }}>
            <Grid item xs={6} sm={3}>
              <StatCard
                label="Total Leads"
                value={activityData.summary.total_leads_with_agent ?? 0}
                icon={<PeopleIcon sx={{ fontSize: 18 }} />}
                color="#1976d2"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                label="Total Enrollments"
                value={activityData.summary.total_enrollments_with_agent ?? 0}
                icon={<SchoolIcon sx={{ fontSize: 18 }} />}
                color="#9c27b0"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                label="New Leads Today"
                value={
                  (activityData.summary.new_leads_assigned || 0) +
                  (activityData.summary.leads_reassigned_in || 0)
                }
                icon={<PersonAddIcon sx={{ fontSize: 18 }} />}
                color="#2e7d32"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                label="New Enr. Today"
                value={
                  (activityData.summary.new_enrollments_assigned || 0) +
                  (activityData.summary.enrollments_reassigned_in || 0)
                }
                icon={<FiberNewIcon sx={{ fontSize: 18 }} />}
                color="#ed6c02"
              />
            </Grid>
          </Grid>

          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Activity on {format(new Date(activityData.date), 'dd MMM')}
          </Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            <Grid item xs={4} sm={2.4}>
              <StatCard
                label="Leads Worked"
                value={activityData.summary.total_leads_worked}
                icon={<PeopleIcon sx={{ fontSize: 18 }} />}
                color="#1976d2"
              />
            </Grid>
            <Grid item xs={4} sm={2.4}>
              <StatCard
                label="Enr. Worked"
                value={activityData.summary.total_enrollments_worked}
                icon={<SchoolIcon sx={{ fontSize: 18 }} />}
                color="#9c27b0"
              />
            </Grid>
            <Grid item xs={4} sm={2.4}>
              <StatCard
                label="Lead Actions"
                value={activityData.summary.total_lead_actions}
                icon={<EditIcon sx={{ fontSize: 18 }} />}
                color="#2e7d32"
              />
            </Grid>
            <Grid item xs={6} sm={2.4}>
              <StatCard
                label="Enr. Actions"
                value={activityData.summary.total_enrollment_actions}
                icon={<AssignmentIcon sx={{ fontSize: 18 }} />}
                color="#ed6c02"
              />
            </Grid>
            <Grid item xs={6} sm={2.4}>
              <StatCard
                label="Follow-ups"
                value={
                  (activityData.summary.followups_due_leads || 0) +
                  (activityData.summary.followups_due_enrollments || 0)
                }
                icon={<EventIcon sx={{ fontSize: 18 }} />}
                color="#d32f2f"
              />
            </Grid>
          </Grid>

          {/* Main Content Grid - 2x3 Layout */}
          <Grid container spacing={1.5}>
            {/* Row 1: Leads Assigned | Enrollments Assigned | Follow-ups Due */}
            <Grid item xs={12} md={4}>
              <SectionCard
                title="Leads Assigned"
                icon={<PersonAddIcon sx={{ fontSize: 18 }} />}
                count={
                  activityData.leads_assignment.new_leads.length +
                  activityData.leads_assignment.reassigned_to_agent.length +
                  activityData.leads_assignment.reassigned_from_agent.length
                }
                sectionKey="leads"
                color="#1976d2"
              >
                {/* New Leads */}
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <FiberNewIcon color="success" sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      New ({activityData.leads_assignment.new_leads.length})
                    </Typography>
                  </Box>
                  {activityData.leads_assignment.new_leads.length > 0 ? (
                    activityData.leads_assignment.new_leads.slice(0, 5).map((lead) => (
                      <Box key={lead.lead_id} sx={{ py: 0.25 }}>
                        <LeadLink leadId={lead.lead_id} name={lead.name} />
                        <Chip label={lead.status} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }} />
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* Reassigned In */}
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <ArrowForwardIcon color="info" sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Reassigned In ({activityData.leads_assignment.reassigned_to_agent.length})
                    </Typography>
                  </Box>
                  {activityData.leads_assignment.reassigned_to_agent.length > 0 ? (
                    activityData.leads_assignment.reassigned_to_agent.slice(0, 5).map((lead, idx) => (
                      <Box key={`${lead.lead_id}-${idx}`} sx={{ py: 0.25 }}>
                        <LeadLink leadId={lead.lead_id} name={lead.name || lead.lead_id} />
                        <Chip label={lead.status || 'N/A'} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }} />
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* Reassigned Out */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <ArrowBackIcon color="warning" sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Reassigned Out ({activityData.leads_assignment.reassigned_from_agent.length})
                    </Typography>
                  </Box>
                  {activityData.leads_assignment.reassigned_from_agent.length > 0 ? (
                    activityData.leads_assignment.reassigned_from_agent.slice(0, 5).map((lead, idx) => (
                      <Box key={`${lead.lead_id}-${idx}`} sx={{ py: 0.25 }}>
                        <LeadLink leadId={lead.lead_id} name={lead.name || lead.lead_id} />
                        <Chip label={lead.status || 'N/A'} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }} />
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>
              </SectionCard>
            </Grid>

            <Grid item xs={12} md={4}>
              <SectionCard
                title="Enrollments Assigned"
                icon={<SchoolIcon sx={{ fontSize: 18 }} />}
                count={
                  activityData.enrollments_assignment.new_enrollments.length +
                  activityData.enrollments_assignment.reassigned_to_agent.length +
                  activityData.enrollments_assignment.reassigned_from_agent.length
                }
                sectionKey="enrollments"
                color="#9c27b0"
              >
                {/* New Enrollments */}
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <FiberNewIcon color="success" sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      New ({activityData.enrollments_assignment.new_enrollments.length})
                    </Typography>
                  </Box>
                  {activityData.enrollments_assignment.new_enrollments.length > 0 ? (
                    activityData.enrollments_assignment.new_enrollments.slice(0, 5).map((enr) => (
                      <Box key={enr.enrollment_id} sx={{ py: 0.25 }}>
                        <EnrollmentLink enrollmentId={enr.enrollment_id} name={enr.name} />
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* Reassigned In (SPOC changed to this agent) */}
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <ArrowForwardIcon color="info" sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Reassigned In ({activityData.enrollments_assignment.reassigned_to_agent.length})
                    </Typography>
                  </Box>
                  {activityData.enrollments_assignment.reassigned_to_agent.length > 0 ? (
                    activityData.enrollments_assignment.reassigned_to_agent.slice(0, 5).map((enr, idx) => (
                      <Box key={`${enr.enrollment_id}-${idx}`} sx={{ py: 0.25 }}>
                        <EnrollmentLink enrollmentId={enr.enrollment_id} name={enr.name || enr.enrollment_id} />
                        {enr.connect_status && (
                          <Chip label={enr.connect_status} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }} />
                        )}
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* Reassigned Out (SPOC changed from this agent) */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <ArrowBackIcon color="warning" sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Reassigned Out ({activityData.enrollments_assignment.reassigned_from_agent.length})
                    </Typography>
                  </Box>
                  {activityData.enrollments_assignment.reassigned_from_agent.length > 0 ? (
                    activityData.enrollments_assignment.reassigned_from_agent.slice(0, 5).map((enr, idx) => (
                      <Box key={`${enr.enrollment_id}-${idx}`} sx={{ py: 0.25 }}>
                        <EnrollmentLink enrollmentId={enr.enrollment_id} name={enr.name || enr.enrollment_id} />
                        {enr.connect_status && (
                          <Chip label={enr.connect_status} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }} />
                        )}
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>
              </SectionCard>
            </Grid>

            <Grid item xs={12} md={4}>
              <SectionCard
                title="Follow-ups Due"
                icon={<EventIcon sx={{ fontSize: 18 }} />}
                count={activityData.followups.leads.length + activityData.followups.enrollments.length}
                sectionKey="followups"
                color="#d32f2f"
              >
                {/* Lead Follow-ups */}
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                    Leads ({activityData.followups.leads.length})
                  </Typography>
                  {activityData.followups.leads.length > 0 ? (
                    activityData.followups.leads.slice(0, 5).map((fu) => (
                      <Box key={fu.lead_id} sx={{ py: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LeadLink leadId={fu.lead_id} name={fu.name} />
                        {fu.is_overdue && <Chip label="Overdue" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem' }} />}
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* Enrollment Follow-ups */}
                <Box>
                  <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                    Enrollments ({activityData.followups.enrollments.length})
                  </Typography>
                  {activityData.followups.enrollments.length > 0 ? (
                    activityData.followups.enrollments.slice(0, 5).map((fu) => (
                      <Box key={fu.enrollment_id} sx={{ py: 0.25 }}>
                        <EnrollmentLink enrollmentId={fu.enrollment_id} name={fu.name} />
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>
              </SectionCard>
            </Grid>

            {/* Row 2: Lead Actions | Enrollment Actions */}
            <Grid item xs={12} md={6}>
              <SectionCard
                title="Lead Actions"
                icon={<EditIcon sx={{ fontSize: 18 }} />}
                count={activityData.lead_actions.total_actions}
                sectionKey="leadActions"
                color="#2e7d32"
              >
                {/* Action type chips */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {Object.entries(activityData.lead_actions.by_type).map(([key, value]) => (
                    <Chip
                      key={key}
                      label={`${key.replace(/_/g, ' ')}: ${value}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem', textTransform: 'capitalize' }}
                    />
                  ))}
                </Box>

                {activityData.lead_actions.details.length > 0 ? (
                  renderLeadActionsTable(activityData.lead_actions.details)
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No actions recorded
                  </Typography>
                )}
              </SectionCard>
            </Grid>

            <Grid item xs={12} md={6}>
              <SectionCard
                title="Enrollment Actions"
                icon={<AssignmentIcon sx={{ fontSize: 18 }} />}
                count={activityData.enrollment_actions.total_actions}
                sectionKey="enrollmentActions"
                color="#ed6c02"
              >
                {/* Action type chips */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {Object.entries(activityData.enrollment_actions.by_type).map(([key, value]) => (
                    <Chip
                      key={key}
                      label={`${key.replace(/_/g, ' ')}: ${value}`}
                      size="small"
                      color="secondary"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem', textTransform: 'capitalize' }}
                    />
                  ))}
                </Box>

                {activityData.enrollment_actions.details.length > 0 ? (
                  renderEnrollmentActionsTable(activityData.enrollment_actions.details)
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No actions recorded
                  </Typography>
                )}
              </SectionCard>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* AI Summary Section */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <AutoAwesomeIcon color="primary" sx={{ fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              AI Summary
            </Typography>
            <Chip label="Disabled" size="small" color="default" sx={{ height: 18, fontSize: '0.65rem' }} />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={generateAISummary}
              disabled={true}
              startIcon={generatingAI ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
            >
              {generatingAI ? 'Generating...' : 'Generate AI Summary'}
            </Button>
            {aiSummary && (
              <Button
                variant="contained"
                size="small"
                onClick={saveSummary}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
              >
                {saving ? 'Saving...' : 'Save Summary'}
              </Button>
            )}
          </Box>

          {aiSummary && (
            <Box
              sx={{
                p: 1.5,
                bgcolor: 'rgba(30,64,136,0.05)',
                borderRadius: 2,
                border: '1px solid rgba(30,64,136,0.18)',
              }}
            >
              <Box
                component="div"
                sx={{
                  lineHeight: 1.6,
                  fontSize: '0.8rem',
                  '& strong': { fontWeight: 700 },
                }}
                dangerouslySetInnerHTML={{
                  __html: aiSummary
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br />'),
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
            py: 4,
            color: 'text.secondary',
          }}
        >
          <EventIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
          <Typography variant="body2">Select a date and click "Get Activity"</Typography>
        </Box>
      )}
    </Paper>
  );
}
