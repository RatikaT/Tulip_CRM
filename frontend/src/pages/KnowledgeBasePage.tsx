import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Collapse,
  alpha,
  Avatar,
  Badge,
  Fade,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PublishIcon from '@mui/icons-material/Publish';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddCommentIcon from '@mui/icons-material/AddComment';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';
import TableChartIcon from '@mui/icons-material/TableChart';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { toast } from 'react-toastify';
import { knowledgeBaseService } from '../services/knowledgeBaseService';
import {
  KnowledgeDocument,
  DocumentCategory,
  DocumentStatus,
  DOCUMENT_CATEGORIES,
  ChatSession,
  SourceReference,
} from '../types/knowledge-base.types';
import DocumentUploadDialog from '../components/knowledge-base/DocumentUploadDialog';
import DocumentEditDialog from '../components/knowledge-base/DocumentEditDialog';
import { brandColors } from '../theme';
import { useAuthStore } from '../stores/authStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
  timestamp: Date;
}

// Custom colors for the redesign
const colors = {
  primary: brandColors.navyBlue,
  primaryLight: alpha(brandColors.navyBlue, 0.08),
  primaryDark: brandColors.navyBlueDark,
  accent: brandColors.orange,
  accentLight: alpha(brandColors.orange, 0.1),
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceHover: '#f1f5f9',
  border: '#e2e8f0',
  textPrimary: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  error: '#ef4444',
  errorLight: '#fee2e2',
  pdf: '#dc2626',
  doc: '#2563eb',
  csv: '#059669',
};

export default function KnowledgeBasePage() {
  const { isAdmin } = useAuthStore();
  const isAdminUser = isAdmin();

  // Documents state
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat history state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Dialogs
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState('');

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await knowledgeBaseService.getDocuments({
        per_page: 100,
        category: categoryFilter || undefined,
        status: isAdminUser ? (statusFilter || undefined) : undefined,
        search: searchQuery || undefined,
      });
      setDocuments(response.documents);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, searchQuery, isAdminUser]);

  // Fetch chat sessions
  const fetchChatSessions = async () => {
    setSessionsLoading(true);
    try {
      const response = await knowledgeBaseService.getChatSessions();
      setChatSessions(response.sessions);
    } catch (error) {
      console.error('Failed to fetch chat sessions:', error);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchChatSessions();
  }, [fetchDocuments]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchDocuments();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Document handlers
  const handleDownload = async (doc: KnowledgeDocument) => {
    try {
      const blob = await knowledgeBaseService.downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Download started');
    } catch (error) {
      console.error('Failed to download:', error);
      toast.error('Failed to download document');
    }
  };

  const handleGenerateSummary = async (doc: KnowledgeDocument) => {
    setSelectedDocument(doc);
    setSummaryDialogOpen(true);
    setSummaryLoading(true);
    setSummary('');

    try {
      const response = await knowledgeBaseService.generateSummary(doc.id);
      setSummary(response.summary);
    } catch (error) {
      console.error('Failed to generate summary:', error);
      setSummary('Failed to generate summary. Please try again.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleToggleStatus = async (doc: KnowledgeDocument) => {
    const newStatus: DocumentStatus = doc.status === 'published' ? 'draft' : 'published';

    if (newStatus === 'published' && !doc.is_processed) {
      toast.error('Cannot publish: Document is still being processed');
      return;
    }

    try {
      await knowledgeBaseService.updateDocumentStatus(doc.id, newStatus);
      fetchDocuments();
      toast.success(`Document ${newStatus === 'published' ? 'published' : 'unpublished'}`);
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update document status');
    }
  };

  const handleDelete = async () => {
    if (!selectedDocument) return;

    try {
      await knowledgeBaseService.deleteDocument(selectedDocument.id);
      setDeleteDialogOpen(false);
      setSelectedDocument(null);
      fetchDocuments();
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast.error('Failed to delete document');
    }
  };

  const handleUploadSuccess = () => {
    setUploadDialogOpen(false);
    fetchDocuments();
    toast.success('Document uploaded successfully');
  };

  const handleEditSuccess = () => {
    setEditDialogOpen(false);
    setSelectedDocument(null);
    fetchDocuments();
    toast.success('Document updated successfully');
  };

  // Chat handlers
  const handleSend = async () => {
    const query = input.trim();
    if (!query || chatLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setChatLoading(true);

    try {
      const response = await knowledgeBaseService.chat(query, sessionId || undefined);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSessionId(response.session_id);
      fetchChatSessions();
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
  };

  const handleLoadSession = async (session: ChatSession) => {
    try {
      const sessionDetail = await knowledgeBaseService.getChatSession(session.id);
      const loadedMessages: Message[] = sessionDetail.messages.map((msg, idx) => ({
        id: `${msg.role}-${idx}-${Date.now()}`,
        role: msg.role,
        content: msg.content,
        sources: msg.sources,
        timestamp: new Date(msg.timestamp),
      }));
      setMessages(loadedMessages);
      setSessionId(session.id);
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error('Failed to load chat history');
    }
  };

  const toggleSources = (messageId: string) => {
    setExpandedSources((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  // Utility functions
  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return <PictureAsPdfIcon sx={{ color: colors.pdf }} />;
      case 'docx':
      case 'doc':
        return <ArticleIcon sx={{ color: colors.doc }} />;
      case 'csv':
        return <TableChartIcon sx={{ color: colors.csv }} />;
      default:
        return <DescriptionIcon sx={{ color: colors.textSecondary }} />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatSessionDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${timeStr}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${timeStr}`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
    }
  };

  return (
    <Box sx={{
      minHeight: 'calc(100vh - 100px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 2.5,
      bgcolor: colors.background,
      mx: -3,
      mt: -3,
      p: 3,
      pb: 4,
    }}>
      {/* Header Section */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: colors.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            Knowledge Base
          </Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>
            Access documents and chat with AI to find information
          </Typography>
        </Box>
        {isAdminUser && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{
              bgcolor: colors.primary,
              px: 3,
              py: 1.2,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: `0 4px 14px ${alpha(colors.primary, 0.4)}`,
              '&:hover': {
                bgcolor: colors.primaryDark,
                boxShadow: `0 6px 20px ${alpha(colors.primary, 0.5)}`,
              },
            }}
          >
            Upload Document
          </Button>
        )}
      </Box>

      {/* Documents Section */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: `1px solid ${colors.border}`,
          bgcolor: colors.surface,
        }}
      >
        {/* Filters Row */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <FolderOpenIcon sx={{ color: colors.primary, fontSize: 24 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: colors.textPrimary }}>
              Documents
            </Typography>
            <Chip
              label={documents.length}
              size="small"
              sx={{
                bgcolor: colors.primaryLight,
                color: colors.primary,
                fontWeight: 600,
                height: 24,
              }}
            />
          </Box>
          <Box sx={{ flex: 1 }} />
          <TextField
            size="small"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: colors.textMuted, fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              width: 280,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: colors.background,
                '&:hover': { bgcolor: colors.surfaceHover },
              },
            }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              label="Category"
              onChange={(e) => setCategoryFilter(e.target.value as DocumentCategory | '')}
              sx={{ borderRadius: 2, bgcolor: colors.background }}
            >
              <MenuItem value="">All Categories</MenuItem>
              {DOCUMENT_CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {isAdminUser && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | '')}
                sx={{ borderRadius: 2, bgcolor: colors.background }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="published">Published</MenuItem>
              </Select>
            </FormControl>
          )}
        </Box>

        {/* Documents List */}
        <Box sx={{ maxHeight: 240, overflowY: 'auto', pr: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} sx={{ color: colors.primary }} />
            </Box>
          ) : documents.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <FolderOpenIcon sx={{ fontSize: 56, color: colors.textMuted, mb: 2 }} />
              <Typography color="text.secondary" fontWeight={500}>No documents found</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {isAdminUser ? 'Upload your first document to get started' : 'No documents available'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {documents.map((doc, index) => (
                <Fade in key={doc.id} timeout={300} style={{ transitionDelay: `${index * 50}ms` }}>
                  <Box
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      borderRadius: 2,
                      border: `1px solid transparent`,
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: colors.surfaceHover,
                        border: `1px solid ${colors.border}`,
                        transform: 'translateX(4px)',
                      },
                    }}
                  >
                    {/* File Icon */}
                    <Avatar
                      sx={{
                        width: 44,
                        height: 44,
                        bgcolor: alpha(
                          doc.file_type === 'pdf' ? colors.pdf :
                          doc.file_type === 'docx' || doc.file_type === 'doc' ? colors.doc :
                          colors.csv, 0.1
                        ),
                        borderRadius: 2,
                      }}
                    >
                      {getFileIcon(doc.file_type)}
                    </Avatar>

                    {/* Document Info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body1"
                        fontWeight={600}
                        noWrap
                        sx={{ color: colors.textPrimary }}
                      >
                        {doc.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                        <Typography variant="caption" sx={{ color: colors.textMuted }}>
                          {doc.file_type.toUpperCase()}
                        </Typography>
                        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: colors.textMuted }} />
                        <Typography variant="caption" sx={{ color: colors.textMuted }}>
                          {formatFileSize(doc.file_size)}
                        </Typography>
                        {doc.page_count && (
                          <>
                            <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: colors.textMuted }} />
                            <Typography variant="caption" sx={{ color: colors.textMuted }}>
                              {doc.page_count} pages
                            </Typography>
                          </>
                        )}
                      </Box>
                    </Box>

                    {/* Category & Status */}
                    <Chip
                      label={doc.category}
                      size="small"
                      sx={{
                        bgcolor: colors.background,
                        color: colors.textSecondary,
                        fontWeight: 500,
                        fontSize: '0.75rem',
                      }}
                    />
                    {isAdminUser && (
                      <Chip
                        label={doc.status === 'published' ? 'Published' : 'Draft'}
                        size="small"
                        sx={{
                          bgcolor: doc.status === 'published' ? colors.successLight : colors.warningLight,
                          color: doc.status === 'published' ? colors.success : colors.warning,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                        }}
                      />
                    )}

                    {/* Actions */}
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {isAdminUser && (
                        <>
                          <Tooltip title={doc.status === 'published' ? 'Unpublish' : 'Publish'}>
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); handleToggleStatus(doc); }}
                              sx={{
                                color: doc.status === 'published' ? colors.warning : colors.success,
                                '&:hover': { bgcolor: doc.status === 'published' ? colors.warningLight : colors.successLight },
                              }}
                            >
                              {doc.status === 'published' ? <UnpublishedIcon fontSize="small" /> : <PublishIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); setSelectedDocument(doc); setEditDialogOpen(true); }}
                              sx={{ color: colors.primary, '&:hover': { bgcolor: colors.primaryLight } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip title="AI Summary">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleGenerateSummary(doc); }}
                          sx={{ color: colors.accent, '&:hover': { bgcolor: colors.accentLight } }}
                        >
                          <AutoAwesomeIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Download">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                          sx={{ color: colors.textSecondary, '&:hover': { bgcolor: colors.surfaceHover } }}
                        >
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {isAdminUser && (
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setSelectedDocument(doc); setDeleteDialogOpen(true); }}
                            sx={{ color: colors.error, '&:hover': { bgcolor: colors.errorLight } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Fade>
              ))}
            </Box>
          )}
        </Box>
      </Paper>

      {/* Chat Section */}
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          overflow: 'hidden',
          borderRadius: 3,
          border: `1px solid ${colors.border}`,
          bgcolor: colors.surface,
          height: 550,
        }}
      >
        {/* Chat History Sidebar */}
        <Box
          sx={{
            width: 300,
            minWidth: 300,
            borderRight: `1px solid ${colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: colors.background,
            overflow: 'hidden',
          }}
        >
          <Box sx={{
            p: 2,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: colors.surface,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <ChatBubbleOutlineIcon sx={{ color: colors.primary, fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ color: colors.textPrimary }}>
                Conversations
              </Typography>
            </Box>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddCommentIcon sx={{ fontSize: 16 }} />}
              onClick={handleNewChat}
              sx={{
                bgcolor: colors.primary,
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.75rem',
                px: 1.5,
                py: 0.5,
                boxShadow: 'none',
                '&:hover': { bgcolor: colors.primaryDark, boxShadow: 'none' },
              }}
            >
              New
            </Button>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {sessionsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} sx={{ color: colors.primary }} />
              </Box>
            ) : chatSessions.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: 48, color: colors.textMuted, mb: 2 }} />
                <Typography variant="body2" fontWeight={500} sx={{ color: colors.textSecondary }}>
                  No conversations yet
                </Typography>
                <Typography variant="caption" sx={{ color: colors.textMuted, display: 'block', mt: 0.5 }}>
                  Start asking questions about your documents
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {chatSessions.map((session) => (
                  <ListItem key={session.id} disablePadding>
                    <ListItemButton
                      selected={sessionId === session.id}
                      onClick={() => handleLoadSession(session)}
                      sx={{
                        py: 2,
                        px: 2,
                        borderBottom: `1px solid ${colors.border}`,
                        '&.Mui-selected': {
                          bgcolor: colors.surface,
                          borderLeft: `3px solid ${colors.primary}`,
                          '&:hover': { bgcolor: colors.surface },
                        },
                        '&:hover': { bgcolor: colors.surfaceHover },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Badge
                          badgeContent={session.message_count}
                          color="primary"
                          sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 18, minWidth: 18 } }}
                        >
                          <ChatBubbleOutlineIcon
                            sx={{
                              color: sessionId === session.id ? colors.primary : colors.textMuted,
                              fontSize: 22,
                            }}
                          />
                        </Badge>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={600} sx={{ color: colors.textPrimary }}>
                            Conversation
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" sx={{ color: colors.textMuted }}>
                            {formatSessionDate(session.updated_at)}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </Box>

        {/* Chat Window */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* Chat Header */}
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: `1px solid ${colors.border}`,
              bgcolor: colors.surface,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Avatar sx={{ bgcolor: colors.primary, width: 40, height: 40 }}>
              <SmartToyIcon sx={{ fontSize: 22 }} />
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ color: colors.textPrimary }}>
                Knowledge Assistant
              </Typography>
              <Typography variant="caption" sx={{ color: colors.textMuted }}>
                {sessionId ? 'Continuing conversation' : 'Ready to help'} • Powered by AI
              </Typography>
            </Box>
          </Box>

          {/* Messages Area */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              bgcolor: colors.background,
              minHeight: 0,
            }}
          >
            {messages.length === 0 && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  textAlign: 'center',
                }}
              >
                <Box>
                  <Avatar
                    sx={{
                      width: 72,
                      height: 72,
                      bgcolor: colors.primaryLight,
                      mx: 'auto',
                      mb: 2,
                    }}
                  >
                    <AutoAwesomeIcon sx={{ fontSize: 36, color: colors.primary }} />
                  </Avatar>
                  <Typography variant="h6" fontWeight={600} sx={{ color: colors.textPrimary }}>
                    How can I help you today?
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 1, maxWidth: 400 }}>
                    Ask questions about the uploaded documents. I'll search through the knowledge base and provide accurate answers.
                  </Typography>
                </Box>
              </Box>
            )}

            {messages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Typography variant="caption" sx={{ color: colors.textMuted, mb: 0.5, mx: 6 }}>
                  {formatTime(message.timestamp)}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1.5, maxWidth: '75%', alignItems: 'flex-end' }}>
                  {message.role === 'assistant' && (
                    <Avatar sx={{ width: 36, height: 36, bgcolor: colors.primary }}>
                      <SmartToyIcon sx={{ fontSize: 20 }} />
                    </Avatar>
                  )}

                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      bgcolor: message.role === 'user' ? colors.primary : colors.surface,
                      color: message.role === 'user' ? '#fff' : colors.textPrimary,
                      borderRadius: 3,
                      borderTopLeftRadius: message.role === 'assistant' ? 4 : 20,
                      borderTopRightRadius: message.role === 'user' ? 4 : 20,
                      border: message.role === 'assistant' ? `1px solid ${colors.border}` : 'none',
                      boxShadow: message.role === 'user'
                        ? `0 4px 12px ${alpha(colors.primary, 0.3)}`
                        : `0 2px 8px ${alpha('#000', 0.05)}`,
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {message.content}
                    </Typography>

                    {message.sources && message.sources.length > 0 && (
                      <Box sx={{ mt: 1.5 }}>
                        <Divider sx={{ my: 1.5, borderColor: colors.border }} />
                        <Box
                          onClick={() => toggleSources(message.id)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            color: colors.primary,
                            '&:hover': { opacity: 0.8 },
                          }}
                        >
                          <Typography variant="caption" fontWeight={600}>
                            {message.sources.length} source{message.sources.length > 1 ? 's' : ''} found
                          </Typography>
                          {expandedSources.has(message.id) ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                        </Box>

                        <Collapse in={expandedSources.has(message.id)}>
                          <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {message.sources.map((source, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  p: 1.5,
                                  bgcolor: colors.background,
                                  borderRadius: 2,
                                  border: `1px solid ${colors.border}`,
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                  <Chip
                                    label={source.document_name}
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.7rem',
                                      bgcolor: colors.primaryLight,
                                      color: colors.primary,
                                      fontWeight: 600,
                                    }}
                                  />
                                  <Chip
                                    label={`${(source.relevance_score * 100).toFixed(0)}% match`}
                                    size="small"
                                    sx={{
                                      height: 20,
                                      fontSize: '0.65rem',
                                      bgcolor: colors.successLight,
                                      color: colors.success,
                                    }}
                                  />
                                </Box>
                                <Typography variant="caption" sx={{ color: colors.textSecondary, lineHeight: 1.5 }}>
                                  {source.chunk_text}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Collapse>
                      </Box>
                    )}
                  </Paper>

                  {message.role === 'user' && (
                    <Avatar sx={{ width: 36, height: 36, bgcolor: colors.accent }}>
                      <PersonIcon sx={{ fontSize: 20 }} />
                    </Avatar>
                  )}
                </Box>
              </Box>
            ))}

            {chatLoading && (
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: colors.primary }}>
                  <SmartToyIcon sx={{ fontSize: 20 }} />
                </Avatar>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    bgcolor: colors.surface,
                    borderRadius: 3,
                    borderTopLeftRadius: 4,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CircularProgress size={16} sx={{ color: colors.primary }} />
                    <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                      Searching knowledge base...
                    </Typography>
                  </Box>
                </Paper>
              </Box>
            )}

            <div ref={messagesEndRef} />
          </Box>

          {/* Input Area */}
          <Box sx={{ p: 2, borderTop: `1px solid ${colors.border}`, bgcolor: colors.surface }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
              <TextField
                fullWidth
                placeholder="Ask a question about your documents..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={chatLoading}
                multiline
                maxRows={4}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    bgcolor: colors.background,
                    '&:hover': { bgcolor: colors.surfaceHover },
                    '&.Mui-focused': { bgcolor: colors.surface },
                  },
                }}
              />
              <IconButton
                onClick={handleSend}
                disabled={!input.trim() || chatLoading}
                sx={{
                  width: 48,
                  height: 48,
                  bgcolor: colors.primary,
                  color: '#fff',
                  borderRadius: 3,
                  boxShadow: `0 4px 12px ${alpha(colors.primary, 0.4)}`,
                  '&:hover': {
                    bgcolor: colors.primaryDark,
                    boxShadow: `0 6px 16px ${alpha(colors.primary, 0.5)}`,
                  },
                  '&.Mui-disabled': {
                    bgcolor: colors.border,
                    color: colors.textMuted,
                    boxShadow: 'none',
                  },
                }}
              >
                <SendIcon />
              </IconButton>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Dialogs */}
      <DocumentUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <DocumentEditDialog
        open={editDialogOpen}
        document={selectedDocument}
        onClose={() => { setEditDialogOpen(false); setSelectedDocument(null); }}
        onSuccess={handleEditSuccess}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Delete Document</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "<strong>{selectedDocument?.name}</strong>"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            sx={{
              bgcolor: colors.error,
              borderRadius: 2,
              '&:hover': { bgcolor: '#dc2626' },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={summaryDialogOpen}
        onClose={() => setSummaryDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AutoAwesomeIcon sx={{ color: colors.accent }} />
            <Typography variant="h6" fontWeight={600}>AI Summary</Typography>
          </Box>
          <IconButton onClick={() => setSummaryDialogOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {summaryLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
              <CircularProgress sx={{ color: colors.primary }} />
              <Typography sx={{ ml: 2, color: colors.textSecondary }}>Generating summary...</Typography>
            </Box>
          ) : (
            <Box>
              <Typography variant="subtitle2" sx={{ color: colors.textMuted, mb: 1 }}>
                {selectedDocument?.name}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: colors.textPrimary }}>
                {summary}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setSummaryDialogOpen(false)}
            variant="contained"
            sx={{ bgcolor: colors.primary, borderRadius: 2 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
