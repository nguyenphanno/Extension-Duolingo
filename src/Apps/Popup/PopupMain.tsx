// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * PopupMain.tsx — entry point. Mounts the surface and pulls in the design system.
 */
import { createRoot } from 'react-dom/client';
import '@Ui/Tokens/Tokens.css';
import '@Ui/Components/Components.css';
import { Popup } from './Popup';

const container = document.getElementById('duo-root');
if (container) {
  createRoot(container).render(<Popup />);
}
