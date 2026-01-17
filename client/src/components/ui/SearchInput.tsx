import React from 'react';
import { IonSearchbar } from '@ionic/react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Rechercher...',
  debounceMs = 300,
}: Props) {
  const handleChange = (e: CustomEvent) => {
    onChange(e.detail.value || '');
  };

  return (
    <IonSearchbar
      value={value}
      onIonInput={handleChange}
      placeholder={placeholder}
      debounce={debounceMs}
      className="p-0"
    />
  );
}
