import React from 'react';
import { IonIcon } from '@ionic/react';
import { folderOpenOutline } from 'ionicons/icons';

interface Props {
  message: string;
  icon?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ message, icon = folderOpenOutline, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <IonIcon icon={icon} className="text-6xl mb-4" />
      <p className="text-lg">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
