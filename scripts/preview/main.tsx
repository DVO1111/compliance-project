import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/tokens.css';
import MainLayout from '../../src/components/Layout/MainLayout';
import FirstRunDashboard from '../../src/components/Dashboard/FirstRunDashboard';

//  The whole screen: ONB-08's content area inside the real sidebar and
//  top bar, which is the thing worth looking at. Only the session and
//  the database are stubbed.
createRoot(document.getElementById('root')!).render(
  <MainLayout currentPage="dashboard" onNavigate={() => {}}>
    <FirstRunDashboard
      companyId="c1"
      userId="u1"
      onAddProduct={() => {}}
      onImportSpreadsheet={() => {}}
      onOpenRow={() => {}}
    />
  </MainLayout>,
);
