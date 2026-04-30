import { createFileRoute } from '@tanstack/react-router';
import { ChatPanel } from '@/features/chat/ChatPanel';

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});

function ChatPage() {
  return <ChatPanel />;
}
