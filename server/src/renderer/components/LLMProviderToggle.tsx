import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import type { LLMProviderType, LLMProviderStatus } from '../electron.d';

interface Props {
  providerStatus: LLMProviderStatus | null;
  onSwitch: (type: LLMProviderType) => void;
  switching: boolean;
}

export function LLMProviderToggle({ providerStatus, onSwitch, switching }: Props) {
  if (!providerStatus) return null;

  const { activeType, localAvailable, claudeAvailable } = providerStatus;

  // Determine info/warning message
  let infoText: string | null = null;
  if (!localAvailable && activeType === 'claude') {
    infoText = 'Modele local non detecte — Claude API active';
  } else if (!claudeAvailable && !localAvailable) {
    infoText = 'Aucun fournisseur LLM disponible — fonctionnalites IA desactivees';
  } else if (!claudeAvailable) {
    infoText = 'ANTHROPIC_API_KEY non definie';
  }

  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-4 space-y-2">
        <div className="text-sm font-medium text-muted-foreground mb-2">Fournisseur LLM</div>
        <div className="flex gap-2">
          <Button
            variant={activeType === 'local' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            disabled={!localAvailable || switching}
            onClick={() => onSwitch('local')}
          >
            Local
          </Button>
          <Button
            variant={activeType === 'claude' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            disabled={!claudeAvailable || switching}
            onClick={() => onSwitch('claude')}
          >
            Claude API
          </Button>
        </div>
        {infoText && (
          <p className="text-xs text-muted-foreground mt-1">{infoText}</p>
        )}
      </CardContent>
    </Card>
  );
}
