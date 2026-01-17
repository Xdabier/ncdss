import React from 'react';
import { IonAlert } from '@ionic/react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  confirmColor = 'danger',
  onConfirm,
  onCancel
}: Props) {
  return (
    <IonAlert
      isOpen={isOpen}
      header={title}
      message={message}
      buttons={[
        {
          text: cancelText,
          role: 'cancel',
          handler: onCancel
        },
        {
          text: confirmText,
          role: 'confirm',
          handler: onConfirm,
          cssClass: `text-${confirmColor}-600`
        }
      ]}
      onDidDismiss={onCancel}
    />
  );
}
