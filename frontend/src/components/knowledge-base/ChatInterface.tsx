import { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  CircularProgress,
  Chip,
  Collapse,
  Divider,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { knowledgeBaseService } from '../../services/knowledgeBaseService';
import { SourceReference } from '../../types/knowledge-base.types';
import { brandColors } from '../../theme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
  timestamp: Date;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

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
      setLoading(false);
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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          bgcolor: brandColors.navyBlue,
          color: 'white',
        }}
      >
        <Typography variant="h6" fontWeight={500}>
          Knowledge Base Chat
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          Ask questions about the documents in the knowledge base
        </Typography>
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
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
              <SmartToyIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
              <Typography color="text.secondary">
                Ask a question to get started
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                I can help you find information from the knowledge base documents.
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
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                maxWidth: '85%',
                alignItems: 'flex-start',
              }}
            >
              {message.role === 'assistant' && (
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: brandColors.navyBlue,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <SmartToyIcon sx={{ fontSize: 18, color: 'white' }} />
                </Box>
              )}

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: message.role === 'user' ? brandColors.navyBlue : 'grey.100',
                  color: message.role === 'user' ? 'white' : 'text.primary',
                  borderRadius: 2,
                  borderTopLeftRadius: message.role === 'assistant' ? 0 : 2,
                  borderTopRightRadius: message.role === 'user' ? 0 : 2,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {message.content}
                </Typography>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Divider sx={{ my: 1 }} />
                    <Box
                      onClick={() => toggleSources(message.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        color: 'primary.main',
                      }}
                    >
                      <Typography variant="caption" fontWeight={500}>
                        {message.sources.length} source(s)
                      </Typography>
                      {expandedSources.has(message.id) ? (
                        <ExpandLessIcon fontSize="small" />
                      ) : (
                        <ExpandMoreIcon fontSize="small" />
                      )}
                    </Box>

                    <Collapse in={expandedSources.has(message.id)}>
                      <Box sx={{ mt: 1 }}>
                        {message.sources.map((source, idx) => (
                          <Box
                            key={idx}
                            sx={{
                              mt: 1,
                              p: 1.5,
                              bgcolor: 'background.paper',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Chip
                                label={source.document_name}
                                size="small"
                                variant="outlined"
                                color="primary"
                              />
                              {source.page_number && (
                                <Typography variant="caption" color="text.secondary">
                                  Page {source.page_number}
                                </Typography>
                              )}
                              <Typography variant="caption" color="text.secondary">
                                ({(source.relevance_score * 100).toFixed(0)}% match)
                              </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
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
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: brandColors.orange,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <PersonIcon sx={{ fontSize: 18, color: 'white' }} />
                </Box>
              )}
            </Box>
          </Box>
        ))}

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: brandColors.navyBlue,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SmartToyIcon sx={{ fontSize: 18, color: 'white' }} />
            </Box>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                bgcolor: 'grey.100',
                borderRadius: 2,
                borderTopLeftRadius: 0,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Searching knowledge base...
                </Typography>
              </Box>
            </Paper>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            placeholder="Ask a question about the documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
            size="small"
            multiline
            maxRows={3}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'background.paper',
              },
            }}
          />
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            sx={{
              bgcolor: brandColors.navyBlue,
              color: 'white',
              '&:hover': {
                bgcolor: brandColors.navyBlue,
                opacity: 0.9,
              },
              '&.Mui-disabled': {
                bgcolor: 'grey.300',
                color: 'grey.500',
              },
            }}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
