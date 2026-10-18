import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/tokens.css';
import MainLayout from '../../src/components/Layout/MainLayout';
import FirstRunDashboard from '../../src/components/Dashboard/FirstRunDashboard';
import ProductsPage from '../../src/components/Products/ProductsPage';

//  Which screen to draw, from ?screen= — the preview is for looking at
//  one page at a time inside the real shell.
const screen = new URLSearchParams(location.search).get('screen') ?? 'dashboard';

const page = screen === 'products'
  ? (
    <ProductsPage
      companyId="c1"
      userId="u1"
      onOpenRegistrations={() => {}}
      onImportSpreadsheet={() => {}}
    />
  )
  : (
    <FirstRunDashboard
      companyId="c1"
      userId="u1"
      onAddProduct={() => {}}
      onImportSpreadsheet={() => {}}
      onOpenRow={() => {}}
    />
  );

createRoot(document.getElementById('root')!).render(
  <MainLayout currentPage={screen as any} onNavigate={() => {}}>{page}</MainLayout>,
);
