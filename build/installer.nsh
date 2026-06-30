; ──────────────────────────────────────────────────────────────────────────
; Orbit Nova — custom NSIS installer hooks (electron-builder extension points)
; ──────────────────────────────────────────────────────────────────────────

; Branded welcome page — makes the futuristic Orbit Nova sidebar greet the user
; on the very first screen (electron-builder only shows it if this macro exists).
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenue dans Orbit Nova"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "Orbit réunit téléchargement, conversion, IA créative, studio et cloud dans une seule application futuriste.$\r$\n$\r$\nL'assistant va installer Orbit sur votre ordinateur. Cliquez sur Suivant pour continuer."
  !insertmacro MUI_PAGE_WELCOME
!macroend
