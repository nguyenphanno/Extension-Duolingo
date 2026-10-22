// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Preview.tsx — a standalone showcase of the three surfaces.
 *
 * Not shipped in the manifest: it exists so the UI can be reviewed (and
 * screenshotted) in a normal tab, backed by the mock bridge.
 */
import { useState } from 'react';
import { useTheme } from '@Ui/Hooks/UseTheme';
import { Segmented } from '@Ui/Components/Controls';
import { BrandMark } from '@Ui/Components/BrandMark';
import { OwlIcon, SparkleIcon, SlidersIcon, HistoryIcon } from '@Ui/Icons/Icons';
import { Popup } from '../Popup/Popup';
import { Options } from '../Options/Options';
import { SidePanel } from '../SidePanel/SidePanel';
import '../Popup/Popup.css';
import '../Options/Options.css';
import '../SidePanel/SidePanel.css';
import './Preview.css';

type Surface = 'popup' | 'options' | 'panel';

const CAPTIONS: Record<Surface, string> = {
  popup: 'Toolbar popup · 384×600 · identity, run control, fortnight chart, task plan and console.',
  options: 'Options page · full settings, palette reference, backup and PRO risk gate.',
  panel: 'Side panel · live progress, task timeline and streaming log.',
};

const initialSurface = (): Surface => {
  const requested = new URLSearchParams(window.location.search).get('surface');
  return requested === 'options' || requested === 'panel' ? requested : 'popup';
};

export function Preview() {
  const [surface, setSurface] = useState<Surface>(initialSurface);
  useTheme('system');

  return (
    <div className="preview">
      <header className="preview__bar">
        <div className="preview__brand">
          <BrandMark size={38} />
          <div>
            <strong>Duo Assist</strong>
            <span>UI preview</span>
          </div>
        </div>

        <Segmented<Surface>
          value={surface}
          onChange={setSurface}
          options={[
            { value: 'popup', label: 'Popup', icon: <SparkleIcon size={14} /> },
            { value: 'options', label: 'Options', icon: <SlidersIcon size={14} /> },
            { value: 'panel', label: 'Side panel', icon: <HistoryIcon size={14} /> },
          ]}
        />

        <span className="preview__note">Mock data · chrome.* APIs simulated</span>
      </header>

      <div className="preview__stage">
        {surface === 'popup' ? (
          <div className="frame frame--popup">
            <div className="frame__chrome">
              <span className="frame__dots">
                <i />
                <i />
                <i />
              </span>
              <span className="frame__title">Duo Assist</span>
              <span className="frame__pill">extension</span>
            </div>
            <div className="frame__body">
              <Popup />
            </div>
          </div>
        ) : null}

        {surface === 'options' ? (
          <div className="frame frame--options">
            <div className="frame__chrome">
              <span className="frame__dots">
                <i />
                <i />
                <i />
              </span>
              <span className="frame__title">chrome-extension://duo-assist/Options.html</span>
              <span className="frame__pill">tab</span>
            </div>
            <div className="frame__body frame__body--scroll">
              <Options />
            </div>
          </div>
        ) : null}

        {surface === 'panel' ? (
          <div className="frame frame--panel">
            <div className="frame__chrome">
              <span className="frame__dots">
                <i />
                <i />
                <i />
              </span>
              <span className="frame__title">Side panel</span>
              <span className="frame__pill">dock</span>
            </div>
            <div className="frame__body">
              <SidePanel />
            </div>
          </div>
        ) : null}

        <p className="preview__caption">{CAPTIONS[surface]}</p>
      </div>
    </div>
  );
}
