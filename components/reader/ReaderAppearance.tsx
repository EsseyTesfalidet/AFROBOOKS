'use client';

import { FONT_FAMILIES, FONT_LABELS, FONT_SIZE_PX, THEME_STYLES, useReaderStore, type ReaderTheme, type FontFamily, type FontSize, type LineSpacing, type MarginSize } from '@/store/readerStore';

const sizes: FontSize[] = ['small', 'medium', 'large', 'xlarge'];
export default function ReaderAppearance() {
  const prefs = useReaderStore();
  return <div className="reader-appearance">
    <fieldset><legend>Reading mode</legend><div className="reader-choice-options">
      <label><input type="radio" name="reading-mode" checked={prefs.readingMode === 'pages'} onChange={() => prefs.setReadingMode('pages')} /><span>Pages</span></label>
      <label><input type="radio" name="reading-mode" checked={prefs.readingMode === 'scroll'} onChange={() => prefs.setReadingMode('scroll')} /><span>Scroll</span></label>
    </div><p className="reader-panel-note mt-3">Turn pages with the arrows or swipe left and right. Scroll keeps the continuous reading layout.</p></fieldset>
    <fieldset><legend>Page color</legend><div className="reader-theme-options">
      {(['paper', 'sepia', 'dark', 'night'] as ReaderTheme[]).map(key => <label key={key} className="reader-theme-option">
        <input type="radio" name="page-color" aria-label={THEME_STYLES[key].label} checked={prefs.theme === key} onChange={() => prefs.setTheme(key)} />
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
    <p className="reader-panel-note">Your reading preferences save automatically on this device.</p>
  </div>;
}
