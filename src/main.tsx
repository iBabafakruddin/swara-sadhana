import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createAppServices } from '@/app/container';
import { ServicesProvider } from '@/app/ServicesProvider';
import '@/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider services={createAppServices()}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
