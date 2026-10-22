/**
 * SidePanelMain.tsx — entry point. Mounts the surface and pulls in the design system.
 */
import { createRoot } from 'react-dom/client';
import '@Ui/Tokens/Tokens.css';
import '@Ui/Components/Components.css';
import { SidePanel } from './SidePanel';

const container = document.getElementById('duo-root');
if (container) {
  createRoot(container).render(<SidePanel />);
}
