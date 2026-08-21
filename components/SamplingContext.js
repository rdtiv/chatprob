import { createContext, useContext } from 'react';

const SamplingContext = createContext(null);

export function SamplingProvider({ value, children }) {
  return <SamplingContext.Provider value={value}>{children}</SamplingContext.Provider>;
}

export function useSampling() {
  const ctx = useContext(SamplingContext);
  if (!ctx) throw new Error('useSampling must be used inside SamplingProvider');
  return ctx;
}
