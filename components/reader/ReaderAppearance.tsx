'use client';

import { FONT_FAMILIES, FONT_LABELS, FONT_SIZE_PX, THEME_STYLES, useReaderStore, type ReaderTheme, type FontFamily, type FontSize, type LineSpacing, type MarginSize } from '@/store/readerStore';
import type { TextFlow } from '@/lib/utils/paragraphFlow';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import { useInstalledApp } from '@/hooks/useInstalledApp';

const sizes: FontSize[] = ['small', 'medium', 'large', 'xlarge'];
function ReaderTextFlow() {
  const prefs = useReaderStore();
  return <div><label className="reader-setting-label" htmlFor="reader-text-flow">Text flow</label><select id="reader-text-flow" className="reader-flow-select" value={prefs.textFlow} onChange={event => prefs.setTextFlow(event.target.value as TextFlow)}><option value="auto">Automatic</option><option value="paragraphs">Flow as paragraphs</option><option value="original">Keep original lines</option></select><p className="reader-panel-note mt-3">Automatic joins clearly wrapped text and respects the author’s line breaks. Flow as paragraphs also joins preserved lines, keeping separate paragraphs. Choose original lines for poetry. This changes only your reading view.</p></div>;
}
export default function ReaderAppearance({ sampleText = '' }: { sampleText?: string }) {
  const prefs = useReaderStore();
  const readerTheme = useReaderTheme();
  const installed = useInstalledApp();
  return <div className="reader-appearance">
    {installed && <>
      <div className="reader-live-preview" aria-label="Text appearance preview"><span>Preview</span><p dir="auto">{sampleText || 'Every page opens a door to another world. Find a comfortable setting and make yourself at home.'}</p></div>
      <fieldset><legend>Quick settings</legend><div className="reader-preset-options">
        {(['comfortable', 'large'] as const).map(preset => <button type="button" key={preset} aria-pressed={prefs.fontSize === (preset === 'large' ? 'xlarge' : 'medium') && prefs.lineSpacing === 'normal' && prefs.marginSize === 'normal'} onClick={() => prefs.applyReadingPreset(preset)}>{preset === 'large' ? 'Large text' : 'Comfortable'}</button>)}
      </div></fieldset>
    </>}
    <fieldset><legend>Reading mode</legend><div className="reader-choice-options">
      <label><input type="radio" name="reading-mode" checked={prefs.readingMode === 'pages'} onChange={() => prefs.setReadingMode('pages')} /><span>Pages</span></label>
      <label><input type="radio" name="reading-mode" checked={prefs.readingMode === 'scroll'} onChange={() => prefs.setReadingMode('scroll')} /><span>Scroll</span></label>
    </div><p className="reader-panel-note mt-3">Turn pages with the arrows or swipe left and right. Scroll keeps the continuous reading layout.</p></fieldset>
    {!installed && <ReaderTextFlow />}
    <fieldset><legend>Page color</legend><div className="reader-theme-options">
      {(['paper', 'sepia', 'dark', 'night'] as ReaderTheme[]).map(key => <label key={key} className="reader-theme-option">
        <input type="radio" name="page-color" aria-label={THEME_STYLES[key].label} checked={readerTheme === key} onChange={() => prefs.setTheme(key)} />
        <span style={{ background: THEME_STYLES[key].bg, color: THEME_STYLES[key].text }}><b>Aa</b>{THEME_STYLES[key].label}</span>
      </label>)}
    </div></fieldset>
    <fieldset><legend>Typeface</legend><div className="reader-choice-options">
      {(Object.keys(FONT_FAMILIES) as FontFamily[]).map(key => <label key={key}>
        <input type="radio" name="typeface" checked={prefs.fontFamily === key} onChange={() => prefs.setFontFamily(key)} />
        <span style={{ fontFamily: FONT_FAMILIES[key] }}>{FONT_LABELS[key]}</span>
      </label>)}
    </div></fieldset>
    <div><label className="reader-setting-label" htmlFor="reader-text-size">Text size <span>{FONT_SIZE_PX[prefs.fontSize].replace('px', '')}</span></label>
      <div className="reader-size-control"><span aria-hidden="true">A</span><input id="reader-text-size" type="range" min={0} max={sizes.length - 1} step={1} value={sizes.indexOf(prefs.fontSize)} aria-valuetext={`${FONT_SIZE_PX[prefs.fontSize]} text`} onChange={event => prefs.setFontSize(sizes[Number(event.target.value)])} /><span aria-hidden="true">A</span></div>
    </div>
    <div className="reader-select-grid">
      <div><label htmlFor="reader-line-spacing">Line spacing</label><select id="reader-line-spacing" value={prefs.lineSpacing} onChange={event => prefs.setLineSpacing(event.target.value as LineSpacing)}><option value="compact">Compact</option><option value="normal">Comfortable</option><option value="relaxed">Spacious</option></select></div>
      <div><label htmlFor="reader-margins">Margins</label><select id="reader-margins" value={prefs.marginSize} onChange={event => prefs.setMarginSize(event.target.value as MarginSize)}><option value="narrow">Narrow</option><option value="normal">Balanced</option><option value="wide">Wide</option></select></div>
    </div>
    {installed && <label className="reader-motion-choice"><span>Page-turn animation<small>Flip pages like a paper book. Follows your device’s reduced-motion setting.</small></span><input type="checkbox" role="switch" aria-label="Page-turn animation" checked={prefs.pageMotion} onChange={event => prefs.setPageMotion(event.target.checked)}/></label>}
    {installed && <details className="reader-advanced"><summary>Text layout</summary><ReaderTextFlow /></details>}
    <p className="reader-panel-note">Your reading preferences save automatically on this device.</p>
  </div>;
}
