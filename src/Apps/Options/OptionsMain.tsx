// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * OptionsMain.tsx — entry point. Mounts the surface and pulls in the design system.
 */
import { createRoot } from 'react-dom/client';
import '@Ui/Tokens/Tokens.css';
import '@Ui/Components/Components.css';
import { Options } from './Options';

const container = document.getElementById('duo-root');
if (container) {
  createRoot(container).render(<Options />);
}
