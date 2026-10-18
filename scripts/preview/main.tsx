import { createRoot } from 'react-dom/client';
import '../../src/styles/tokens.css';
import FirstRunDashboard from '../../src/components/Dashboard/FirstRunDashboard';

createRoot(document.getElementById('root')!).render(
  <div style={{ background: '#0d1933', minHeight: '100vh', padding: 24 }}>
    <FirstRunDashboard
      companyId="c1"
      userId="u1"
      onAddProduct={() => {}}
      onImportSpreadsheet={() => {}}
      onOpenRow={() => {}}
    />
  </div>,
);
