import React, { ReactNode } from 'react';
import { IonItem, IonLabel, IonNote } from '@ionic/react';

interface Props {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, error, required, children }: Props) {
  return (
    <IonItem className={error ? 'ion-invalid' : ''}>
      <IonLabel position="stacked">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </IonLabel>
      {children}
      {error && <IonNote slot="error">{error}</IonNote>}
    </IonItem>
  );
}
