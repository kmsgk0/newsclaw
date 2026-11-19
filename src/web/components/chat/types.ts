import type { MaterialContext } from "../../types";

export interface ChatProps {
  context?: MaterialContext;
  conversationId?: string;
  initialSkillId?: string;
  onConversation?: (id: string) => void;
  onContextChange?: (context?: MaterialContext) => void;
  onArtifactSaved?: () => void;
  compact?: boolean;
  chooseMaterial?: boolean;
}
