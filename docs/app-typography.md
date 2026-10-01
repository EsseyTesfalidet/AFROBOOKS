# Interface typography

The app interface uses self-hosted DM Sans for body text and controls, with Manrope for headings. Both variable fonts and their SIL Open Font Licenses are in `public/fonts`. Ethiopic fallback supports Tigrinya/Amharic interface text. The shared type scale raises the smallest utility text sizes and establishes clearer heading weights, spacing and line heights; navigation and footer text have matching adjustments. Sign-in and registration headings use a smaller mobile size.

Reader font choices and preferred reading size remain unchanged. Global heading rules explicitly exclude the reading view, manuscript preview and chapter editor. The reader continues to use its own CSS and font preferences, including the Ethiopic fallback introduced with PDF/OCR support.

Browser verification covered home, browse, discover, search, cart, checkout, login, signup, community, terms and privacy at 320, 390, 844 and 1280 pixels. There was no horizontal page overflow or JavaScript exception. Fonts loaded successfully, and a reader-style fixture retained its Lora family and 20px selected text size after the interface styles were applied.
