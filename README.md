<p align="center">
  <img src="https://raw.githubusercontent.com/ThomasDM40-dev/orbit-releases/main/assets/banner.png" alt="Orbit Banner" width="100%"/>
</p>

<p align="center">
  <strong>🚀 Téléchargeur multimédia & studio vidéo IA tout-en-un</strong>
</p>

<p align="center">
  <a href="https://github.com/ThomasDM40-dev/orbit-releases/releases/latest"><img src="https://img.shields.io/github/v/release/ThomasDM40-dev/orbit-releases?style=for-the-badge&color=ff2a6d&label=Version" alt="Version"/></a>
  <a href="https://github.com/ThomasDM40-dev/orbit-releases/releases/latest"><img src="https://img.shields.io/github/downloads/ThomasDM40-dev/orbit-releases/total?style=for-the-badge&color=a855f7&label=Downloads" alt="Downloads"/></a>
  <img src="https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge&logo=windows&logoColor=white" alt="Platform"/>
  <img src="https://img.shields.io/badge/Electron-React_19-22d3ee?style=for-the-badge&logo=electron&logoColor=white" alt="Stack"/>
</p>

<p align="center">
  <a href="https://github.com/ThomasDM40-dev/orbit-releases/releases/latest">
    <img src="https://img.shields.io/badge/⬇️_Télécharger-Orbit_Setup.exe-ff2a6d?style=for-the-badge" alt="Download"/>
  </a>
</p>

---

## ✨ Qu'est-ce qu'Orbit ?

**Orbit** est une application desktop tout-en-un qui réunit un **téléchargeur multimédia**, un **convertisseur**, et un véritable **studio vidéo par IA** — le tout dans une interface premium « Liquid Glass ».

Un mélange de **JDownloader + HandBrake + Flowframes + Topaz Video AI + Whisper**, dans une seule app.

> Le code principal est publié sur la branche `main` à chaque release. Les binaires bundlés (yt-dlp, FFmpeg, Real-ESRGAN, RIFE, HandBrakeCLI, Whisper) sont téléchargés automatiquement au premier usage.

<br/>

## 🎯 Fonctionnalités

### ⬇️ Téléchargeur multimédia
- **1000+ sites** (YouTube, X/Twitter, TikTok, Instagram, Twitch, SoundCloud…) via **yt-dlp**
- File d'attente avec téléchargements parallèles, qualité jusqu'au **8K**, extraction audio (MP3/FLAC/WAV/M4A…)
- Navigateur-renifleur intégré pour capturer les flux (HLS/DASH/MP4), cookies, métadonnées & miniatures
- SponsorBlock (marquer / supprimer), archive anti-doublons, sous-titres

### 🔃 Convertisseur & Tags
- Conversion entre tous formats (MP4, MKV, AVI, MOV, MP3, FLAC, WAV, OGG…)
- Éditeur de tags ID3 (titre, artiste, album, pochette), drag & drop

### 🎬 Médiathèque (Anime Media Manager)
- Gestionnaire de médias pour monteurs & artistes 3D : import drag & drop, **scan de dossiers**, organisation par **séries / saisons / épisodes** (détection auto)
- Recherche instantanée + filtres (résolution, codec, tri), sections **Récemment ajoutés / Favoris / Reprendre la lecture**
- **Lecteur intégré** (vitesse, image par image, reprise) + panneau d'infos complet
- Conversion FFmpeg vers **ProRes / DNxHR / H.264 / H.265** + **« Préparer pour AE / Premiere / DaVinci / Blender »**

### 🎨 Génération d'image IA (gratuit, sans clé)
- Crée des images depuis un **texte**, propulsé par **Flux** (open-source, niveau Midjourney) — gratuit & illimité
- **10 styles** (Photoréaliste, Cinématique, 3D/Blender, Anime, Digital Art, Cyberpunk, Logo/Vecteur…), plusieurs modèles, ratios (1:1, 16:9, 9:16, 21:9…)
- Génération **par lot** (jusqu'à 4), **seed verrouillable**, galerie avec aperçu plein écran, réutilisation prompt+seed, sauvegarde auto

### 🧽 Gomme magique IA (suppression / remplacement d'objet)
- Comme le **Remplissage génératif** de Photoshop, mais **100% local & gratuit** : peins une zone pour **effacer** un objet (le fond est reconstruit par **LaMa**) ou **décris un prompt** pour générer/remplacer le contenu de la zone par un vrai **inpainting Stable Diffusion exécuté sur ton PC** — le modèle est conditionné sur la photo autour de la zone, donc le rendu se fond dans la scène (plus d'image aléatoire)
- **Accélération GPU** (DirectML — NVIDIA/AMD/Intel, sans installation) avec **repli CPU automatique** : ~3× plus rapide (~25 s/génération)
- **Sélection intelligente** : clique sur un objet pour le sélectionner automatiquement (**SAM**), ou lance la **détection automatique** d'objets (**YOLO** : personnes, voitures, animaux, meubles…)
- Pinceau & gomme réglables, 3 niveaux de précision, annulation, retouches en chaîne — la zone non peinte garde sa qualité d'origine au pixel près
- Tout tourne en local (ONNX) : moteurs téléchargés une seule fois (LaMa ~200 Mo, SAM ~40 Mo, YOLO ~13 Mo, Stable Diffusion ~2,1 Go), aucune clé ni compte

### 🚀 Amélioration IA (moteur libre, gratuit)
- **Upscale** Real-ESRGAN (vidéo / photo / anime) jusqu'à 8× + résolutions cibles 720p→8K
- **Interpolation** RIFE jusqu'à 120 fps + ralenti IA
- **Restauration** : débruitage temporel/spatial, deblock, deband, désentrelacement, colorimétrie
- **Stabilisation** vidstab 2-passes, netteté CAS, comparaison Avant/Après, moniteur GPU/VRAM/CPU/RAM

### ✂️ Détourage IA (suppression de fond sans fond vert)
- **Robust Video Matting** (ONNX) — détoure le sujet en **alpha**, aucun fond vert requis
- Sorties : **transparent** (WebM alpha / ProRes 4444 / séquence PNG), fond vert, couleur, **flou**, ou image
- Modèles MobileNetV3 (rapide) / ResNet50 (qualité), aperçu 3 s, file par lot — pipeline en flux décodage→ONNX→FFmpeg

### 🔥 HandBrake
- Le **vrai moteur HandBrakeCLI** (open-source) auto-téléchargé et piloté par Orbit
- **100+ préréglages officiels**, encodeurs x264 / x265 / AV1 (SVT) + **NVENC** matériel
- Qualité constante (RF) ou débit moyen 2-passes, conteneurs MP4 / MKV / WEBM
- Filtres NLMeans, Lapsharp, decomb, deblock, rotation, file par lot

### ✨ Topaz Video AI *(pour les détenteurs d'une licence Topaz)*
- Pilote une installation **Topaz Video AI** licenciée : Proteus, Iris, Artemis, Gaia, Nyx, Dione…
- Upscale, interpolation (Chronos/Apollo/Aion), stabilisation 2-passes — sans ouvrir Topaz

### ☁️ Drive Discord (stockage chiffré, façon Disbox)
- Stockage de fichiers **gratuit** qui s'appuie sur un salon Discord : collez l'URL d'un **webhook** et envoyez vos projets/fichiers dessus
- **Chiffrement de bout en bout AES-256** : chaque fichier est chiffré localement avec votre phrase secrète avant l'envoi
- Gros fichiers **découpés en blocs**, organisation en **dossiers**, téléchargement/suppression en un clic ; liens Discord expirés **régénérés automatiquement**
- ⚠️ Va à l'encontre des conditions de Discord — usage d'appoint, pas une sauvegarde unique

### 📝 Transcription IA
- Transcription **Whisper** locale → export SRT / VTT / TXT, et vers **Premiere Pro, After Effects, CapCut, DaVinci, Final Cut**…

### 📡 Abonnements & 🎮 Discord Rich Presence
- Surveillance automatique de chaînes, téléchargement des nouvelles vidéos
- Statut Discord dynamique selon l'onglet actif

### 🌍 Interface multilingue
- Disponible en **6 langues** : Français, English, Español, Deutsch, Italiano, Português
- **Détection automatique** de la langue du système au premier lancement (repli français)
- Changement instantané depuis le menu **Langue** ou les **Réglages** — toute l'app se traduit à la volée

<br/>

## ⚙️ Paramètres (réellement fonctionnels)
Téléchargements (audio, miniatures, métadonnées, SponsorBlock, cookies navigateur, args yt-dlp perso…), **apparence** (thèmes Sombre/AMOLED/Minuit/Clair + 7 accents), **système** (lancement au démarrage, notifications, vidage du cache, proxy + test), **IA & performance** (GPU & dossier de sortie par défaut). Tout est persisté et appliqué au moteur.

<br/>

## 💻 Installation

1. **Téléchargez** le dernier installateur → [**Orbit Setup.exe**](https://github.com/ThomasDM40-dev/orbit-releases/releases/latest)
2. **Lancez** l'installateur (Windows 10/11 64-bit). Un **GPU Vulkan** (NVIDIA/AMD/Intel) est recommandé pour l'IA.
3. Orbit télécharge automatiquement les moteurs nécessaires au premier usage. Mises à jour automatiques intégrées.

### Construire depuis les sources
```bash
npm install
npm run dev            # développement (Vite + Electron)
npm run electron:build # build de l'installateur Windows
```

<br/>

## 🛠️ Stack technique

| Technologie | Rôle |
|:---|:---|
| **Electron + React 19 + TypeScript** | Application desktop & UI |
| **Vite 8 · Tailwind CSS 4 · Framer Motion** | Build & design « Liquid Glass » |
| **yt-dlp · FFmpeg** | Téléchargement & conversion |
| **Real-ESRGAN · RIFE (ncnn-Vulkan)** | Upscale & interpolation IA |
| **HandBrakeCLI** | Compression / transcodage |
| **whisper.cpp** | Transcription locale |
| **Topaz Video AI** | Modèles IA propriétaires (licence requise) |
| **electron-updater · discord-rpc** | MAJ auto & Rich Presence |

<br/>

## 📦 Structure du projet

```
orbit/
├── main.js              # Process principal Electron (IPC, moteurs)
├── preload.js           # Bridge IPC sécurisé
├── enhance.js           # Moteur libre (Real-ESRGAN + RIFE + ffmpeg)
├── inpaint.js           # Gomme magique IA — effacer (LaMa ONNX + ffmpeg)
├── sdinpaint.js         # Inpainting Stable Diffusion local (ONNX, tokenizer CLIP + DDIM)
├── sam.js               # Sélection intelligente au clic (SAM ONNX)
├── yolo.js              # Détection automatique d'objets (YOLOv8 ONNX)
├── handbrake.js         # Bridge HandBrakeCLI
├── topaz.js             # Bridge Topaz Video AI
├── transcription.js     # Whisper → formats d'export
├── changelog.html       # Notes de version in-app
├── src/
│   ├── App.tsx
│   └── components/       # DownloadInterface, Converter, OrbitEnhance,
│                         # HandBrake, TopazVideoAI, Transcription,
│                         # AIInterpolator, Subscriptions, SettingsModal…
└── package.json
```

<br/>

## ⌨️ Raccourcis clavier
`Ctrl + ,` Paramètres · `Ctrl + I` Importer · `Escape` Fermer

<br/>

## 🗺️ Roadmap

- [x] Téléchargeur multimédia (1000+ sites) & convertisseur + tags
- [x] Interpolation IA (RIFE) & abonnements & Discord Rich Presence
- [x] Transcription Whisper + export montage (Premiere/AE/CapCut/DaVinci/FCP)
- [x] Amélioration IA (Real-ESRGAN upscale, restauration, stabilisation)
- [x] HandBrake intégré (compression pro)
- [x] Topaz Video AI (licence utilisateur)
- [x] Paramètres complets + thèmes & couleurs d'accent
- [x] Génération d'image IA (Flux) & Gomme magique IA (effacer / remplacer par prompt)
- [ ] Séparateur de pistes audio (stems / vocal remover)
- [ ] Restauration de visages (GFPGAN)
- [ ] Support macOS & Linux

<br/>

## 📄 Changelog
Voir les [**Releases**](https://github.com/ThomasDM40-dev/orbit-releases/releases) pour le détail complet (changelog aussi consultable dans l'app : *Paramètres → À propos → Changelog*).

- **v0.34.6** — **Rapports de bug automatiques** (erreurs/crashs → Discord, avec journal récent, chemins masqués) · bouton **« Signaler un bug »** + interrupteur dans les réglages · **écran d'erreur propre** (Recharger / Copier le rapport)
- **v0.34.5** — HandBrake : **estimation de taille** + avertissements (fichier plus gros / codec inefficace) · **recherche d'onglets** (Ctrl + K) · Sniffer ouvre sur sa page d'accueil (interface repensée) · fix alignement Drive · licences : **kill-switch de révocation** à distance (fail-open)
- **v0.26.0** — Drive Cloud : **mot de passe oublié** (code à 6 chiffres par e-mail) pour réinitialiser le mot de passe de connexion
- **v0.25.2** — Correctif : erreurs HTTP 502 à l'envoi Cloud (cadence des transferts désormais fixée par le serveur, évite de saturer les petits serveurs)
- **v0.25.1** — Drive Cloud : concurrence des transferts **adaptée au nombre de webhooks** (~3 par webhook) → plus de webhooks = plus rapide
- **v0.25.0** — Drive Cloud : gestion des **webhooks & profils** depuis l'app (ajout/activation/suppression, profils nommés basculables) ; pool piloté par PostgreSQL
- **v0.24.0** — Drive Discord **mode Cloud** : comptes utilisateurs + serveur auto-hébergé (pool de webhooks, PostgreSQL), contenu chiffré côté client (zéro-knowledge)
- **v0.23.1** — Drive Discord : chaque fichier affiche son **icône native** (Blender, Word, Excel, PDF…)
- **v0.23.0** — Drive Discord **bien plus rapide** : transferts parallèles (jusqu'à 6 blocs simultanés) à l'envoi comme au téléchargement
- **v0.22.2** — Correctif : l'envoi de fichiers du Drive Discord échouait (HTTP 413) — taille des blocs réduite à 8 Mio
- **v0.22.1** — Correctif : le Drive Discord plantait au démarrage (module manquant dans l'installeur 0.22.0)
- **v0.22.0** — **Drive Discord** : stockage de fichiers gratuit sur un salon Discord (webhook), chiffré de bout en bout (AES-256), avec dossiers, découpage en blocs et régénération des liens expirés
- **v0.21.1** — Correctifs Modules & IA : barre de progression qui ne se fige plus, Amélioration IA passe bien en « À jour », bouton Annuler retiré pour yt-dlp
- **v0.21.0** — **Modules & IA** plus complet (vraie détection des MAJ yt-dlp, versions/tailles, bouton Annuler, progression en %) + **démarrage plus rapide** (studios chargés à la demande, ~855→636 Ko) + vérificateur de traductions
- **v0.20.3** — **Modules & IA** : un module déjà installé affiche « À jour » au lieu de « Mettre à jour » (icône ↻ pour forcer une réinstallation)
- **v0.20.2** — **Nouvel onglet « Modules & IA »** dans les réglages : installe/met à jour tous les moteurs et modèles d'IA (yt-dlp, IA locale, Real-ESRGAN+RIFE, HandBrake, LaMa, RVM) depuis un seul endroit, avec état et progression en direct
- **v0.20.1** — **Correctif** : changer de langue ne relance plus la vérification des mises à jour (la notification « Tout est à jour » n'apparaît qu'au démarrage)
- **v0.20.0** — **Interface entièrement multilingue** : toute l'app retraduite de A à Z en **6 langues** (FR, EN, ES, DE, IT, PT) · détection auto de la langue système · sélecteur dans le menu Langue et les Réglages
- **v0.19.x** — **Remplacer/Ajouter par inpainting Stable Diffusion 100% local** : l'IA est conditionnée sur la photo autour de la zone et fond le rendu dans la scène (fini les images aléatoires) — gratuit, hors-ligne, sans clé · **accéléré GPU** (DirectML, repli CPU auto, ~25 s/génération)
- **v0.18.x** — **AI Eraser** complet : sélection au clic (**SAM**), détection automatique d'objets (**YOLO**), suppression haute résolution (LaMa) — 100% local & gratuit
- **v0.17.x** — **Génération d'image IA** (Flux — gratuit, sans clé) · **Gomme magique IA** : effacer un objet (LaMa, local) ou le remplacer/ajouter via un prompt, comme le Remplissage génératif de Photoshop
- **v0.16.x** — Assistant IA local gratuit (Qwen via llama.cpp) · interface repensée (Markdown, Liquid Glass) · **pilotage de l'app par l'IA** : navigation, onglets, réglages **et téléchargement réel d'un lien** (« télécharge cette vidéo… ») — hors-ligne · **lecteur universel** : Play robuste (accents/espaces) + **lecture de TOUS les formats** (MKV/H.265/AV1) par conversion ffmpeg automatique à la volée (remux instantané si H.264, mise en cache), pochette audio, repli lecteur système · **sniffer intégré** : navigateur d'interception dans l'app (plus de fenêtre séparée), les flux cachés (Patreon/HLS/DASH) s'ajoutent automatiquement aux téléchargements · **chemin de fichier exact** récupéré auprès de yt-dlp (fini les vidéos « illisibles » après fusion/remux) · **menus déroulants Liquid Glass** custom sur TOUT l'app (51 menus : clavier, groupes, coche, positionnement intelligent)
- **v0.15.0** — Onboarding au premier lancement · icônes d'onglets sur-mesure · prompt de mise à jour au démarrage
- **v0.14.0** — Onglet Détourage IA (Robust Video Matting · transparent/vert/flou/image)
- **v0.13.0** — Onglet Médiathèque (gestionnaire + conversion ProRes/DNxHR + export créatif) · fix Reels Instagram
- **v0.12.0** — Onglet HandBrake (moteur officiel) + code source public sur `main`
- **v0.11.x** — Amélioration IA (Real-ESRGAN/RIFE) + paramètres refaits et fonctionnels
- **v0.10.0** — Onglet Topaz Video AI
- **v0.9.x** — Transcription IA & exports montage

<br/>

---

<p align="center">
  <strong>Développé avec ❤️ et beaucoup de ☕</strong><br/>
  <sub>© 2026 Orbit — ThomasDM40-dev</sub>
</p>
